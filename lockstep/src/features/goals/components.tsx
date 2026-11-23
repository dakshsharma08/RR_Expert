/** Building blocks shared by the Dashboard, Goal page and Focus Mode. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Check, Flame, Gauge, Plus, Quote, Sparkles } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { GoalData } from '@/db/hooks';
import { type GoalMetrics, goalMetrics, minutesLabel, paceLabel, shortDate, stateLabel } from '@/lib/metrics';
import { useMinute, useNow } from '@/lib/ticker';
import { cn } from '@/lib/cn';
import { toggleTask, logMinutes, getKv, setKv, recordRuns } from '@/db/repo';
import type { TaskRow, GoalRow } from '@/db/db';
import { ProgressRing } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/form';
import { getHealth, getMotivation } from '@/lib/api';
import { formatInZone, type Countdown, type TimeParts } from '@shared/time';

/** Live metrics (re-computed every second via the shared ticker). */
export function useLiveMetrics(data: GoalData | null | undefined): GoalMetrics | null {
  const now = useNow();
  return useMemo(
    () => (data ? goalMetrics(data.goal, data.milestones, data.tasks, data.logs, now) : null),
    [data, now],
  );
}

/** Minute-resolution metrics for things that don't need seconds. */
export function useMinuteMetrics(data: GoalData | null | undefined): GoalMetrics | null {
  const now = useMinute();
  return useMemo(
    () => (data ? goalMetrics(data.goal, data.milestones, data.tasks, data.logs, now) : null),
    [data, now],
  );
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Big serif countdown. Seconds tick visually, but the accessible text only changes
 * once a minute so screen readers aren't flooded.
 */
export function CountdownDigits({
  c,
  size = 'lg',
  showSeconds = true,
}: {
  c: Countdown;
  size?: 'md' | 'lg' | 'xl';
  showSeconds?: boolean;
}) {
  const p: TimeParts = c.parts;
  const units: [string, string][] = [
    [String(p.days), p.days === 1 ? 'day' : 'days'],
    [pad(p.hours), 'hrs'],
    [pad(p.minutes), 'min'],
  ];
  if (showSeconds) units.push([pad(p.seconds), 'sec']);
  const num =
    size === 'xl'
      ? 'text-[clamp(56px,13vw,160px)]'
      : size === 'lg'
        ? 'text-[clamp(44px,9vw,96px)]'
        : 'text-[40px]';
  const srText =
    c.state === 'expired'
      ? 'Deadline passed'
      : c.state === 'completed'
        ? 'Goal completed'
        : `${p.days} days, ${p.hours} hours and ${p.minutes} minutes left`;
  if (c.state === 'expired' || c.state === 'completed') {
    return (
      <p className={cn('font-display leading-none text-text', num)}>
        {c.state === 'completed' ? 'Completed' : 'Time’s up'}
      </p>
    );
  }
  return (
    <div>
      <p className="sr-only" aria-live="polite" aria-atomic>
        {srText}
      </p>
      <div className="flex items-start gap-[0.32em]" aria-hidden style={{ fontSize: 'inherit' }}>
        {units.map(([v, label], i) => (
          <div key={label} className="flex items-start">
            {i > 0 && (
              <span
                className={cn('mr-[0.14em] font-display font-light leading-[0.9] text-gold-deep/80', num)}
              >
                :
              </span>
            )}
            <div className="flex flex-col items-center">
              <span
                className={cn('font-display font-light leading-[0.9] tabular text-text', num)}
                style={{ fontVariationSettings: '"opsz" 144' }}
              >
                {v}
              </span>
              <span className="mt-2 text-[11px] uppercase tracking-[0.18em] text-muted">{label}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function StatPill({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  tone?: 'good' | 'warn' | 'bad';
}) {
  return (
    <div className="flex min-h-11 items-center gap-2 rounded-full border border-hairline px-3 py-1.5 text-sm">
      <span
        className={cn(
          'text-accent-text',
          tone === 'good' && 'text-success',
          tone === 'warn' && 'text-warning',
          tone === 'bad' && 'text-danger',
        )}
        aria-hidden
      >
        {icon}
      </span>
      <span className="text-muted">{label}</span>
      <span className="tabular font-medium text-text">{value}</span>
    </div>
  );
}

export function GoalHero({ data, m, compact }: { data: GoalData; m: GoalMetrics; compact?: boolean }) {
  const { goal } = data;
  const c = m.countdown;
  return (
    <section className="card relative overflow-hidden p-5 sm:p-8" aria-labelledby={`hero-${goal.id}`}>
      <div
        className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full border border-hairline"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-10 -top-10 size-44 rounded-full border border-hairline"
        aria-hidden
      />
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="eyebrow mb-2">
            {stateLabel(c)} · Day {Math.max(1, c.dayNumber)} of {c.totalDays}
          </p>
          <h1
            id={`hero-${goal.id}`}
            className={cn(
              'mb-5 leading-tight',
              compact ? 'text-xl sm:text-2xl' : 'text-[28px] sm:text-[40px]',
            )}
          >
            {goal.title}
          </h1>
          <CountdownDigits c={c} size={compact ? 'md' : 'lg'} />
          <p className="mt-4 text-sm text-muted">
            Due {formatInZone(goal.deadline_utc, goal.timezone)} · {goal.timezone}
          </p>
        </div>
        <div className="flex items-center gap-5">
          <ProgressRing value={m.progress} size={compact ? 88 : 120} stroke={3} label="Work done">
            <div className="text-center">
              <p className="font-mono text-2xl tabular text-text">{Math.round(m.progress * 100)}%</p>
              <p className="text-[11px] uppercase tracking-[0.14em] text-muted">done</p>
            </div>
          </ProgressRing>
        </div>
      </div>
      <div className="relative mt-6 flex flex-wrap gap-2">
        <StatPill
          icon={<Gauge className="size-4" strokeWidth={1.5} />}
          label={paceLabel(m.pace)}
          value={`${Math.round(c.timePct * 100)}% of time used`}
          tone={m.pace === 'behind' ? 'warn' : m.pace === 'ahead' ? 'good' : undefined}
        />
        <StatPill
          icon={<Flame className="size-4" strokeWidth={1.5} />}
          label="Streak"
          value={`${m.streak} day${m.streak === 1 ? '' : 's'}`}
        />
        <StatPill
          icon={<Check className="size-4" strokeWidth={1.5} />}
          label="Milestones"
          value={`${m.milestonesDone}/${m.milestonesTotal}`}
        />
      </div>
    </section>
  );
}

/** Today's focus: tick tasks off; progress, insights and the wallpaper update from these. */
export function TodayFocus({ goal, m }: { goal: GoalRow; m: GoalMetrics }) {
  const [logOpen, setLogOpen] = useState(false);
  const allDone = m.todayFocus.length > 0 && m.todayFocus.every((t) => t.done_at);
  return (
    <section className="card p-5 sm:p-6" aria-labelledby="focus-title">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-1">Today's focus · {goal.hours_per_day} h</p>
          <h2 id="focus-title" className="text-xl">
            {allDone ? 'Done for today' : m.nextMilestone ? m.nextMilestone.title : 'All milestones done'}
          </h2>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLogOpen(true)}
          icon={<Plus className="size-4" strokeWidth={1.5} />}
        >
          Log time
        </Button>
      </div>
      {m.todayFocus.length === 0 ? (
        <p className="text-sm text-muted">
          No open tasks. Add tasks to your milestones, or log time directly.
        </p>
      ) : (
        <ul className="space-y-1">
          {m.todayFocus.map((t) => (
            <TaskCheck key={t.id} task={t} />
          ))}
        </ul>
      )}
      {m.todayMinutesLogged > 0 && (
        <p className="mt-4 text-xs text-muted">Logged today: {minutesLabel(m.todayMinutesLogged)}</p>
      )}
      <LogTimeDialog open={logOpen} onOpenChange={setLogOpen} goalId={goal.id} />
    </section>
  );
}

export function TaskCheck({ task }: { task: TaskRow }) {
  const done = !!task.done_at;
  const onToggle = async () => {
    const r = await toggleTask(task.id, !done);
    if (r.goalCompleted)
      toast.success('Goal complete. Every milestone is done.', {
        description: 'Refresh your wallpaper to celebrate.',
      });
    else if (r.milestoneCompleted)
      toast.success('Milestone complete', { description: 'Your progress and wallpaper data just updated.' });
  };
  return (
    <li>
      <label className="group flex min-h-12 cursor-pointer items-center gap-3 rounded-[12px] px-2 py-2 hover:bg-surface-2/60">
        <input type="checkbox" checked={done} onChange={() => void onToggle()} className="peer sr-only" />
        <span
          className={cn(
            'flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors duration-200 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus)]',
            done
              ? 'border-gold bg-gold text-obsidian'
              : 'border-line-strong text-transparent group-hover:border-gold',
          )}
          aria-hidden
        >
          <motion.span initial={false} animate={{ scale: done ? 1 : 0.4, opacity: done ? 1 : 0 }}>
            <Check className="size-3.5" strokeWidth={3} />
          </motion.span>
        </span>
        <span
          className={cn('flex-1 text-sm transition-colors', done ? 'text-muted line-through' : 'text-text')}
        >
          {task.title}
        </span>
        <span className="font-mono text-xs tabular text-muted">{minutesLabel(task.estimated_minutes)}</span>
      </label>
    </li>
  );
}

export function LogTimeDialog({
  open,
  onOpenChange,
  goalId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  goalId: string;
}) {
  const [minutes, setMinutes] = useState('30');
  const [note, setNote] = useState('');
  const submit = async () => {
    const n = Number(minutes);
    if (!(n > 0 && n <= 24 * 60)) return toast.error('Enter minutes between 1 and 1440.');
    await logMinutes(goalId, n, note);
    toast.success(`Logged ${minutesLabel(Math.round(n))}`);
    setNote('');
    onOpenChange(false);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Log time"
      description="Count work that isn't a task: reading, revision, practice."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void submit()}>Log time</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Minutes">
          {({ id }) => (
            <Input
              id={id}
              type="number"
              min={1}
              max={1440}
              inputMode="numeric"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
            />
          )}
        </Field>
        <Field label="Note" optional>
          {({ id }) => (
            <Input
              id={id}
              value={note}
              maxLength={300}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What did you work on?"
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
}

/** Next milestones list (compact). */
export function UpcomingMilestones({ data, limit = 3 }: { data: GoalData; limit?: number }) {
  const upcoming = data.milestones.filter((m) => m.status !== 'completed').slice(0, limit);
  return (
    <section className="card p-5 sm:p-6" aria-labelledby="upcoming-title">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <p className="eyebrow mb-1">Upcoming</p>
          <h2 id="upcoming-title" className="text-xl">
            Next milestones
          </h2>
        </div>
        <Link
          to={`/goals/${data.goal.id}`}
          className="inline-flex min-h-11 items-center text-sm text-accent-text hover:underline"
        >
          Full plan
        </Link>
      </div>
      {upcoming.length === 0 ? (
        <p className="text-sm text-muted">Every milestone is complete.</p>
      ) : (
        <ol className="space-y-3">
          {upcoming.map((m) => {
            const t = data.tasks.filter((x) => x.milestone_id === m.id);
            const done = t.filter((x) => x.done_at).length;
            return (
              <li key={m.id} className="flex items-center gap-3">
                <ProgressRing
                  value={t.length ? done / t.length : 0}
                  size={36}
                  stroke={2.5}
                  label={`${m.title} progress`}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.title}</p>
                  <p className="text-xs text-muted">
                    {shortDate(m.target_date)} · {done}/{t.length} tasks
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/**
 * Motivation line from REAL numbers. Uses Gemini when the server has a key (cached
 * per goal per day); otherwise a plain sentence built from the same numbers.
 */
export function useMotivation(
  goal: GoalRow | undefined | null,
  m: GoalMetrics | null,
): { line: string | null; source: 'ai' | 'local' | null } {
  const dateKey = m?.countdown.todayKey;
  const cacheKey =
    goal && dateKey ? `motivation:${goal.id}:${dateKey}:${Math.round((m?.progress ?? 0) * 20)}` : null;
  const health = useQuery({ queryKey: ['health'], queryFn: getHealth, staleTime: 60_000 });
  const local = m && goal ? localMotivation(m) : null;
  const [cached, setCached] = useState<string | null>(null);
  const asked = useRef<string | null>(null);

  useEffect(() => {
    if (!cacheKey) return;
    let cancelled = false;
    void getKv<string>(cacheKey).then((v) => !cancelled && setCached(v ?? null));
    return () => {
      cancelled = true;
    };
  }, [cacheKey]);

  useEffect(() => {
    if (!goal || !m || !cacheKey || cached || !health.data?.ai.configured || asked.current === cacheKey)
      return;
    if (goal.status !== 'active') return;
    asked.current = cacheKey;
    const ctrl = new AbortController();
    getMotivation(
      {
        goal: goal.title,
        daysLeft: m.countdown.daysLeft,
        percentDone: Math.round(m.progress * 100),
        nextMilestone: m.nextMilestone?.title ?? null,
        streak: m.streak,
        pace: m.pace,
        state: m.countdown.state,
        dateKey: m.countdown.todayKey,
      },
      ctrl.signal,
    )
      .then(async (r) => {
        await setKv(cacheKey, r.line);
        await recordRuns([r.run], goal.id);
        setCached(r.line);
      })
      .catch(() => {
        /* fall back to the local line silently */
      });
    return () => ctrl.abort();
  }, [goal, m, cacheKey, cached, health.data]);

  if (cached) return { line: cached, source: 'ai' };
  return { line: local, source: local ? 'local' : null };
}

export function localMotivation(m: GoalMetrics): string {
  const c = m.countdown;
  const pct = Math.round(m.progress * 100);
  if (c.state === 'completed') return 'Done. Every milestone met.';
  if (c.state === 'expired') return 'The deadline passed. Close it out or set a new one.';
  if (c.state === 'due-today') return `Final day. ${pct}% done; finish the last steps.`;
  const next = m.nextMilestone ? `Next: ${m.nextMilestone.title}.` : '';
  if (m.pace === 'behind')
    return `${c.daysLeft} days, ${pct}% done. One focused session closes the gap.`.trim();
  if (m.pace === 'ahead') return `${pct}% done with ${c.daysLeft} days to go. Keep the lead. ${next}`.trim();
  return `${c.daysLeft} days left · ${pct}% done. ${next}`.trim();
}

export function MotivationCard({ line, source }: { line: string | null; source: 'ai' | 'local' | null }) {
  if (!line) return null;
  return (
    <figure className="flex items-start gap-3 rounded-[20px] border border-hairline px-5 py-4">
      <Quote className="mt-0.5 size-4 shrink-0 text-accent-text" strokeWidth={1.5} aria-hidden />
      <div>
        <blockquote className="font-display text-lg italic leading-snug text-text">{line}</blockquote>
        <figcaption className="mt-1 text-xs text-muted">
          {source === 'ai' ? (
            <span className="inline-flex items-center gap-1">
              <Sparkles className="size-3" strokeWidth={1.5} aria-hidden /> ✦ AI suggestion · Gemini, from
              your real numbers
            </span>
          ) : (
            'From your real numbers'
          )}
        </figcaption>
      </div>
    </figure>
  );
}
