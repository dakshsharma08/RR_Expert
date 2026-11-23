/**
 * Plan contracts + deterministic checks, shared by the browser and the API.
 *
 * Gemini proposes a plan; THIS file decides whether the plan is valid. We never
 * trust the model's arithmetic or dates blindly:
 *   1. Zod checks the SHAPE (types, lengths, enums).
 *   2. `validatePlan` checks the LOGIC in plain code: dates in range, in order,
 *      on working days, and hours vs. the capacity we compute ourselves.
 *   3. Feasibility is recomputed in code. If Gemini disagrees, the UI shows the
 *      code result and the reason.
 */
import { z } from 'zod';
import {
  WEEKDAY_SHORT,
  addDays,
  diffDays,
  effectiveDeadlineKey,
  isDayKey,
  isValidTimeZone,
  weekdayOf,
  workingDaysBetween,
} from './time';

export const LEVELS = ['Beginner', 'Intermediate', 'Advanced'] as const;
export const PACES = ['Steady', 'Balanced', 'Sprint'] as const;
export const FEASIBILITY = ['Achievable', 'Tight', 'Unrealistic'] as const;
export const DIFFICULTY = ['Easy', 'Medium', 'Hard'] as const;

export type Level = (typeof LEVELS)[number];
export type PaceStyle = (typeof PACES)[number];
export type Feasibility = (typeof FEASIBILITY)[number];
export type Difficulty = (typeof DIFFICULTY)[number];

/** Plans reach at most ~3 years ahead (keeps day-by-day maths cheap and plans meaningful). */
export const MAX_HORIZON_DAYS = 3 * 366;

export const LIMITS = {
  goalChars: 300,
  constraintsChars: 1000,
  maxMilestones: 12,
  maxTasksPerMilestone: 8,
  fileBytes: 10 * 1024 * 1024,
} as const;

export const ATTACHMENT_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'] as const;

const dayKeySchema = z.string().refine(isDayKey, 'Must be a real date in YYYY-MM-DD format');

/** What the user tells us in the wizard. */
export const IntakeSchema = z.object({
  goal: z.string().trim().min(3, 'Describe your goal in a few words').max(LIMITS.goalChars),
  deadlineDate: dayKeySchema.refine(
    (d) => d <= new Date(Date.now() + (MAX_HORIZON_DAYS + 2) * 86_400_000).toISOString().slice(0, 10),
    'Pick a deadline within the next 3 years',
  ),
  deadlineTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm'),
  timezone: z.string().refine(isValidTimeZone, 'Unknown time zone'),
  level: z.enum(LEVELS),
  hoursPerDay: z.number().min(0.5).max(16),
  workingDays: z.array(z.number().int().min(0).max(6)).min(1, 'Pick at least one working day').max(7),
  constraints: z.string().max(LIMITS.constraintsChars).default(''),
  pace: z.enum(PACES),
  /** Optional steer for one-tap fixes ("reduce scope", etc.). */
  adjustment: z.enum(['none', 'reduce-scope', 'extend-deadline', 'add-hours']).default('none'),
  attachment: z
    .object({
      name: z.string().max(200),
      mimeType: z.enum(ATTACHMENT_TYPES),
      /** base64, no data: prefix. 10 MB file ≈ 13.4 MB base64. */
      data: z.string().max(Math.ceil((LIMITS.fileBytes * 4) / 3) + 8),
    })
    .optional(),
});
export type Intake = z.infer<typeof IntakeSchema>;
export type IntakeInput = z.input<typeof IntakeSchema>;

export const TaskSchema = z.object({
  id: z.string().min(1).max(40),
  title: z.string().trim().min(1).max(160),
  estimatedMinutes: z.number().int().min(5).max(600),
});

export const MilestoneSchema = z.object({
  id: z.string().min(1).max(40),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(600),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  estimatedHours: z.number().positive().max(2000),
  difficulty: z.enum(DIFFICULTY),
  tasks: z.array(TaskSchema).min(1).max(LIMITS.maxTasksPerMilestone),
});

/** The exact shape Gemini must return (mirrors the JSON schema sent to the API). */
export const PlanSchema = z.object({
  goal: z.string().trim().min(1).max(400),
  deadline: z.string().min(1).max(80),
  timezone: z.string().min(1).max(80),
  feasibility: z.enum(FEASIBILITY),
  feasibilityReason: z.string().trim().min(1).max(600),
  totalEstimatedHours: z.number().nonnegative().max(20000),
  /**
   * Hours the COMPLETE goal would need, when that's more than the capacity (Gemini then
   * plans only the essentials). Null/absent when the full goal fits.
   */
  fullScopeHours: z.number().nonnegative().max(20000).nullable().optional(),
  milestones: z.array(MilestoneSchema).min(1).max(LIMITS.maxMilestones),
  risks: z.array(z.string().trim().min(1).max(300)).max(8),
  recoveryStrategy: z.string().trim().max(600),
  dailyRitual: z.string().trim().max(400),
});
export type Plan = z.infer<typeof PlanSchema>;
export type PlanMilestone = z.infer<typeof MilestoneSchema>;
export type PlanTask = z.infer<typeof TaskSchema>;

// ───────────────────────────── Capacity ─────────────────────────────

export interface CapacityInput {
  todayKey: string;
  deadlineUtc: string;
  timezone: string;
  hoursPerDay: number;
  workingDays: readonly number[];
}

export interface Capacity {
  /** Calendar days counted: today … effective deadline day (inclusive). */
  fromKey: string;
  toKey: string;
  workingDates: string[];
  workingDayCount: number;
  hoursPerDay: number;
  capacityHours: number;
}

/**
 * Capacity = working days from TODAY to the deadline day (both inclusive) × hours per day.
 * Today counts because you can start right away; a midnight deadline belongs to the day before.
 */
export function computeCapacity(input: CapacityInput): Capacity {
  const toKey = effectiveDeadlineKey(input.deadlineUtc, input.timezone);
  const workingDates =
    diffDays(input.todayKey, toKey) >= 0 ? workingDaysBetween(input.todayKey, toKey, input.workingDays) : [];
  const capacityHours = round1(workingDates.length * input.hoursPerDay);
  return {
    fromKey: input.todayKey,
    toKey,
    workingDates,
    workingDayCount: workingDates.length,
    hoursPerDay: input.hoursPerDay,
    capacityHours,
  };
}

/** Dates a milestone may land on: working days strictly after today, up to the deadline day. */
export function allowedMilestoneDates(cap: Capacity): string[] {
  const valid = cap.workingDates.filter((d) => d > cap.fromKey);
  // Same-day deadline: today is the only possible date.
  if (valid.length === 0 && cap.toKey === cap.fromKey && cap.workingDates.includes(cap.fromKey))
    return [cap.fromKey];
  return valid;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ───────────────────────────── Feasibility ─────────────────────────────

export interface FeasibilityResult {
  feasibility: Feasibility;
  reason: string;
  ratio: number;
}

/**
 * Code-side feasibility: how much of your available hours the plan uses.
 *   ≤ 85 %  → Achievable (some slack for bad days)
 *   ≤ 100 % → Tight
 *   > 100 % → Unrealistic
 */
export function codeFeasibility(totalHours: number, cap: Capacity, subject = 'Plan'): FeasibilityResult {
  if (cap.workingDayCount === 0 || cap.capacityHours <= 0) {
    return {
      feasibility: 'Unrealistic',
      ratio: Infinity,
      reason: 'There are no working days left before the deadline with your current working-day settings.',
    };
  }
  const ratio = totalHours / cap.capacityHours;
  const pct = Math.round(ratio * 100);
  const base = `${subject} needs ${fmtH(totalHours)} h; you have ${fmtH(cap.capacityHours)} h (${cap.workingDayCount} working day${cap.workingDayCount === 1 ? '' : 's'} × ${fmtH(cap.hoursPerDay)} h/day) — ${pct}% of your capacity.`;
  if (ratio <= 0.85)
    return { feasibility: 'Achievable', ratio, reason: `${base} That leaves room for bad days.` };
  if (ratio <= 1)
    return { feasibility: 'Tight', ratio, reason: `${base} Little slack — one missed day hurts.` };
  return { feasibility: 'Unrealistic', ratio, reason: `${base} It does not fit before the deadline.` };
}

function fmtH(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

// ───────────────────────────── Validation ─────────────────────────────

export type CheckId =
  'shape' | 'dates-future' | 'dates-deadline' | 'chronological' | 'working-days' | 'hours-sum' | 'capacity';

export interface PlanCheck {
  id: CheckId;
  label: string;
  ok: boolean;
  detail: string;
}

export interface ValidationContext {
  todayKey: string;
  deadlineUtc: string;
  timezone: string;
  hoursPerDay: number;
  workingDays: readonly number[];
}

export interface ValidationResult {
  /** True when every HARD check passes (capacity is reported but is not a hard error). */
  ok: boolean;
  plan: Plan | null;
  checks: PlanCheck[];
  /** Exact, model-readable error messages used for the single repair call. */
  errors: string[];
  capacity: Capacity;
  code: FeasibilityResult;
  /** Gemini's own feasibility claim, for side-by-side display. */
  model: { feasibility: Feasibility; reason: string } | null;
  agrees: boolean;
  /** Hours the whole goal needs (≥ the plan total). Equals the plan total when nothing was cut. */
  scopeHours: number;
}

/**
 * Validate a raw (unknown) Gemini response against the shape and our rules.
 * Pure and deterministic: same input → same result. Easy to unit-test.
 */
export function validatePlan(raw: unknown, ctx: ValidationContext): ValidationResult {
  const capacity = computeCapacity(ctx);
  const parsed = PlanSchema.safeParse(raw);
  if (!parsed.success) {
    const errors = parsed.error.issues
      .slice(0, 12)
      .map((i) => `Field "${i.path.join('.') || '(root)'}": ${i.message}`);
    const code = codeFeasibility(0, capacity);
    return {
      ok: false,
      plan: null,
      checks: [
        { id: 'shape', label: 'Response matches the plan schema', ok: false, detail: errors.join('; ') },
      ],
      errors,
      capacity,
      code,
      model: null,
      agrees: false,
      scopeHours: 0,
    };
  }

  const plan = normalizePlan(parsed.data);
  const errors: string[] = [];
  const deadlineKey = capacity.toKey;
  const working = new Set(ctx.workingDays);
  const sameDayDeadline = deadlineKey === ctx.todayKey;

  const badDates: string[] = [];
  const pastDates: string[] = [];
  const lateDates: string[] = [];
  const offDays: string[] = [];
  plan.milestones.forEach((m, i) => {
    const label = `Milestone ${i + 1} "${m.title}"`;
    if (!isDayKey(m.targetDate)) {
      badDates.push(`${label} has an invalid targetDate "${m.targetDate}" (use YYYY-MM-DD).`);
      return;
    }
    const afterToday = sameDayDeadline ? m.targetDate >= ctx.todayKey : m.targetDate > ctx.todayKey;
    if (!afterToday)
      pastDates.push(`${label} targetDate ${m.targetDate} must be after today (${ctx.todayKey}).`);
    if (m.targetDate > deadlineKey)
      lateDates.push(`${label} targetDate ${m.targetDate} is after the deadline day (${deadlineKey}).`);
    if (!working.has(weekdayOf(m.targetDate)))
      offDays.push(
        `${label} targetDate ${m.targetDate} is a ${WEEKDAY_SHORT[weekdayOf(m.targetDate)]}, which is not a working day (${ctx.workingDays
          .map((d) => WEEKDAY_SHORT[d])
          .join(', ')}).`,
      );
  });

  const orderIssues: string[] = [];
  for (let i = 1; i < plan.milestones.length; i++) {
    const prev = plan.milestones[i - 1]!;
    const cur = plan.milestones[i]!;
    if (isDayKey(prev.targetDate) && isDayKey(cur.targetDate) && cur.targetDate < prev.targetDate) {
      orderIssues.push(
        `Milestone ${i + 1} "${cur.title}" (${cur.targetDate}) comes before milestone ${i} "${prev.title}" (${prev.targetDate}); keep milestones in chronological order.`,
      );
    }
  }

  errors.push(...badDates, ...pastDates, ...lateDates, ...orderIssues, ...offDays);

  const sum = round1(plan.milestones.reduce((s, m) => s + m.estimatedHours, 0));
  const claimed = parsed.data.totalEstimatedHours;
  const sumOk = Math.abs(sum - claimed) <= 0.5;
  // If Gemini had to cut scope to fit, judge feasibility on the FULL goal, not the trimmed plan.
  const fullScope = parsed.data.fullScopeHours ?? null;
  const scopeHours = fullScope !== null && fullScope > sum + 0.5 ? round1(fullScope) : sum;
  const code = feasibilityFor(sum, fullScope, capacity);
  const fits = sum <= capacity.capacityHours;

  const checks: PlanCheck[] = [
    {
      id: 'shape',
      label: 'Response matches the plan schema',
      ok: true,
      detail: `${plan.milestones.length} milestones, ${plan.milestones.reduce((s, m) => s + m.tasks.length, 0)} tasks.`,
    },
    {
      id: 'dates-future',
      label: 'Every milestone date is after today',
      ok: badDates.length === 0 && pastDates.length === 0,
      detail: [...badDates, ...pastDates].join(' ') || `All dates are after ${ctx.todayKey}.`,
    },
    {
      id: 'dates-deadline',
      label: 'Every milestone is on or before the deadline',
      ok: lateDates.length === 0,
      detail: lateDates.join(' ') || `All dates are on or before ${deadlineKey}.`,
    },
    {
      id: 'chronological',
      label: 'Milestones are in date order',
      ok: orderIssues.length === 0,
      detail: orderIssues.join(' ') || 'Dates only move forward.',
    },
    {
      id: 'working-days',
      label: 'Milestones land on your working days',
      ok: offDays.length === 0,
      detail: offDays.join(' ') || 'Every date is one of your working days.',
    },
    {
      id: 'hours-sum',
      label: 'Total hours add up',
      ok: true,
      detail: sumOk
        ? `Milestones add up to ${sum} h.`
        : `Gemini said ${claimed} h, but the milestones add up to ${sum} h — we use ${sum} h.`,
    },
    {
      id: 'capacity',
      label: 'Fits your available hours',
      ok: fits,
      detail: code.reason,
    },
  ];

  const model = { feasibility: plan.feasibility, reason: plan.feasibilityReason };
  const finalPlan: Plan = { ...plan, totalEstimatedHours: sum };
  return {
    ok: errors.length === 0,
    plan: finalPlan,
    checks,
    errors,
    capacity,
    code,
    model,
    agrees: model.feasibility === code.feasibility,
    scopeHours,
  };
}

/**
 * Code feasibility for a plan total, taking into account a FULL-goal estimate when
 * Gemini had to cut scope. Shared by server validation and client re-checks after edits.
 */
export function feasibilityFor(
  planHours: number,
  fullScopeHours: number | null | undefined,
  cap: Capacity,
  subject = 'Plan',
): FeasibilityResult {
  const scope =
    fullScopeHours != null && fullScopeHours > planHours + 0.5 ? round1(fullScopeHours) : planHours;
  return scope > planHours && scope > cap.capacityHours
    ? scopeFeasibility(scope, planHours, cap)
    : codeFeasibility(planHours, cap, subject);
}

/** Feasibility when the plan was trimmed to fit: the full goal doesn't fit, by definition. */
function scopeFeasibility(scopeHours: number, planHours: number, cap: Capacity): FeasibilityResult {
  return {
    feasibility: 'Unrealistic',
    ratio: cap.capacityHours > 0 ? scopeHours / cap.capacityHours : Infinity,
    reason: `The full goal needs about ${fmtH(scopeHours)} h; you have ${fmtH(cap.capacityHours)} h (${cap.workingDayCount} working day${cap.workingDayCount === 1 ? '' : 's'} × ${fmtH(cap.hoursPerDay)} h/day). This plan keeps the essentials (${fmtH(planHours)} h). Use a fix below to make room for the rest.`,
  };
}

/** Make ids unique and stable (m1, m1-t1 …) so the UI can key on them. */
export function normalizePlan(plan: Plan): Plan {
  const seen = new Set<string>();
  const milestones = plan.milestones.map((m, i) => {
    let id = m.id?.trim() || `m${i + 1}`;
    if (seen.has(id)) id = `m${i + 1}`;
    while (seen.has(id)) id = `${id}x`;
    seen.add(id);
    const taskSeen = new Set<string>();
    const tasks = m.tasks.map((t, j) => {
      let tid = t.id?.trim() || `${id}-t${j + 1}`;
      if (taskSeen.has(tid) || seen.has(tid)) tid = `${id}-t${j + 1}`;
      taskSeen.add(tid);
      return { ...t, id: tid };
    });
    return { ...m, id, tasks, estimatedHours: round1(m.estimatedHours) };
  });
  return { ...plan, milestones };
}

// ───────────────────────────── One-tap fixes ─────────────────────────────

export interface FixSuggestions {
  /** New deadline day that would make the plan Achievable at current hours, if within 2 years. */
  extendTo: string | null;
  /** Hours per day needed to make the plan fit (≤ 16), or null if impossible. */
  hoursPerDay: number | null;
  /** Hours the plan must shrink to for the current capacity. */
  reduceTo: number;
}

export function suggestFixes(totalHours: number, ctx: ValidationContext): FixSuggestions {
  const cap = computeCapacity(ctx);
  const target = totalHours / 0.85; // capacity needed to be "Achievable"
  let extendTo: string | null = null;
  let hours = 0;
  let day = ctx.todayKey;
  const working = new Set(ctx.workingDays);
  const limit = Math.max(0, diffDays(ctx.todayKey, cap.toKey)) + 3 * 366;
  for (let i = 0; i < limit; i++) {
    if (working.has(weekdayOf(day))) hours += ctx.hoursPerDay;
    if (hours >= target && day > cap.toKey) {
      extendTo = day;
      break;
    }
    day = addDays(day, 1);
  }
  const needPerDay = cap.workingDayCount > 0 ? Math.ceil((target / cap.workingDayCount) * 2) / 2 : Infinity;
  return {
    extendTo,
    hoursPerDay: needPerDay <= 16 ? Math.max(needPerDay, ctx.hoursPerDay + 0.5) : null,
    reduceTo: Math.floor(cap.capacityHours * 0.85),
  };
}
