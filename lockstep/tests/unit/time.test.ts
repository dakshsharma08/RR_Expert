import { describe, expect, it } from 'vitest';
import {
  addDays,
  computeCountdown,
  computePace,
  dayKey,
  diffDays,
  effectiveDeadlineKey,
  localToUtcIso,
  parseWall,
  splitDuration,
  workingDaysBetween,
  zonedWallTimeToUtc,
} from '../../shared/time';

describe('local wall time → UTC', () => {
  it('converts a normal time', () => {
    const r = localToUtcIso('2026-12-01', '09:00', 'Asia/Kolkata');
    expect(r.iso).toBe('2026-12-01T03:30:00.000Z');
    expect(r.adjustment).toBe('none');
  });

  it('handles a DST gap (spring forward) by moving forward', () => {
    // New York jumps 02:00 → 03:00 on 2026-03-08; 02:30 does not exist.
    const r = localToUtcIso('2026-03-08', '02:30', 'America/New_York');
    expect(r.adjustment).toBe('gap');
    expect(r.iso).toBe('2026-03-08T07:30:00.000Z'); // 03:30 EDT
    expect(r.note).toMatch(/doesn't exist/);
  });

  it('handles a DST overlap (fall back) by taking the earlier instant', () => {
    // New York repeats 01:00–02:00 on 2026-11-01.
    const r = localToUtcIso('2026-11-01', '01:30', 'America/New_York');
    expect(r.adjustment).toBe('overlap');
    expect(r.iso).toBe('2026-11-01T05:30:00.000Z'); // 01:30 EDT (first)
  });

  it('handles Europe DST gap', () => {
    const r = localToUtcIso('2026-03-29', '02:15', 'Europe/Berlin');
    expect(r.adjustment).toBe('gap');
    expect(r.iso).toBe('2026-03-29T01:15:00.000Z'); // 03:15 CEST
  });

  it('accepts a leap day and rejects an impossible date', () => {
    expect(localToUtcIso('2028-02-29', '12:00', 'UTC').iso).toBe('2028-02-29T12:00:00.000Z');
    expect(() => parseWall('2027-02-29', '12:00')).toThrow();
    expect(() => parseWall('2026-04-31', '12:00')).toThrow();
  });

  it('rejects unknown zones', () => {
    expect(() => zonedWallTimeToUtc(parseWall('2026-12-01', '09:00'), 'Mars/Olympus')).toThrow();
  });
});

describe('calendar day math', () => {
  it('crosses month ends and leap years', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(diffDays('2026-11-23', '2026-12-25')).toBe(32);
    expect(diffDays('2026-03-07', '2026-03-09')).toBe(2); // across a DST weekend in the US — still 2 days
  });

  it('day key depends on the zone (timezone change)', () => {
    const instant = '2026-11-23T20:00:00.000Z';
    expect(dayKey(instant, 'America/Los_Angeles')).toBe('2026-11-23');
    expect(dayKey(instant, 'Asia/Tokyo')).toBe('2026-11-24');
  });

  it('counts working days inclusively', () => {
    // 2026-11-23 is a Monday. Mon–Fri over two weeks = 10 days.
    expect(workingDaysBetween('2026-11-23', '2026-12-06', [1, 2, 3, 4, 5])).toHaveLength(10);
    expect(workingDaysBetween('2026-11-23', '2026-11-22', [1])).toHaveLength(0);
  });

  it('treats a midnight deadline as due the previous day', () => {
    expect(effectiveDeadlineKey('2026-12-01T00:00:00.000Z', 'UTC')).toBe('2026-11-30');
    expect(effectiveDeadlineKey('2026-12-01T00:01:00.000Z', 'UTC')).toBe('2026-12-01');
  });
});

describe('countdown', () => {
  const base = { startUtc: '2026-11-01T00:00:00.000Z', timezone: 'UTC' };

  it('is active with days left and Day X of Y', () => {
    const c = computeCountdown({
      ...base,
      deadlineUtc: '2026-12-31T17:00:00.000Z',
      nowMs: Date.parse('2026-11-23T10:00:00Z'),
    });
    expect(c.state).toBe('active');
    expect(c.daysLeft).toBe(38);
    expect(c.dayNumber).toBe(23);
    expect(c.totalDays).toBe(61);
    expect(c.timePct).toBeGreaterThan(0.3);
    expect(c.timePct).toBeLessThan(0.4);
  });

  it('is due-today on a same-day deadline', () => {
    const c = computeCountdown({
      ...base,
      deadlineUtc: '2026-11-23T18:00:00.000Z',
      nowMs: Date.parse('2026-11-23T10:00:00Z'),
    });
    expect(c.state).toBe('due-today');
    expect(c.daysLeft).toBe(0);
    expect(c.parts).toEqual({ days: 0, hours: 8, minutes: 0, seconds: 0 });
  });

  it('is due-today the day before a midnight deadline', () => {
    const c = computeCountdown({
      ...base,
      deadlineUtc: '2026-11-24T00:00:00.000Z',
      nowMs: Date.parse('2026-11-23T10:00:00Z'),
    });
    expect(c.state).toBe('due-today');
    expect(c.daysLeft).toBe(0);
  });

  it('is expired after the deadline and never shows negative time', () => {
    const c = computeCountdown({
      ...base,
      deadlineUtc: '2026-11-20T18:00:00.000Z',
      nowMs: Date.parse('2026-11-23T10:00:00Z'),
    });
    expect(c.state).toBe('expired');
    expect(c.remainingMs).toBe(0);
    expect(c.parts.seconds).toBe(0);
    expect(c.daysLeft).toBeLessThan(0);
  });

  it('is upcoming before the start and completed when flagged', () => {
    const up = computeCountdown({
      ...base,
      startUtc: '2026-12-01T00:00:00Z',
      deadlineUtc: '2026-12-31T00:00:00Z',
      nowMs: Date.parse('2026-11-23T10:00:00Z'),
    });
    expect(up.state).toBe('upcoming');
    expect(up.dayNumber).toBe(0);
    const done = computeCountdown({
      ...base,
      deadlineUtc: '2026-12-31T00:00:00Z',
      nowMs: Date.parse('2026-11-23T10:00:00Z'),
      completed: true,
    });
    expect(done.state).toBe('completed');
  });

  it('counts days in the goal zone across DST', () => {
    // Deadline 9:00 New York on 2026-03-10; now is 2026-03-07 noon New York (before spring forward).
    const deadline = localToUtcIso('2026-03-10', '09:00', 'America/New_York').iso;
    const now = Date.parse(localToUtcIso('2026-03-07', '12:00', 'America/New_York').iso);
    const c = computeCountdown({
      startUtc: '2026-03-01T00:00:00Z',
      deadlineUtc: deadline,
      timezone: 'America/New_York',
      nowMs: now,
    });
    expect(c.daysLeft).toBe(3);
    // 2 days 21 hours wall-clock, minus the hour lost to DST → 2d 20h.
    expect(c.parts.days).toBe(2);
    expect(c.parts.hours).toBe(20);
  });

  it('handles a leap-day deadline', () => {
    const c = computeCountdown({
      startUtc: '2028-02-01T00:00:00Z',
      deadlineUtc: '2028-02-29T12:00:00Z',
      timezone: 'UTC',
      nowMs: Date.parse('2028-02-28T12:00:00Z'),
    });
    expect(c.daysLeft).toBe(1);
    expect(c.totalDays).toBe(29);
  });

  it('splits durations', () => {
    expect(splitDuration(90061000)).toEqual({ days: 1, hours: 1, minutes: 1, seconds: 1 });
    expect(splitDuration(-5)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  });

  it('computes pace with a tolerance band', () => {
    expect(computePace(0.5, 0.6)).toBe('ahead');
    expect(computePace(0.5, 0.52)).toBe('on-track');
    expect(computePace(0.5, 0.3)).toBe('behind');
  });
});
