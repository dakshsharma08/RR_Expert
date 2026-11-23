/**
 * One error type for the whole API.
 *
 * Why (for learners): the browser should never have to guess what went wrong.
 * Every failure, whether bad input, a busy Gemini or a timeout, becomes an
 * `AppError` with a stable `code` from shared/api.ts, a friendly sentence and
 * a `retryable` flag. The error handler turns it into ApiError JSON, and the
 * SSE route turns it into an `error` event.
 *
 * We NEVER forward raw SDK error messages to the client. They can contain
 * request details we don't want to leak, so we map them to our own messages.
 */
import type { ApiError, ApiErrorCode } from '../../shared/api';

/** HTTP status used when an error is sent as a normal JSON response. */
export const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  AI_NOT_CONFIGURED: 503,
  AI_BUSY: 503,
  RATE_LIMITED: 429,
  INVALID_INPUT: 400,
  PLAN_INVALID: 502,
  TIMEOUT: 504,
  CANCELLED: 499, // never really sent: the client has gone away
  NOT_FOUND: 404,
  INTERNAL: 500,
};

/** Default friendly message and retry hint for each code. */
export const DEFAULTS: Record<ApiErrorCode, { message: string; retryable: boolean }> = {
  AI_NOT_CONFIGURED: {
    message: "AI planning isn't set up on this server yet (no Gemini API key). Your saved plans still work.",
    retryable: false,
  },
  AI_BUSY: {
    message: 'Gemini is busy right now — your saved plan still works. Try again in a minute.',
    retryable: true,
  },
  RATE_LIMITED: {
    message: "You've made a lot of AI requests in a short time. Please wait a little and try again.",
    retryable: true,
  },
  INVALID_INPUT: {
    message: "Some of the details aren't valid. Please check them and try again.",
    retryable: false,
  },
  PLAN_INVALID: {
    message:
      "Gemini's plan didn't pass our date and hour checks, even after one repair attempt. Please try again — a fresh attempt usually works.",
    retryable: true,
  },
  TIMEOUT: { message: 'Gemini took too long to answer. Please try again.', retryable: true },
  CANCELLED: { message: 'The request was cancelled.', retryable: true },
  NOT_FOUND: { message: "That API route doesn't exist.", retryable: false },
  INTERNAL: { message: 'Something went wrong on our side. Please try again.', retryable: true },
};

export interface AppErrorOptions {
  retryable?: boolean;
  details?: string[];
  status?: number;
  /** Extra response headers, e.g. Retry-After for RATE_LIMITED. */
  headers?: Record<string, string>;
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  readonly details?: string[];
  readonly headers?: Record<string, string>;

  constructor(code: ApiErrorCode, message?: string, opts: AppErrorOptions = {}) {
    super(message ?? DEFAULTS[code].message, opts.cause === undefined ? undefined : { cause: opts.cause });
    this.name = 'AppError';
    this.code = code;
    this.status = opts.status ?? STATUS_BY_CODE[code];
    this.retryable = opts.retryable ?? DEFAULTS[code].retryable;
    if (opts.details && opts.details.length > 0) this.details = opts.details;
    if (opts.headers) this.headers = opts.headers;
  }

  /** The exact JSON shape the client receives (shared/api.ts → ApiError). */
  toJSON(): ApiError {
    const out: ApiError = { code: this.code, message: this.message, retryable: this.retryable };
    if (this.details) out.details = this.details;
    return out;
  }
}

/** HTTP status of an error thrown by the @google/genai SDK (its ApiError has `.status`). */
export function upstreamStatus(err: unknown): number | undefined {
  if (err && typeof err === 'object' && 'status' in err) {
    const s = (err as { status: unknown }).status;
    if (typeof s === 'number') return s;
  }
  return undefined;
}

/** Statuses worth retrying with backoff (spec: 429, 500 and 503). */
export function isRetryableUpstream(err: unknown): boolean {
  if (err instanceof AppError) return false;
  const s = upstreamStatus(err);
  return s === 429 || s === 500 || s === 503;
}

function isAbortError(err: unknown): boolean {
  return (
    !!err &&
    typeof err === 'object' &&
    'name' in err &&
    ((err as { name: unknown }).name === 'AbortError' || (err as { name: unknown }).name === 'TimeoutError')
  );
}

/**
 * Turn anything that was thrown into an AppError.
 *
 * `signal` is the AbortSignal of the call. When WE aborted (timeout or client
 * cancel) we stored an AppError as the abort reason, which is more useful than
 * the SDK's generic "This operation was aborted".
 */
export function toAppError(err: unknown, signal?: AbortSignal): AppError {
  if (err instanceof AppError) return err;
  if (signal?.aborted && signal.reason instanceof AppError) return signal.reason;
  if (isAbortError(err)) return new AppError('CANCELLED');

  const status = upstreamStatus(err);
  if (status !== undefined) {
    // The SDK message may contain request details, so only look for a few keywords.
    const raw = err instanceof Error ? err.message : '';
    if (status === 401 || status === 403 || /API[_ ]KEY/i.test(raw)) {
      return new AppError(
        'AI_NOT_CONFIGURED',
        "The server's Gemini API key was rejected. Check GEMINI_API_KEY on the server.",
        {
          details: [`Gemini status ${status}`],
        },
      );
    }
    if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) {
      return new AppError('AI_BUSY', undefined, { details: [`Gemini status ${status}`] });
    }
    if (status === 404) {
      return new AppError('INTERNAL', "The configured Gemini model isn't available to this API key.", {
        retryable: false,
        details: ['Gemini status 404 — check GEMINI_MODEL'],
      });
    }
    if (status === 400) {
      return new AppError(
        'INTERNAL',
        "Gemini couldn't process this request. If you attached a file, try a different one.",
        {
          retryable: false,
          details: ['Gemini status 400'],
        },
      );
    }
    return new AppError('INTERNAL', undefined, { details: [`Gemini status ${status}`] });
  }

  // `fetch failed` and friends: we couldn't reach Gemini at all.
  if (err instanceof TypeError && /fetch/i.test(err.message)) {
    return new AppError(
      'AI_BUSY',
      "We couldn't reach Gemini right now — your saved plan still works. Try again in a minute.",
    );
  }
  return new AppError('INTERNAL');
}

/** Format zod issues as short, safe strings (`path: message`). */
export function zodDetails(issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>): string[] {
  return issues.slice(0, 12).map((i) => {
    const path = i.path.map((p) => String(p)).join('.');
    return path ? `${path}: ${i.message}` : i.message;
  });
}
