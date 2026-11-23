/**
 * Timeouts and cancellation helpers built on AbortController.
 *
 * Why (for learners): an AbortController is a "stop button" for async work.
 * The @google/genai SDK accepts its `signal` (config.abortSignal) and cancels
 * the HTTP request when it fires. We press the button in three situations:
 *   1. a timeout expires (→ TIMEOUT error),
 *   2. the browser disconnects (→ CANCELLED),
 *   3. an outer operation was stopped (the reason is passed down).
 * The abort "reason" is an AppError, so whoever catches the failure knows WHY.
 */
import { AppError } from './errors';

const noop = () => {};

export function timeoutError(what: string): AppError {
  return new AppError('TIMEOUT', undefined, { details: [what] });
}

/**
 * Wait for `p`, but reject straight away if `signal` aborts.
 * We don't rely only on the SDK noticing the abort: this guarantees we stop
 * waiting even if a library ignores the signal.
 */
export function raceAbort<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    p.catch(noop); // the late rejection is expected; don't report it as unhandled
    return Promise.reject(signal.reason);
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      p.catch(noop);
      reject(signal.reason);
    };
    signal.addEventListener('abort', onAbort, { once: true });
    p.then(
      (v) => {
        signal.removeEventListener('abort', onAbort);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener('abort', onAbort);
        reject(e);
      },
    );
  });
}

/**
 * Run `fn` with a signal that aborts after `ms` (reason: TIMEOUT) or when
 * `parent` aborts (reason: the parent's reason, e.g. CANCELLED).
 */
export async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  ms: number,
  parent: AbortSignal | undefined,
  what: string,
): Promise<T> {
  const own = new AbortController();
  const signal = parent ? AbortSignal.any([parent, own.signal]) : own.signal;
  const timer = setTimeout(() => own.abort(timeoutError(what)), ms);
  try {
    return await raceAbort(fn(signal), signal);
  } finally {
    clearTimeout(timer);
  }
}
