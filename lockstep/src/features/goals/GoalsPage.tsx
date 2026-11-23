/** All goals, grouped by status. */
import { useNavigate } from 'react-router';
import { Plus, Target } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useGoals } from '@/db/hooks';
import { db, type GoalRow } from '@/db/db';
import { Button } from '@/components/ui/button';
import { EmptyState, ProgressRing, Skeleton } from '@/components/ui/misc';
import { goalMetrics, stateLabel } from '@/lib/metrics';
import { useMinute } from '@/lib/ticker';
import { setActiveGoal } from '@/db/repo';
import { formatInZone } from '@shared/time';

const GROUPS: { title: string; statuses: GoalRow['status'][] }[] = [
  { title: 'Active', statuses: ['active'] },
  { title: 'Needs review', statuses: ['review', 'planning'] },
  { title: 'Completed', statuses: ['completed'] },
  { title: 'Archived', statuses: ['archived'] },
];

export default function GoalsPage() {
  const goals = useGoals();
  const navigate = useNavigate();
  if (goals === undefined)
    return (
      <div className="mx-auto max-w-4xl space-y-3 px-4 py-10">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
    );
  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-10 pt-6 sm:px-6 md:pt-10">
      <div className="mb-6 flex items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-1">Your countdowns</p>
          <h1 className="text-[28px] sm:text-[40px]">Goals</h1>
        </div>
        <Button onClick={() => navigate('/new')} icon={<Plus className="size-4" strokeWidth={1.75} />}>
          New goal
        </Button>
      </div>
      {goals.length === 0 ? (
        <EmptyState
          icon={<Target className="size-5" strokeWidth={1.5} />}
          title="No goals yet. Start with one deadline that matters."
          action={<Button onClick={() => navigate('/new')}>New goal</Button>}
        />
      ) : (
        <div className="space-y-8">
          {GROUPS.map((grp) => {
            const list = goals.filter((g) => grp.statuses.includes(g.status));
            if (!list.length) return null;
            return (
              <section key={grp.title} aria-label={grp.title}>
                <h2 className="eyebrow mb-3">
                  {grp.title} · {list.length}
                </h2>
                <ul className="space-y-3">
                  {list.map((g) => (
                    <GoalRowItem key={g.id} goal={g} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function GoalRowItem({ goal }: { goal: GoalRow }) {
  const now = useMinute();
  const navigate = useNavigate();
  const rows = useLiveQuery(
    async () => ({
      ms: await db.milestones.where('goal_id').equals(goal.id).toArray(),
      ts: await db.tasks.where('goal_id').equals(goal.id).toArray(),
      ls: await db.progress_logs.where('goal_id').equals(goal.id).toArray(),
    }),
    [goal.id],
  );
  const m = rows ? goalMetrics(goal, rows.ms, rows.ts, rows.ls, now) : null;
  const pending = goal.status === 'review' || goal.status === 'planning';
  return (
    <li>
      <button
        onClick={() => {
          void setActiveGoal(goal.id);
          navigate(
            goal.status === 'planning'
              ? `/goals/${goal.id}/plan`
              : pending
                ? `/goals/${goal.id}/review`
                : `/goals/${goal.id}`,
          );
        }}
        className="card flex w-full items-center gap-4 p-4 text-left transition-colors hover:border-line-strong"
      >
        <ProgressRing value={m?.progress ?? 0} size={52} stroke={2.5} label={`${goal.title} progress`}>
          <span className="font-mono text-[11px] tabular text-muted">
            {Math.round((m?.progress ?? 0) * 100)}%
          </span>
        </ProgressRing>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{goal.title}</p>
          <p className="text-xs text-muted">
            Due{' '}
            {formatInZone(goal.deadline_utc, goal.timezone, {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}{' '}
            · {m ? (pending ? 'Awaiting approval' : stateLabel(m.countdown)) : '…'}
          </p>
        </div>
        {m && !pending && m.countdown.state === 'active' && (
          <p className="font-display text-3xl tabular">
            {m.countdown.daysLeft}
            <span className="ml-1 font-sans text-xs text-muted">days</span>
          </p>
        )}
      </button>
    </li>
  );
}
