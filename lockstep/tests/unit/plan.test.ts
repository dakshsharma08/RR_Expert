import { describe, expect, it } from 'vitest';
import {
  IntakeSchema,
  PlanSchema,
  codeFeasibility,
  computeCapacity,
  suggestFixes,
  validatePlan,
  type Plan,
} from '../../shared/plan';

// Monday 2026-11-23, deadline Fri 2026-12-04 18:00 UTC, Mon–Fri, 2 h/day.
const ctx = {
  todayKey: '2026-11-23',
  deadlineUtc: '2026-12-04T18:00:00.000Z',
  timezone: 'UTC',
  hoursPerDay: 2,
  workingDays: [1, 2, 3, 4, 5],
};

function plan(overrides: Partial<Plan> = {}): Plan {
  return {
    goal: 'Ship portfolio site',
    deadline: '2026-12-04T18:00:00.000Z',
    timezone: 'UTC',
    feasibility: 'Achievable',
    feasibilityReason: 'Fits comfortably.',
    totalEstimatedHours: 12,
    milestones: [
      {
        id: 'm1',
        title: 'Wireframes',
        description: 'Sketch pages',
        targetDate: '2026-11-25',
        estimatedHours: 4,
        difficulty: 'Easy',
        tasks: [{ id: 't1', title: 'Home page sketch', estimatedMinutes: 120 }],
      },
      {
        id: 'm2',
        title: 'Build',
        description: 'Code it',
        targetDate: '2026-12-01',
        estimatedHours: 6,
        difficulty: 'Medium',
        tasks: [{ id: 't2', title: 'Layout', estimatedMinutes: 180 }],
      },
      {
        id: 'm3',
        title: 'Launch',
        description: 'Deploy',
        targetDate: '2026-12-04',
        estimatedHours: 2,
        difficulty: 'Easy',
        tasks: [{ id: 't3', title: 'Deploy', estimatedMinutes: 60 }],
      },
    ],
    risks: ['Scope creep'],
    recoveryStrategy: 'Cut the blog.',
    dailyRitual: '25 minutes before breakfast.',
    ...overrides,
  };
}

describe('capacity', () => {
  it('counts working days from today to the deadline day × hours/day', () => {
    const cap = computeCapacity(ctx);
    expect(cap.workingDayCount).toBe(10);
    expect(cap.capacityHours).toBe(20);
  });
  it('is zero when the deadline has passed', () => {
    expect(computeCapacity({ ...ctx, deadlineUtc: '2026-11-20T00:00:00Z' }).capacityHours).toBe(0);
  });
});

describe('code feasibility', () => {
  const cap = computeCapacity(ctx);
  it('classifies by share of capacity', () => {
    expect(codeFeasibility(12, cap).feasibility).toBe('Achievable');
    expect(codeFeasibility(19, cap).feasibility).toBe('Tight');
    expect(codeFeasibility(25, cap).feasibility).toBe('Unrealistic');
  });
});

describe('validatePlan', () => {
  it('passes a good plan', () => {
    const r = validatePlan(plan(), ctx);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.checks.every((c) => c.ok)).toBe(true);
    expect(r.agrees).toBe(true);
  });

  it('rejects past, late, unordered and weekend dates with exact messages', () => {
    const p = plan();
    p.milestones[0]!.targetDate = '2026-11-23'; // today — not after today
    p.milestones[1]!.targetDate = '2026-11-28'; // Saturday
    p.milestones[2]!.targetDate = '2026-12-07'; // after deadline
    const r = validatePlan(p, ctx);
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toMatch(/must be after today/);
    expect(r.errors.join('\n')).toMatch(/Sat, which is not a working day/);
    expect(r.errors.join('\n')).toMatch(/after the deadline day/);
  });

  it('flags non-chronological milestones', () => {
    const p = plan();
    p.milestones[1]!.targetDate = '2026-11-24';
    p.milestones[0]!.targetDate = '2026-11-26';
    const r = validatePlan(p, ctx);
    expect(r.checks.find((c) => c.id === 'chronological')!.ok).toBe(false);
  });

  it('recomputes total hours and feasibility in code, and reports disagreement', () => {
    const p = plan({ totalEstimatedHours: 5, feasibility: 'Achievable' });
    p.milestones[1]!.estimatedHours = 20; // total 26 h > 20 h capacity
    const r = validatePlan(p, ctx);
    expect(r.plan!.totalEstimatedHours).toBe(26);
    expect(r.code.feasibility).toBe('Unrealistic');
    expect(r.agrees).toBe(false);
    expect(r.checks.find((c) => c.id === 'capacity')!.ok).toBe(false);
    expect(r.checks.find((c) => c.id === 'hours-sum')!.detail).toMatch(/add up to 26 h/);
    // capacity is a feasibility signal, not a hard error
    expect(r.ok).toBe(true);
  });

  it('returns shape errors for malformed output', () => {
    const r = validatePlan({ goal: 'x', milestones: 'nope' }, ctx);
    expect(r.ok).toBe(false);
    expect(r.plan).toBeNull();
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it('de-duplicates ids', () => {
    const p = plan();
    p.milestones[1]!.id = 'm1';
    const r = validatePlan(p, ctx);
    const ids = r.plan!.milestones.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('allows today only for a same-day deadline', () => {
    const sameDay = { ...ctx, deadlineUtc: '2026-11-23T20:00:00Z' };
    const p = plan({
      milestones: [{ ...plan().milestones[0]!, targetDate: '2026-11-23', estimatedHours: 1 }],
    });
    expect(validatePlan(p, sameDay).ok).toBe(true);
  });
});

describe('trimmed scope', () => {
  it('judges feasibility on the full goal when Gemini had to cut scope', () => {
    // Plan fits (12 h of 20 h) but the complete goal needs 60 h.
    const r = validatePlan(plan({ feasibility: 'Unrealistic', fullScopeHours: 60 }), ctx);
    expect(r.ok).toBe(true);
    expect(r.code.feasibility).toBe('Unrealistic');
    expect(r.code.reason).toMatch(/full goal needs about 60 h/);
    expect(r.agrees).toBe(true);
    expect(r.scopeHours).toBe(60);
    expect(r.checks.find((c) => c.id === 'capacity')!.ok).toBe(true); // the plan itself fits
  });
  it('treats fullScopeHours = 0 (what Gemini is told to send when nothing was cut) as "fits"', () => {
    const r = validatePlan(plan({ fullScopeHours: 0 }), ctx);
    expect(r.code.feasibility).toBe('Achievable');
    expect(r.scopeHours).toBe(12);
  });
  it('ignores a full-scope estimate that is not larger than the plan', () => {
    const r = validatePlan(plan({ fullScopeHours: null }), ctx);
    expect(r.code.feasibility).toBe('Achievable');
    expect(r.scopeHours).toBe(12);
  });
});

describe('fix suggestions', () => {
  it('suggests a later deadline and more hours when over capacity', () => {
    const f = suggestFixes(30, ctx);
    expect(f.extendTo! > '2026-12-04').toBe(true);
    expect(f.hoursPerDay).toBeGreaterThan(2);
    expect(f.reduceTo).toBe(17);
  });
});

describe('schemas', () => {
  it('validates intake', () => {
    const ok = IntakeSchema.safeParse({
      goal: 'Pass the AWS exam',
      deadlineDate: '2026-12-20',
      deadlineTime: '09:00',
      timezone: 'Asia/Kolkata',
      level: 'Beginner',
      hoursPerDay: 2,
      workingDays: [1, 2, 3],
      constraints: '',
      pace: 'Balanced',
    });
    expect(ok.success).toBe(true);
    const bad = IntakeSchema.safeParse({
      goal: 'x',
      deadlineDate: '2026-02-30',
      deadlineTime: '25:00',
      timezone: 'Nope',
      level: 'Pro',
      hoursPerDay: 40,
      workingDays: [],
      pace: 'Fast',
    });
    expect(bad.success).toBe(false);
    expect(bad.error!.issues.length).toBeGreaterThanOrEqual(7);
  });
  it('rejects too many milestones', () => {
    const p = plan();
    const many = Array.from({ length: 13 }, (_, i) => ({ ...p.milestones[0]!, id: `m${i}` }));
    expect(PlanSchema.safeParse({ ...p, milestones: many }).success).toBe(false);
  });
});
