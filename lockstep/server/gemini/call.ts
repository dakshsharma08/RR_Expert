/**
 * The two ways we call Gemini, with all the robustness rules in one place:
 *
 *   callGemini()   — one request, one answer. 30 s timeout per attempt,
 *                    retries 429/500/503 with backoff, logs an ai_run per attempt.
 *   streamGemini() — streaming. 30 s to the first chunk, 30 s between chunks,
 *                    120 s overall. Retries only while NOTHING has been received
 *                    yet (once text is streaming to the user, a silent restart
 *                    would show them duplicate milestones).
 *
 * Both take the request's AbortSignal, so a closed browser tab stops the
 * Gemini request immediately (config.abortSignal is how the SDK accepts it).
 */
import type { Content, GenerateContentParameters, GenerateContentResponse, Part } from '@google/genai';
import type { AiKind, AiRunMeta } from '../../shared/api';
import type { RunRecorder } from '../lib/aiRuns';
import { runMeta } from '../lib/aiRuns';
import type { AiTuning } from '../lib/config';
import { AppError, isRetryableUpstream, toAppError } from '../lib/errors';
import { withRetry } from '../lib/retry';
import { raceAbort, timeoutError, withTimeout } from '../lib/timeout';
import type { GeminiLike } from './client';

/** Everything a Gemini call needs, bundled per HTTP request. */
export interface CallContext {
  gemini: GeminiLike;
  recorder: RunRecorder;
  tuning: AiTuning;
  /** Aborts when the client disconnects. */
  signal: AbortSignal;
  /** Every attempt is appended here and returned to the client. */
  runs: AiRunMeta[];
}

export interface CallArgs {
  kind: AiKind;
  model: string;
  request: Omit<GenerateContentParameters, 'model'>;
  /** Override the retry count (e.g. 0 for a heavy model that has a fallback). */
  retries?: number;
}

/** Visible text of a response: text parts only, skipping "thought" summaries. */
export function partsText(parts: readonly Part[] | undefined): string {
  let out = '';
  for (const p of parts ?? []) if (typeof p.text === 'string' && !p.thought) out += p.text;
  return out;
}

export function responseText(r: GenerateContentResponse): string {
  return partsText(r.candidates?.[0]?.content?.parts);
}

export function responseContent(r: GenerateContentResponse): Content | undefined {
  return r.candidates?.[0]?.content;
}

function tokensOf(r: GenerateContentResponse | undefined): number | null {
  const t = r?.usageMetadata?.totalTokenCount;
  return typeof t === 'number' ? t : null;
}

const SAFETY_FINISH = new Set([
  'SAFETY',
  'PROHIBITED_CONTENT',
  'BLOCKLIST',
  'SPII',
  'RECITATION',
  'IMAGE_SAFETY',
]);

/** Why Gemini refused to answer (prompt blocked or answer stopped for safety), if it did. */
export function blockReason(r: GenerateContentResponse): string | null {
  const prompt = r.promptFeedback?.blockReason;
  if (prompt) return String(prompt);
  const finish = r.candidates?.[0]?.finishReason;
  return finish && SAFETY_FINISH.has(String(finish)) ? String(finish) : null;
}

/** A refusal is not a server fault and retrying won't help, so it gets its own clear message. */
function blockedError(reason: string): AppError {
  return new AppError(
    'INVALID_INPUT',
    'Gemini declined this request for safety reasons. Try rephrasing it.',
    {
      details: [`blocked: ${reason}`],
    },
  );
}

function record(ctx: CallContext, meta: AiRunMeta) {
  ctx.runs.push(meta);
  ctx.recorder.record(meta);
}

/** One non-streaming call with timeout, retries and logging. */
export async function callGemini(ctx: CallContext, args: CallArgs): Promise<GenerateContentResponse> {
  const t = ctx.tuning;
  let response: GenerateContentResponse;
  try {
    response = await withRetry(
      async () => {
        const started = Date.now();
        try {
          const response = await withTimeout(
            (signal) =>
              ctx.gemini.models.generateContent({
                ...args.request,
                model: args.model,
                config: { ...args.request.config, abortSignal: signal },
              }),
            t.callTimeoutMs,
            ctx.signal,
            `No answer within ${Math.round(t.callTimeoutMs / 1000)} s`,
          );
          record(ctx, runMeta(args.kind, args.model, started, true, tokensOf(response)));
          return response;
        } catch (err) {
          record(ctx, runMeta(args.kind, args.model, started, false, null));
          throw err;
        }
      },
      {
        retries: args.retries ?? t.maxRetries,
        baseMs: t.retryBaseMs,
        maxMs: t.retryMaxMs,
        signal: ctx.signal,
        shouldRetry: isRetryableUpstream,
      },
    );
  } catch (err) {
    throw toAppError(err, ctx.signal);
  }
  const blocked = blockReason(response);
  if (blocked) throw blockedError(blocked);
  return response;
}

export interface StreamArgs extends CallArgs {
  /** Called with each new piece of visible text, in order. */
  onText: (delta: string) => void;
  /** Called once, when the first chunk (text or thought) arrives. */
  onFirstChunk?: () => void;
}

/** Stream a response, enforcing first-chunk / between-chunk / total timeouts. Returns the full text. */
export async function streamGemini(ctx: CallContext, args: StreamArgs): Promise<string> {
  const t = ctx.tuning;
  // `total` aborts everything after the overall cap; it is also aborted by the client disconnecting.
  const totalCtrl = new AbortController();
  const total = AbortSignal.any([ctx.signal, totalCtrl.signal]);
  const totalTimer = setTimeout(
    () => totalCtrl.abort(timeoutError(`Stream exceeded ${Math.round(t.streamTotalTimeoutMs / 1000)} s`)),
    t.streamTotalTimeoutMs,
  );

  let started = Date.now();
  let lastUsage: GenerateContentResponse | undefined;
  let text = '';
  let attemptSignal: AbortSignal = total;

  // `as` widens the type: TypeScript can't see the assignment inside consume().
  let blocked = null as string | null;
  const consume = (chunk: GenerateContentResponse) => {
    if (chunk.usageMetadata) lastUsage = chunk;
    blocked = blockReason(chunk) ?? blocked;
    const delta = responseText(chunk);
    if (delta) {
      text += delta;
      args.onText(delta);
    }
  };

  try {
    // Phase 1 (retryable): open the stream and wait for the first chunk.
    const { stream, attemptCtrl } = await withRetry(
      async () => {
        started = Date.now();
        const attemptCtrl = new AbortController();
        attemptSignal = AbortSignal.any([total, attemptCtrl.signal]);
        const firstTimer = setTimeout(
          () =>
            attemptCtrl.abort(
              timeoutError(`No first chunk within ${Math.round(t.firstChunkTimeoutMs / 1000)} s`),
            ),
          t.firstChunkTimeoutMs,
        );
        try {
          const stream = await raceAbort(
            ctx.gemini.models.generateContentStream({
              ...args.request,
              model: args.model,
              config: { ...args.request.config, abortSignal: attemptSignal },
            }),
            attemptSignal,
          );
          const first = await raceAbort(stream.next(), attemptSignal);
          if (!first.done) {
            args.onFirstChunk?.();
            consume(first.value);
          }
          return { stream: first.done ? null : stream, attemptCtrl };
        } catch (err) {
          record(ctx, runMeta(args.kind, args.model, started, false, null));
          throw err;
        } finally {
          clearTimeout(firstTimer);
        }
      },
      {
        retries: args.retries ?? t.maxRetries,
        baseMs: t.retryBaseMs,
        maxMs: t.retryMaxMs,
        signal: total,
        shouldRetry: isRetryableUpstream,
      },
    );

    // Phase 2 (not retryable): read the rest, resetting the idle timer per chunk.
    try {
      while (stream) {
        const idle = setTimeout(
          () =>
            attemptCtrl.abort(
              timeoutError(`Stream paused for more than ${Math.round(t.chunkIdleTimeoutMs / 1000)} s`),
            ),
          t.chunkIdleTimeoutMs,
        );
        let next: IteratorResult<GenerateContentResponse>;
        try {
          next = await raceAbort(stream.next(), attemptSignal);
        } finally {
          clearTimeout(idle);
        }
        if (next.done) break;
        consume(next.value);
      }
    } catch (err) {
      record(ctx, runMeta(args.kind, args.model, started, false, tokensOf(lastUsage)));
      // Let the SDK's generator finish cleaning up; its late rejection is expected.
      stream?.return(undefined).catch(() => {});
      throw err;
    }
    record(ctx, runMeta(args.kind, args.model, started, true, tokensOf(lastUsage)));
    if (blocked) throw blockedError(blocked);
    return text;
  } catch (err) {
    // attemptSignal carries our abort reason (TIMEOUT / CANCELLED) if we pressed stop.
    throw toAppError(err, attemptSignal);
  } finally {
    clearTimeout(totalTimer);
  }
}
