/**
 * POST /api/coach — a short, data-grounded coaching reply using Gemini FUNCTION CALLING.
 *
 * How function calling works (for learners):
 *   1. We send the conversation plus a list of tools (name, description,
 *      JSON-schema parameters). We do NOT paste the whole plan into the prompt.
 *   2. Gemini may answer with `functionCall` parts ("call getPlan()") instead of text.
 *   3. We run the function ourselves and send back a `functionResponse` part.
 *   4. Repeat (max 4 tool rounds) until Gemini answers with plain text.
 *
 * Our tools:
 *   - getPlan()      → the goal + milestones from the REQUEST (the client is the
 *                      source of truth for the user's data; the server stores nothing).
 *   - getProgress()  → the progress numbers from the request.
 *   - proposeReschedule({summary, changes}) → validated HERE with the same date
 *     rules as plans. The result (valid / errors) goes back to Gemini so it can
 *     fix its own mistakes. The server never applies anything: the final
 *     `proposal` (old → new for each change) is shown to the user as a diff with
 *     Accept / Reject.
 */
import { FunctionCallingConfigMode, type Content, type FunctionDeclaration, type Part } from '@google/genai';
import { z } from 'zod';
import type {
  CoachChip,
  CoachContext,
  CoachProposal,
  CoachRequest,
  CoachResponse,
  RescheduleChange,
} from '../../shared/api';
import { allowedMilestoneDates, computeCapacity } from '../../shared/plan';
import { WEEKDAY_SHORT, effectiveDeadlineKey, isDayKey, isValidTimeZone, weekdayOf } from '../../shared/time';
import { AppError, toAppError } from '../lib/errors';
import { callGemini, partsText, responseContent, type CallContext } from './call';
import { CHIP_MESSAGES, buildCoachSystemInstruction, buildCoachUserText } from './prompts';

// ───────────────────────────── Input schema ─────────────────────────────

const dayKeySchema = z.string().refine(isDayKey, 'Must be a real date in YYYY-MM-DD format');
const CHIPS = ['on-track', 'today', 'replan', 'lighten', 'improve'] as const;

const MilestoneContextSchema = z.object({
  id: z.string().min(1).max(40),
  title: z.string().max(160),
  targetDate: dayKeySchema,
  estimatedHours: z.number().nonnegative().max(2000),
  status: z.enum(['pending', 'approved', 'completed']),
  tasksDone: z.number().int().min(0).max(100),
  tasksTotal: z.number().int().min(0).max(100),
  tasks: z
    .array(
      z.object({
        title: z.string().max(160),
        done: z.boolean(),
        estimatedMinutes: z.number().min(0).max(600),
      }),
    )
    .max(12)
    .optional(),
});

export const CoachRequestSchema = z
  .object({
    message: z.string().trim().max(1000, 'Keep messages under 1000 characters').default(''),
    chip: z.enum(CHIPS).optional(),
    context: z.object({
      goal: z.object({
        title: z.string().max(400),
        deadlineUtc: z.iso.datetime({ offset: true }),
        timezone: z.string().refine(isValidTimeZone, 'Unknown time zone'),
        hoursPerDay: z.number().min(0.5).max(16),
        workingDays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
        pace: z.string().max(40),
      }),
      todayKey: dayKeySchema,
      milestones: z.array(MilestoneContextSchema).max(20),
      progress: z.object({
        percentDone: z.number().min(0).max(100),
        timePct: z.number().min(0).max(100),
        pace: z.enum(['ahead', 'on-track', 'behind']),
        streak: z.number().int().min(0).max(10_000),
        minutesLast7Days: z
          .number()
          .min(0)
          .max(7 * 24 * 60),
        daysLeft: z.number().int().min(-3650).max(3650),
      }),
    }),
    // History is capped at the last 10 turns (older turns are dropped, not rejected).
    history: z
      .array(z.object({ role: z.enum(['user', 'model']), text: z.string().max(2000) }))
      .max(40)
      .default([])
      .transform((h) => h.slice(-10)),
  })
  .refine((r) => r.message.length > 0 || r.chip !== undefined, {
    message: 'Type a message or pick a suggestion',
    path: ['message'],
  });

export type ParsedCoachRequest = z.infer<typeof CoachRequestSchema>;
// Compile-time check that the parsed request is a valid CoachRequest.
const _typecheck: (r: ParsedCoachRequest) => CoachRequest = (r) => r;
void _typecheck;

// ───────────────────────────── Tools ─────────────────────────────

export const COACH_TOOLS: FunctionDeclaration[] = [
  {
    name: 'getPlan',
    description:
      "Returns the user's goal and all milestones (id, title, targetDate, estimatedHours, status, task counts and tasks).",
  },
  {
    name: 'getProgress',
    description:
      'Returns progress: percentDone, timePct (share of the time window used), pace, streak, minutesLast7Days, daysLeft.',
  },
  {
    name: 'proposeReschedule',
    description:
      'Propose new target dates (and optionally new hours) for milestones. The server validates the proposal and returns errors to fix. The user must accept it in the app; nothing is applied automatically.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'One sentence explaining the change for the user.' },
        changes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              milestoneId: { type: 'string' },
              newTargetDate: { type: 'string', description: 'YYYY-MM-DD' },
              newEstimatedHours: { type: 'number' },
            },
            required: ['milestoneId', 'newTargetDate'],
          },
        },
      },
      required: ['summary', 'changes'],
    },
  },
];

const ProposalArgsSchema = z.object({
  summary: z.string().trim().max(400).default(''),
  changes: z
    .array(
      z.object({
        milestoneId: z.string(),
        newTargetDate: z.string(),
        newEstimatedHours: z.number().optional().nullable(),
      }),
    )
    .max(20),
});

/**
 * Validate a proposeReschedule call against the plan rules. Pure function:
 * same input → same output, so it is easy to test.
 */
export function validateReschedule(args: unknown, context: CoachContext, todayKey: string): CoachProposal {
  const parsed = ProposalArgsSchema.safeParse(args);
  if (!parsed.success) {
    return {
      summary: '',
      changes: [],
      valid: false,
      errors: parsed.error.issues
        .slice(0, 6)
        .map((i) => `Arguments: ${i.path.join('.') || '(root)'} ${i.message}`),
    };
  }
  const { summary, changes: proposed } = parsed.data;
  const errors: string[] = [];
  const g = context.goal;
  const deadlineKey = effectiveDeadlineKey(g.deadlineUtc, g.timezone);
  const sameDay = deadlineKey === todayKey;
  const working = new Set(g.workingDays);
  const byId = new Map(context.milestones.map((m) => [m.id, m]));
  const seen = new Set<string>();
  const changes: RescheduleChange[] = [];

  if (proposed.length === 0) errors.push('No changes were proposed.');

  for (const c of proposed) {
    const m = byId.get(c.milestoneId);
    if (!m) {
      errors.push(`Unknown milestoneId "${c.milestoneId}". Use an id from getPlan().`);
      continue;
    }
    if (seen.has(m.id)) {
      errors.push(`Milestone "${m.title}" (${m.id}) is changed more than once.`);
      continue;
    }
    seen.add(m.id);
    const label = `Milestone "${m.title}" (${m.id})`;
    const newHours = c.newEstimatedHours ?? m.estimatedHours;
    changes.push({
      milestoneId: m.id,
      title: m.title,
      oldDate: m.targetDate,
      newDate: c.newTargetDate,
      oldHours: m.estimatedHours,
      newHours,
    });

    if (m.status === 'completed') errors.push(`${label} is already completed; leave it unchanged.`);
    if (!(Number.isFinite(newHours) && newHours > 0 && newHours <= 2000)) {
      errors.push(`${label} newEstimatedHours must be more than 0 (got ${newHours}).`);
    }
    if (!isDayKey(c.newTargetDate)) {
      errors.push(`${label} newTargetDate "${c.newTargetDate}" is not a valid YYYY-MM-DD date.`);
      continue;
    }
    const d = c.newTargetDate;
    const afterToday = sameDay ? d >= todayKey : d > todayKey;
    if (!afterToday) errors.push(`${label} newTargetDate ${d} must be after today (${todayKey}).`);
    if (d > deadlineKey)
      errors.push(`${label} newTargetDate ${d} is after the deadline day (${deadlineKey}).`);
    if (!working.has(weekdayOf(d))) {
      errors.push(
        `${label} newTargetDate ${d} is a ${WEEKDAY_SHORT[weekdayOf(d)]}, which is not a working day (${g.workingDays
          .map((w) => WEEKDAY_SHORT[w])
          .join(', ')}).`,
      );
    }
  }

  // Chronological in the resulting plan order (only pairs touching a change are reported).
  const changed = new Map(changes.filter((c) => isDayKey(c.newDate)).map((c) => [c.milestoneId, c.newDate]));
  const resulting = context.milestones.map((m) => ({ m, date: changed.get(m.id) ?? m.targetDate }));
  for (let i = 1; i < resulting.length; i++) {
    const prev = resulting[i - 1]!;
    const cur = resulting[i]!;
    if (!changed.has(prev.m.id) && !changed.has(cur.m.id)) continue;
    if (cur.date < prev.date) {
      errors.push(
        `After the change, "${cur.m.title}" (${cur.date}) would come before "${prev.m.title}" (${prev.date}); keep milestones in plan order.`,
      );
    }
  }

  return { summary: summary || 'Proposed schedule change', changes, valid: errors.length === 0, errors };
}

// ───────────────────────────── The loop ─────────────────────────────

export const MAX_TOOL_ROUNDS = 4;

/** Plain text only: strip markdown symbols and keep it to ~120 words. */
export function cleanReply(raw: string): string {
  let s = raw
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '')
    .replace(/\*\*|__|`+/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const words = s.split(/\s+/);
  if (words.length > 130) s = `${words.slice(0, 120).join(' ')}…`;
  return s;
}

export interface CoachModels {
  defaultModel: string;
  heavyModel: string | null;
}

export async function runCoach(
  call: CallContext,
  models: CoachModels,
  req: ParsedCoachRequest,
  todayKey: string,
): Promise<CoachResponse> {
  const context = req.context as CoachContext;
  const chip: CoachChip | undefined = req.chip;
  const message = req.message || (chip ? CHIP_MESSAGES[chip] : '');

  const g = context.goal;
  const capacity = computeCapacity({
    todayKey,
    deadlineUtc: g.deadlineUtc,
    timezone: g.timezone,
    hoursPerDay: g.hoursPerDay,
    workingDays: g.workingDays,
  });
  const systemInstruction = buildCoachSystemInstruction({
    context,
    todayKey,
    deadlineKey: capacity.toKey,
    capacityHours: capacity.capacityHours,
    workingDayCount: capacity.workingDayCount,
    allowedDates: allowedMilestoneDates(capacity),
    ...(chip ? { chip } : {}),
  });

  const contents: Content[] = [{ role: 'user', parts: [{ text: buildCoachUserText(message, req.history) }] }];
  const toolCalls: string[] = [];
  // `as` widens the type: TypeScript can't see the assignment inside the tool callback below.
  let proposal = null as CoachProposal | null;

  // Replanning is harder reasoning, so it may use the heavy (Pro) model, with a fallback.
  const wantsHeavy = (chip === 'replan' || chip === 'lighten') && !!models.heavyModel;
  let model = wantsHeavy && models.heavyModel ? models.heavyModel : models.defaultModel;

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const lastRound = round === MAX_TOOL_ROUNDS;
    const request = {
      contents,
      config: {
        systemInstruction,
        tools: [{ functionDeclarations: COACH_TOOLS }],
        // On the last round we force a text answer so the loop always ends.
        toolConfig: {
          functionCallingConfig: {
            mode: lastRound ? FunctionCallingConfigMode.NONE : FunctionCallingConfigMode.AUTO,
          },
        },
      },
    };

    let response;
    try {
      // The heavy model gets one attempt (no retries) because we have a fallback.
      response = await callGemini(call, {
        kind: 'coach',
        model,
        request,
        retries: model === models.defaultModel ? undefined : 0,
      });
    } catch (err) {
      const e = toAppError(err, call.signal);
      if (model !== models.defaultModel && e.code !== 'CANCELLED') {
        model = models.defaultModel;
        response = await callGemini(call, { kind: 'coach', model, request });
      } else {
        throw e;
      }
    }

    const content = responseContent(response);
    const calls = (content?.parts ?? []).filter((p) => p.functionCall?.name).map((p) => p.functionCall!);
    if (calls.length === 0 || lastRound) {
      const text = cleanReply(partsText(content?.parts));
      const reply = text || proposal?.summary || '';
      if (!reply) throw new AppError('INTERNAL', 'Gemini returned an empty reply. Please try again.');
      return { reply, proposal, toolCalls, runs: call.runs };
    }

    // Keep the model's turn exactly as sent (it may carry thought signatures that must be returned).
    contents.push(content ?? { role: 'model', parts: calls.map((fc) => ({ functionCall: fc })) });
    const responses: Part[] = calls.map((fc) => {
      const name = fc.name ?? '';
      toolCalls.push(name);
      let result: Record<string, unknown>;
      if (name === 'getPlan') {
        result = { goal: context.goal, milestones: context.milestones };
      } else if (name === 'getProgress') {
        result = { ...context.progress };
      } else if (name === 'proposeReschedule') {
        proposal = validateReschedule(fc.args ?? {}, context, todayKey);
        result = {
          valid: proposal.valid,
          errors: proposal.errors,
          changes: proposal.changes,
          note: proposal.valid
            ? 'Valid. The app will show this to the user to Accept or Reject; it is NOT applied yet.'
            : 'Not valid. Fix every error and call proposeReschedule again.',
        };
      } else {
        result = { error: `Unknown tool "${name}".` };
      }
      return { functionResponse: { name, ...(fc.id ? { id: fc.id } : {}), response: result } };
    });
    contents.push({ role: 'user', parts: responses });
  }

  // Unreachable: the last round always returns above.
  throw new AppError('INTERNAL');
}
