/**
 * POST /api/insights/weekly — a 2–3 sentence honest summary of the week.
 */
import { z } from 'zod';
import type { WeeklyInsightRequest, WeeklyInsightResponse } from '../../shared/api';
import { isDayKey } from '../../shared/time';
import { AppError } from '../lib/errors';
import { callGemini, responseText, type CallContext } from './call';
import { buildWeeklyPrompt } from './prompts';
import { SUMMARY_SCHEMA } from './schema';
import { tryParseJson } from './streamParser';

const minutes = z
  .number()
  .min(0)
  .max(7 * 24 * 60);

export const WeeklyInsightRequestSchema = z.object({
  goal: z.string().trim().min(1).max(300),
  weekStartKey: z.string().refine(isDayKey, 'Must be a real date in YYYY-MM-DD format'),
  plannedMinutes: minutes,
  actualMinutes: minutes,
  tasksCompleted: z.number().int().min(0).max(10_000),
  milestonesCompleted: z.number().int().min(0).max(1_000),
  streak: z.number().int().min(0).max(10_000),
  pace: z.enum(['ahead', 'on-track', 'behind']),
  daysLeft: z.number().int().min(-3650).max(3650),
}) satisfies z.ZodType<WeeklyInsightRequest>;

/** Plain text, max ~3 sentences / 600 chars, no markdown symbols or emoji. */
export function cleanSummary(raw: string): string {
  const s = raw
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '')
    .replace(/[*_#`]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > 600 ? `${s.slice(0, 599).trimEnd()}…` : s;
}

export async function generateWeeklyInsight(
  call: CallContext,
  model: string,
  req: WeeklyInsightRequest,
): Promise<WeeklyInsightResponse> {
  const { system, user } = buildWeeklyPrompt(req);
  const response = await callGemini(call, {
    kind: 'insight',
    model,
    request: {
      contents: [{ role: 'user', parts: [{ text: user }] }],
      config: {
        systemInstruction: system,
        responseMimeType: 'application/json',
        responseJsonSchema: SUMMARY_SCHEMA,
      },
    },
  });
  const parsed = tryParseJson(responseText(response)) as { summary?: unknown } | undefined;
  const summary = typeof parsed?.summary === 'string' ? cleanSummary(parsed.summary) : '';
  const run = call.runs[call.runs.length - 1];
  if (!summary || !run) throw new AppError('INTERNAL', 'Gemini returned an empty summary. Please try again.');
  return { summary, run };
}
