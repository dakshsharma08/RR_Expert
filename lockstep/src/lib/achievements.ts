/**
 * Achievements: small, honest milestones computed from REAL data (never granted
 * for nothing). Pure function, so it's easy to test and to recompute anywhere.
 */
import type { GoalRow, MilestoneRow, TaskRow } from '@/db/db';
import type { GoalMetrics } from './metrics';
import { dayKey, effectiveDeadlineKey } from '@shared/time';

export interface Achievement {
  id: string;
  title: string;
  description: string;
  unlocked: boolean;
}

export function computeAchievements(
  goal: GoalRow,
  milestones: MilestoneRow[],
  tasks: TaskRow[],
  m: GoalMetrics,
  opts: { exported?: boolean } = {},
): Achievement[] {
  const doneTasks = tasks.filter((t) => t.done_at).length;
  const doneMs = milestones.filter((x) => x.status === 'completed').length;
  const finished = goal.status === 'completed';
  const early =
    finished && goal.completed_at
      ? dayKey(goal.completed_at, goal.timezone) < effectiveDeadlineKey(goal.deadline_utc, goal.timezone)
      : false;
  const list: (Omit<Achievement, 'unlocked'> & { ok: boolean })[] = [
    { id: 'approved', title: 'Locked in', description: 'You approved your plan.', ok: !!goal.approved_at },
    {
      id: 'wallpaper',
      title: 'On every unlock',
      description: 'You exported a lock screen.',
      ok: !!opts.exported,
    },
    {
      id: 'first-task',
      title: 'First step',
      description: 'You completed your first task.',
      ok: doneTasks >= 1,
    },
    {
      id: 'first-milestone',
      title: 'First milestone',
      description: 'A whole milestone, done.',
      ok: doneMs >= 1,
    },
    {
      id: 'streak-3',
      title: 'Three in a row',
      description: 'Work logged three days running.',
      ok: m.streak >= 3,
    },
    {
      id: 'streak-7',
      title: 'A week of focus',
      description: 'Work logged seven days running.',
      ok: m.streak >= 7,
    },
    {
      id: 'halfway',
      title: 'Halfway there',
      description: 'Half of the planned work is done.',
      ok: m.progress >= 0.5,
    },
    {
      id: 'ahead',
      title: 'Ahead of pace',
      description: 'More work done than time used.',
      ok: m.pace === 'ahead' && m.progress >= 0.1,
    },
    { id: 'finished', title: 'Finished', description: 'Every milestone complete.', ok: finished },
    { id: 'early', title: 'Early finish', description: 'Done before the deadline day.', ok: early },
  ];
  return list.map(({ ok, ...a }) => ({ ...a, unlocked: ok }));
}
