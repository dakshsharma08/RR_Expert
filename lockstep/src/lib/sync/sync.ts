/**
 * Optional cloud sync (Supabase). The app never needs this: Dexie on the device is
 * the source of truth. Signing in only adds "keep my devices in step".
 *
 * One sync, per table, parents first (goals → milestones → tasks → logs → wallpapers → ai_runs):
 *   1. PULL   rows the cloud changed since last time (`sync_seq` > our cursor).
 *   2. MERGE  them with rows this device changed since its last push (last write wins).
 *   3. DELETE rows that vanished on one side since the last sync (see merge.ts).
 *   4. WRITE  winners into Dexie, then UPLOAD this device's winners.
 * Cursors live in the Dexie `kv` table, so a sync only moves what changed.
 *
 * Every public function here returns a friendly result instead of throwing.
 */
import { useEffect, useState } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import {
  db,
  nowIso,
  type AiRunRow,
  type GoalRow,
  type MilestoneRow,
  type ProgressLogRow,
  type TaskRow,
  type WallpaperRow,
} from '@/db/db';
import { getKv, setKv } from '@/db/repo';
import { cloudConfigured, getSupabase } from './client';
import { mergeRows, planDeletions, sameContent, toMillis, type Versioned } from './merge';

const NOT_CONFIGURED = "Cloud sync isn't set up for this copy of LOCKSTEP. Everything stays on this device.";
const OFFLINE = "You're offline. Your data is safe on this device. Sync again when you're back online.";

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

// ───────────────────────────── Sign-in ─────────────────────────────

export type AuthResult = { ok: true } | { ok: false; message: string };

/**
 * Passwordless sign-in: Supabase emails a one-time link. Opening it returns to
 * this page, and the client finishes the sign-in from the link (detectSessionInUrl).
 */
export async function signInWithEmail(email: string): Promise<AuthResult> {
  const sb = getSupabase();
  if (!sb) return { ok: false, message: NOT_CONFIGURED };
  const address = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))
    return { ok: false, message: 'Enter a full email address, like you@example.com.' };
  if (isOffline()) return { ok: false, message: OFFLINE };
  try {
    const { error } = await sb.auth.signInWithOtp({
      email: address,
      // Come back to the page the request was made from (usually Settings).
      options: {
        emailRedirectTo: `${window.location.origin}${window.location.pathname}`,
        shouldCreateUser: true,
      },
    });
    return error ? { ok: false, message: authMessage(error) } : { ok: true };
  } catch (e) {
    return { ok: false, message: authMessage(e) };
  }
}

/** Signs out on THIS device only. Local data stays exactly where it is. */
export async function signOut(): Promise<AuthResult> {
  const sb = getSupabase();
  if (!sb) return { ok: false, message: NOT_CONFIGURED };
  try {
    const { error } = await sb.auth.signOut({ scope: 'local' });
    return error ? { ok: false, message: authMessage(error) } : { ok: true };
  } catch (e) {
    return { ok: false, message: authMessage(e) };
  }
}

/**
 * The current Supabase session, kept up to date by `onAuthStateChange`
 * (it fires once on subscribe with the stored session, then on every sign-in/out).
 * `ready` is false until that first answer arrives.
 */
export function useSession(): { session: Session | null; ready: boolean } {
  const [state, setState] = useState<{ session: Session | null; ready: boolean }>({
    session: null,
    ready: !cloudConfigured,
  });
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    const { data } = sb.auth.onAuthStateChange((_event, session) => setState({ session, ready: true }));
    return () => data.subscription.unsubscribe();
  }, []);
  return state;
}

/** Supabase auth errors → one plain sentence. */
function authMessage(e: unknown): string {
  const err = (e ?? {}) as { code?: string; status?: number; message?: string; name?: string };
  const code = err.code ?? '';
  if (err.name === 'AuthRetryableFetchError' || /fetch|network/i.test(err.message ?? ''))
    return "Couldn't reach the sign-in server. Check your connection and try again.";
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || err.status === 429)
    return 'Too many sign-in emails were requested. Wait a minute, then try again.';
  if (code === 'email_address_invalid') return 'That email address was not accepted. Check it for typos.';
  if (code === 'signup_disabled' || code === 'email_address_not_authorized')
    return "This address can't sign up here. The app's owner has turned off new sign-ups.";
  if (code === 'otp_disabled' || code === 'email_provider_disabled')
    return 'Email sign-in is turned off for this project. The developer can enable it in Supabase under Authentication → Providers.';
  return "Couldn't complete that. Please try again in a moment.";
}

// ───────────────────────────── Cloud row shapes ─────────────────────────────
// Dexie rows are already snake_case. The differences are small and all live here:
//   * `order` is a reserved SQL word, so the cloud column is `sort_order`.
//   * goals and ai_runs carry the signed-in user's id.
//   * Wallpapers keep the Living Wallpaper link fields (share_secret and friends)
//     and the thumbnail on the device; they never go up.
//   * ai_runs have no `updated_at` on the device; the call time (`created_at`) is
//     used, because a run never changes after it is logged.
//   * Nested objects (intake, plan_meta, working_days, design_json) go into jsonb as-is.

export type SyncTable = 'goals' | 'milestones' | 'tasks' | 'progress_logs' | 'wallpapers' | 'ai_runs';

export type CloudGoal = Omit<GoalRow, 'user_id' | 'deleted_at'> & { user_id: string };
export type CloudMilestone = Omit<MilestoneRow, 'order'> & { sort_order: number };
export type CloudTask = Omit<TaskRow, 'order'> & { sort_order: number };
export type CloudProgressLog = ProgressLogRow;
export type CloudWallpaper = Omit<
  WallpaperRow,
  'share_token' | 'share_secret' | 'share_url' | 'revoked_at' | 'thumb'
>;
export type CloudAiRun = Omit<AiRunRow, 'user_id' | 'created_at'> & {
  user_id: string;
  at: string;
  updated_at: string;
};

/** Postgres answers "2026-11-23T10:00:00+00:00"; Dexie stores "2026-11-23T10:00:00.000Z". Same moment, one format. */
const iso = (v: string): string => {
  const ms = Date.parse(v);
  return Number.isNaN(ms) ? v : new Date(ms).toISOString();
};
const isoOrNull = (v: string | null | undefined): string | null => (v ? iso(v) : null);

export const toCloud = {
  goals: (g: GoalRow, userId: string): CloudGoal => ({
    id: g.id,
    user_id: userId,
    title: g.title,
    deadline_utc: g.deadline_utc,
    timezone: g.timezone,
    start_utc: g.start_utc,
    status: g.status,
    pace_style: g.pace_style,
    hours_per_day: g.hours_per_day,
    working_days: g.working_days,
    constraints: g.constraints ?? '',
    level: g.level,
    intake: g.intake,
    dst_note: g.dst_note ?? null,
    plan_meta: g.plan_meta ?? null,
    approved_at: g.approved_at ?? null,
    completed_at: g.completed_at ?? null,
    created_at: g.created_at,
    updated_at: g.updated_at,
  }),
  milestones: (m: MilestoneRow): CloudMilestone => ({
    id: m.id,
    goal_id: m.goal_id,
    title: m.title,
    description: m.description ?? '',
    target_date: m.target_date,
    estimated_hours: m.estimated_hours,
    difficulty: m.difficulty,
    sort_order: m.order,
    source: m.source,
    edited: m.edited,
    status: m.status,
    approved_at: m.approved_at ?? null,
    completed_at: m.completed_at ?? null,
    created_at: m.created_at,
    updated_at: m.updated_at,
  }),
  tasks: (t: TaskRow): CloudTask => ({
    id: t.id,
    milestone_id: t.milestone_id,
    goal_id: t.goal_id,
    title: t.title,
    estimated_minutes: t.estimated_minutes,
    sort_order: t.order,
    source: t.source,
    edited: t.edited,
    done_at: t.done_at ?? null,
    created_at: t.created_at,
    updated_at: t.updated_at,
  }),
  progress_logs: (l: ProgressLogRow): CloudProgressLog => ({
    id: l.id,
    goal_id: l.goal_id,
    date: l.date,
    minutes: l.minutes,
    note: l.note ?? '',
    task_id: l.task_id ?? null,
    created_at: l.created_at,
    updated_at: l.updated_at,
  }),
  // Explicit fields: share_secret and thumb are simply never copied.
  wallpapers: (w: WallpaperRow): CloudWallpaper => ({
    id: w.id,
    goal_id: w.goal_id,
    name: w.name,
    design_json: w.design_json,
    device_preset: w.device_preset,
    created_at: w.created_at,
    updated_at: w.updated_at,
  }),
  ai_runs: (r: AiRunRow, userId: string): CloudAiRun => ({
    id: r.id,
    user_id: userId,
    goal_id: r.goal_id ?? null,
    kind: r.kind,
    model: r.model,
    latency_ms: Math.round(r.latency_ms), // integer column
    ok: r.ok,
    tokens: r.tokens === null ? null : Math.round(r.tokens),
    at: r.created_at,
    updated_at: r.created_at,
  }),
};

/** Cloud → Dexie. `existing` is the device's current copy: its device-only fields are kept. */
export const fromCloud = {
  goals: (c: CloudGoal, existing?: GoalRow): GoalRow => ({
    ...existing, // keeps any device-only extras (e.g. deleted_at)
    id: c.id,
    user_id: c.user_id,
    title: c.title,
    deadline_utc: iso(c.deadline_utc),
    timezone: c.timezone,
    start_utc: iso(c.start_utc),
    status: c.status,
    pace_style: c.pace_style,
    hours_per_day: c.hours_per_day,
    working_days: c.working_days,
    constraints: c.constraints,
    level: c.level,
    intake: c.intake,
    dst_note: c.dst_note,
    plan_meta: c.plan_meta,
    approved_at: isoOrNull(c.approved_at),
    completed_at: isoOrNull(c.completed_at),
    created_at: iso(c.created_at),
    updated_at: iso(c.updated_at),
  }),
  milestones: (c: CloudMilestone, existing?: MilestoneRow): MilestoneRow => ({
    ...existing,
    id: c.id,
    goal_id: c.goal_id,
    title: c.title,
    description: c.description,
    target_date: c.target_date,
    estimated_hours: c.estimated_hours,
    difficulty: c.difficulty,
    order: c.sort_order,
    source: c.source,
    edited: c.edited,
    status: c.status,
    approved_at: isoOrNull(c.approved_at),
    completed_at: isoOrNull(c.completed_at),
    created_at: iso(c.created_at),
    updated_at: iso(c.updated_at),
  }),
  tasks: (c: CloudTask, existing?: TaskRow): TaskRow => ({
    ...existing,
    id: c.id,
    milestone_id: c.milestone_id,
    goal_id: c.goal_id,
    title: c.title,
    estimated_minutes: c.estimated_minutes,
    order: c.sort_order,
    source: c.source,
    edited: c.edited,
    done_at: isoOrNull(c.done_at),
    created_at: iso(c.created_at),
    updated_at: iso(c.updated_at),
  }),
  progress_logs: (c: CloudProgressLog, existing?: ProgressLogRow): ProgressLogRow => ({
    ...existing,
    id: c.id,
    goal_id: c.goal_id,
    date: c.date,
    minutes: c.minutes,
    note: c.note,
    task_id: c.task_id,
    created_at: iso(c.created_at),
    updated_at: iso(c.updated_at),
  }),
  wallpapers: (c: CloudWallpaper, existing?: WallpaperRow): WallpaperRow => ({
    // A wallpaper new to this device has no link and no thumbnail yet.
    share_token: null,
    share_secret: null,
    share_url: null,
    revoked_at: null,
    thumb: null,
    ...existing,
    id: c.id,
    goal_id: c.goal_id,
    name: c.name,
    design_json: c.design_json,
    device_preset: c.device_preset,
    created_at: iso(c.created_at),
    updated_at: iso(c.updated_at),
  }),
  ai_runs: (c: CloudAiRun, existing?: AiRunRow): AiRunRow => ({
    ...existing,
    id: c.id,
    user_id: c.user_id,
    goal_id: c.goal_id,
    kind: c.kind,
    model: c.model,
    latency_ms: c.latency_ms,
    ok: c.ok,
    tokens: c.tokens,
    created_at: iso(c.at),
  }),
};

// ───────────────────────────── Sync state (Dexie kv) ─────────────────────────────

export const SYNC_KEYS = {
  /** The account this device's data is linked to: { id, email }. */
  account: 'sync:account',
  /** Per table: the highest server change number (`sync_seq`) already pulled. */
  lastPulledSeq: 'sync:lastPulledSeq',
  /** Per table: when this device last uploaded (device clock). Newer edits are "dirty". */
  lastPushedAt: 'sync:lastPushedAt',
  /** Per table: ids both sides had after the last sync (to spot deletions). */
  known: 'sync:known',
  /** When the last sync finished, for the UI. */
  lastSyncedAt: 'sync:lastSyncedAt',
} as const;

type PerTable<T> = Partial<Record<SyncTable, T>>;

export interface SyncCounts {
  /** Rows written on this device from the cloud. */
  pulled: number;
  /** Rows uploaded from this device. */
  pushed: number;
  /** Rows removed (on either side) because they were deleted elsewhere. */
  deleted: number;
}

export type SyncResult =
  | { ok: true; at: string; total: SyncCounts; tables: Record<SyncTable, SyncCounts> }
  | { ok: false; message: string };

const PAGE = 500; // below Supabase's default 1000-row response cap
const UPSERT_CHUNK = 200;
const DELETE_CHUNK = 100; // ids go in the URL, so keep it short

interface Ctx {
  sb: SupabaseClient;
  userId: string;
  startedAt: string;
  pulledSeq: PerTable<number>;
  pushedAt: PerTable<string>;
  known: PerTable<string[]>;
  /** Ids each finished table holds in the cloud, so children never point at a missing parent. */
  cloudIds: PerTable<Set<string>>;
}

/** The few Dexie table methods sync needs (any Dexie table fits this shape). */
interface LocalTable<L> {
  toArray(): Promise<L[]>;
  bulkGet(ids: string[]): Promise<(L | undefined)[]>;
  bulkPut(rows: readonly L[]): Promise<unknown>;
  bulkDelete(ids: string[]): Promise<void>;
}

interface TableSpec<L extends { id: string }, C extends Versioned> {
  name: SyncTable;
  table: LocalTable<L>;
  toCloud: (row: L, userId: string) => C;
  fromCloud: (row: C, existing: L | undefined) => L;
  /** Parent rows this row needs in the cloud first: [table, id] pairs. */
  parents?: (row: C) => Array<[SyncTable, string]>;
  /** After upload: mark local rows with the owner, without touching updated_at. */
  adopt?: (ids: string[], userId: string) => Promise<unknown>;
}

const SPECS = {
  goals: {
    name: 'goals',
    table: db.goals,
    toCloud: toCloud.goals,
    fromCloud: fromCloud.goals,
    adopt: (ids, userId) => db.goals.where('id').anyOf(ids).modify({ user_id: userId }),
  } satisfies TableSpec<GoalRow, CloudGoal>,
  milestones: {
    name: 'milestones',
    table: db.milestones,
    toCloud: toCloud.milestones,
    fromCloud: fromCloud.milestones,
    parents: (m) => [['goals', m.goal_id]],
  } satisfies TableSpec<MilestoneRow, CloudMilestone>,
  tasks: {
    name: 'tasks',
    table: db.tasks,
    toCloud: toCloud.tasks,
    fromCloud: fromCloud.tasks,
    parents: (t) => [
      ['goals', t.goal_id],
      ['milestones', t.milestone_id],
    ],
  } satisfies TableSpec<TaskRow, CloudTask>,
  progress_logs: {
    name: 'progress_logs',
    table: db.progress_logs,
    toCloud: toCloud.progress_logs,
    fromCloud: fromCloud.progress_logs,
    parents: (l) => [['goals', l.goal_id]],
  } satisfies TableSpec<ProgressLogRow, CloudProgressLog>,
  wallpapers: {
    name: 'wallpapers',
    table: db.wallpapers,
    toCloud: toCloud.wallpapers,
    fromCloud: fromCloud.wallpapers,
    parents: (w) => [['goals', w.goal_id]],
  } satisfies TableSpec<WallpaperRow, CloudWallpaper>,
  ai_runs: {
    name: 'ai_runs',
    table: db.ai_runs,
    toCloud: toCloud.ai_runs,
    fromCloud: fromCloud.ai_runs,
    adopt: (ids, userId) => db.ai_runs.where('id').anyOf(ids).modify({ user_id: userId }),
  } satisfies TableSpec<AiRunRow, CloudAiRun>,
};

let inFlight: Promise<SyncResult> | null = null;

/**
 * Sync this device with the cloud once. Safe to call repeatedly: a second call
 * while one is running just waits for the first. Never throws.
 */
export function syncNow(): Promise<SyncResult> {
  inFlight ??= runExclusive().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** Web Locks stop two open tabs from syncing at the same moment (where supported). */
async function runExclusive(): Promise<SyncResult> {
  try {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    return locks ? await locks.request('lockstep-sync', runSync) : await runSync();
  } catch (e) {
    return { ok: false, message: syncMessage(e) };
  }
}

async function runSync(): Promise<SyncResult> {
  const sb = getSupabase();
  if (!sb) return { ok: false, message: NOT_CONFIGURED };
  if (isOffline()) return { ok: false, message: OFFLINE };

  const { data, error } = await sb.auth.getSession();
  if (error) throw error;
  const user = data.session?.user;
  if (!user) return { ok: false, message: 'Sign in first, then sync.' };

  // One device, one account. Uploading data that was synced with account A into
  // account B would mix two people's goals, so we refuse and say how to fix it.
  const linked = await getKv<{ id: string; email: string | null }>(SYNC_KEYS.account);
  if (linked && linked.id !== user.id) {
    return {
      ok: false,
      message: `This device's data is linked to ${linked.email ?? 'another account'}. Sign in with that account to sync, or export your data and use "Delete all data" to start fresh with this one.`,
    };
  }
  if (!linked) await setKv(SYNC_KEYS.account, { id: user.id, email: user.email ?? null });

  const ctx: Ctx = {
    sb,
    userId: user.id,
    // Captured BEFORE reading anything: an edit made during this sync is newer than
    // this and will be uploaded next time.
    startedAt: nowIso(),
    pulledSeq: (await getKv<PerTable<number>>(SYNC_KEYS.lastPulledSeq)) ?? {},
    pushedAt: (await getKv<PerTable<string>>(SYNC_KEYS.lastPushedAt)) ?? {},
    known: (await getKv<PerTable<string[]>>(SYNC_KEYS.known)) ?? {},
    cloudIds: {},
  };

  // Parents first, so a milestone is never uploaded before its goal exists.
  const tables: Record<SyncTable, SyncCounts> = {
    goals: await syncTable(SPECS.goals, ctx),
    milestones: await syncTable(SPECS.milestones, ctx),
    tasks: await syncTable(SPECS.tasks, ctx),
    progress_logs: await syncTable(SPECS.progress_logs, ctx),
    wallpapers: await syncTable(SPECS.wallpapers, ctx),
    ai_runs: await syncTable(SPECS.ai_runs, ctx),
  };
  const total = Object.values(tables).reduce<SyncCounts>(
    (sum, c) => ({
      pulled: sum.pulled + c.pulled,
      pushed: sum.pushed + c.pushed,
      deleted: sum.deleted + c.deleted,
    }),
    { pulled: 0, pushed: 0, deleted: 0 },
  );
  const at = nowIso();
  await setKv(SYNC_KEYS.lastSyncedAt, at);
  return { ok: true, at, total, tables };
}

async function syncTable<L extends { id: string }, C extends Versioned>(
  spec: TableSpec<L, C>,
  ctx: Ctx,
): Promise<SyncCounts> {
  const counts: SyncCounts = { pulled: 0, pushed: 0, deleted: 0 };
  const { sb, userId } = ctx;
  const stamp = (row: L) => spec.toCloud(row, userId).updated_at;

  // 1. Read both sides.
  const cloudIds = await listCloudIds(sb, spec.name);
  const changed = await pullChanged<C>(sb, spec.name, ctx.pulledSeq[spec.name] ?? 0);
  const localRows = await spec.table.toArray();

  const known = new Set(ctx.known[spec.name] ?? []);
  const lastPush = ctx.pushedAt[spec.name];
  const changedIds = new Set(changed.map((r) => r.id));
  const dirtyIds = new Set(
    localRows.filter((r) => !lastPush || toMillis(stamp(r)) > toMillis(lastPush)).map((r) => r.id),
  );
  const stampAtRead = new Map(localRows.map((r) => [r.id, stamp(r)]));

  // 2. Decide. A local row takes part if it changed here, changed in the cloud,
  //    or the cloud has never had it (e.g. restored with Undo or imported).
  const candidates = localRows.filter(
    (r) => dirtyIds.has(r.id) || changedIds.has(r.id) || (!cloudIds.has(r.id) && !known.has(r.id)),
  );
  const { toLocal, toRemote } = mergeRows(
    candidates.map((r) => spec.toCloud(r, userId)),
    changed,
  );
  const { deleteLocal, deleteRemote } = planDeletions({
    known,
    localIds: localRows.map((r) => r.id),
    remoteIds: cloudIds,
    localChanged: dirtyIds,
    remoteChanged: changedIds,
  });

  // 3. Apply on this device, in one transaction.
  const deletedHere = new Set<string>();
  await db.transaction(
    'rw',
    [db.goals, db.milestones, db.tasks, db.progress_logs, db.wallpapers, db.ai_runs, db.kv],
    async () => {
      // Re-read inside the transaction so nothing can change between the check and the write.
      const currents = await spec.table.bulkGet(toLocal.map((r) => r.id));
      const writes: L[] = [];
      toLocal.forEach((remote, i) => {
        const current = currents[i];
        // Edited on this device while we were busy talking to the server? That edit is newer; keep it.
        if (current && toMillis(stamp(current)) > toMillis(remote.updated_at)) return;
        const next = spec.fromCloud(remote, current);
        if (current && sameContent(next, current)) return; // just an echo of our own upload
        writes.push(next);
      });
      await spec.table.bulkPut(writes);
      counts.pulled = writes.length;

      const doomed = await spec.table.bulkGet(deleteLocal);
      deleteLocal.forEach((id, i) => {
        const current = doomed[i];
        // Only delete if it hasn't been edited here since we looked.
        if (current && toMillis(stamp(current)) <= toMillis(stampAtRead.get(id))) deletedHere.add(id);
      });
      await deleteOnDevice(spec, [...deletedHere]);
    },
  );
  counts.deleted += deletedHere.size;

  // 4. Apply in the cloud: deletions first, then uploads.
  for (const ids of chunk(deleteRemote, DELETE_CHUNK)) {
    const { error } = await sb.from(spec.name).delete().in('id', ids);
    if (error) throw error;
  }
  counts.deleted += deleteRemote.length;

  // Skip rows whose parent is not in the cloud (it would fail the foreign key and the
  // RLS check). This only happens with inconsistent local data; nothing is deleted.
  const uploads = toRemote.filter((row) =>
    (spec.parents?.(row) ?? []).every(([table, id]) => ctx.cloudIds[table]?.has(id)),
  );
  for (const rows of chunk(uploads, UPSERT_CHUNK)) {
    const { error } = await sb.from(spec.name).upsert(rows, { onConflict: 'id' });
    if (error) throw error;
  }
  counts.pushed = uploads.length;
  if (spec.adopt && uploads.length)
    await spec.adopt(
      uploads.map((r) => r.id),
      userId,
    );

  // 5. Remember where we got to (only after this table fully succeeded).
  const inCloud = new Set([...cloudIds, ...changedIds, ...uploads.map((r) => r.id)]);
  for (const id of deleteRemote) inCloud.delete(id);
  const onDevice = new Set([...localRows.map((r) => r.id), ...toLocal.map((r) => r.id)]);
  for (const id of deletedHere) onDevice.delete(id);
  ctx.cloudIds[spec.name] = inCloud;
  ctx.known[spec.name] = [...onDevice].filter((id) => inCloud.has(id));
  ctx.pushedAt[spec.name] = ctx.startedAt;
  ctx.pulledSeq[spec.name] = changed.reduce(
    (max, r) => Math.max(max, Number(r.sync_seq) || 0),
    ctx.pulledSeq[spec.name] ?? 0,
  );
  await setKv(SYNC_KEYS.known, ctx.known);
  await setKv(SYNC_KEYS.lastPushedAt, ctx.pushedAt);
  await setKv(SYNC_KEYS.lastPulledSeq, ctx.pulledSeq);
  return counts;
}

/** Remove rows on this device. A goal takes its plan with it, like `deleteGoal` in repo.ts. */
async function deleteOnDevice<L extends { id: string }, C extends Versioned>(
  spec: TableSpec<L, C>,
  ids: string[],
): Promise<void> {
  if (!ids.length) return;
  if (spec.name === 'goals') {
    await db.tasks.where('goal_id').anyOf(ids).delete();
    await db.milestones.where('goal_id').anyOf(ids).delete();
    await db.progress_logs.where('goal_id').anyOf(ids).delete();
    await db.wallpapers.where('goal_id').anyOf(ids).delete();
    const active = await db.kv.get('activeGoalId');
    if (typeof active?.value === 'string' && ids.includes(active.value)) await db.kv.delete('activeGoalId');
  }
  if (spec.name === 'milestones') await db.tasks.where('milestone_id').anyOf(ids).delete();
  await spec.table.bulkDelete(ids);
}

/** Every id this user has in a table (RLS filters to their rows). Paged by id. */
async function listCloudIds(sb: SupabaseClient, table: SyncTable): Promise<Set<string>> {
  const ids = new Set<string>();
  let after: string | null = null;
  for (;;) {
    let query = sb.from(table).select('id');
    if (after !== null) query = query.gt('id', after);
    const { data, error } = await query.order('id', { ascending: true }).limit(PAGE);
    if (error) throw error;
    const rows = (data ?? []) as Array<{ id: string }>;
    for (const r of rows) ids.add(r.id);
    const last = rows.at(-1);
    if (rows.length < PAGE || !last) return ids;
    after = last.id;
  }
}

/** Rows changed in the cloud after change number `since`, oldest first. Paged by sync_seq. */
async function pullChanged<C>(
  sb: SupabaseClient,
  table: SyncTable,
  since: number,
): Promise<Array<C & { sync_seq: number }>> {
  const out: Array<C & { sync_seq: number }> = [];
  let cursor = since;
  for (;;) {
    const { data, error } = await sb
      .from(table)
      .select('*')
      .gt('sync_seq', cursor)
      .order('sync_seq', { ascending: true })
      .limit(PAGE);
    if (error) throw error;
    const rows = (data ?? []) as Array<C & { sync_seq: number }>;
    out.push(...rows);
    const last = rows.at(-1);
    if (rows.length < PAGE || !last) return out;
    cursor = Number(last.sync_seq);
  }
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Any sync failure → one plain sentence. Raw database errors never reach the user. */
export function syncMessage(e: unknown): string {
  const err = (e ?? {}) as { code?: string; message?: string; name?: string; status?: number };
  const code = String(err.code ?? '');
  const text = err.message ?? '';
  if (
    /failed to fetch|network|load failed|fetch failed/i.test(text) ||
    err.name === 'AuthRetryableFetchError'
  )
    return "Couldn't reach the sync server. Check your connection and try again.";
  if (['42P01', '42703', 'PGRST204', 'PGRST205'].includes(code))
    return "The cloud database isn't set up yet (or is out of date). The developer needs to run supabase/migrations/0001_lockstep.sql in Supabase.";
  if (code.startsWith('PGRST3') || err.status === 401 || /jwt/i.test(text))
    return 'Your sign-in has expired. Sign out, sign in again, then sync.';
  if (code === '42501')
    return 'The cloud refused a change for permission reasons. Sign out and back in, then try again.';
  if (code === '23503')
    return "Some items point at a goal that isn't in the cloud yet. Tap Sync now once more.";
  if (code.startsWith('22') || code.startsWith('23'))
    return "Some data on this device didn't fit the cloud format, so sync stopped. Your data on this device is safe.";
  return "Sync didn't finish. Nothing on this device was lost. Try again in a moment.";
}
