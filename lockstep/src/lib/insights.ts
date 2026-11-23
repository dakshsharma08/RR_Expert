/**
 * Insight math (pure, unit-tested). "Planned" comes from the approved plan: each
 * milestone's hours are spread evenly over the working days leading up to its date.
 * "Actual" comes from your logged minutes (ticked tasks + manual logs).
 */
import type { GoalRow, MilestoneRow, ProgressLogRow } from '@/db/db';
import { addDays, dayKey, diffDays, effectiveDeadlineKey, weekdayOf, workingDaysBetween } from '@shared/time';

export function plannedDailyMinutes(goal: GoalRow, milestones: MilestoneRow[]): Map<string, number> {
  const out = new Map<string, number>();
  const ordered = [...milestones].sort((a, b) =>
    a.target_date === b.target_date ? a.order - b.order : a.target_date < b.target_date ? -1 : 1,
  );
  const startKey = dayKey(goal.approved_at ?? goal.start_utc, goal.timezone);
  let from = startKey;
  for (const m of ordered) {
    const to = m.target_date < from ? from : m.target_date;
    const days = workingDaysBetween(from, to, goal.working_days);
    const slots = days.length ? days : [to];
    const per = (m.estimated_hours * 60) / slots.length;
    for (const d of slots) out.set(d, (out.get(d) ?? 0) + per);
    from = addDays(to, 1);
  }
  return out;
}

export function actualDailyMinutes(logs: ProgressLogRow[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const l of logs) out.set(l.date, (out.get(l.date) ?? 0) + l.minutes);
  return out;
}

export interface ProgressPoint {
  date: string;
  planned: number; // cumulative % of total planned minutes
  actual: number | null; // null for future days
}

export function progressSeries(
  goal: GoalRow,
  milestones: MilestoneRow[],
  logs: ProgressLogRow[],
  nowMs: number,
): ProgressPoint[] {
  const planned = plannedDailyMinutes(goal, milestones);
  const actual = actualDailyMinutes(logs);
  const total = [...planned.values()].reduce((s, v) => s + v, 0) || 1;
  const start = dayKey(goal.approved_at ?? goal.start_utc, goal.timezone);
  const end = effectiveDeadlineKey(goal.deadline_utc, goal.timezone);
  const today = dayKey(nowMs, goal.timezone);
  const firstLog = [...actual.keys()].sort()[0];
  const from = firstLog && firstLog < start ? firstLog : start;
  const n = Math.min(400, Math.max(0, diffDays(from, end)));
  let cp = 0;
  let ca = 0;
  const pts: ProgressPoint[] = [];
  for (let i = 0; i <= n; i++) {
    const d = addDays(from, i);
    cp += planned.get(d) ?? 0;
    ca += actual.get(d) ?? 0;
    pts.push({
      date: d,
      planned: round(Math.min(100, (cp / total) * 100)),
      actual: d <= today ? round(Math.min(100, (ca / total) * 100)) : null,
    });
  }
  return pts;
}

export interface WeekBar {
  weekStart: string;
  planned: number; // hours
  actual: number; // hours
}

/** Monday of the week containing `key`. */
export function weekStartOf(key: string): string {
  const wd = weekdayOf(key);
  return addDays(key, wd === 0 ? -6 : 1 - wd);
}

export function weeklyBars(goal: GoalRow, milestones: MilestoneRow[], logs: ProgressLogRow[]): WeekBar[] {
  const planned = plannedDailyMinutes(goal, milestones);
  const actual = actualDailyMinutes(logs);
  const weeks = new Map<string, WeekBar>();
  const add = (d: string, k: 'planned' | 'actual', min: number) => {
    const w = weekStartOf(d);
    const row = weeks.get(w) ?? { weekStart: w, planned: 0, actual: 0 };
    row[k] += min / 60;
    weeks.set(w, row);
  };
  planned.forEach((v, d) => add(d, 'planned', v));
  actual.forEach((v, d) => add(d, 'actual', v));
  return [...weeks.values()]
    .sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1))
    .map((w) => ({ ...w, planned: round(w.planned), actual: round(w.actual) }));
}

export interface HeatCell {
  date: string;
  minutes: number;
  future: boolean;
}

/** Last `weeks` weeks of activity, Monday-first columns, for the streak heatmap. */
export function heatmap(logs: ProgressLogRow[], todayKey: string, weeks = 12): HeatCell[][] {
  const actual = actualDailyMinutes(logs);
  const lastMonday = weekStartOf(todayKey);
  const firstMonday = addDays(lastMonday, -(weeks - 1) * 7);
  const cols: HeatCell[][] = [];
  for (let w = 0; w < weeks; w++) {
    const col: HeatCell[] = [];
    for (let d = 0; d < 7; d++) {
      const date = addDays(firstMonday, w * 7 + d);
      col.push({ date, minutes: actual.get(date) ?? 0, future: date > todayKey });
    }
    cols.push(col);
  }
  return cols;
}

function round(n: number) {
  return Math.round(n * 10) / 10;
}
