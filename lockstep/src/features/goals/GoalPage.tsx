/** One goal: live countdown, today's focus, the full plan with tasks, and goal actions. */
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import {
  CheckCircle2,
  ChevronDown,
  Circle,
  ListChecks,
  MoreHorizontal,
  Pencil,
  Smartphone,
  Timer,
  Trash2,
  Archive,
  RotateCcw,
} from 'lucide-react';
import * as DM from '@radix-ui/react-dropdown-menu';
import { useGoalData } from '@/db/hooks';
import { deleteGoal, restoreSnapshot, setActiveGoal, setGoalStatus, setMilestoneCompleted } from '@/db/repo';
import { Button, IconButton } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { CompletedBadge, EditedBadge, GeneratedStamp } from '@/components/ui/badges';
import { EmptyState, Skeleton, ProgressBar } from '@/components/ui/misc';
import { GoalHero, MotivationCard, TaskCheck, TodayFocus, useLiveMetrics, useMotivation } from './components';
import { minutesLabel, shortDate } from '@/lib/metrics';
import { cn } from '@/lib/cn';
import { CoachCard } from '@/features/coach/CoachCard';
import { revokeLivingWallpaper } from '@/features/studio/living';
import { db } from '@/db/db';
import { AchievementsCard } from './Achievements';

export default function GoalPage() {
  const { goalId } = useParams();
  const data = useGoalData(goalId);
  const m = useLiveMetrics(data);
  const motivation = useMotivation(data?.goal, m);
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  if (data === undefined)
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-10">
        <Skeleton className="h-64" />
        <Skeleton className="h-40" />
      </div>
    );
  if (data === null || !m)
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <EmptyState
          icon={<ListChecks className="size-5" strokeWidth={1.5} />}
          title="This goal doesn't exist anymore."
          action={<Button onClick={() => navigate('/goals')}>See all goals</Button>}
        />
      </div>
    );

  const { goal, milestones, tasks } = data;
  if (goal.status === 'planning' || goal.status === 'review') {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <EmptyState
          icon={<ListChecks className="size-5" strokeWidth={1.5} />}
          title="This plan isn't approved yet. Review and approve it to start the countdown."
          action={
            <Button
              onClick={() =>
                navigate(goal.status === 'planning' ? `/goals/${goal.id}/plan` : `/goals/${goal.id}/review`)
              }
            >
              Review plan
            </Button>
          }
        />
      </div>
    );
  }

  async function onDelete() {
    // Public wallpaper links must stop working too. Only this device holds their secrets.
    const live = (await db.wallpapers.where('goal_id').equals(goal.id).toArray()).filter(
      (w) => w.share_token && !w.revoked_at,
    );
    const failed = (await Promise.allSettled(live.map((w) => revokeLivingWallpaper(w)))).filter(
      (r) => r.status === 'rejected',
    ).length;
    if (failed)
      toast.error("Some wallpaper links couldn't be revoked (offline?)", {
        description: 'Revoke them later in Settings → Living Wallpaper links.',
      });
    const snap = await deleteGoal(goal.id);
    navigate('/goals');
    toast('Goal deleted', {
      description: goal.title,
      action: { label: 'Undo', onClick: () => void restoreSnapshot(snap) },
    });
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 px-4 pb-10 pt-6 sm:px-6 md:pt-10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link to="/goals" className="inline-flex min-h-11 items-center text-sm text-muted hover:text-text">
          ← All goals
        </Link>
        <div className="flex items-center gap-1">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate(`/studio/${goal.id}`)}
            icon={<Smartphone className="size-4" strokeWidth={1.5} />}
          >
            Wallpaper
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/focus/${goal.id}`)}
            icon={<Timer className="size-4" strokeWidth={1.5} />}
          >
            Focus
          </Button>
          <DM.Root>
            <DM.Trigger asChild>
              <IconButton label="More goal actions">
                <MoreHorizontal className="size-5" strokeWidth={1.5} />
              </IconButton>
            </DM.Trigger>
            <DM.Portal>
              <DM.Content
                align="end"
                sideOffset={6}
                className="z-50 min-w-52 rounded-[14px] border border-hairline bg-surface-2 p-1 shadow-xl"
              >
                <MenuItem
                  onSelect={() => navigate(`/goals/${goal.id}/review`)}
                  icon={<Pencil className="size-4" />}
                >
                  Edit plan
                </MenuItem>
                {goal.status === 'completed' ? (
                  <MenuItem
                    onSelect={() => void setGoalStatus(goal.id, 'active')}
                    icon={<RotateCcw className="size-4" />}
                  >
                    Reopen goal
                  </MenuItem>
                ) : (
                  <MenuItem
                    onSelect={() =>
                      void setGoalStatus(goal.id, 'completed').then(() => toast.success('Marked complete'))
                    }
                    icon={<CheckCircle2 className="size-4" />}
                  >
                    Mark goal complete
                  </MenuItem>
                )}
                <MenuItem
                  onSelect={() =>
                    void setGoalStatus(goal.id, 'archived').then(() => {
                      toast('Goal archived');
                      navigate('/goals');
                    })
                  }
                  icon={<Archive className="size-4" />}
                >
                  Archive
                </MenuItem>
                <DM.Separator className="my-1 h-px bg-hairline" />
                <MenuItem onSelect={() => setConfirmDelete(true)} icon={<Trash2 className="size-4" />} danger>
                  Delete goal…
                </MenuItem>
              </DM.Content>
            </DM.Portal>
          </DM.Root>
        </div>
      </div>

      <GoalHero data={data} m={m} />
      <MotivationCard line={motivation.line} source={motivation.source} />

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <TodayFocus goal={goal} m={m} />
        <CoachCard data={data} m={m} />
      </div>

      <AchievementsCard data={data} m={m} />

      <section aria-labelledby="plan-title" className="pt-4">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <p className="eyebrow mb-1">The plan</p>
            <h2 id="plan-title" className="text-xl">
              {milestones.length} milestones
            </h2>
          </div>
          {goal.plan_meta?.source === 'ai' && (
            <GeneratedStamp model={goal.plan_meta.model} at={goal.plan_meta.generatedAt} />
          )}
        </div>
        <ol className="relative space-y-3 border-l border-hairline pl-6">
          {milestones.map((ms) => {
            const t = tasks.filter((x) => x.milestone_id === ms.id);
            const done = t.filter((x) => x.done_at).length;
            const isOpen = open[ms.id] ?? ms.id === m.nextMilestone?.id;
            const overdue = ms.status !== 'completed' && ms.target_date < m.countdown.todayKey;
            return (
              <li key={ms.id} className="card relative p-4">
                <span
                  className={cn(
                    'absolute -left-[31px] top-6 size-2.5 rounded-full border',
                    ms.status === 'completed' ? 'border-success bg-success' : 'border-gold bg-bg',
                  )}
                  aria-hidden
                />
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => void setMilestoneCompleted(ms.id, ms.status !== 'completed')}
                    aria-label={
                      ms.status === 'completed'
                        ? `Mark ${ms.title} not complete`
                        : `Mark ${ms.title} complete`
                    }
                    aria-pressed={ms.status === 'completed'}
                    className="-ml-2 -mt-1 inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-muted hover:text-text"
                  >
                    {ms.status === 'completed' ? (
                      <CheckCircle2 className="size-6 text-success" strokeWidth={1.5} />
                    ) : (
                      <Circle className="size-6" strokeWidth={1.25} />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {ms.status === 'completed' && <CompletedBadge />}
                      {ms.edited && <EditedBadge />}
                      {overdue && (
                        <span className="inline-flex h-6 items-center rounded-full bg-warning/15 px-2 text-[11px] font-medium text-warning">
                          Overdue
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => setOpen((o) => ({ ...o, [ms.id]: !isOpen }))}
                      aria-expanded={isOpen}
                      className="mt-1 flex w-full items-start justify-between gap-3 text-left"
                    >
                      <span className={cn('font-medium', ms.status === 'completed' && 'text-muted')}>
                        {ms.title}
                      </span>
                      <ChevronDown
                        className={cn(
                          'mt-1 size-4 shrink-0 text-muted transition-transform',
                          isOpen && 'rotate-180',
                        )}
                        strokeWidth={1.5}
                        aria-hidden
                      />
                    </button>
                    <p className="mt-1 text-xs text-muted">
                      <span className="font-mono tabular text-accent-text">{shortDate(ms.target_date)}</span>{' '}
                      · {ms.estimated_hours} h · {done}/{t.length} tasks
                    </p>
                    {t.length > 0 && (
                      <ProgressBar
                        className="mt-3"
                        value={t.length ? done / t.length : 0}
                        label={`${ms.title} task progress`}
                      />
                    )}
                    {isOpen && (
                      <div className="mt-3">
                        {ms.description && <p className="mb-2 text-sm text-muted">{ms.description}</p>}
                        <ul className="space-y-0.5">
                          {t.map((task) => (
                            <TaskCheck key={task.id} task={task} />
                          ))}
                        </ul>
                        {t.length === 0 && (
                          <p className="text-xs text-muted">
                            No tasks. Use Edit plan to add some, or tick the milestone when it's done.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
        <p className="mt-4 text-xs text-muted">
          Total planned: {minutesLabel(tasks.reduce((s, t) => s + t.estimated_minutes, 0))} across{' '}
          {tasks.length} tasks.
        </p>
      </section>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this goal?"
        description={`"${goal.title}" and its milestones, tasks, progress and wallpapers will be deleted from this device, and any Living Wallpaper links for it will stop working. You can undo the deletion for a few seconds.`}
        confirmLabel="Delete goal"
        onConfirm={() => void onDelete()}
      />
      <SetActive id={goal.id} />
    </div>
  );
}

function SetActive({ id }: { id: string }) {
  // Opening a goal makes it the one Home and Studio focus on.
  useState(() => void setActiveGoal(id));
  return null;
}

function MenuItem({
  children,
  onSelect,
  icon,
  danger,
}: {
  children: React.ReactNode;
  onSelect: () => void;
  icon: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <DM.Item
      onSelect={onSelect}
      className={cn(
        'flex h-11 cursor-pointer items-center gap-2.5 rounded-[10px] px-3 text-sm outline-none data-[highlighted]:bg-surface',
        danger ? 'text-danger' : 'text-text',
      )}
    >
      <span aria-hidden className={danger ? 'text-danger' : 'text-muted'}>
        {icon}
      </span>
      {children}
    </DM.Item>
  );
}
