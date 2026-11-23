# Server notes — Gemini engine

How the LOCKSTEP API works, what was checked, and what is still open.

## Files

| Path | What it does |
|---|---|
| `server/app.ts` | `createApp({ now?, gemini?, env?, tuning?, wallpaperStore? })`: helmet, CORS allow-list, `express.json({ limit: '15mb' })`, `/api` routes, JSON 404 for `/api`, ApiError error handler |
| `server/dev.ts` | Loads `.env` with `process.loadEnvFile` and listens on `PORT` or 8787 |
| `server/prod.ts` | Serves `dist/` (with long cache on `/assets`) and the API, falls back to `index.html` for SPA routes, and listens on `PORT` or 8080 |
| `api/index.ts` | Vercel entry: `export default createApp()` |
| `vercel.json` | Rewrites `/api/(.*)` to `/api` and everything else to `/index.html`; `/assets/*` gets `immutable` caching |
| `server/gemini/client.ts` | `GeminiLike`, `createGeminiClient`, `ModelResolver` (models.list, cached for 1 h, falls back to `gemini-flash-latest`) |
| `server/gemini/call.ts` | `callGemini` (30 s per attempt, retries) and `streamGemini` (30 s to the first chunk, 30 s between chunks, 120 s in total). Also logs runs and detects safety blocks |
| `server/gemini/prompts.ts` | All prompts, plus `neutralize` and `wrapData` for prompt-injection defense |
| `server/gemini/schema.ts` | `responseJsonSchema` for plans (with `propertyOrdering`, and a targetDate `enum` when there are 90 or fewer allowed dates) |
| `server/gemini/streamParser.ts` | `PlanStreamParser`: brace-depth scanner that emits `feasibility` and each complete milestone |
| `server/gemini/plan.ts` / `repair.ts` | `preparePlanJob` (facts and 400 checks), `generatePlan` (stream, validate, then at most one repair) |
| `server/gemini/coach.ts` | Function-calling loop (up to 4 tool rounds, then a forced text answer) and `validateReschedule` |
| `server/gemini/motivation.ts` / `insight.ts` | The motivation line (cached by request hash) and the weekly summary |
| `server/gemini/routes.ts` | The routes and the order of checks |
| `server/lib/*` | errors, config/tuning, retry, timeout, rate limit (memory or Upstash), SSE, ai_runs |

## Routes and order of checks

Every AI route runs the same checks in this order:

1. **Rate limit**, per IP (the first `x-forwarded-for` entry, otherwise `req.ip`). The limits are 20 requests per 10 min and 150 per day. Over the limit, the route returns `429 RATE_LIMITED` with a `Retry-After` header.
2. **Body check** with zod. A bad body returns `400 INVALID_INPUT` with `details: ["path: message", …]`.
3. **Key check.** With no key, the route returns `503 AI_NOT_CONFIGURED`. We never fake AI output.
4. **Gemini call.**

Before the plan stream opens, errors come back as normal JSON with an HTTP status: `{ code, message, retryable, details? }`. This is the bare `ApiError` shape, with no wrapper. Once the stream has opened with HTTP 200, errors arrive as an `event: error` instead.

| Code | HTTP | When |
|---|---|---|
| INVALID_INPUT | 400 (413 if the body is too large) | Zod failure, deadline in the past, no usable working days, safety block (`details: ["blocked: SAFETY"]`) |
| RATE_LIMITED | 429 | Over the limit. The `Retry-After` header gives the wait in seconds |
| AI_NOT_CONFIGURED | 503 | No `GEMINI_API_KEY`, or the key was rejected |
| AI_BUSY | 503 | Still getting 429/500/503 after 2 retries, or Gemini can't be reached |
| TIMEOUT | 504 | First-chunk, idle or total stream timeout, or the 30 s limit on a single call |
| PLAN_INVALID | (SSE only) | The repaired plan still failed its hard checks |
| NOT_FOUND | 404 | Unknown `/api/*` route |

### POST /api/plan event order

```
status{thinking} → status{streaming} → feasibility → milestone{index:0} … → status{validating}
  [→ status{repairing} → status{validating}] → status{done} → result
```

`result` or `error` is always the **last** event. Milestone events are only previews. The client must use `result.plan`, because a repair can change dates. Comment lines (`: keepalive`) arrive every 15 s, and the client should ignore them. If the client aborts the fetch, the server aborts the Gemini request too.

### Other routes

- `POST /api/motivation` returns `{ line, run }`. The line is at most 90 characters, with no emoji. Answers are cached in memory by the SHA-256 of the request, which includes `dateKey`. A cache hit returns the *original* `run`, with the same `at`, so the client should de-duplicate runs by `at`.
- `POST /api/coach` returns `{ reply, proposal, toolCalls, runs }`. The request takes either a `message` of at most 1000 characters, or a `chip`, which replaces an empty message with a preset one. `history` keeps the last 10 turns; older turns are dropped and up to 40 are accepted. The server never applies a proposal. Its `valid` and `errors` fields tell the UI whether to enable Accept. "Today" comes from the **server clock** in `context.goal.timezone`; the client's `todayKey` is ignored. The `replan` and `lighten` chips use `GEMINI_MODEL_HEAVY` once, with no retries, and fall back to the default model if it fails.
- `POST /api/insights/weekly` returns `{ summary, run }`.
- `GET /api/health` calls `models.list()` only when a key is set, and only once per hour. `imageModel` is always `null`, and `wallpaperStore` is reported from `createApp` options; it defaults to `upstash` when Upstash is configured, otherwise `memory`.

## SDK facts (@google/genai 3.6.1), verified by intercepting requests

- The default API version for the Developer API is **`v1`**, not v1beta. The SDK sends these requests:
  - `POST https://generativelanguage.googleapis.com/v1/models/{model}:generateContent`
  - `POST …/v1/models/{model}:streamGenerateContent?alt=sse`. The response body is `data: {GenerateContentResponse}\r\n\r\n` chunks.
  - `GET  …/v1/models?pageSize=…`. The response is `{ models: [{ name: "models/…", supportedGenerationMethods }] }`.
  - To use v1beta instead, set `GOOGLE_GENAI_API_VERSION=beta`; the SDK reads it itself.
- The key goes in the `x-goog-api-key` header. Body layout:
  - `config.systemInstruction` is sent as top-level `systemInstruction: {parts:[{text}], role:"user"}`.
  - `responseMimeType`, `responseJsonSchema` and `thinkingConfig` go inside `generationConfig`.
  - `tools` and `toolConfig` are top-level fields.
- `config.abortSignal` is the cancel switch. The SDK combines it with its own per-attempt signal and passes it to `fetch`.
- The SDK only retries when `httpOptions.retryOptions` is set. We don't set it; our own retry logic lives in `server/lib/retry.ts`.
- Without callable tools, `generateContentStream` performs the HTTP request before it returns, so HTTP errors reject the promise. Retrying is therefore only safe before the first chunk.
- `response.text` warns when a response mixes text and function calls, so we use `partsText()`, which also skips `thought` parts.
- For Gemini 2.5+ models we set `thinkingConfig.includeThoughts: true`. Thought summaries then stream early and keep the 30 s first-chunk timer from firing. They are never shown or stored.
- Automatic continuation, an SDK default, is left on. It only triggers on `finishReason: CONTINUATION`.

## Test notes

- Run `npx vitest run tests/integration`: 2 files, 43 tests. MSW `setupServer` uses `onUnhandledFrame`, which fails any unmocked external request and lets `127.0.0.1` through.
- MSW 3 quirk: a mocked streaming body *with no length* that hangs and is then aborted makes undici assert (`!this.aborted`) when the mocked socket closes. The cancel test's hanging mock therefore sets a `Content-Length`.
- Vitest 5 hides `console.log` from passing or skipped tests. The live test prints `SKIPPED: no GEMINI_API_KEY` with `process.stdout.write`.
- Run `npm run test:live` with a real key: 3 tests (health, streamed plan, motivation + coach tools).

## Supabase `ai_runs` table (server inserts)

The server inserts rows with the service-role key over PostgREST, fire-and-forget. It sends no prompts, no user text and no user id.

```sql
create table if not exists public.ai_runs (
  id bigint generated always as identity primary key,
  kind text not null,          -- plan | repair | coach | motivation | insight | background
  model text not null,
  latency_ms integer not null,
  ok boolean not null,
  tokens integer,
  at timestamptz not null
);
alter table public.ai_runs enable row level security; -- service role bypasses RLS
```

If the frontend also stores runs in Supabase with a `user_id`, add that column as nullable. Server rows leave it null.

## Open points / risks

- **Vercel and ESM:** with `"type": "module"`, Vercel's Node runtime may reject extensionless relative imports (`./time`, `../server/app`) with ERR_MODULE_NOT_FOUND. If a deploy fails this way, either pre-bundle the function (esbuild `--bundle --platform=node`) or switch the imports to `.js` extensions.
- **`maxDuration: 300`** needs Fluid compute, which is the default for new projects. On an older Hobby project, lower it to 60.
- **Spoofable IP:** on hosts that *append* to a client-sent `x-forwarded-for`, such as Cloud Run, the first entry can be spoofed. Vercel overwrites the header.
- **Memory limits are per instance:** the in-memory rate limit and motivation cache belong to one serverless instance. Use Upstash for real limits.
- **Logging on Vercel:** a fire-and-forget Supabase insert can be cut off when the function freezes. The insert starts before the response ends, so this is rare. `waitUntil` would make it certain.
