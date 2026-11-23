/**
 * Live re-validation while the user edits the plan (same rules as the server).
 * Hard issues block "Approve"; soft issues are warnings.
 */
import type { GoalRow, MilestoneRow } from '@/db/db';
import { WEEKDAY_SHORT, dayKey, effectiveDeadlineKey, isDayKey, weekdayOf } from '@shared/time';

export interface MilestoneIssues {
  hard: string[];
  soft: string[];
}

export function liveChecks(goal: GoalRow, milestones: MilestoneRow[], nowMs = Date.now()) {
  const today = dayKey(nowMs, goal.timezone);
  const deadlineKey = effectiveDeadlineKey(goal.deadline_utc, goal.timezone);
  const working = new Set(goal.working_days);
  const sameDay = deadlineKey === today;
  const byId = new Map<string, MilestoneIssues>();
  const ordered = [...milestones].sort((a, b) => a.order - b.order);
  let hardCount = 0;
  ordered.forEach((m, i) => {
    const issues: MilestoneIssues = { hard: [], soft: [] };
    if (m.status !== 'completed') {
      if (!isDayKey(m.target_date)) issues.hard.push('Pick a valid date.');
      else {
        const ok = sameDay ? m.target_date >= today : m.target_date > today;
        if (!ok && goal.status !== 'active') issues.hard.push('Date must be after today.');
        if (!ok && goal.status === 'active' && m.target_date < today)
          issues.soft.push('This date has passed — reschedule it or ask the coach to replan.');
        if (m.target_date > deadlineKey) issues.hard.push('Date is after the deadline.');
        if (!working.has(weekdayOf(m.target_date)))
          issues.soft.push(`${WEEKDAY_SHORT[weekdayOf(m.target_date)]} isn't one of your working days.`);
      }
    }
    const prev = ordered[i - 1];
    if (prev && isDayKey(prev.target_date) && isDayKey(m.target_date) && m.target_date < prev.target_date)
      issues.hard.push('Comes before the previous milestone — reorder or change the date.');
    if (!(m.estimated_hours > 0)) issues.hard.push('Hours must be more than 0.');
    hardCount += issues.hard.length;
    byId.set(m.id, issues);
  });
  return { byId, hardCount, today, deadlineKey };
}
