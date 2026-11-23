import { describe, expect, it } from 'vitest';
import { computeAchievements } from '../../src/lib/achievements';
import type { GoalRow, MilestoneRow, TaskRow } from '../../src/db/db';
import type { GoalMetrics } from '../../src/lib/metrics';

const goal = {
  status: 'active',
  approved_at: '2026-11-23T09:00:00Z',
  completed_at: null,
  timezone: 'UTC',
  deadline_utc: '2026-12-10T09:00:00Z',
} as unknown as GoalRow;
const m = (o: Partial<GoalMetrics>) => ({ streak: 0, progress: 0, pace: 'on-track', ...o }) as GoalMetrics;
const ids = (a: ReturnType<typeof computeAchievements>) => a.filter((x) => x.unlocked).map((x) => x.id);

describe('achievements come only from real data', () => {
  it('fresh approved plan → only "Locked in"', () => {
    expect(ids(computeAchievements(goal, [], [], m({})))).toEqual(['approved']);
  });
  it('tasks, milestones, streaks, halfway, export', () => {
    const tasks = [{ done_at: '2026-11-24' }] as TaskRow[];
    const ms = [{ status: 'completed' }] as MilestoneRow[];
    const got = ids(
      computeAchievements(goal, ms, tasks, m({ streak: 3, progress: 0.6, pace: 'ahead' }), {
        exported: true,
      }),
    );
    expect(got).toEqual(
      expect.arrayContaining(['wallpaper', 'first-task', 'first-milestone', 'streak-3', 'halfway', 'ahead']),
    );
    expect(got).not.toContain('streak-7');
  });
  it('early finish only when completed before the deadline day', () => {
    const done = { ...goal, status: 'completed', completed_at: '2026-12-01T10:00:00Z' } as GoalRow;
    expect(ids(computeAchievements(done, [], [], m({ progress: 1 })))).toEqual(
      expect.arrayContaining(['finished', 'early']),
    );
  });
});
