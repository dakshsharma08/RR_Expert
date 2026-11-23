/**
 * All writes to the local database go through these functions, so rules like
 * "editing an AI milestone marks it Edited by you" live in exactly one place.
 */
import {
  db,
  nowIso,
  uid,
  type GoalRow,
  type MilestoneRow,
  type PlanMeta,
  type ProgressLogRow,
  type StoredIntake,
  type TaskRow,
  type AiRunRow,
} from './db';
import type { AiRunMeta, PlanResult, RescheduleChange } from '@shared/api';
import { computeCapacity, feasibilityFor, round1, suggestFixes, type Difficulty } from '@shared/plan';
import { dayKey, localToUtcIso } from '@shared/time';

// ───────────────────────── Goals ─────────────────────────

/** Create a goal row in "planning" state right after the wizard. */
export async function createGoalDraft(intake: StoredIntake): Promise<GoalRow> {
  const conv = localToUtcIso(intake.deadlineDate, intake.deadlineTime, intake.timezone);
  const now = nowIso();
  const goal: GoalRow = {
    id: uid(),
    user_id: null,
    title: intake.goal.trim(),
    deadline_utc: conv.iso,
    timezone: intake.timezone,
    start_utc: now,
    status: 'planning',
    pace_style: intake.pace,
    hours_per_day: intake.hoursPerDay,
    working_days: [...intake.workingDays].sort(),
    constraints: intake.constraints,
    level: intake.level,
    intake,
    dst_note: conv.note ?? null,
    plan_meta: null,
    approved_at: null,
    completed_at: null,
    created_at: now,
    updated_at: now,
  };
  await db.goals.add(goal);
  return goal;
}

/** Update the goal's settings from a new intake (used by one-tap fixes before regenerating). */
export async function updateGoalIntake(goalId: string, intake: StoredIntake): Promise<void> {
  const conv = localToUtcIso(intake.deadlineDate, intake.deadlineTime, intake.timezone);
  await db.goals.update(goalId, {
    intake,
    title: intake.goal.trim(),
    deadline_utc: conv.iso,
    timezone: intake.timezone,
    pace_style: intake.pace,
    hours_per_day: intake.hoursPerDay,
    working_days: [...intake.workingDays].sort(),
    constraints: intake.constraints,
    level: intake.level,
    dst_note: conv.note ?? null,
    updated_at: nowIso(),
  });
}

/** Save a validated Gemini plan: replaces any not-yet-approved milestones. */
export async function savePlanResult(goalId: string, result: PlanResult): Promise<void> {
  const now = nowIso();
  const generatedAt = result.runs.at(-1)?.at ?? now;
  const model = result.runs.at(-1)?.model ?? null;
  const meta: PlanMeta = {
    source: 'ai',
    modelFeasibility: result.model?.feasibility ?? null,
    modelReason: result.model?.reason ?? null,
    code: result.code,
    agrees: result.agrees,
    checks: result.checks,
    capacity: result.capacity,
    fixes: result.fixes,
    risks: result.plan.risks,
    recoveryStrategy: result.plan.recoveryStrategy,
    dailyRitual: result.plan.dailyRitual,
    totalEstimatedHours: result.plan.totalEstimatedHours,
    fullScopeHours: result.plan.fullScopeHours ?? null,
    generatedAt,
    model,
    repaired: result.repaired,
  };
  await db.transaction('rw', [db.goals, db.milestones, db.tasks, db.ai_runs], async () => {
    await clearPlan(goalId);
    const milestones: MilestoneRow[] = [];
    const tasks: TaskRow[] = [];
    result.plan.milestones.forEach((m, i) => {
      const mid = uid();
      milestones.push({
        id: mid,
        goal_id: goalId,
        title: m.title,
        description: m.description,
        target_date: m.targetDate,
        estimated_hours: m.estimatedHours,
        difficulty: m.difficulty,
        order: i,
        source: 'ai',
        edited: false,
        status: 'pending',
        approved_at: null,
        completed_at: null,
        created_at: now,
        updated_at: now,
      });
      m.tasks.forEach((t, j) =>
        tasks.push({
          id: uid(),
          milestone_id: mid,
          goal_id: goalId,
          title: t.title,
          estimated_minutes: t.estimatedMinutes,
          order: j,
          source: 'ai',
          edited: false,
          done_at: null,
          created_at: now,
          updated_at: now,
        }),
      );
    });
    await db.milestones.bulkAdd(milestones);
    await db.tasks.bulkAdd(tasks);
    await db.goals.update(goalId, { plan_meta: meta, status: 'review', updated_at: now });
    await recordRuns(result.runs, goalId);
  });
}

/** Start an empty plan the user fills in by hand (used when AI is unavailable). */
export async function startManualPlan(goalId: string): Promise<void> {
  const goal = await db.goals.get(goalId);
  if (!goal) return;
  const existing = await db.milestones.where('goal_id').equals(goalId).toArray();
  const meta = recomputeMeta(
    goal,
    existing,
    goal.plan_meta,
    await db.tasks.where('goal_id').equals(goalId).toArray(),
  );
  await db.goals.update(goalId, {
    plan_meta: { ...meta, source: goal.plan_meta?.source ?? 'manual' },
    status: goal.approved_at ? 'active' : 'review',
    updated_at: nowIso(),
  });
}

async function clearPlan(goalId: string) {
  const ms = await db.milestones.where('goal_id').equals(goalId).primaryKeys();
  await db.tasks.where('goal_id').equals(goalId).delete();
  await db.milestones.bulkDelete(ms);
}

/** Recompute capacity + code feasibility after edits (dates/hours can change). */
/**
 * Recompute capacity + code feasibility after edits (dates/hours can change).
 * Once a plan is under way we judge the REMAINING work against the capacity left from
 * today (completed milestones and ticked task minutes don't count again).
 */
export function recomputeMeta(
  goal: GoalRow,
  milestones: Pick<MilestoneRow, 'id' | 'estimated_hours' | 'status'>[],
  prev: PlanMeta | null,
  tasks: Pick<TaskRow, 'milestone_id' | 'estimated_minutes' | 'done_at'>[] = [],
): PlanMeta {
  const todayKey = dayKey(Date.now(), goal.timezone);
  const ctx = {
    todayKey,
    deadlineUtc: goal.deadline_utc,
    timezone: goal.timezone,
    hoursPerDay: goal.hours_per_day,
    workingDays: goal.working_days,
  };
  const capacity = computeCapacity(ctx);
  const total = round1(milestones.reduce((s, m) => s + m.estimated_hours, 0));
  const remaining = round1(
    milestones.reduce((s, m) => {
      if (m.status === 'completed') return s;
      const ts = tasks.filter((t) => t.milestone_id === m.id);
      const all = ts.reduce((a, t) => a + t.estimated_minutes, 0);
      const done = ts.filter((t) => t.done_at).reduce((a, t) => a + t.estimated_minutes, 0);
      return s + m.estimated_hours * (all > 0 ? 1 - done / all : 1);
    }, 0),
  );
  const started = remaining < total - 0.05;
  const code = started
    ? feasibilityFor(remaining, null, capacity, 'Remaining work')
    : feasibilityFor(total, prev?.fullScopeHours, capacity);
  const scope = started ? remaining : Math.max(total, prev?.fullScopeHours ?? 0);
  return {
    source: prev?.source ?? 'manual',
    modelFeasibility: prev?.modelFeasibility ?? null,
    modelReason: prev?.modelReason ?? null,
    code,
    agrees: prev?.modelFeasibility ? prev.modelFeasibility === code.feasibility : true,
    checks: prev?.checks ?? [],
    capacity,
    // Fixes always reflect today's numbers, never stale ones from plan generation.
    fixes: scope > 0 ? suggestFixes(scope, ctx) : null,
    risks: prev?.risks ?? [],
    recoveryStrategy: prev?.recoveryStrategy ?? '',
    dailyRitual: prev?.dailyRitual ?? '',
    totalEstimatedHours: total,
    fullScopeHours: prev?.fullScopeHours ?? null,
    generatedAt: prev?.generatedAt ?? null,
    model: prev?.model ?? null,
    repaired: prev?.repaired ?? false,
  };
}

export async function refreshGoalMeta(goalId: string): Promise<void> {
  const goal = await db.goals.get(goalId);
  if (!goal) return;
  const [ms, ts] = await Promise.all([
    db.milestones.where('goal_id').equals(goalId).toArray(),
    db.tasks.where('goal_id').equals(goalId).toArray(),
  ]);
  await db.goals.update(goalId, {
    plan_meta: recomputeMeta(goal, ms, goal.plan_meta, ts),
    updated_at: nowIso(),
  });
}

export async function approvePlan(goalId: string): Promise<void> {
  const now = nowIso();
  await db.transaction('rw', [db.goals, db.milestones], async () => {
    const ms = await db.milestones.where('goal_id').equals(goalId).toArray();
    await Promise.all(
      ms.map((m) =>
        db.milestones.update(m.id, {
          status: m.status === 'completed' ? 'completed' : 'approved',
          approved_at: m.approved_at ?? now,
          updated_at: now,
        }),
      ),
    );
    const goal = await db.goals.get(goalId);
    await db.goals.update(goalId, {
      status: 'active',
      approved_at: goal?.approved_at ?? now,
      updated_at: now,
    });
  });
  await setActiveGoal(goalId);
}

export async function setGoalStatus(goalId: string, status: GoalRow['status']): Promise<void> {
  await db.goals.update(goalId, {
    status,
    completed_at: status === 'completed' ? nowIso() : null,
    updated_at: nowIso(),
  });
}

export async function renameGoal(goalId: string, title: string): Promise<void> {
  await db.goals.update(goalId, { title: title.trim().slice(0, 300), updated_at: nowIso() });
}

/** Delete a goal and everything that belongs to it. Returns a snapshot for Undo. */
export async function deleteGoal(goalId: string): Promise<Snapshot> {
  const snap = await snapshotGoal(goalId);
  await db.transaction(
    'rw',
    [db.goals, db.milestones, db.tasks, db.progress_logs, db.wallpapers],
    async () => {
      await db.tasks.where('goal_id').equals(goalId).delete();
      await db.milestones.where('goal_id').equals(goalId).delete();
      await db.progress_logs.where('goal_id').equals(goalId).delete();
      // Keep wallpaper rows whose link is still live (revoke failed): Settings can retry with their secret.
      const wps = await db.wallpapers.where('goal_id').equals(goalId).toArray();
      await db.wallpapers.bulkDelete(
        wps.filter((w) => !w.share_token || w.revoked_at || !w.share_secret).map((w) => w.id),
      );
      await db.goals.delete(goalId);
    },
  );
  const active = await getKv<string>('activeGoalId');
  if (active === goalId) await db.kv.delete('activeGoalId');
  return snap;
}

export interface Snapshot {
  goals: GoalRow[];
  milestones: MilestoneRow[];
  tasks: TaskRow[];
  progress_logs: ProgressLogRow[];
  wallpapers: import('./db').WallpaperRow[];
}

async function snapshotGoal(goalId: string): Promise<Snapshot> {
  return {
    goals: await db.goals.where('id').equals(goalId).toArray(),
    milestones: await db.milestones.where('goal_id').equals(goalId).toArray(),
    tasks: await db.tasks.where('goal_id').equals(goalId).toArray(),
    progress_logs: await db.progress_logs.where('goal_id').equals(goalId).toArray(),
    wallpapers: await db.wallpapers.where('goal_id').equals(goalId).toArray(),
  };
}

export async function restoreSnapshot(s: Snapshot): Promise<void> {
  await db.transaction(
    'rw',
    [db.goals, db.milestones, db.tasks, db.progress_logs, db.wallpapers],
    async () => {
      await db.goals.bulkPut(s.goals);
      await db.milestones.bulkPut(s.milestones);
      await db.tasks.bulkPut(s.tasks);
      await db.progress_logs.bulkPut(s.progress_logs);
      await db.wallpapers.bulkPut(s.wallpapers);
    },
  );
}

// ───────────────────────── Milestones ─────────────────────────

export type MilestonePatch = Partial<
  Pick<MilestoneRow, 'title' | 'description' | 'target_date' | 'estimated_hours' | 'difficulty'>
>;

export async function updateMilestone(id: string, patch: MilestonePatch): Promise<void> {
  const m = await db.milestones.get(id);
  if (!m) return;
  await db.milestones.update(id, { ...patch, edited: true, updated_at: nowIso() });
  if (patch.estimated_hours !== undefined || patch.target_date !== undefined)
    await refreshGoalMeta(m.goal_id);
}

export async function addMilestone(
  goalId: string,
  data: {
    title: string;
    target_date: string;
    estimated_hours: number;
    description?: string;
    difficulty?: Difficulty;
  },
): Promise<string> {
  const now = nowIso();
  const count = await db.milestones.where('goal_id').equals(goalId).count();
  const goal = await db.goals.get(goalId);
  const id = uid();
  await db.milestones.add({
    id,
    goal_id: goalId,
    title: data.title.trim(),
    description: data.description?.trim() ?? '',
    target_date: data.target_date,
    estimated_hours: data.estimated_hours,
    difficulty: data.difficulty ?? 'Medium',
    order: count,
    source: 'user',
    edited: false,
    status: goal?.status === 'active' ? 'approved' : 'pending',
    approved_at: goal?.status === 'active' || goal?.status === 'completed' ? now : null,
    completed_at: null,
    created_at: now,
    updated_at: now,
  });
  await refreshGoalMeta(goalId);
  await syncGoalCompletion(goalId); // a new open milestone re-opens a completed goal
  return id;
}

export async function deleteMilestone(
  id: string,
): Promise<{ milestone: MilestoneRow; tasks: TaskRow[] } | null> {
  const m = await db.milestones.get(id);
  if (!m) return null;
  const tasks = await db.tasks.where('milestone_id').equals(id).toArray();
  await db.transaction('rw', [db.milestones, db.tasks], async () => {
    await db.tasks.where('milestone_id').equals(id).delete();
    await db.milestones.delete(id);
  });
  await normalizeOrder(m.goal_id);
  await refreshGoalMeta(m.goal_id);
  await syncGoalCompletion(m.goal_id); // deleting the last open milestone completes the goal
  return { milestone: m, tasks };
}

export async function restoreMilestone(data: { milestone: MilestoneRow; tasks: TaskRow[] }): Promise<void> {
  await db.transaction('rw', [db.milestones, db.tasks], async () => {
    const ms = await db.milestones.where('goal_id').equals(data.milestone.goal_id).sortBy('order');
    // Re-insert at its old position.
    for (const m of ms)
      if (m.order >= data.milestone.order) await db.milestones.update(m.id, { order: m.order + 1 });
    await db.milestones.put(data.milestone);
    await db.tasks.bulkPut(data.tasks);
  });
  await normalizeOrder(data.milestone.goal_id);
  await refreshGoalMeta(data.milestone.goal_id);
  await syncGoalCompletion(data.milestone.goal_id);
}

async function normalizeOrder(goalId: string) {
  const ms = await db.milestones.where('goal_id').equals(goalId).sortBy('order');
  await Promise.all(ms.map((m, i) => (m.order === i ? null : db.milestones.update(m.id, { order: i }))));
}

export async function reorderMilestones(goalId: string, orderedIds: string[]): Promise<void> {
  const now = nowIso();
  await db.transaction('rw', db.milestones, async () => {
    await Promise.all(orderedIds.map((id, i) => db.milestones.update(id, { order: i, updated_at: now })));
  });
  void goalId;
}

export async function setMilestoneCompleted(id: string, completed: boolean): Promise<void> {
  const m = await db.milestones.get(id);
  if (!m) return;
  const now = nowIso();
  await db.milestones.update(id, {
    status: completed ? 'completed' : m.approved_at ? 'approved' : 'pending',
    completed_at: completed ? now : null,
    updated_at: now,
  });
  await syncGoalCompletion(m.goal_id);
}

// ───────────────────────── Tasks ─────────────────────────

export async function addTask(milestoneId: string, title: string, minutes: number): Promise<void> {
  const m = await db.milestones.get(milestoneId);
  if (!m) return;
  const count = await db.tasks.where('milestone_id').equals(milestoneId).count();
  const now = nowIso();
  await db.tasks.add({
    id: uid(),
    milestone_id: milestoneId,
    goal_id: m.goal_id,
    title: title.trim(),
    estimated_minutes: minutes,
    order: count,
    source: 'user',
    edited: false,
    done_at: null,
    created_at: now,
    updated_at: now,
  });
  if (m.status === 'completed') await setMilestoneCompleted(milestoneId, false);
}

export async function updateTask(
  id: string,
  patch: Partial<Pick<TaskRow, 'title' | 'estimated_minutes'>>,
): Promise<void> {
  await db.tasks.update(id, { ...patch, edited: true, updated_at: nowIso() });
}

export interface DeletedTask {
  task: TaskRow;
  logs: ProgressLogRow[];
}

/** Delete a task (and the minutes it logged). Returns what Undo needs to put back. */
export async function deleteTask(id: string): Promise<DeletedTask | null> {
  const t = await db.tasks.get(id);
  if (!t) return null;
  const logs = await db.progress_logs.where('task_id').equals(id).toArray();
  await db.transaction('rw', [db.tasks, db.progress_logs], async () => {
    await db.tasks.delete(id);
    await db.progress_logs.where('task_id').equals(id).delete();
  });
  await syncMilestoneFromTasks(t.milestone_id);
  return { task: t, logs };
}

export async function restoreTask(d: DeletedTask): Promise<void> {
  await db.transaction('rw', [db.tasks, db.progress_logs], async () => {
    await db.tasks.put(d.task);
    if (d.logs.length) await db.progress_logs.bulkPut(d.logs);
  });
  await syncMilestoneFromTasks(d.task.milestone_id);
}

/** After tasks are added/removed: all remaining tasks done → milestone complete. */
async function syncMilestoneFromTasks(milestoneId: string): Promise<void> {
  const m = await db.milestones.get(milestoneId);
  if (!m) return;
  const ts = await db.tasks.where('milestone_id').equals(milestoneId).toArray();
  const now = nowIso();
  if (ts.length > 0 && ts.every((t) => t.done_at) && m.status !== 'completed') {
    await db.milestones.update(m.id, { status: 'completed', completed_at: now, updated_at: now });
  }
  await syncGoalCompletion(m.goal_id);
  await refreshGoalMeta(m.goal_id);
}

/**
 * Tick a task on/off. Completing a task also logs its estimated minutes for today
 * (that feeds Insights), and completes the milestone when all its tasks are done.
 */
export async function toggleTask(
  id: string,
  done: boolean,
): Promise<{ milestoneCompleted: boolean; goalCompleted: boolean }> {
  const t = await db.tasks.get(id);
  if (!t) return { milestoneCompleted: false, goalCompleted: false };
  const goal = await db.goals.get(t.goal_id);
  if (!goal) return { milestoneCompleted: false, goalCompleted: false };
  const now = nowIso();
  let milestoneCompleted = false;
  await db.transaction('rw', [db.tasks, db.progress_logs, db.milestones], async () => {
    await db.tasks.update(id, { done_at: done ? now : null, updated_at: now });
    await db.progress_logs.where('task_id').equals(id).delete();
    if (done) {
      await db.progress_logs.add({
        id: uid(),
        goal_id: t.goal_id,
        date: dayKey(Date.now(), goal.timezone),
        minutes: t.estimated_minutes,
        note: t.title,
        task_id: id,
        created_at: now,
        updated_at: now,
      });
    }
    const siblings = await db.tasks.where('milestone_id').equals(t.milestone_id).toArray();
    const allDone = siblings.every((s) => (s.id === id ? done : !!s.done_at));
    const m = await db.milestones.get(t.milestone_id);
    if (m) {
      if (allDone && m.status !== 'completed') {
        await db.milestones.update(m.id, { status: 'completed', completed_at: now, updated_at: now });
        milestoneCompleted = true;
      } else if (!done && !allDone && m.status === 'completed') {
        // Un-ticking a task re-opens its milestone. Ticking never re-opens one you completed by hand.
        await db.milestones.update(m.id, {
          status: m.approved_at ? 'approved' : 'pending',
          completed_at: null,
          updated_at: now,
        });
      }
    }
  });
  const goalCompleted = await syncGoalCompletion(t.goal_id);
  return { milestoneCompleted, goalCompleted };
}

async function syncGoalCompletion(goalId: string): Promise<boolean> {
  const goal = await db.goals.get(goalId);
  if (!goal || (goal.status !== 'active' && goal.status !== 'completed')) return false;
  const ms = await db.milestones.where('goal_id').equals(goalId).toArray();
  const all = ms.length > 0 && ms.every((m) => m.status === 'completed');
  if (all && goal.status !== 'completed') {
    await db.goals.update(goalId, { status: 'completed', completed_at: nowIso(), updated_at: nowIso() });
    return true;
  }
  if (!all && goal.status === 'completed') {
    await db.goals.update(goalId, { status: 'active', completed_at: null, updated_at: nowIso() });
  }
  return false;
}

// ───────────────────────── Progress ─────────────────────────

export async function logMinutes(
  goalId: string,
  minutes: number,
  note: string,
  date?: string,
): Promise<void> {
  const goal = await db.goals.get(goalId);
  if (!goal) return;
  const now = nowIso();
  await db.progress_logs.add({
    id: uid(),
    goal_id: goalId,
    date: date ?? dayKey(Date.now(), goal.timezone),
    minutes: Math.max(1, Math.round(minutes)),
    note: note.trim().slice(0, 300),
    task_id: null,
    created_at: now,
    updated_at: now,
  });
}

export async function deleteLog(id: string): Promise<void> {
  await db.progress_logs.delete(id);
}

// ───────────────────────── Coach proposals ─────────────────────────

export async function applyReschedule(goalId: string, changes: RescheduleChange[]): Promise<void> {
  const now = nowIso();
  await db.transaction('rw', db.milestones, async () => {
    for (const c of changes) {
      const m = await db.milestones.get(c.milestoneId);
      if (!m || m.goal_id !== goalId) continue;
      await db.milestones.update(c.milestoneId, {
        target_date: c.newDate,
        estimated_hours: c.newHours,
        edited: true,
        updated_at: now,
      });
    }
    // keep timeline order chronological after a replan
    const ms = await db.milestones.where('goal_id').equals(goalId).toArray();
    ms.sort((a, b) =>
      a.target_date === b.target_date ? a.order - b.order : a.target_date < b.target_date ? -1 : 1,
    );
    await Promise.all(ms.map((m, i) => db.milestones.update(m.id, { order: i })));
  });
  await refreshGoalMeta(goalId);
}

// ───────────────────────── AI runs + KV ─────────────────────────

export async function recordRuns(runs: AiRunMeta[], goalId: string | null = null): Promise<void> {
  if (!runs.length) return;
  const rows: AiRunRow[] = runs.map((r) => ({
    id: uid(),
    user_id: null,
    goal_id: goalId,
    kind: r.kind,
    model: r.model,
    latency_ms: r.latencyMs,
    ok: r.ok,
    tokens: r.tokens,
    created_at: r.at,
  }));
  await db.ai_runs.bulkAdd(rows);
}

export async function getKv<T>(key: string): Promise<T | undefined> {
  return (await db.kv.get(key))?.value as T | undefined;
}

export async function setKv(key: string, value: unknown): Promise<void> {
  await db.kv.put({ key, value, updated_at: nowIso() });
}

export async function setActiveGoal(goalId: string): Promise<void> {
  await setKv('activeGoalId', goalId);
}

// ───────────────────────── Import / export / wipe ─────────────────────────

export const EXPORT_VERSION = 1;

export async function exportAll() {
  return {
    app: 'lockstep',
    version: EXPORT_VERSION,
    exported_at: nowIso(),
    goals: await db.goals.toArray(),
    milestones: await db.milestones.toArray(),
    tasks: await db.tasks.toArray(),
    progress_logs: await db.progress_logs.toArray(),
    wallpapers: (await db.wallpapers.toArray()).map((w) => ({ ...w, share_secret: null })),
    ai_runs: await db.ai_runs.toArray(),
  };
}

export async function importAll(data: unknown): Promise<{ goals: number }> {
  const d = data as Awaited<ReturnType<typeof exportAll>>;
  if (!d || d.app !== 'lockstep' || !Array.isArray(d.goals))
    throw new Error('This file is not a LOCKSTEP export.');
  await db.transaction(
    'rw',
    [db.goals, db.milestones, db.tasks, db.progress_logs, db.wallpapers, db.ai_runs],
    async () => {
      await db.goals.bulkPut(d.goals);
      await db.milestones.bulkPut(d.milestones ?? []);
      await db.tasks.bulkPut(d.tasks ?? []);
      await db.progress_logs.bulkPut(d.progress_logs ?? []);
      await db.wallpapers.bulkPut(d.wallpapers ?? []);
      await db.ai_runs.bulkPut(d.ai_runs ?? []);
    },
  );
  return { goals: d.goals.length };
}

export async function deleteAllData(): Promise<void> {
  await db.transaction(
    'rw',
    [db.goals, db.milestones, db.tasks, db.progress_logs, db.wallpapers, db.ai_runs, db.images, db.kv],
    async () => {
      await Promise.all([
        db.goals.clear(),
        db.milestones.clear(),
        db.tasks.clear(),
        db.progress_logs.clear(),
        db.wallpapers.clear(),
        db.ai_runs.clear(),
        db.images.clear(),
        db.kv.clear(),
      ]);
    },
  );
  try {
    localStorage.clear();
  } catch {
    /* storage may be blocked */
  }
}
