/**
 * The AI routes, mounted under /api by server/app.ts.
 *
 *   GET  /api/health           — is AI configured, which model, which stores
 *   POST /api/plan             — Server-Sent Events: status → feasibility → milestone… → result | error
 *   POST /api/motivation       — { line, run }
 *   POST /api/coach            — { reply, proposal, toolCalls, runs }
 *   POST /api/insights/weekly  — { summary, run }
 *
 * Order of checks for every AI route (for learners):
 *   1. rate limit (cheap, protects quota)      → 429 RATE_LIMITED + Retry-After
 *   2. validate the body with zod               → 400 INVALID_INPUT + details
 *   3. is a Gemini key configured?              → 503 AI_NOT_CONFIGURED
 *   4. call Gemini (timeouts, retries, logging)
 * Failures BEFORE the plan stream opens are normal JSON errors with an HTTP
 * status. Once the stream is open (HTTP 200), failures arrive as an `error` event.
 */
import { Router, type Response } from 'express';
import type { z } from 'zod';
import type { HealthResponse, PlanStreamEvent } from '../../shared/api';
import { IntakeSchema } from '../../shared/plan';
import { dayKey } from '../../shared/time';
import type { RunRecorder } from '../lib/aiRuns';
import type { AiTuning } from '../lib/config';
import { AppError, toAppError, zodDetails } from '../lib/errors';
import { rateLimitMiddleware, type RateLimiter } from '../lib/rateLimit';
import { openSse } from '../lib/sse';
import type { CallContext } from './call';
import type { GeminiLike, ModelResolver } from './client';
import { CoachRequestSchema, runCoach } from './coach';
import { WeeklyInsightRequestSchema, generateWeeklyInsight } from './insight';
import { MotivationRequestSchema, generateMotivation, type MotivationCache } from './motivation';
import { BackgroundRequestSchema, generateBackground, type ImageModelResolver } from './background';
import { generatePlan, preparePlanJob } from './plan';

export interface AiDeps {
  /** null when GEMINI_API_KEY is not set. */
  gemini: GeminiLike | null;
  models: ModelResolver | null;
  recorder: RunRecorder;
  tuning: AiTuning;
  now: () => Date;
  limiter: RateLimiter;
  motivationCache: MotivationCache;
  /** Image model discovery for AI backgrounds (null when AI isn't configured). */
  images?: ImageModelResolver | null;
  wallpaperStore: HealthResponse['wallpaperStore'];
}

function parseBody<S extends z.ZodType>(schema: S, body: unknown): z.output<S> {
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    throw new AppError('INVALID_INPUT', undefined, { details: zodDetails(parsed.error.issues) });
  }
  return parsed.data;
}

function requireAi(deps: AiDeps): { gemini: GeminiLike; models: ModelResolver } {
  if (!deps.gemini || !deps.models) throw new AppError('AI_NOT_CONFIGURED');
  return { gemini: deps.gemini, models: deps.models };
}

/**
 * An AbortSignal that fires when the client goes away before we finished.
 * `res.on('close')` also fires after a normal finish, so we check writableEnded.
 */
function abortOnDisconnect(res: Response): AbortSignal {
  const ctrl = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) ctrl.abort(new AppError('CANCELLED'));
  });
  return ctrl.signal;
}

function callContext(deps: AiDeps, gemini: GeminiLike, signal: AbortSignal): CallContext {
  return { gemini, recorder: deps.recorder, tuning: deps.tuning, signal, runs: [] };
}

export function createAiRouter(deps: AiDeps): Router {
  const router = Router();
  const limit = rateLimitMiddleware(deps.limiter);

  router.get('/health', async (_req, res) => {
    // Only touches Gemini (models.list, cached 1 h) when a key is configured.
    const model = deps.models ? await deps.models.resolve() : null;
    const body: HealthResponse = {
      ok: true,
      ai: {
        configured: !!deps.gemini,
        model,
        heavyModel: deps.models?.heavy ?? null,
        imageModel: deps.images ? await deps.images.resolve() : null,
      },
      rateLimit: deps.limiter.kind,
      wallpaperStore: deps.wallpaperStore,
      time: deps.now().toISOString(),
    };
    res.json(body);
  });

  router.post('/plan', limit, async (req, res) => {
    const intake = parseBody(IntakeSchema, req.body);
    const job = preparePlanJob(intake, deps.now());
    const { gemini, models } = requireAi(deps);

    const signal = abortOnDisconnect(res);
    const sse = openSse<PlanStreamEvent>(res, { keepAliveMs: deps.tuning.keepAliveMs });
    const call = callContext(deps, gemini, signal);
    try {
      const model = await models.resolve();
      const result = await generatePlan(call, job, model, (e) => sse.send(e));
      sse.send({ event: 'status', data: { phase: 'done', message: 'Your plan is ready.' } });
      sse.send({ event: 'result', data: result });
    } catch (err) {
      const e = toAppError(err, signal);
      // If the client cancelled there is nobody left to tell.
      if (e.code !== 'CANCELLED') sse.send({ event: 'error', data: e.toJSON() });
    } finally {
      sse.close();
    }
  });

  router.post('/background', limit, async (req, res) => {
    const body = parseBody(BackgroundRequestSchema, req.body);
    const { gemini } = requireAi(deps);
    if (!deps.images) throw new AppError('AI_NOT_CONFIGURED');
    const call = callContext(deps, gemini, abortOnDisconnect(res));
    res.json(await generateBackground(call, deps.images, body));
  });

  router.post('/motivation', limit, async (req, res) => {
    const body = parseBody(MotivationRequestSchema, req.body);
    const { gemini, models } = requireAi(deps);
    const call = callContext(deps, gemini, abortOnDisconnect(res));
    const model = await models.resolve();
    res.json(await generateMotivation(call, model, body, deps.motivationCache));
  });

  router.post('/coach', limit, async (req, res) => {
    const body = parseBody(CoachRequestSchema, req.body);
    const { gemini, models } = requireAi(deps);
    const call = callContext(deps, gemini, abortOnDisconnect(res));
    // The server clock decides what "today" is, in the goal's time zone.
    const todayKey = dayKey(deps.now(), body.context.goal.timezone);
    const defaultModel = await models.resolve();
    res.json(await runCoach(call, { defaultModel, heavyModel: models.heavy }, body, todayKey));
  });

  router.post('/insights/weekly', limit, async (req, res) => {
    const body = parseBody(WeeklyInsightRequestSchema, req.body);
    const { gemini, models } = requireAi(deps);
    const call = callContext(deps, gemini, abortOnDisconnect(res));
    const model = await models.resolve();
    res.json(await generateWeeklyInsight(call, model, body));
  });

  return router;
}
