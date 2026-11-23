/**
 * LOCKSTEP countdown engine — pure functions, shared by the browser and the server.
 *
 * Key ideas (for learners):
 * - We STORE every deadline as a UTC ISO string plus the IANA time zone the user
 *   picked (e.g. "Asia/Kolkata"). UTC is unambiguous; the zone tells us how to
 *   show it and which calendar day "today" is for that goal.
 * - Converting a local wall-clock time ("2026-03-08 02:30 in New York") to UTC is
 *   tricky around daylight-saving changes:
 *     • GAP: the clock jumps 02:00 → 03:00, so 02:30 never happens. We move the
 *       time forward by the size of the gap (→ 03:30), like Temporal's
 *       "compatible" rule, and report `adjustment: 'gap'` so the UI can say so.
 *     • OVERLAP: the clock falls back 02:00 → 01:00, so 01:30 happens twice. We
 *       pick the EARLIER instant and report `adjustment: 'overlap'`.
 * - "Calendar days" are counted with day keys ("YYYY-MM-DD") in the goal's zone,
 *   so a deadline is never off by one day for someone abroad.
 */
import { getTimezoneOffset } from 'date-fns-tz';

export const DAY_MS = 86_400_000;

export interface WallTime {
  year: number;
  month: number; // 1–12
  day: number;
  hour: number; // 0–23
  minute: number;
  second?: number;
}

export type DstAdjustment = 'none' | 'gap' | 'overlap';

export interface ZonedConversion {
  utc: Date;
  adjustment: DstAdjustment;
  /** Human-readable explanation when an adjustment happened. */
  note?: string;
}

/** True when the string is an IANA zone this runtime understands. */
export function isValidTimeZone(tz: string): boolean {
  if (!tz || typeof tz !== 'string') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The device's own IANA zone (falls back to UTC). */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = partsFormatterCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    partsFormatterCache.set(tz, f);
  }
  return f;
}

/** What a wall clock in `tz` shows at instant `date`. */
export function utcToWall(date: Date | number, tz: string): WallTime {
  const d = typeof date === 'number' ? new Date(date) : date;
  const parts = partsFormatter(tz).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') % 24,
    minute: get('minute'),
    second: get('second'),
  };
}

function offsetMs(tz: string, instant: number): number {
  const off = getTimezoneOffset(tz, new Date(instant));
  if (Number.isNaN(off)) throw new Error(`Unknown time zone: ${tz}`);
  return off;
}

function sameWall(a: WallTime, b: WallTime): boolean {
  return (
    a.year === b.year && a.month === b.month && a.day === b.day && a.hour === b.hour && a.minute === b.minute
  );
}

/**
 * Convert a local wall-clock time in `tz` to a UTC instant, handling DST gaps and overlaps explicitly.
 */
export function zonedWallTimeToUtc(wall: WallTime, tz: string): ZonedConversion {
  if (!isValidTimeZone(tz)) throw new Error(`Unknown time zone: ${tz}`);
  const guess = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second ?? 0);
  // Offsets a day and a half either side: one is "before" any DST switch near this time, the other "after".
  const offBefore = offsetMs(tz, guess - 1.5 * DAY_MS);
  const offAfter = offsetMs(tz, guess + 1.5 * DAY_MS);
  const candidates = Array.from(new Set([guess - offBefore, guess - offAfter, guess - offsetMs(tz, guess)]));
  const valid = candidates.filter((c) => sameWall(utcToWall(c, tz), wall)).sort((a, b) => a - b);

  if (valid.length === 0) {
    // DST gap: this wall time does not exist. Shift forward by the gap (pre-transition offset).
    const shifted = guess - offBefore;
    const w = utcToWall(shifted, tz);
    return {
      utc: new Date(shifted),
      adjustment: 'gap',
      note: `${pad(wall.hour)}:${pad(wall.minute)} doesn't exist on ${wall.year}-${pad(wall.month)}-${pad(wall.day)} in ${tz} (clocks jump forward), so we used ${pad(w.hour)}:${pad(w.minute)}.`,
    };
  }
  const first = valid[0]!;
  const last = valid[valid.length - 1]!;
  if (last !== first) {
    return {
      utc: new Date(first),
      adjustment: 'overlap',
      note: `${pad(wall.hour)}:${pad(wall.minute)} happens twice on ${wall.year}-${pad(wall.month)}-${pad(wall.day)} in ${tz} (clocks fall back), so we used the first one.`,
    };
  }
  return { utc: new Date(first), adjustment: 'none' };
}

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Parse "YYYY-MM-DD" + "HH:mm" into a WallTime (throws on malformed input). */
export function parseWall(dateKey: string, time = '00:00'): WallTime {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  const tm = /^(\d{2}):(\d{2})$/.exec(time);
  if (!dm || !tm) throw new Error(`Invalid date/time: ${dateKey} ${time}`);
  const wall = { year: +dm[1]!, month: +dm[2]!, day: +dm[3]!, hour: +tm[1]!, minute: +tm[2]! };
  // Reject impossible dates such as 2026-02-30.
  const probe = new Date(Date.UTC(wall.year, wall.month - 1, wall.day));
  if (probe.getUTCMonth() !== wall.month - 1 || probe.getUTCDate() !== wall.day) {
    throw new Error(`Invalid calendar date: ${dateKey}`);
  }
  if (wall.hour > 23 || wall.minute > 59) throw new Error(`Invalid time: ${time}`);
  return wall;
}

/** Convenience: local date + time in a zone → UTC ISO + DST info. */
export function localToUtcIso(dateKey: string, time: string, tz: string): ZonedConversion & { iso: string } {
  const conv = zonedWallTimeToUtc(parseWall(dateKey, time), tz);
  return { ...conv, iso: conv.utc.toISOString() };
}

// ───────────────────────── Day keys (calendar days) ─────────────────────────

/** Calendar date ("YYYY-MM-DD") that `instant` falls on in `tz`. */
export function dayKey(instant: Date | number | string, tz: string): string {
  const d = instant instanceof Date ? instant : new Date(instant);
  const w = utcToWall(d, tz);
  return `${w.year}-${pad(w.month)}-${pad(w.day)}`;
}

function keyToUtcMidnight(key: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) throw new Error(`Invalid day key: ${key}`);
  return Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!);
}

function utcMidnightToKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function isDayKey(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return utcMidnightToKey(keyToUtcMidnight(s)) === s;
}

export function addDays(key: string, n: number): string {
  return utcMidnightToKey(keyToUtcMidnight(key) + n * DAY_MS);
}

/** Whole calendar days from `a` to `b` (positive when b is later). */
export function diffDays(a: string, b: string): number {
  return Math.round((keyToUtcMidnight(b) - keyToUtcMidnight(a)) / DAY_MS);
}

/** 0 = Sunday … 6 = Saturday, for a calendar date. */
export function weekdayOf(key: string): number {
  return new Date(keyToUtcMidnight(key)).getUTCDay();
}

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** Every calendar day from `from` to `to`, inclusive. Empty if `to` is before `from`. */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  const n = diffDays(from, to);
  for (let i = 0; i <= n; i++) out.push(addDays(from, i));
  return out;
}

/** Working days (by weekday number) between two keys, inclusive. */
export function workingDaysBetween(from: string, to: string, workingDays: readonly number[]): string[] {
  const set = new Set(workingDays);
  return eachDay(from, to).filter((k) => set.has(weekdayOf(k)));
}

/**
 * The calendar day a deadline "belongs" to. A deadline at exactly 00:00 local means
 * "by the end of the previous day", so we count it as due on that previous day.
 */
export function effectiveDeadlineKey(deadlineUtc: string | Date, tz: string): string {
  const d = deadlineUtc instanceof Date ? deadlineUtc : new Date(deadlineUtc);
  const w = utcToWall(d, tz);
  const key = `${w.year}-${pad(w.month)}-${pad(w.day)}`;
  return w.hour === 0 && w.minute === 0 ? addDays(key, -1) : key;
}

// ───────────────────────────── Countdown ─────────────────────────────

export type CountdownState = 'upcoming' | 'active' | 'due-today' | 'completed' | 'expired';
export type Pace = 'ahead' | 'on-track' | 'behind';

export interface CountdownInput {
  nowMs: number;
  startUtc: string;
  deadlineUtc: string;
  timezone: string;
  completed?: boolean;
}

export interface TimeParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export interface Countdown {
  state: CountdownState;
  remainingMs: number;
  elapsedMs: number;
  totalMs: number;
  /** Share of the time window used up, 0–1. */
  timePct: number;
  /** Calendar days from today to the (effective) deadline day in the goal zone. Negative once past. */
  daysLeft: number;
  /** "Day X of Y" — X is clamped to 0…Y (0 while upcoming). */
  dayNumber: number;
  totalDays: number;
  parts: TimeParts;
  todayKey: string;
  deadlineKey: string;
  startKey: string;
}

export function splitDuration(ms: number): TimeParts {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

export function computeCountdown(input: CountdownInput): Countdown {
  const { nowMs, timezone } = input;
  const start = new Date(input.startUtc).getTime();
  const deadline = new Date(input.deadlineUtc).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(deadline)) throw new Error('Invalid start or deadline');

  const todayKey = dayKey(nowMs, timezone);
  const deadlineKey = effectiveDeadlineKey(input.deadlineUtc, timezone);
  const startKey = dayKey(start, timezone);

  const totalMs = Math.max(1, deadline - start);
  const remainingMs = Math.max(0, deadline - nowMs);
  const elapsedMs = Math.min(totalMs, Math.max(0, nowMs - start));
  const timePct = Math.min(1, Math.max(0, elapsedMs / totalMs));

  const totalDays = Math.max(1, diffDays(startKey, deadlineKey) + 1);
  const rawDay = diffDays(startKey, todayKey) + 1;
  const dayNumber = Math.min(totalDays, Math.max(0, rawDay));
  const daysLeft = diffDays(todayKey, deadlineKey);

  let state: CountdownState;
  if (input.completed) state = 'completed';
  else if (nowMs >= deadline) state = 'expired';
  else if (nowMs < start) state = 'upcoming';
  else if (todayKey >= deadlineKey) state = 'due-today';
  else state = 'active';

  return {
    state,
    remainingMs,
    elapsedMs,
    totalMs,
    timePct,
    daysLeft,
    dayNumber: state === 'upcoming' ? 0 : dayNumber,
    totalDays,
    parts: splitDuration(remainingMs),
    todayKey,
    deadlineKey,
    startKey,
  };
}

/**
 * Pace compares how much of the TIME is used with how much of the WORK is done.
 * A 5-percentage-point band counts as "on track" so tiny wobbles don't nag.
 */
export function computePace(timePct: number, taskPct: number, tolerance = 0.05): Pace {
  const diff = taskPct - timePct;
  if (diff > tolerance) return 'ahead';
  if (diff < -tolerance) return 'behind';
  return 'on-track';
}

/** Format a UTC instant in a zone, e.g. "Mon, 1 Dec 2026, 09:00". */
export function formatInZone(
  instant: Date | number | string,
  tz: string,
  opts: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  },
  locale = 'en-GB',
): string {
  const d = instant instanceof Date ? instant : new Date(instant);
  return new Intl.DateTimeFormat(locale, { ...opts, timeZone: tz }).format(d);
}

/** "12 Dec" style label for a day key (no zone needed — it is already a calendar date). */
export function formatDayKey(
  key: string,
  opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' },
): string {
  return new Intl.DateTimeFormat('en-GB', { ...opts, timeZone: 'UTC' }).format(
    new Date(keyToUtcMidnight(key)),
  );
}

/** Short zone label such as "GMT+5:30" for display next to times. */
export function zoneLabel(tz: string, at: Date | number = Date.now()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
    }).formatToParts(typeof at === 'number' ? new Date(at) : at);
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? tz;
  } catch {
    return tz;
  }
}

/** All IANA zones the runtime knows (falls back to a short list on old browsers). */
export function listTimeZones(): string[] {
  const anyIntl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
  try {
    const list = anyIntl.supportedValuesOf?.('timeZone');
    if (list && list.length) return list.includes('UTC') ? list : ['UTC', ...list];
  } catch {
    /* ignore */
  }
  return [
    'UTC',
    'America/Los_Angeles',
    'America/Denver',
    'America/Chicago',
    'America/New_York',
    'America/Sao_Paulo',
    'Europe/London',
    'Europe/Berlin',
    'Africa/Lagos',
    'Asia/Dubai',
    'Asia/Kolkata',
    'Asia/Singapore',
    'Asia/Tokyo',
    'Australia/Sydney',
    'Pacific/Auckland',
  ];
}
