/**
 * Retry with exponential backoff and jitter.
 *
 * Why (for learners): when Gemini answers 429 (too many requests) or 500/503
 * (overloaded), trying again a moment later usually works. We wait longer after
 * each failure (exponential backoff), and we add randomness (jitter) so many
 * servers that failed together don't all retry at the same instant.
 *
 * We also honour the AbortSignal: if the user closes the tab while we are
 * waiting to retry, we stop at once instead of calling Gemini for nobody.
 */

export interface RetryOptions {
  /** Retries AFTER the first attempt (spec: 2 → at most 3 calls). */
  retries: number;
  baseMs: number;
  maxMs: number;
  signal?: AbortSignal;
  shouldRetry: (err: unknown) => boolean;
  /** Injectable randomness for tests. */
  random?: () => number;
}

/**
 * Delay before retry number `attempt` (0-based): base × 2^attempt, capped,
 * then "equal jitter": a random value between half and all of that.
 */
export function backoffDelay(
  attempt: number,
  baseMs: number,
  maxMs: number,
  random: () => number = Math.random,
): number {
  const exp = Math.min(maxMs, baseMs * 2 ** attempt);
  return Math.round(exp / 2 + random() * (exp / 2));
}

/** setTimeout as a promise that rejects with the signal's reason if aborted. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(signal?.reason);
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export async function withRetry<T>(fn: (attempt: number) => Promise<T>, opts: RetryOptions): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    if (opts.signal?.aborted) throw opts.signal.reason;
    try {
      return await fn(attempt);
    } catch (err) {
      const canRetry = attempt < opts.retries && opts.shouldRetry(err) && !opts.signal?.aborted;
      if (!canRetry) throw err;
      await sleep(backoffDelay(attempt, opts.baseMs, opts.maxMs, opts.random), opts.signal);
    }
  }
}
