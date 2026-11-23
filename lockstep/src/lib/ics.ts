/** Export milestones + deadline as an .ics calendar file (all-day events). */
import type { GoalRow, MilestoneRow } from '@/db/db';
import { addDays, effectiveDeadlineKey } from '@shared/time';

const esc = (s: string) =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const d = (key: string) => key.replace(/-/g, '');
const stamp = () =>
  new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');

export function buildIcs(goals: GoalRow[], milestones: MilestoneRow[]): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LOCKSTEP//Countdown//EN',
    'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:LOCKSTEP',
  ];
  for (const g of goals) {
    const dk = effectiveDeadlineKey(g.deadline_utc, g.timezone);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${g.id}@lockstep`,
      `DTSTAMP:${stamp()}`,
      `DTSTART;VALUE=DATE:${d(dk)}`,
      `DTEND;VALUE=DATE:${d(addDays(dk, 1))}`,
      `SUMMARY:${esc(`⏳ Deadline: ${g.title}`)}`,
      'END:VEVENT',
    );
    for (const m of milestones.filter((x) => x.goal_id === g.id)) {
      lines.push(
        'BEGIN:VEVENT',
        `UID:${m.id}@lockstep`,
        `DTSTAMP:${stamp()}`,
        `DTSTART;VALUE=DATE:${d(m.target_date)}`,
        `DTEND;VALUE=DATE:${d(addDays(m.target_date, 1))}`,
        `SUMMARY:${esc(`${m.title} · ${g.title}`)}`,
        `DESCRIPTION:${esc(`${m.description}\n${m.estimated_hours} h planned`)}`,
        'END:VEVENT',
      );
    }
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
