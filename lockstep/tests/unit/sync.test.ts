/**
 * Cloud sync logic that can be tested without a network: the last-write-wins merge,
 * deletion planning, content comparison, and the Dexie ⇄ cloud row mapping.
 */
import { describe, expect, it } from 'vitest';
import { mergeRows, planDeletions, sameContent, stableStringify, toMillis } from '../../src/lib/sync/merge';
import { fromCloud, toCloud, syncMessage } from '../../src/lib/sync/sync';
import type { AiRunRow, GoalRow, MilestoneRow, WallpaperRow } from '../../src/db/db';

const row = (id: string, updated_at: string, extra: Record<string, unknown> = {}) => ({
  id,
  updated_at,
  ...extra,
});
const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

describe('mergeRows (last write wins)', () => {
  it('sends remote-only rows to the device and local-only rows to the cloud', () => {
    const r = mergeRows(
      [row('local', '2026-11-01T00:00:00.000Z')],
      [row('remote', '2026-11-01T00:00:00.000Z')],
    );
    expect(ids(r.toLocal)).toEqual(['remote']);
    expect(ids(r.toRemote)).toEqual(['local']);
  });

  it('keeps the newer version of a row both sides have', () => {
    const local = [
      row('a', '2026-11-02T00:00:00.000Z', { v: 'local' }),
      row('b', '2026-11-01T00:00:00.000Z', { v: 'local' }),
    ];
    const remote = [
      row('a', '2026-11-01T00:00:00.000Z', { v: 'remote' }),
      row('b', '2026-11-02T00:00:00.000Z', { v: 'remote' }),
    ];
    const r = mergeRows(local, remote);
    expect(r.toRemote).toEqual([local[0]]);
    expect(r.toLocal).toEqual([remote[1]]);
  });

  it('gives a tie to the remote copy', () => {
    const r = mergeRows(
      [row('a', '2026-11-01T10:00:00.000Z', { v: 'local' })],
      [row('a', '2026-11-01T10:00:00.000Z', { v: 'remote' })],
    );
    expect(r.toLocal).toEqual([{ id: 'a', updated_at: '2026-11-01T10:00:00.000Z', v: 'remote' }]);
    expect(r.toRemote).toEqual([]);
  });

  it('compares instants, not text (Postgres "+00:00" vs JavaScript "Z")', () => {
    const r = mergeRows([row('a', '2026-11-01T10:00:00.500Z')], [row('a', '2026-11-01T10:00:00+00:00')]);
    expect(ids(r.toRemote)).toEqual(['a']); // local is half a second newer
    expect(r.toLocal).toEqual([]);
  });

  it('keeps the newest copy when a list repeats an id', () => {
    const r = mergeRows(
      [],
      [
        row('a', '2026-11-01T00:00:00.000Z', { v: 1 }),
        row('a', '2026-11-03T00:00:00.000Z', { v: 3 }),
        row('a', '2026-11-02T00:00:00.000Z', { v: 2 }),
      ],
    );
    expect(r.toLocal).toEqual([row('a', '2026-11-03T00:00:00.000Z', { v: 3 })]);
  });

  it('handles empty inputs and unreadable times', () => {
    expect(mergeRows([], [])).toEqual({ toLocal: [], toRemote: [] });
    expect(toMillis('not a date')).toBe(0);
    expect(toMillis(null)).toBe(0);
    const r = mergeRows([row('a', 'garbage')], [row('a', '2026-11-01T00:00:00.000Z')]);
    expect(ids(r.toLocal)).toEqual(['a']);
  });
});

describe('planDeletions', () => {
  const base = { known: ['a', 'b'], localChanged: [] as string[], remoteChanged: [] as string[] };

  it('deletes in the cloud what this device deleted', () => {
    expect(planDeletions({ ...base, localIds: ['b'], remoteIds: ['a', 'b'] })).toEqual({
      deleteLocal: [],
      deleteRemote: ['a'],
    });
  });

  it('deletes on this device what another device deleted', () => {
    expect(planDeletions({ ...base, localIds: ['a', 'b'], remoteIds: ['a'] })).toEqual({
      deleteLocal: ['b'],
      deleteRemote: [],
    });
  });

  it('lets an edit beat a deletion on either side', () => {
    expect(
      planDeletions({ ...base, localIds: ['b'], remoteIds: ['a', 'b'], remoteChanged: ['a'] }).deleteRemote,
    ).toEqual([]);
    expect(
      planDeletions({ ...base, localIds: ['a', 'b'], remoteIds: ['a'], localChanged: ['b'] }).deleteLocal,
    ).toEqual([]);
  });

  it('never deletes rows it has not seen on both sides (first sync, new rows)', () => {
    expect(
      planDeletions({ known: [], localIds: ['x'], remoteIds: ['y'], localChanged: [], remoteChanged: [] }),
    ).toEqual({ deleteLocal: [], deleteRemote: [] });
  });

  it('does nothing when both sides already deleted a row', () => {
    expect(planDeletions({ ...base, localIds: ['b'], remoteIds: ['b'] })).toEqual({
      deleteLocal: [],
      deleteRemote: [],
    });
  });
});

describe('sameContent', () => {
  it('ignores key order (jsonb reorders keys) and undefined fields', () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe(stableStringify({ a: { c: 3, d: 2 }, b: 1 }));
    expect(sameContent({ a: 1, b: undefined }, { a: 1 })).toBe(true);
  });

  it('still sees real changes, including array order', () => {
    expect(sameContent({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
    expect(sameContent({ a: 1 }, { a: 2 })).toBe(false);
  });
});

// ───────────────────────── Row mapping ─────────────────────────

const T = '2026-11-23T08:00:00.000Z';
const USER = '00000000-0000-4000-8000-0000000000aa';

const goal: GoalRow = {
  id: 'g1',
  user_id: null,
  title: 'Ship it',
  deadline_utc: '2026-12-04T18:00:00.000Z',
  timezone: 'Europe/London',
  start_utc: T,
  status: 'active',
  pace_style: 'Steady',
  hours_per_day: 1.5,
  working_days: [1, 2, 3, 4, 5],
  constraints: '',
  level: 'Beginner',
  intake: {
    goal: 'Ship it',
    deadlineDate: '2026-12-04',
    deadlineTime: '18:00',
    timezone: 'Europe/London',
    level: 'Beginner',
    hoursPerDay: 1.5,
    workingDays: [1, 2, 3, 4, 5],
    constraints: '',
    pace: 'Steady',
  },
  dst_note: null,
  plan_meta: null,
  approved_at: T,
  completed_at: null,
  created_at: T,
  updated_at: T,
};

const milestone: MilestoneRow = {
  id: 'm1',
  goal_id: 'g1',
  title: 'Draft',
  description: '',
  target_date: '2026-11-30',
  estimated_hours: 4.5,
  difficulty: 'Medium',
  order: 3,
  source: 'ai',
  edited: false,
  status: 'approved',
  approved_at: T,
  completed_at: null,
  created_at: T,
  updated_at: T,
};

const wallpaper: WallpaperRow = {
  id: 'w1',
  goal_id: 'g1',
  name: 'Lock',
  design_json: { template: 'x' } as unknown as WallpaperRow['design_json'],
  device_preset: 'iphone-15',
  share_token: 'tok',
  share_secret: 'SECRET',
  share_url: 'https://example.test/w/tok',
  revoked_at: null,
  thumb: 'data:image/png;base64,AAAA',
  created_at: T,
  updated_at: T,
};

const run: AiRunRow = {
  id: 'r1',
  user_id: null,
  goal_id: 'g1',
  kind: 'plan',
  model: 'gemini',
  latency_ms: 812,
  ok: true,
  tokens: 1200,
  created_at: T,
};

describe('row mapping', () => {
  it('never uploads the share secret, the link fields or the thumbnail', () => {
    const up = toCloud.wallpapers(wallpaper);
    expect(Object.keys(up).sort()).toEqual([
      'created_at',
      'design_json',
      'device_preset',
      'goal_id',
      'id',
      'name',
      'updated_at',
    ]);
    expect(JSON.stringify(up)).not.toContain('SECRET');
  });

  it("keeps this device's secret and thumbnail when a cloud copy comes down", () => {
    const down = fromCloud.wallpapers({ ...toCloud.wallpapers(wallpaper), name: 'Renamed' }, wallpaper);
    expect(down).toEqual({ ...wallpaper, name: 'Renamed' });
    const fresh = fromCloud.wallpapers(toCloud.wallpapers(wallpaper), undefined);
    expect(fresh).toMatchObject({ share_secret: null, share_token: null, thumb: null });
  });

  it('sets the owner on goals and ai_runs', () => {
    expect(toCloud.goals(goal, USER).user_id).toBe(USER);
    expect(toCloud.ai_runs(run, USER)).toMatchObject({ user_id: USER, at: T, updated_at: T });
  });

  it('maps `order` to the `sort_order` column and back', () => {
    const up = toCloud.milestones(milestone);
    expect(up).toMatchObject({ sort_order: 3 });
    expect(up).not.toHaveProperty('order');
    expect(fromCloud.milestones(up, undefined).order).toBe(3);
  });

  it('round-trips every table without changes, so echoes of our own uploads are skipped', () => {
    const owned = { ...goal, user_id: USER };
    expect(sameContent(fromCloud.goals(toCloud.goals(owned, USER), owned), owned)).toBe(true);
    expect(sameContent(fromCloud.milestones(toCloud.milestones(milestone), milestone), milestone)).toBe(true);
    expect(sameContent(fromCloud.wallpapers(toCloud.wallpapers(wallpaper), wallpaper), wallpaper)).toBe(true);
    const ownedRun = { ...run, user_id: USER };
    expect(sameContent(fromCloud.ai_runs(toCloud.ai_runs(ownedRun, USER), ownedRun), ownedRun)).toBe(true);
  });

  it('stores Postgres timestamps in the same format Dexie uses', () => {
    const fromPg = {
      ...toCloud.milestones(milestone),
      updated_at: '2026-11-23T08:00:00+00:00',
      approved_at: '2026-11-23T08:00:00.25+00:00',
    };
    const down = fromCloud.milestones(fromPg, undefined);
    expect(down.updated_at).toBe('2026-11-23T08:00:00.000Z');
    expect(down.approved_at).toBe('2026-11-23T08:00:00.250Z');
  });
});

describe('syncMessage', () => {
  it('turns raw errors into plain sentences', () => {
    expect(syncMessage({ code: 'PGRST205', message: "Could not find the table 'public.goals'" })).toMatch(
      /run supabase\/migrations\/0001_lockstep\.sql/,
    );
    expect(syncMessage(new TypeError('Failed to fetch'))).toMatch(/connection/);
    expect(syncMessage({ code: '42501', message: 'new row violates row-level security policy' })).toMatch(
      /permission/,
    );
    expect(syncMessage({ code: 'PGRST301', message: 'JWT expired' })).toMatch(/sign in again/i);
    expect(syncMessage('???')).toMatch(/Nothing on this device was lost/);
  });
});
