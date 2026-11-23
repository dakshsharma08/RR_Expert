/**
 * Turn real goal data into the numbers a wallpaper shows. Everything here comes
 * from your database and the clock — no invented values.
 */
import type { GoalData } from '@/db/hooks';
import type { GoalMetrics } from '@/lib/metrics';
import type { WallpaperData } from '@shared/wallpaper/types';
import { dayKey, diffDays, formatDayKey, formatInZone } from '@shared/time';

export function buildWallpaperData(
  data: GoalData,
  m: GoalMetrics,
  motivation: string | null,
  nowMs: number,
): WallpaperData {
  const { goal } = data;
  const c = m.countdown;
  const startKey = c.startKey;
  const span = Math.max(1, diffDays(startKey, c.deadlineKey));
  return {
    goalTitle: goal.title,
    daysLeft: Math.max(0, c.daysLeft),
    state: c.state,
    dayNumber: Math.max(c.state === 'upcoming' ? 0 : 1, c.dayNumber),
    totalDays: c.totalDays,
    deadlineLabel: formatInZone(goal.deadline_utc, goal.timezone, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }),
    nextMilestone: m.nextMilestone
      ? {
          title: m.nextMilestone.title,
          dateLabel: formatDayKey(m.nextMilestone.target_date, {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
          }),
        }
      : null,
    progressPct: m.progress,
    motivation,
    updatedLabel: `Updated ${formatDayKey(dayKey(nowMs, goal.timezone), { day: 'numeric', month: 'short' })}`,
    startsInDays:
      c.state === 'upcoming' ? Math.max(0, diffDays(dayKey(nowMs, goal.timezone), startKey)) : undefined,
    milestones: data.milestones.map((ms) => ({
      title: ms.title,
      at: Math.min(1, Math.max(0, diffDays(startKey, ms.target_date) / span)),
      done: ms.status === 'completed',
    })),
  };
}
