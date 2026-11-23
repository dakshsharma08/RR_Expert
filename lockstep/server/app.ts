/**
 * createApp(): the Express application shared by every way we run the server:
 *   - server/dev.ts  (local development, port 8787, Vite proxies /api to it)
 *   - server/prod.ts (local production / Cloud Run: also serves the built SPA)
 *   - api/index.ts   (Vercel serverless function)
 *
 * Middleware order matters (for learners):
 *   helmet → security headers on every response
 *   cors   → which OTHER websites may call /api from a browser
 *   json   → parse request bodies (15 MB covers a 10 MB file as base64)
 *   routes → everything under /api
 *   404    → unknown /api routes get JSON, not an HTML page
 *   errors → every thrown error becomes ApiError JSON
 *
 * Options exist for tests: `now` fixes the clock, `gemini` swaps the client,
 * `env` replaces process.env and `tuning` shrinks timeouts/backoff.
 */
import cors, { type CorsOptions } from 'cors';
import express, { type ErrorRequestHandler, type Express, type Request } from 'express';
import helmet from 'helmet';
import { createGeminiClient, ModelResolver, type GeminiLike } from './gemini/client';
import { MotivationCache } from './gemini/motivation';
import { createAiRouter } from './gemini/routes';
import { createRunRecorder } from './lib/aiRuns';
import { loadConfig, resolveTuning, type TuningOverrides } from './lib/config';
import { AppError } from './lib/errors';
import { createRateLimiter, rateLimitMiddleware, rulesFrom } from './lib/rateLimit';

import { createAccountRouter } from './account';
import { ImageModelResolver } from './gemini/background';
import { createWallpaperRouter, storeFromEnv, type WallpaperStore } from './wallpaper/living';
export type { GeminiLike } from './gemini/client';

export interface CreateAppOptions {
  /** Server clock (decides "today" in the user's zone). Defaults to the real clock. */
  now?: () => Date;
  /** Gemini client. Defaults to the real SDK when GEMINI_API_KEY is set. */
  gemini?: GeminiLike;
  /** Environment variables. Defaults to process.env. */
  env?: NodeJS.ProcessEnv;
  /** Timeouts, backoff and rate limits. Defaults are the product spec. */
  tuning?: TuningOverrides;
  /** Where Living Wallpaper links are stored. Defaults: Upstash → file (local) → memory (serverless). */
  wallpapers?: WallpaperStore;
}

export function createApp(opts: CreateAppOptions = {}): Express {
  const env = opts.env ?? process.env;
  const config = loadConfig(env);
  const tuning = resolveTuning(opts.tuning);
  const now = opts.now ?? (() => new Date());

  // No key → no client. The AI routes then answer 503 AI_NOT_CONFIGURED; we never fake AI output.
  const gemini = opts.gemini ?? (config.geminiApiKey ? createGeminiClient(config.geminiApiKey) : null);
  const models = gemini
    ? new ModelResolver(gemini, {
        pinned: config.model,
        heavy: config.heavyModel,
        cacheMs: tuning.modelCacheMs,
      })
    : null;

  const app = express();
  app.disable('x-powered-by');
  // Client IPs for rate limiting: trust Vercel's headers there; elsewhere only as many
  // proxy hops as TRUST_PROXY says (0 = trust none; Cloud Run: 1). See lib/rateLimit.ts.
  app.set('lockstep:vercel', !!env.VERCEL);
  app.set('trust proxy', Math.max(0, Number(env.TRUST_PROXY ?? 0) || 0));

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          // The SPA (served by prod.ts) talks to our API and, optionally, to Supabase.
          'connect-src': [
            "'self'",
            ...(config.supabase ? [config.supabase.url, config.supabase.url.replace(/^http/, 'ws')] : []),
          ],
          'img-src': ["'self'", 'data:', 'blob:'],
          'font-src': ["'self'", 'data:'],
          'style-src': ["'self'", "'unsafe-inline'"],
          'worker-src': ["'self'", 'blob:'],
          'manifest-src': ["'self'"],
          'frame-ancestors': ["'none'"],
          // Would break plain-http local production runs (npm start on localhost).
          'upgrade-insecure-requests': null,
        },
      },
    }),
  );

  // CORS allow-list. Requests without an Origin header (same-origin GETs, curl,
  // server-to-server) are allowed. Browsers send Origin on same-origin POSTs
  // too, so an Origin equal to this server's own host is also allowed.
  // For other origins we simply don't add CORS headers: the browser then blocks
  // the call (JSON POSTs need a preflight, which fails).
  const corsFor = (req: Request, cb: (err: Error | null, options?: CorsOptions) => void) => {
    const origin = req.headers.origin?.replace(/\/+$/, '');
    let allowed = !origin || config.allowedOrigins.includes(origin);
    if (!allowed && origin) {
      try {
        allowed = new URL(origin).host === req.headers.host;
      } catch {
        allowed = false;
      }
    }
    cb(null, { origin: allowed, methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], maxAge: 600 });
  };
  app.use('/api', cors(corsFor));

  app.use(express.json({ limit: '15mb' }));

  // API answers are personal and live: never cache them.
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  const limiter = createRateLimiter(config.upstash, rulesFrom(tuning.rateLimit));
  const wallpapers = opts.wallpapers ?? storeFromEnv(env, config.upstash);
  app.use(
    '/api',
    createAiRouter({
      gemini,
      models,
      recorder: createRunRecorder({ supabase: config.supabase }),
      tuning,
      now,
      limiter,
      motivationCache: new MotivationCache(),
      images: models
        ? new ImageModelResolver(() => models.listedNames(), {
            pinned: env.GEMINI_IMAGE_MODEL?.trim() || null,
            cacheMs: tuning.modelCacheMs,
          })
        : null,
      wallpaperStore: wallpapers.kind,
    }),
  );

  // Cloud account deletion (only when Supabase is configured server-side).
  app.use('/api', createAccountRouter({ supabase: config.supabase }));

  // Living Wallpaper links (create / update / revoke / today's PNG).
  // Separate, generous limits so wallpaper links can't be abused to burn CPU or storage.
  const wallpaperWrites = createRateLimiter(config.upstash, [
    { name: 'wp-window', windowSec: 10 * 60, max: 30 },
    { name: 'wp-day', windowSec: 24 * 60 * 60, max: 200 },
  ]);
  const wallpaperReads = createRateLimiter(config.upstash, [
    { name: 'wpget-window', windowSec: 10 * 60, max: 120 },
    { name: 'wpget-day', windowSec: 24 * 60 * 60, max: 2000 },
  ]);
  app.use(
    '/api',
    createWallpaperRouter({
      store: wallpapers,
      now,
      publicUrl: env.PUBLIC_APP_URL?.trim() || null,
      writeLimit: rateLimitMiddleware(wallpaperWrites, 'wallpaper link changes'),
      readLimit: rateLimitMiddleware(wallpaperReads, 'wallpaper downloads'),
    }),
  );

  // Unknown /api routes → JSON 404 (only /api; prod.ts adds the SPA after this).
  app.use('/api', (_req, _res, next) => next(new AppError('NOT_FOUND')));

  app.use(errorHandler);
  return app;
}

/** Every error → ApiError JSON. Internal details are never sent to the client. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (res.headersSent) {
    // A stream was already going (SSE handles its own errors); just end it.
    if (!res.writableEnded) res.end();
    return;
  }
  let e: AppError;
  if (err instanceof AppError) {
    e = err;
  } else if (
    err &&
    typeof err === 'object' &&
    'type' in err &&
    (err as { type: unknown }).type === 'entity.too.large'
  ) {
    e = new AppError('INVALID_INPUT', 'That request is too large (max 15 MB).', { status: 413 });
  } else if (
    err &&
    typeof err === 'object' &&
    'type' in err &&
    (err as { type: unknown }).type === 'entity.parse.failed'
  ) {
    e = new AppError('INVALID_INPUT', 'The request body must be valid JSON.');
  } else {
    // Unexpected bug: log the stack (no request data) and send a generic message.
    console.error(
      JSON.stringify({
        type: 'unhandled_error',
        name: (err as Error)?.name,
        message: (err as Error)?.message,
      }),
    );
    e = new AppError('INTERNAL');
  }
  // A cancelled request has no listener left.
  if (e.code === 'CANCELLED' || res.destroyed) return;
  if (e.headers) for (const [k, v] of Object.entries(e.headers)) res.setHeader(k, v);
  res.status(e.status).json(e.toJSON());
};
