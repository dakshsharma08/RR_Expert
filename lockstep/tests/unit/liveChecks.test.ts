import { describe, expect, it } from 'vitest';
import { liveChecks } from '../../src/lib/liveChecks';
import type { GoalRow, MilestoneRow } from '../../src/db/db';

const NOW = Date.parse('2026-11-23T12:00:00Z'); // Monday
const goal = {
  status: 'review',
  timezone: 'UTC',
  deadline_utc: '2026-12-04T18:00:00Z',
  working_days: [1, 2, 3, 4, 5],
} as unknown as GoalRow;
const ms = (dates: string[], extra: Partial<MilestoneRow> = {}) =>
  dates.map((d, i) => ({
    id: `m${i}`,
    order: i,
    target_date: d,
    estimated_hours: 2,
    status: 'pending',
    ...extra,
  })) as MilestoneRow[];

describe('live plan checks (review screen)', () => {
  it('accepts a clean plan', () => {
    expect(liveChecks(goal, ms(['2026-11-24', '2026-12-01']), NOW).hardCount).toBe(0);
  });
  it('blocks past, late and out-of-order dates; warns on weekends', () => {
    const r = liveChecks(goal, ms(['2026-11-23', '2026-12-08', '2026-11-28']), NOW);
    expect(r.byId.get('m0')!.hard).toContain('Date must be after today.');
    expect(r.byId.get('m1')!.hard).toContain('Date is after the deadline.');
    expect(r.byId.get('m2')!.hard.join()).toMatch(/before the previous milestone/);
    expect(r.byId.get('m2')!.soft.join()).toMatch(/Sat isn't one of your working days/);
  });
  it('treats a past date on an ACTIVE plan as a soft "reschedule" warning, not a blocker', () => {
    const active = { ...goal, status: 'active' } as GoalRow;
    const r = liveChecks(active, ms(['2026-11-20']), NOW);
    expect(r.hardCount).toBe(0);
    expect(r.byId.get('m0')!.soft.join()).toMatch(/has passed/);
  });
  it('ignores dates of completed milestones', () => {
    const r = liveChecks(goal, ms(['2026-11-20'], { status: 'completed' }), NOW);
    expect(r.hardCount).toBe(0);
  });
});
