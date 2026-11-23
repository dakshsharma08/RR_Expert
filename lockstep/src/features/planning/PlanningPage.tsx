/**
 * Gemini planning screen. Milestones stream in as Gemini writes them; the final plan
 * is validated by code on the server before we save it. Cancel stops the AI call.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, PenLine, RotateCcw, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FeasibilityBadge } from '@/components/ui/badges';
import { useGoal } from '@/db/hooks';
import { savePlanResult, startManualPlan } from '@/db/repo';
import { ApiCallError, streamPlan } from '@/lib/api';
import { usePlanner } from '@/stores/planner';
import { shortDate } from '@/lib/metrics';
import type { ApiError, PlanFeasibilityEvent, PlanStatusEvent } from '@shared/api';
import type { PlanMilestone } from '@shared/plan';
import { Skeleton } from '@/components/ui/misc';

type Phase = 'idle' | 'streaming' | 'error' | 'cancelled' | 'done';

export default function PlanningPage() {
  const { goalId } = useParams();
  const goal = useGoal(goalId);
  const navigate = useNavigate();
  const attachment = usePlanner((s) => (goalId ? s.attachments[goalId] : undefined));
  const adjustment = usePlanner((s) => (goalId ? s.pendingAdjustment[goalId] : undefined));
  const [phase, setPhase] = useState<Phase>('idle');
  const [status, setStatus] = useState<PlanStatusEvent | null>(null);
  const [feas, setFeas] = useState<PlanFeasibilityEvent | null>(null);
  const [milestones, setMilestones] = useState<PlanMilestone[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  const startedFor = useRef<string | null>(null);

  const run = useCallback(async () => {
    if (!goal) return;
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setPhase('streaming');
    setError(null);
    setMilestones([]);
    setFeas(null);
    setStatus({ phase: 'thinking', message: 'Reading your goal…' });
    try {
      let finished = false;
      await streamPlan(
        { ...goal.intake, attachment, adjustment: adjustment ?? 'none' },
        (e) => {
          if (c.signal.aborted) return;
          if (e.event === 'status') setStatus(e.data);
          else if (e.event === 'feasibility') setFeas(e.data);
          else if (e.event === 'milestone')
            setMilestones((prev) => {
              const next = [...prev];
              next[e.data.index] = e.data.milestone;
              return next;
            });
          else if (e.event === 'error') {
            finished = true;
            setError(e.data);
            setPhase('error');
          } else if (e.event === 'result') {
            finished = true;
            setMilestones(e.data.plan.milestones);
            setPhase('done');
            void savePlanResult(goal.id, e.data).then(() =>
              navigate(`/goals/${goal.id}/review`, { replace: true }),
            );
          }
        },
        c.signal,
      );
      if (!finished && !c.signal.aborted) {
        setError({
          code: 'INTERNAL',
          message: 'The connection closed before the plan finished.',
          retryable: true,
        });
        setPhase('error');
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setError(
        e instanceof ApiCallError
          ? e.error
          : { code: 'INTERNAL', message: 'Something went wrong. Please try again.', retryable: true },
      );
      setPhase('error');
    }
  }, [goal, attachment, adjustment, navigate]);

  useEffect(() => {
    if (!goal || startedFor.current === goal.id) return;
    if (goal.status !== 'planning' && goal.plan_meta) {
      navigate(`/goals/${goal.id}/review`, { replace: true });
      return;
    }
    startedFor.current = goal.id;
    void run();
  }, [goal, run, navigate]);

  // On unmount, stop the stream AND forget that we started it, so a remount
  // (React StrictMode in dev, or coming back to this page) starts a fresh one.
  useEffect(
    () => () => {
      ctrl.current?.abort();
      startedFor.current = null;
    },
    [],
  );

  const cancel = () => {
    ctrl.current?.abort();
    setPhase('cancelled');
  };

  async function buildManually() {
    if (!goal) return;
    await startManualPlan(goal.id);
    navigate(`/goals/${goal.id}/review`);
  }

  if (goal === undefined)
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Skeleton className="h-40" />
      </div>
    );
  if (goal === null)
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-muted">This goal no longer exists.</p>
        <Button className="mt-4" onClick={() => navigate('/new')}>
          Start a new goal
        </Button>
      </div>
    );

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-20 pt-6 sm:px-6 md:pt-12">
      <p className="eyebrow mb-2">Planning with Gemini</p>
      <h1 className="text-[28px] leading-tight sm:text-[40px]">{goal.title}</h1>

      <div className="mt-6 flex flex-wrap items-center gap-3" aria-live="polite">
        {phase === 'streaming' && (
          <span className="inline-flex items-center gap-2 text-sm text-muted">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-gold opacity-60" />
              <span className="relative inline-flex size-2.5 rounded-full bg-gold" />
            </span>
            {status?.message ?? 'Thinking…'}
          </span>
        )}
        {feas && <FeasibilityBadge value={feas.feasibility} prefix="Gemini:" />}
        {phase === 'streaming' && (
          <Button
            variant="ghost"
            size="sm"
            onClick={cancel}
            icon={<X className="size-4" strokeWidth={1.5} />}
            className="ml-auto"
          >
            Cancel
          </Button>
        )}
      </div>
      {feas && <p className="mt-3 text-sm text-muted">{feas.feasibilityReason}</p>}

      <ol className="relative mt-8 space-y-3 border-l border-hairline pl-6" aria-label="Milestones">
        <AnimatePresence initial={false}>
          {milestones.map((m, i) =>
            m ? (
              <motion.li
                key={m.id + i}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                className="card relative p-4"
              >
                <span
                  className="absolute -left-[31px] top-5 size-2.5 rounded-full border border-gold bg-bg"
                  aria-hidden
                />
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-medium">{m.title}</p>
                  <p className="shrink-0 font-mono text-xs tabular text-accent-text">
                    {safeDate(m.targetDate)}
                  </p>
                </div>
                <p className="mt-1 text-sm text-muted">{m.description}</p>
                <p className="mt-2 text-xs text-muted">
                  {m.estimatedHours} h · {m.tasks.length} task{m.tasks.length === 1 ? '' : 's'} ·{' '}
                  {m.difficulty}
                </p>
              </motion.li>
            ) : null,
          )}
        </AnimatePresence>
        {phase === 'streaming' &&
          Array.from({ length: Math.max(1, 3 - milestones.length) }).map((_, i) => (
            <li key={`sk${i}`} className="relative">
              <span
                className="absolute -left-[31px] top-5 size-2.5 rounded-full border border-hairline bg-bg"
                aria-hidden
              />
              <Skeleton className="h-24" />
            </li>
          ))}
      </ol>

      {phase === 'cancelled' && (
        <div className="card mt-8 p-5" role="status">
          <p className="font-medium">Planning cancelled.</p>
          <p className="mt-1 text-sm text-muted">Nothing was saved. Start again whenever you're ready.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => void run()} icon={<Sparkles className="size-4" strokeWidth={1.75} />}>
              Generate again
            </Button>
            <Button
              variant="ghost"
              onClick={() => void buildManually()}
              icon={<PenLine className="size-4" strokeWidth={1.5} />}
            >
              Plan it myself
            </Button>
          </div>
        </div>
      )}

      {phase === 'error' && error && (
        <div className="mt-8 rounded-[20px] border border-danger/35 bg-danger/10 p-5" role="alert">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" strokeWidth={1.5} aria-hidden />
            <div className="min-w-0">
              <p className="font-medium text-text">{errorTitle(error)}</p>
              <p className="mt-1 text-sm text-muted">{error.message}</p>
              {error.details && error.details.length > 0 && (
                <details className="mt-3 text-xs text-muted">
                  <summary className="cursor-pointer">What failed the checks</summary>
                  <ul className="mt-2 list-disc space-y-1 pl-4">
                    {error.details.slice(0, 8).map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {error.retryable && error.code !== 'AI_NOT_CONFIGURED' && (
              <Button onClick={() => void run()} icon={<RotateCcw className="size-4" strokeWidth={1.5} />}>
                Retry
              </Button>
            )}
            <Button
              variant={error.code === 'AI_NOT_CONFIGURED' ? 'primary' : 'ghost'}
              onClick={() => void buildManually()}
              icon={<PenLine className="size-4" strokeWidth={1.5} />}
            >
              Build the plan myself
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function errorTitle(e: ApiError): string {
  switch (e.code) {
    case 'AI_NOT_CONFIGURED':
      return "Gemini isn't connected on this server";
    case 'AI_BUSY':
      return 'Gemini is busy';
    case 'RATE_LIMITED':
      return 'Too many requests';
    case 'TIMEOUT':
      return 'Gemini took too long';
    case 'PLAN_INVALID':
      return "Gemini's plan didn't pass our checks";
    case 'INVALID_INPUT':
      return 'Something in your answers needs a fix';
    default:
      return 'Planning failed';
  }
}

function safeDate(k: string) {
  try {
    return shortDate(k);
  } catch {
    return k;
  }
}
