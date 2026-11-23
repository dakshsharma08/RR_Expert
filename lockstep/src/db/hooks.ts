/** Reactive reads: components re-render automatically when the database changes. */
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type GoalRow } from './db';

export function useGoals() {
  return useLiveQuery(() => db.goals.orderBy('created_at').reverse().toArray(), [], undefined);
}

export function useGoal(goalId: string | undefined) {
  return useLiveQuery(
    async () => (goalId ? ((await db.goals.get(goalId)) ?? null) : null),
    [goalId],
    undefined,
  );
}

export function useGoalData(goalId: string | undefined) {
  return useLiveQuery(
    async () => {
      if (!goalId) return null;
      const goal = await db.goals.get(goalId);
      if (!goal) return null;
      const [milestones, tasks, logs] = await Promise.all([
        db.milestones.where('goal_id').equals(goalId).sortBy('order'),
        db.tasks.where('goal_id').equals(goalId).toArray(),
        db.progress_logs.where('goal_id').equals(goalId).toArray(),
      ]);
      tasks.sort((a, b) => a.order - b.order);
      return { goal, milestones, tasks, logs };
    },
    [goalId],
    undefined,
  );
}

export type GoalData = NonNullable<ReturnType<typeof useGoalData>>;

/** The goal the dashboard/studio focus on: the remembered one, else the newest active goal. */
export function useActiveGoalId(): string | null | undefined {
  return useLiveQuery(async () => {
    const remembered = (await db.kv.get('activeGoalId'))?.value as string | undefined;
    if (remembered) {
      const g = await db.goals.get(remembered);
      if (g && g.status !== 'archived') return remembered;
    }
    const goals: GoalRow[] = await db.goals.orderBy('created_at').reverse().toArray();
    const pick =
      goals.find((g) => g.status === 'active') ??
      goals.find((g) => g.status === 'completed') ??
      goals.find((g) => g.status === 'review') ??
      goals.find((g) => g.status !== 'archived');
    return pick?.id ?? null;
  }, []);
}

export function useKv<T>(key: string): T | undefined {
  return useLiveQuery(async () => (await db.kv.get(key))?.value as T | undefined, [key]);
}
