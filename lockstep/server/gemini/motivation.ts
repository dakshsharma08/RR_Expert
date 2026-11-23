/**
 * POST /api/motivation — one calm, specific line for the lock screen.
 *
 * Cached in memory by a hash of the request (which includes `dateKey`), so the
 * same numbers on the same day never cost a second Gemini call. A cached answer
 * returns the ORIGINAL run record (same `at`), so the client can de-duplicate.
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { MotivationRequest, MotivationResponse } from '../../shared/api';
import { isDayKey } from '../../shared/time';
import { AppError } from '../lib/errors';
import { callGemini, responseText, type CallContext } from './call';
import { buildMotivationPrompt } from './prompts';
import { LINE_SCHEMA } from './schema';
import { tryParseJson } from './streamParser';

export const MotivationRequestSchema = z.object({
  goal: z.string().trim().min(1).max(300),
  daysLeft: z.number().int().min(-3650).max(3650),
  percentDone: z.number().min(0).max(100),
  nextMilestone: z.string().trim().max(160).nullable(),
  streak: z.number().int().min(0).max(10_000),
  pace: z.enum(['ahead', 'on-track', 'behind']),
  state: z.enum(['upcoming', 'active', 'due-today', 'completed', 'expired']),
  dateKey: z.string().refine(isDayKey, 'Must be a real date in YYYY-MM-DD format'),
}) satisfies z.ZodType<MotivationRequest>;

export const MAX_LINE_CHARS = 90;

/** Strip emoji, quotes and line breaks; keep it to one line of ≤ 90 characters. */
export function cleanLine(raw: string): string {
  let s = raw
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .trim();
  if (s.length > MAX_LINE_CHARS) {
    const cut = s.slice(0, MAX_LINE_CHARS - 1);
    const space = cut.lastIndexOf(' ');
    s = `${(space > 40 ? cut.slice(0, space) : cut).replace(/[\s,;:—-]+$/, '')}…`;
  }
  return s;
}

export class MotivationCache {
  private readonly map = new Map<string, MotivationResponse>();
  constructor(private readonly maxEntries = 500) {}

  static keyOf(r: MotivationRequest): string {
    // Fixed key order so equal requests always hash the same.
    const canonical = JSON.stringify([
      r.goal,
      r.daysLeft,
      r.percentDone,
      r.nextMilestone,
      r.streak,
      r.pace,
      r.state,
      r.dateKey,
    ]);
    return createHash('sha256').update(canonical).digest('hex');
  }

  get(key: string): MotivationResponse | undefined {
    return this.map.get(key);
  }

  set(key: string, value: MotivationResponse) {
    if (this.map.size >= this.maxEntries) {
      // Maps iterate in insertion order, so the first key is the oldest.
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, value);
  }
}

export async function generateMotivation(
  call: CallContext,
  model: string,
  req: MotivationRequest,
  cache: MotivationCache,
): Promise<MotivationResponse> {
  const key = MotivationCache.keyOf(req);
  const hit = cache.get(key);
  if (hit) return hit;

  const { system, user } = buildMotivationPrompt(req);
  const response = await callGemini(call, {
    kind: 'motivation',
    model,
    request: {
      contents: [{ role: 'user', parts: [{ text: user }] }],
      config: {
        systemInstruction: system,
        responseMimeType: 'application/json',
        responseJsonSchema: LINE_SCHEMA,
      },
    },
  });
  const parsed = tryParseJson(responseText(response)) as { line?: unknown } | undefined;
  const line = typeof parsed?.line === 'string' ? cleanLine(parsed.line) : '';
  const run = call.runs[call.runs.length - 1];
  if (!line || !run) throw new AppError('INTERNAL', 'Gemini returned an empty line. Please try again.');
  const result: MotivationResponse = { line, run };
  cache.set(key, result);
  return result;
}
