/**
 * Server configuration, read from environment variables ONCE when the app is created.
 *
 * Why (for learners): reading env in one place means we can see every knob at a
 * glance, tests can pass their own `env` object, and secrets (the Gemini key,
 * the Supabase service key) live in exactly one object that is never logged or
 * sent anywhere except to the service it belongs to.
 */

export interface ServerConfig {
  /** Secret. Only ever handed to the @google/genai constructor. */
  geminiApiKey: string | null;
  /** Pinned default model (GEMINI_MODEL); null → auto-pick via models.list(). */
  model: string | null;
  /** Optional "Pro" model used for coach replanning (GEMINI_MODEL_HEAVY). */
  heavyModel: string | null;
  allowedOrigins: string[];
  upstash: { url: string; token: string } | null;
  supabase: { url: string; serviceKey: string } | null;
}

function clean(v: string | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

export function loadConfig(env: NodeJS.ProcessEnv): ServerConfig {
  const upstashUrl = clean(env.UPSTASH_REDIS_REST_URL);
  const upstashToken = clean(env.UPSTASH_REDIS_REST_TOKEN);
  const supabaseUrl = clean(env.SUPABASE_URL) ?? clean(env.VITE_SUPABASE_URL);
  const supabaseKey = clean(env.SUPABASE_SERVICE_ROLE_KEY);
  return {
    geminiApiKey: clean(env.GEMINI_API_KEY),
    model: clean(env.GEMINI_MODEL),
    heavyModel: clean(env.GEMINI_MODEL_HEAVY),
    allowedOrigins: (env.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((s) => s.trim().replace(/\/+$/, ''))
      .filter(Boolean),
    upstash: upstashUrl && upstashToken ? { url: upstashUrl.replace(/\/+$/, ''), token: upstashToken } : null,
    supabase:
      supabaseUrl && supabaseKey ? { url: supabaseUrl.replace(/\/+$/, ''), serviceKey: supabaseKey } : null,
  };
}

/**
 * Timing and limit knobs. The defaults are the product spec; tests shrink them
 * (e.g. 1 ms backoff) so the suite stays fast without changing any logic.
 */
export interface AiTuning {
  /** Non-streaming Gemini calls. */
  callTimeoutMs: number;
  /** Streaming: max wait for the first chunk… */
  firstChunkTimeoutMs: number;
  /** …and between two chunks… */
  chunkIdleTimeoutMs: number;
  /** …and for the whole stream. */
  streamTotalTimeoutMs: number;
  /** Retries after the first attempt for 429/500/503. */
  maxRetries: number;
  retryBaseMs: number;
  retryMaxMs: number;
  /** SSE comment interval that keeps proxies from closing idle connections. */
  keepAliveMs: number;
  /** How long the auto-picked model name is cached. */
  modelCacheMs: number;
  rateLimit: { windowSec: number; windowMax: number; dayMax: number };
}

export const DEFAULT_TUNING: AiTuning = {
  callTimeoutMs: 30_000,
  firstChunkTimeoutMs: 30_000,
  chunkIdleTimeoutMs: 30_000,
  streamTotalTimeoutMs: 120_000,
  maxRetries: 2,
  retryBaseMs: 800,
  retryMaxMs: 6_000,
  keepAliveMs: 15_000,
  modelCacheMs: 60 * 60 * 1000,
  rateLimit: { windowSec: 10 * 60, windowMax: 20, dayMax: 150 },
};

export type TuningOverrides = Partial<Omit<AiTuning, 'rateLimit'>> & {
  rateLimit?: Partial<AiTuning['rateLimit']>;
};

export function resolveTuning(over: TuningOverrides = {}): AiTuning {
  return { ...DEFAULT_TUNING, ...over, rateLimit: { ...DEFAULT_TUNING.rateLimit, ...over.rateLimit } };
}
