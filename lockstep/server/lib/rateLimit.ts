/**
 * Per-IP rate limiting for the AI routes: 20 requests per 10 minutes and 150 per day.
 *
 * Why (for learners): every AI request costs money and quota. Limits stop one
 * person (or a bot) from using it all up.
 *
 * Two stores:
 *   - memory: a Map in this process. Perfect locally, but on serverless every
 *     instance has its own Map, so the limit is only approximate there.
 *   - Upstash Redis (REST): shared by all instances. Used when
 *     UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set. We send one
 *     pipeline per window: INCR (count this request), EXPIRE … NX (start the
 *     window clock only on the first request) and TTL (seconds until reset,
 *     used for the Retry-After header).
 * If Upstash fails, we fall back to memory rather than blocking everyone.
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { AppError } from './errors';

export interface RateLimitRule {
  name: string;
  windowSec: number;
  max: number;
}

export interface RateLimitDecision {
  ok: boolean;
  /** Seconds until the tightest exceeded window resets (0 when ok). */
  retryAfterSec: number;
  /** Which rule blocked the request, if any. */
  rule: string | null;
}

export interface RateLimiter {
  readonly kind: 'memory' | 'upstash';
  hit(key: string): Promise<RateLimitDecision>;
}

export function rulesFrom(limits: { windowSec: number; windowMax: number; dayMax: number }): RateLimitRule[] {
  return [
    { name: 'window', windowSec: limits.windowSec, max: limits.windowMax },
    { name: 'day', windowSec: 24 * 60 * 60, max: limits.dayMax },
  ];
}

function decide(rules: RateLimitRule[], counts: { count: number; ttlSec: number }[]): RateLimitDecision {
  let blocked: RateLimitDecision = { ok: true, retryAfterSec: 0, rule: null };
  rules.forEach((rule, i) => {
    const c = counts[i];
    if (!c || c.count <= rule.max) return;
    const retry = Math.max(1, Math.ceil(c.ttlSec));
    // If several windows are exceeded, the client must wait for the LONGEST one.
    if (blocked.ok || retry > blocked.retryAfterSec)
      blocked = { ok: false, retryAfterSec: retry, rule: rule.name };
  });
  return blocked;
}

export class MemoryRateLimiter implements RateLimiter {
  readonly kind = 'memory' as const;
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly rules: RateLimitRule[],
    private readonly nowMs: () => number = Date.now,
  ) {}

  async hit(key: string): Promise<RateLimitDecision> {
    const now = this.nowMs();
    if (this.buckets.size > 10_000) this.sweep(now);
    const counts = this.rules.map((rule) => {
      const k = `${rule.name}:${key}`;
      let b = this.buckets.get(k);
      if (!b || b.resetAt <= now) {
        b = { count: 0, resetAt: now + rule.windowSec * 1000 };
        this.buckets.set(k, b);
      }
      b.count += 1;
      return { count: b.count, ttlSec: (b.resetAt - now) / 1000 };
    });
    return decide(this.rules, counts);
  }

  private sweep(now: number) {
    for (const [k, b] of this.buckets) if (b.resetAt <= now) this.buckets.delete(k);
  }
}

type PipelineResult = { result?: unknown; error?: string };

export class UpstashRateLimiter implements RateLimiter {
  readonly kind = 'upstash' as const;

  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly rules: RateLimitRule[],
    private readonly fallback: RateLimiter,
    private readonly fetchImpl: typeof fetch = (...a) => fetch(...a),
  ) {}

  async hit(key: string): Promise<RateLimitDecision> {
    const commands = this.rules.flatMap((rule) => {
      const k = `lockstep:rl:${rule.name}:${key}`;
      return [
        ['INCR', k],
        ['EXPIRE', k, String(rule.windowSec), 'NX'],
        ['TTL', k],
      ];
    });
    try {
      const res = await this.fetchImpl(`${this.url}/pipeline`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(commands),
        signal: AbortSignal.timeout(2_000),
      });
      if (!res.ok) throw new Error(`Upstash HTTP ${res.status}`);
      const results = (await res.json()) as PipelineResult[];
      const counts = this.rules.map((rule, i) => {
        const incr = results[i * 3]?.result;
        const ttl = results[i * 3 + 2]?.result;
        const count = Number(incr);
        if (!Number.isFinite(count)) throw new Error('Upstash returned an unexpected result');
        const ttlNum = Number(ttl);
        return { count, ttlSec: Number.isFinite(ttlNum) && ttlNum > 0 ? ttlNum : rule.windowSec };
      });
      return decide(this.rules, counts);
    } catch {
      // Never log the token or URL. A short note is enough to notice the problem.
      console.warn(JSON.stringify({ type: 'rate_limit_fallback', store: 'memory' }));
      return this.fallback.hit(key);
    }
  }
}

export function createRateLimiter(
  upstash: { url: string; token: string } | null,
  rules: RateLimitRule[],
  fetchImpl?: typeof fetch,
): RateLimiter {
  const memory = new MemoryRateLimiter(rules);
  return upstash ? new UpstashRateLimiter(upstash.url, upstash.token, rules, memory, fetchImpl) : memory;
}

/**
 * The caller's IP, without trusting headers a client can forge.
 * - On Vercel (app setting `lockstep:vercel`), the platform overwrites
 *   x-forwarded-for and sets x-real-ip, so those are the real client.
 * - Elsewhere we use `req.ip`, which honours Express' `trust proxy` setting
 *   (TRUST_PROXY env = number of proxy hops, e.g. 1 on Cloud Run). With no trusted
 *   proxy, it is the socket address, so a random X-Forwarded-For can't mint new buckets.
 */
export function clientIp(req: Request): string {
  if (req.app?.get('lockstep:vercel')) {
    const real = req.headers['x-real-ip'];
    const realIp = (Array.isArray(real) ? real[0] : real)?.trim();
    if (realIp) return realIp;
    const xff = req.headers['x-forwarded-for'];
    const first = (Array.isArray(xff) ? xff[0] : xff)?.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

export function rateLimitMiddleware(limiter: RateLimiter, what = 'AI requests'): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const decision = await limiter.hit(clientIp(req));
    if (decision.ok) return next();
    const minutes = Math.ceil(decision.retryAfterSec / 60);
    const message = decision.rule?.endsWith('day')
      ? `You've reached today's limit for ${what}. Try again in about ${Math.ceil(minutes / 60)} hour(s).`
      : `You've made a lot of ${what} in a short time. Try again in about ${minutes} minute(s).`;
    next(
      new AppError('RATE_LIMITED', message, { headers: { 'Retry-After': String(decision.retryAfterSec) } }),
    );
  };
}
