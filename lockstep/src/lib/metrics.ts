/**
 * Derived numbers for a goal: countdown, % done, pace, streak, next milestone,
 * and "Today's focus". Pure function of database rows + the current time.
 */
import type { GoalRow, MilestoneRow, ProgressLogRow, TaskRow } from '@/db/db';
import {
  addDays,
  computeCountdown,
  computePace,
  dayKey,
  formatDayKey,
  type Countdown,
  type Pace,
} from '@shared/time';

export interface GoalMetrics {
  countdown: Countdown;
  tasksDone: number;
  tasksTotal: number;
  minutesDone: number;
  minutesTotal: number;
  /** Work done, 0–1, weighted by estimated minutes. */
  progress: number;
  pace: Pace;
  streak: number;
  nextMilestone: MilestoneRow | null;
  milestonesDone: number;
  milestonesTotal: number;
  todayFocus: TaskRow[];
  todayMinutesLogged: number;
  overdueMilestones: MilestoneRow[];
}

export function goalMetrics(
  goal: GoalRow,
  milestones: MilestoneRow[],
  tasks: TaskRow[],
  logs: ProgressLogRow[],
  nowMs: number,
): GoalMetrics {
  // The plan starts when the goal was created (never in the future). Clamping `now`
  // to the start avoids a false "upcoming" state when a minute-rounded clock lags behind.
  const startMs = Math.min(Date.parse(goal.start_utc), Date.parse(goal.approved_at ?? goal.start_utc));
  nowMs = Math.max(nowMs, startMs);
  const countdown = computeCountdown({
    nowMs,
    startUtc: new Date(startMs).toISOString(),
    deadlineUtc: goal.deadline_utc,
    timezone: goal.timezone,
    completed: goal.status === 'completed',
  });
  const ordered = [...milestones].sort((a, b) => a.order - b.order);
  const tasksTotal = tasks.length;
  const done = tasks.filter((t) => t.done_at);
  const minutesTotal = tasks.reduce((s, t) => s + t.estimated_minutes, 0);
  const minutesDone = done.reduce((s, t) => s + t.estimated_minutes, 0);
  const completedMilestoneIds = new Set(ordered.filter((m) => m.status === 'completed').map((m) => m.id));
  // Progress: task minutes when tasks exist; otherwise completed milestone hours.
  let progress = 0;
  if (minutesTotal > 0) {
    // A milestone ticked complete by hand counts all of its tasks.
    const credited = tasks.reduce(
      (s, t) => s + (t.done_at || completedMilestoneIds.has(t.milestone_id) ? t.estimated_minutes : 0),
      0,
    );
    progress = credited / minutesTotal;
  } else if (ordered.length) {
    const totalH = ordered.reduce((s, m) => s + m.estimated_hours, 0) || 1;
    progress =
      ordered.filter((m) => m.status === 'completed').reduce((s, m) => s + m.estimated_hours, 0) / totalH;
  }
  if (goal.status === 'completed') progress = 1;
  progress = Math.min(1, Math.max(0, progress));

  const nextMilestone = ordered.find((m) => m.status !== 'completed') ?? null;
  const today = dayKey(nowMs, goal.timezone);
  const overdueMilestones = ordered.filter((m) => m.status !== 'completed' && m.target_date < today);

  // Today's focus: undone tasks in milestone order until today's hours are filled (min 1 task).
  const budget = goal.hours_per_day * 60;
  const tasksByMilestone = new Map<string, TaskRow[]>();
  tasks.forEach((t) => {
    const list = tasksByMilestone.get(t.milestone_id) ?? [];
    list.push(t);
    tasksByMilestone.set(t.milestone_id, list);
  });
  const todayFocus: TaskRow[] = [];
  let used = 0;
  for (const m of ordered) {
    const list = (tasksByMilestone.get(m.id) ?? []).sort((a, b) => a.order - b.order);
    if (m.status === 'completed') {
      // Keep today's ticks visible (satisfying, and lets you undo), skip the rest.
      for (const t of list)
        if (t.done_at && dayKey(t.done_at, goal.timezone) === today) {
          todayFocus.push(t);
          used += t.estimated_minutes;
        }
      continue;
    }
    for (const t of list) {
      const doneToday = t.done_at && dayKey(t.done_at, goal.timezone) === today;
      if (t.done_at && !doneToday) continue;
      if (!t.done_at && used >= budget) break;
      todayFocus.push(t);
      // Work done today counts toward today's budget, so the list can actually be finished.
      used += t.estimated_minutes;
    }
    if (used >= budget) break;
  }

  const todayMinutesLogged = logs.filter((l) => l.date === today).reduce((s, l) => s + l.minutes, 0);

  return {
    countdown,
    tasksDone: done.length,
    tasksTotal,
    minutesDone,
    minutesTotal,
    progress,
    pace: computePace(countdown.timePct, progress),
    streak: computeStreak(logs, today),
    nextMilestone,
    milestonesDone: completedMilestoneIds.size,
    milestonesTotal: ordered.length,
    todayFocus,
    todayMinutesLogged,
    overdueMilestones,
  };
}

/** Consecutive days with logged work, ending today (or yesterday if nothing yet today). */
export function computeStreak(logs: Pick<ProgressLogRow, 'date' | 'minutes'>[], today: string): number {
  const days = new Set(logs.filter((l) => l.minutes > 0).map((l) => l.date));
  let cursor = days.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (days.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function stateLabel(c: Countdown): string {
  switch (c.state) {
    case 'completed':
      return 'Completed';
    case 'expired':
      return 'Deadline passed';
    case 'due-today':
      return 'Due today';
    case 'upcoming':
      return 'Not started';
    default:
      return c.daysLeft === 1 ? '1 day left' : `${c.daysLeft} days left`;
  }
}

export function paceLabel(p: Pace): string {
  return p === 'ahead' ? 'Ahead of pace' : p === 'behind' ? 'Behind pace' : 'On track';
}

export function shortDate(key: string): string {
  return formatDayKey(key, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function minutesLabel(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
