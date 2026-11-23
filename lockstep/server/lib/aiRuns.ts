/**
 * ai_runs logging: one small record per Gemini call.
 *
 * Why (for learners): to understand cost and reliability we want to know which
 * model ran, how long it took, whether it worked and how many tokens it used.
 * We deliberately record NOTHING else: no prompts, no user text, no keys.
 *
 * Every record is:
 *   1. printed as one JSON line to stdout (Vercel / Cloud Run collect these), and
 *   2. if Supabase is configured, inserted into the `ai_runs` table through the
 *      PostgREST REST API. This is "fire and forget": logging must never slow
 *      down or break the user's request, so failures only print a warning.
 * The same records are returned in API responses so the browser can store them too.
 */
import type { AiKind, AiRunMeta } from '../../shared/api';

export interface RunRecorder {
  record(meta: AiRunMeta): void;
}

export interface RunRecorderOptions {
  supabase: { url: string; serviceKey: string } | null;
  fetchImpl?: typeof fetch;
  /** Where log lines go (stdout by default). */
  log?: (line: string) => void;
}

export function createRunRecorder(opts: RunRecorderOptions): RunRecorder {
  const log = opts.log ?? ((line: string) => console.log(line));
  const doFetch = opts.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  return {
    record(meta) {
      log(JSON.stringify({ type: 'ai_run', ...meta }));
      if (!opts.supabase) return;
      const { url, serviceKey } = opts.supabase;
      // Column names are snake_case (see docs/notes/server.md for the SQL).
      const row = {
        kind: meta.kind,
        model: meta.model,
        latency_ms: meta.latencyMs,
        ok: meta.ok,
        tokens: meta.tokens,
        at: meta.at,
      };
      void doFetch(`${url}/rest/v1/ai_runs`, {
        method: 'POST',
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(row),
        signal: AbortSignal.timeout(5_000),
      })
        .then((res) => {
          if (!res.ok) log(JSON.stringify({ type: 'ai_run_insert_failed', status: res.status }));
        })
        .catch(() => log(JSON.stringify({ type: 'ai_run_insert_failed', status: null })));
    },
  };
}

/** Build an AiRunMeta. `tokens` is usageMetadata.totalTokenCount when Gemini reports it. */
export function runMeta(
  kind: AiKind,
  model: string,
  startedAt: number,
  ok: boolean,
  tokens: number | null,
): AiRunMeta {
  return {
    kind,
    model,
    latencyMs: Math.max(0, Date.now() - startedAt),
    ok,
    tokens,
    at: new Date().toISOString(),
  };
}
