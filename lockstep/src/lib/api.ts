/**
 * Browser-side API client. The browser never talks to Gemini directly and never
 * sees the API key: every AI call goes through our own /api server.
 */
import type {
  ApiError,
  BackgroundRequestBody,
  BackgroundResponse,
  CoachRequest,
  CoachResponse,
  HealthResponse,
  MotivationRequest,
  MotivationResponse,
  PlanStreamEvent,
  WeeklyInsightRequest,
  WeeklyInsightResponse,
} from '@shared/api';
import type { IntakeInput } from '@shared/plan';

export class ApiCallError extends Error {
  constructor(
    public readonly error: ApiError,
    public readonly status: number,
  ) {
    super(error.message);
  }
}

const OFFLINE: ApiError = {
  code: 'AI_BUSY',
  message: "You're offline. Your saved plan still works — AI features return when you're back online.",
  retryable: true,
};

function toApiError(status: number, body: unknown): ApiError {
  const b = body as Partial<ApiError> | null;
  if (b && typeof b.code === 'string' && typeof b.message === 'string') return b as ApiError;
  if (status === 404)
    return {
      code: 'NOT_FOUND',
      message: 'The LOCKSTEP API is not reachable on this deployment.',
      retryable: false,
    };
  return {
    code: 'INTERNAL',
    message: 'Something went wrong on our side. Please try again.',
    retryable: true,
  };
}

async function postJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new ApiCallError(OFFLINE, 0);
  let res: Response;
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiCallError(OFFLINE, 0);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiCallError(toApiError(res.status, data), res.status);
  return data as T;
}

export async function getHealth(): Promise<HealthResponse | null> {
  try {
    const res = await fetch('/api/health');
    if (!res.ok) return null;
    return (await res.json()) as HealthResponse;
  } catch {
    return null;
  }
}

export const getMotivation = (req: MotivationRequest, signal?: AbortSignal) =>
  postJson<MotivationResponse>('/api/motivation', req, signal);

export const generateBackground = (req: BackgroundRequestBody, signal?: AbortSignal) =>
  postJson<BackgroundResponse>('/api/background', req, signal);

export const askCoach = (req: CoachRequest, signal?: AbortSignal) =>
  postJson<CoachResponse>('/api/coach', req, signal);

export const getWeeklyInsight = (req: WeeklyInsightRequest, signal?: AbortSignal) =>
  postJson<WeeklyInsightResponse>('/api/insights/weekly', req, signal);

/**
 * Stream a plan from POST /api/plan (Server-Sent Events over fetch, because
 * EventSource can't POST). Calls `onEvent` for each event. Abort with the signal.
 */
export async function streamPlan(
  intake: IntakeInput,
  onEvent: (e: PlanStreamEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  if (navigator.onLine === false) throw new ApiCallError(OFFLINE, 0);
  let res: Response;
  try {
    res = await fetch('/api/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(intake),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiCallError(OFFLINE, 0);
  }
  if (!res.ok || !res.body || !res.headers.get('content-type')?.includes('text/event-stream')) {
    const data = await res.json().catch(() => null);
    throw new ApiCallError(toApiError(res.status, data), res.status);
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let idx: number;
    // SSE messages are separated by a blank line.
    while ((idx = buffer.search(/\r?\n\r?\n/)) !== -1) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx).replace(/^\r?\n\r?\n/, '');
      const parsed = parseSse(raw);
      if (parsed) onEvent(parsed);
    }
  }
}

function parseSse(raw: string): PlanStreamEvent | null {
  let event = 'message';
  const data: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith(':')) continue; // keep-alive comment
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
  }
  if (!data.length) return null;
  try {
    return { event, data: JSON.parse(data.join('\n')) } as PlanStreamEvent;
  } catch {
    return null;
  }
}
