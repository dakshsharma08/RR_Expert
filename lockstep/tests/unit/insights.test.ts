import { describe, expect, it } from 'vitest';
import { computeStreak } from '../../src/lib/metrics';
import { heatmap, plannedDailyMinutes, weekStartOf, weeklyBars } from '../../src/lib/insights';
import { buildIcs } from '../../src/lib/ics';
import type { GoalRow, MilestoneRow, ProgressLogRow } from '../../src/db/db';

const goal = {
  id: 'g',
  title: 'Ship; it, now',
  deadline_utc: '2026-12-04T18:00:00.000Z',
  timezone: 'UTC',
  start_utc: '2026-11-23T08:00:00.000Z',
  approved_at: '2026-11-23T09:00:00.000Z',
  working_days: [1, 2, 3, 4, 5],
  hours_per_day: 2,
} as unknown as GoalRow;
const ms = [
  {
    id: 'a',
    goal_id: 'g',
    title: 'A',
    description: '',
    target_date: '2026-11-25',
    estimated_hours: 6,
    order: 0,
  },
  {
    id: 'b',
    goal_id: 'g',
    title: 'B',
    description: '',
    target_date: '2026-12-04',
    estimated_hours: 7,
    order: 1,
  },
] as unknown as MilestoneRow[];
const log = (date: string, minutes: number) =>
  ({ id: date, goal_id: 'g', date, minutes, note: '', task_id: null }) as unknown as ProgressLogRow;

describe('insight math', () => {
  it('spreads milestone hours over working days before each date', () => {
    const p = plannedDailyMinutes(goal, ms);
    // A: Mon 23 – Wed 25 = 3 working days × 120 min
    expect(p.get('2026-11-23')).toBe(120);
    expect(p.get('2026-11-25')).toBe(120);
    // B: Thu 26 – Fri 4 Dec = 7 working days × 60 min
    expect(p.get('2026-11-26')).toBe(60);
    expect(p.get('2026-11-28')).toBeUndefined(); // Saturday
    const total = [...p.values()].reduce((s, v) => s + v, 0);
    expect(total).toBe(13 * 60);
  });
  it('groups by Monday-start weeks', () => {
    expect(weekStartOf('2026-11-29')).toBe('2026-11-23'); // Sunday → previous Monday
    const w = weeklyBars(goal, ms, [log('2026-11-24', 90)]);
    expect(w[0]).toMatchObject({ weekStart: '2026-11-23', actual: 1.5 });
  });
  it('counts streaks ending today or yesterday', () => {
    const logs = [log('2026-11-21', 30), log('2026-11-22', 30), log('2026-11-23', 10)];
    expect(computeStreak(logs, '2026-11-23')).toBe(3);
    expect(computeStreak(logs.slice(0, 2), '2026-11-23')).toBe(2);
    expect(computeStreak(logs.slice(0, 1), '2026-11-23')).toBe(0);
  });
  it('builds a 12-week heatmap', () => {
    const h = heatmap([log('2026-11-23', 45)], '2026-11-23');
    expect(h).toHaveLength(12);
    expect(h.at(-1)![0]).toMatchObject({ date: '2026-11-23', minutes: 45 });
  });
  it('escapes .ics text', () => {
    const ics = buildIcs([{ ...goal, status: 'active' } as GoalRow], ms);
    const bs = String.fromCharCode(92); // a backslash: ICS escapes ';' and ','
    expect(ics).toContain(`SUMMARY:⏳ Deadline: Ship${bs}; it${bs}, now`);
    expect(ics).toContain('DTSTART;VALUE=DATE:20261204');
    expect(ics.split('BEGIN:VEVENT')).toHaveLength(4);
  });
});
