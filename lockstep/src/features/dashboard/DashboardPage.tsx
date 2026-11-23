/** Home: the active goal's countdown, today's focus, upcoming milestones, coach, and other countdowns. */
import { Link, useNavigate } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Smartphone, Target, Timer, Wand2 } from 'lucide-react';
import { useActiveGoalId, useGoalData, useGoals } from '@/db/hooks';
import { db, type GoalRow } from '@/db/db';
import { Button } from '@/components/ui/button';
import { EmptyState, ProgressRing, Skeleton } from '@/components/ui/misc';
import {
  GoalHero,
  MotivationCard,
  TodayFocus,
  UpcomingMilestones,
  useLiveMetrics,
  useMotivation,
} from '@/features/goals/components';
import { CoachCard } from '@/features/coach/CoachCard';
import { goalMetrics, stateLabel } from '@/lib/metrics';
import { useMinute } from '@/lib/ticker';
import { setActiveGoal } from '@/db/repo';

export default function DashboardPage() {
  const activeId = useActiveGoalId();
  const goals = useGoals();
  const data = useGoalData(activeId ?? undefined);
  const m = useLiveMetrics(data);
  const motivation = useMotivation(data?.goal, m);
  const navigate = useNavigate();

  if (goals === undefined || activeId === undefined)
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-10">
        <Skeleton className="h-64" />
        <Skeleton className="h-40" />
      </div>
    );

  if (goals.length === 0 || !activeId) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12 md:py-20">
        <p className="eyebrow mb-2 text-center">Welcome</p>
        <h1 className="mb-8 text-center text-[28px] sm:text-[40px]">Lock in your first deadline.</h1>
        <EmptyState
          icon={<Target className="size-5" strokeWidth={1.5} />}
          title="Tell LOCKSTEP your goal and deadline. Gemini drafts the milestones; you approve every one."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => navigate('/new')} icon={<Plus className="size-4" strokeWidth={1.75} />}>
                New goal
              </Button>
              <Button
                variant="ghost"
                onClick={() => navigate('/new')}
                icon={<Wand2 className="size-4" strokeWidth={1.5} />}
              >
                Try a sample
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  const others = goals.filter((g) => g.id !== activeId && g.status !== 'archived');

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 px-4 pb-10 pt-6 sm:px-6 md:pt-10">
      {data && m ? (
        data.goal.status === 'review' || data.goal.status === 'planning' ? (
          <div className="card p-6">
            <p className="eyebrow mb-1">Waiting for your approval</p>
            <h1 className="text-2xl">{data.goal.title}</h1>
            <p className="mt-2 text-sm text-muted">
              Review the milestones and approve the plan to start the live countdown.
            </p>
            <Button
              className="mt-4"
              onClick={() =>
                navigate(
                  data.goal.status === 'planning'
                    ? `/goals/${data.goal.id}/plan`
                    : `/goals/${data.goal.id}/review`,
                )
              }
            >
              Review plan
            </Button>
          </div>
        ) : (
          <>
            <Link
              to={`/goals/${data.goal.id}`}
              className="block rounded-[20px] focus-visible:outline-2"
              aria-label={`Open ${data.goal.title}`}
            >
              <GoalHero data={data} m={m} />
            </Link>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => navigate(`/studio/${data.goal.id}`)}
                icon={<Smartphone className="size-4" strokeWidth={1.5} />}
              >
                Make lock screen
              </Button>
              <Button
                variant="ghost"
                onClick={() => navigate(`/focus/${data.goal.id}`)}
                icon={<Timer className="size-4" strokeWidth={1.5} />}
              >
                Focus mode
              </Button>
            </div>
            <MotivationCard line={motivation.line} source={motivation.source} />
            <div className="grid gap-5 lg:grid-cols-2">
              <TodayFocus goal={data.goal} m={m} />
              <div className="space-y-5">
                <UpcomingMilestones data={data} />
                <CoachCard data={data} m={m} />
              </div>
            </div>
          </>
        )
      ) : (
        <Skeleton className="h-64" />
      )}

      {others.length > 0 && (
        <section aria-labelledby="others-title" className="pt-4">
          <h2 id="others-title" className="mb-3 text-xl">
            Other countdowns
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {others.map((g) => (
              <OtherCountdown key={g.id} goal={g} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function OtherCountdown({ goal }: { goal: GoalRow }) {
  const now = useMinute();
  const navigate = useNavigate();
  const rows = useLiveQuery(async () => {
    const [ms, ts, ls] = await Promise.all([
      db.milestones.where('goal_id').equals(goal.id).toArray(),
      db.tasks.where('goal_id').equals(goal.id).toArray(),
      db.progress_logs.where('goal_id').equals(goal.id).toArray(),
    ]);
    return { ms, ts, ls };
  }, [goal.id]);
  if (!rows)
    return (
      <li>
        <Skeleton className="h-20" />
      </li>
    );
  const m = goalMetrics(goal, rows.ms, rows.ts, rows.ls, now);
  const pending = goal.status === 'review' || goal.status === 'planning';
  return (
    <li>
      <button
        onClick={() => {
          void setActiveGoal(goal.id);
          navigate(pending ? `/goals/${goal.id}/review` : `/goals/${goal.id}`);
        }}
        className="card flex w-full items-center gap-4 p-4 text-left transition-colors hover:border-line-strong"
      >
        <ProgressRing value={m.progress} size={48} stroke={2.5} label={`${goal.title} progress`} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{goal.title}</p>
          <p className="text-xs text-muted">{pending ? 'Awaiting approval' : stateLabel(m.countdown)}</p>
        </div>
        {!pending && m.countdown.state === 'active' && (
          <p className="font-display text-3xl tabular text-text">
            {m.countdown.daysLeft}
            <span className="ml-1 font-sans text-xs text-muted">d</span>
          </p>
        )}
      </button>
    </li>
  );
}
