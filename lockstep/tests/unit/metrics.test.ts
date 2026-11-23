import { describe, expect, it } from 'vitest';
import { goalMetrics } from '../../src/lib/metrics';
import { recomputeMeta } from '../../src/db/repo';
import type { GoalRow, MilestoneRow, TaskRow } from '../../src/db/db';

const NOW = Date.parse('2026-11-23T12:00:00Z');
const goal = {
  id: 'g',
  status: 'active',
  timezone: 'UTC',
  hours_per_day: 1,
  working_days: [1, 2, 3, 4, 5],
  start_utc: '2026-11-20T09:00:00Z',
  approved_at: '2026-11-20T10:00:00Z',
  deadline_utc: '2026-12-31T18:00:00Z',
} as unknown as GoalRow;
const ms = [
  { id: 'a', order: 0, status: 'approved', target_date: '2026-11-27', estimated_hours: 2 },
  { id: 'b', order: 1, status: 'approved', target_date: '2026-12-10', estimated_hours: 2 },
] as MilestoneRow[];
const task = (id: string, m: string, order: number, done_at: string | null = null) =>
  ({ id, milestone_id: m, order, estimated_minutes: 30, done_at }) as TaskRow;

describe("Today's focus", () => {
  it("fills today's hours, and finishes once today's work is done", () => {
    const fresh = [task('a1', 'a', 0), task('a2', 'a', 1), task('a3', 'a', 2), task('b1', 'b', 0)];
    expect(goalMetrics(goal, ms, fresh, [], NOW).todayFocus.map((t) => t.id)).toEqual(['a1', 'a2']);
    const doneToday = [
      task('a1', 'a', 0, '2026-11-23T08:00:00Z'),
      task('a2', 'a', 1, '2026-11-23T09:00:00Z'),
      task('a3', 'a', 2),
      task('b1', 'b', 0),
    ];
    const focus = goalMetrics(goal, ms, doneToday, [], NOW).todayFocus;
    expect(focus.map((t) => t.id)).toEqual(['a1', 'a2']); // 1 h budget used → done for today
    expect(focus.every((t) => t.done_at)).toBe(true);
  });
});

describe('feasibility once a plan is under way', () => {
  it('judges only the remaining work against the capacity left', () => {
    const big = [
      { id: 'a', status: 'completed', estimated_hours: 50 },
      { id: 'b', status: 'approved', estimated_hours: 20 },
    ] as MilestoneRow[];
    const meta = recomputeMeta({ ...goal, hours_per_day: 2 } as GoalRow, big, null, []);
    expect(meta.totalEstimatedHours).toBe(70);
    expect(meta.code.reason).toMatch(/^Remaining work needs 20 h/);
  });
});
