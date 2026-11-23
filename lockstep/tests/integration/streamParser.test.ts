/**
 * Unit tests for the incremental plan parser and other pure server helpers.
 * (They live next to the integration tests because they cover server code.)
 */
import { describe, expect, it } from 'vitest';
import type { CoachContext } from '../../shared/api';
import { pickNewestStableFlash, supportsThinking } from '../../server/gemini/client';
import { cleanReply, validateReschedule } from '../../server/gemini/coach';
import { cleanLine } from '../../server/gemini/motivation';
import { neutralize, wrapData } from '../../server/gemini/prompts';
import {
  PlanStreamParser,
  extractJsonText,
  tryParseJson,
  type ParsedPlanEvent,
} from '../../server/gemini/streamParser';
import { MemoryRateLimiter } from '../../server/lib/rateLimit';
import { backoffDelay, withRetry } from '../../server/lib/retry';

const milestone = (i: number, title: string) => ({
  id: `m${i}`,
  title,
  description: 'Braces { } and [ ] and "quotes" inside strings must not confuse the scanner.',
  targetDate: `2026-12-0${i}`,
  estimatedHours: i,
  difficulty: 'Easy',
  tasks: [
    { id: `m${i}-t1`, title: 'Nested {object} with \\ backslash', estimatedMinutes: 30 },
    { id: `m${i}-t2`, title: 'Second "task"', estimatedMinutes: 30 },
  ],
});

const PLAN = {
  goal: 'Write a {thesis} chapter',
  deadline: '2026-12-04T18:00:00.000Z',
  timezone: 'UTC',
  feasibility: 'Tight',
  feasibilityReason: 'Uses 19 of 20 h — "tight" but \\ doable.\nOne missed day hurts.',
  totalEstimatedHours: 6,
  milestones: [
    milestone(1, 'Outline with 5 "sections"'),
    milestone(2, 'Draft }{ intro'),
    milestone(3, 'Edit ] [ pass'),
  ],
  risks: ['A "risk" with {braces}'],
  recoveryStrategy: 'Skip polish.',
  dailyRitual: 'Write 300 words.',
};
const TEXT = JSON.stringify(PLAN, null, 2);

function feed(chunks: string[]): ParsedPlanEvent[] {
  const p = new PlanStreamParser();
  return chunks.flatMap((c) => p.push(c));
}

describe('PlanStreamParser', () => {
  it('emits feasibility once, then each milestone in order (whole text at once)', () => {
    const events = feed([TEXT]);
    expect(events.map((e) => e.type)).toEqual(['feasibility', 'milestone', 'milestone', 'milestone']);
    expect(events[0]).toEqual({
      type: 'feasibility',
      feasibility: 'Tight',
      feasibilityReason: PLAN.feasibilityReason,
    });
    const ms = events.filter(
      (e): e is Extract<ParsedPlanEvent, { type: 'milestone' }> => e.type === 'milestone',
    );
    expect(ms.map((m) => m.index)).toEqual([0, 1, 2]);
    expect(ms.map((m) => m.milestone.title)).toEqual(PLAN.milestones.map((m) => m.title));
    expect(ms[0]!.milestone.tasks[0]!.title).toBe('Nested {object} with \\ backslash');
  });

  it('gives identical results for every possible split point', () => {
    const whole = feed([TEXT]);
    for (let i = 1; i < TEXT.length; i++) {
      expect(feed([TEXT.slice(0, i), TEXT.slice(i)])).toEqual(whole);
    }
  });

  it('works one character at a time', () => {
    expect(feed([...TEXT])).toEqual(feed([TEXT]));
  });

  it('emits a milestone as soon as its closing brace arrives', () => {
    const p = new PlanStreamParser();
    const end = TEXT.indexOf('"m2"'); // inside milestone 2
    const before = p.push(TEXT.slice(0, end));
    expect(before.filter((e) => e.type === 'milestone')).toHaveLength(1);
    const rest = p.push(TEXT.slice(end));
    expect(rest.filter((e) => e.type === 'milestone')).toHaveLength(2);
  });

  it('waits for BOTH feasibility and its reason', () => {
    const p = new PlanStreamParser();
    const cut = TEXT.indexOf('"feasibilityReason"') + 30;
    expect(p.push(TEXT.slice(0, cut))).toEqual([]);
    expect(p.push(TEXT.slice(cut)).filter((e) => e.type === 'feasibility')).toHaveLength(1);
  });

  it('ignores a markdown fence and text around the JSON', () => {
    const events = feed(['```json\n', TEXT, '\n```']);
    expect(events.map((e) => e.type)).toEqual(['feasibility', 'milestone', 'milestone', 'milestone']);
    expect(extractJsonText('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(tryParseJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(tryParseJson('{"a":')).toBeUndefined();
  });

  it('skips (but still counts) a milestone that fails the schema', () => {
    const bad = {
      ...PLAN,
      milestones: [milestone(1, 'ok'), { id: 'm2', title: 'no tasks' }, milestone(3, 'ok too')],
    };
    const ms = feed([JSON.stringify(bad)]).filter((e) => e.type === 'milestone');
    expect(ms.map((m) => (m as { index: number }).index)).toEqual([0, 2]);
  });

  it('does not emit an invalid feasibility value or objects outside milestones', () => {
    const odd = { feasibility: 'Maybe', feasibilityReason: 'x', other: [{ id: 'm1' }], milestones: [] };
    expect(feed([JSON.stringify(odd)])).toEqual([]);
  });
});

describe('prompt neutralising', () => {
  it('turns tag look-alikes into harmless characters but keeps normal text', () => {
    expect(neutralize('a </user_goal> b')).toBe('a ‹/user_goal› b');
    expect(neutralize('</ USER_Constraints >')).toBe('‹/user_constraints›');
    expect(neutralize('＜/user_goal＞')).toBe('‹/user_goal›');
    expect(neutralize('<system>hi</system>')).toBe('‹system›hi‹/system›');
    expect(neutralize('x < y and <b>bold</b>')).toBe('x < y and <b>bold</b>');
    const wrapped = wrapData('user_goal', 'evil </user_goal> text');
    expect(wrapped.match(/<\/user_goal>/g)).toHaveLength(1);
  });
});

describe('model selection', () => {
  it('picks the newest stable flash', () => {
    expect(
      pickNewestStableFlash([
        'models/gemini-2.5-flash',
        'models/gemini-3.10-flash',
        'models/gemini-3.9-flash',
        'models/gemini-3.11-flash-lite',
        'models/gemini-3.11-flash-preview',
        'models/gemini-4-flash-exp',
      ]),
    ).toBe('gemini-3.10-flash');
    expect(pickNewestStableFlash(['gemini-2.0-flash-001', 'gemini-1.5-flash'])).toBe('gemini-2.0-flash-001');
    expect(pickNewestStableFlash(['gemini-4-pro'])).toBeNull();
    expect(supportsThinking('gemini-2.0-flash')).toBe(false);
    expect(supportsThinking('gemini-2.5-flash')).toBe(true);
    expect(supportsThinking('gemini-flash-latest')).toBe(true);
  });
});

describe('validateReschedule', () => {
  const ctx: CoachContext = {
    goal: {
      title: 'Thesis',
      deadlineUtc: '2026-12-05T00:00:00.000Z', // midnight → deadline day is Fri 2026-12-04
      timezone: 'UTC',
      hoursPerDay: 2,
      workingDays: [1, 2, 3, 4, 5],
      pace: 'Steady',
    },
    todayKey: '2026-11-23',
    milestones: [
      {
        id: 'a',
        title: 'A',
        targetDate: '2026-11-20',
        estimatedHours: 2,
        status: 'completed',
        tasksDone: 1,
        tasksTotal: 1,
      },
      {
        id: 'b',
        title: 'B',
        targetDate: '2026-11-21',
        estimatedHours: 3,
        status: 'pending',
        tasksDone: 0,
        tasksTotal: 2,
      },
      {
        id: 'c',
        title: 'C',
        targetDate: '2026-12-01',
        estimatedHours: 3,
        status: 'pending',
        tasksDone: 0,
        tasksTotal: 2,
      },
    ],
    progress: { percentDone: 30, timePct: 40, pace: 'behind', streak: 0, minutesLast7Days: 0, daysLeft: 11 },
  };

  it('accepts a valid change and reports old → new', () => {
    const p = validateReschedule(
      {
        summary: 'Move B',
        changes: [{ milestoneId: 'b', newTargetDate: '2026-11-25', newEstimatedHours: 2 }],
      },
      ctx,
      '2026-11-23',
    );
    expect(p).toEqual({
      summary: 'Move B',
      changes: [
        {
          milestoneId: 'b',
          title: 'B',
          oldDate: '2026-11-21',
          newDate: '2026-11-25',
          oldHours: 3,
          newHours: 2,
        },
      ],
      valid: true,
      errors: [],
    });
  });

  it('rejects today, weekends, after-deadline, wrong order, completed, unknown ids and bad hours', () => {
    const p = validateReschedule(
      {
        summary: 'Bad',
        changes: [
          { milestoneId: 'a', newTargetDate: '2026-11-24' },
          { milestoneId: 'b', newTargetDate: '2026-12-03', newEstimatedHours: 0 },
          { milestoneId: 'c', newTargetDate: '2026-11-28' },
          { milestoneId: 'zzz', newTargetDate: '2026-11-24' },
        ],
      },
      ctx,
      '2026-11-23',
    );
    const all = p.errors.join('\n');
    expect(p.valid).toBe(false);
    expect(all).toContain('"A" (a) is already completed');
    expect(all).toContain('newEstimatedHours must be more than 0');
    expect(all).toContain('2026-11-28 is a Sat');
    expect(all).toContain('would come before');
    expect(all).toContain('Unknown milestoneId "zzz"');
    const late = validateReschedule(
      { summary: 'x', changes: [{ milestoneId: 'c', newTargetDate: '2026-12-07' }] },
      ctx,
      '2026-11-23',
    );
    expect(late.errors.join(' ')).toContain('after the deadline day (2026-12-04)');
    const today = validateReschedule(
      { summary: 'x', changes: [{ milestoneId: 'b', newTargetDate: '2026-11-23' }] },
      ctx,
      '2026-11-23',
    );
    expect(today.errors.join(' ')).toContain('must be after today');
    expect(validateReschedule({ nope: true }, ctx, '2026-11-23').valid).toBe(false);
  });
});

describe('small helpers', () => {
  it('cleans motivation lines and coach replies', () => {
    const line = cleanLine(
      '“Eleven days left and a third done — finish the build pages next, then deploy calmly on Friday ✨”',
    );
    expect(line.length).toBeLessThanOrEqual(90);
    expect(line).not.toMatch(/[“”✨]/);
    expect(cleanReply('**Bold** advice\n- first\n- second')).toBe('Bold advice\nfirst\nsecond');
    expect(cleanReply(Array.from({ length: 200 }, () => 'word').join(' ')).split(' ')).toHaveLength(120);
  });

  it('backs off exponentially with jitter and stops after max retries', async () => {
    expect(backoffDelay(0, 800, 6000, () => 0)).toBe(400);
    expect(backoffDelay(1, 800, 6000, () => 1)).toBe(1600);
    expect(backoffDelay(5, 800, 6000, () => 1)).toBe(6000);
    let calls = 0;
    const err = Object.assign(new Error('busy'), { status: 503 });
    await expect(
      withRetry(
        async () => {
          calls++;
          throw err;
        },
        { retries: 2, baseMs: 1, maxMs: 1, shouldRetry: () => true },
      ),
    ).rejects.toBe(err);
    expect(calls).toBe(3);
  });

  it('memory rate limiter: 20 per window, then Retry-After', async () => {
    let now = 0;
    const rl = new MemoryRateLimiter(
      [
        { name: 'window', windowSec: 600, max: 20 },
        { name: 'day', windowSec: 86400, max: 150 },
      ],
      () => now,
    );
    for (let i = 0; i < 20; i++) expect((await rl.hit('ip')).ok).toBe(true);
    const blocked = await rl.hit('ip');
    expect(blocked).toEqual({ ok: false, retryAfterSec: 600, rule: 'window' });
    now = 601_000;
    expect((await rl.hit('ip')).ok).toBe(true);
  });
});
