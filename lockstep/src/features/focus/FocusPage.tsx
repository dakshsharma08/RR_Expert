/**
 * Focus Mode: full-screen live countdown with seconds (the wallpaper is static, so
 * the live seconds live here). Optional Wake Lock keeps the screen on.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Expand, Shrink, X } from 'lucide-react';
import { useGoalData } from '@/db/hooks';
import { CountdownDigits, TaskCheck, useLiveMetrics } from '@/features/goals/components';
import { IconButton } from '@/components/ui/button';
import { Switch } from '@/components/ui/controls';
import { ProgressRing, Skeleton } from '@/components/ui/misc';
import { paceLabel, shortDate, stateLabel } from '@/lib/metrics';

interface WakeLockSentinelLike {
  release(): Promise<void>;
  addEventListener(t: 'release', cb: () => void): void;
}

export default function FocusPage() {
  const { goalId } = useParams();
  const data = useGoalData(goalId);
  const m = useLiveMetrics(data);
  const navigate = useNavigate();
  const [wake, setWake] = useState(false);
  const [wakeActive, setWakeActive] = useState(false);
  const [fs, setFs] = useState(false);
  const sentinel = useRef<WakeLockSentinelLike | null>(null);
  const wakeSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

  useEffect(() => {
    if (!wake || !wakeSupported) return;
    let cancelled = false;
    const acquire = async () => {
      try {
        const s = await (
          navigator as unknown as { wakeLock: { request: (t: 'screen') => Promise<WakeLockSentinelLike> } }
        ).wakeLock.request('screen');
        if (cancelled) return void s.release();
        sentinel.current = s;
        setWakeActive(true);
        s.addEventListener('release', () => setWakeActive(false));
      } catch {
        setWakeActive(false);
      }
    };
    void acquire();
    // The browser releases the lock when the tab is hidden; take it back on return.
    const onVis = () => document.visibilityState === 'visible' && void acquire();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      void sentinel.current?.release();
      sentinel.current = null;
    };
  }, [wake, wakeSupported]);

  useEffect(() => {
    const on = () => setFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !document.fullscreenElement && navigate(-1);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('fullscreenchange', on);
      window.removeEventListener('keydown', onKey);
    };
  }, [navigate]);

  if (data === undefined)
    return (
      <div className="min-h-dvh bg-obsidian p-10">
        <Skeleton className="h-40" />
      </div>
    );
  if (!data || !m)
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg p-6 text-center">
        <p className="text-muted">This goal isn't available.</p>
        <button
          className="h-11 rounded-[14px] bg-gold px-5 font-semibold text-obsidian"
          onClick={() => navigate('/app')}
        >
          Go home
        </button>
      </div>
    );

  const next = m.nextMilestone;
  const nextTasks = next
    ? data.tasks.filter((t) => t.milestone_id === next.id && !t.done_at).slice(0, 3)
    : [];

  return (
    <div className="relative flex min-h-dvh flex-col bg-bg text-text">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute left-1/2 top-1/2 size-[110vmin] -translate-x-1/2 -translate-y-1/2 rounded-full border border-hairline" />
        <div className="absolute left-1/2 top-1/2 size-[80vmin] -translate-x-1/2 -translate-y-1/2 rounded-full border border-hairline" />
      </div>
      <header className="safe-top relative z-10 flex items-center justify-between p-4">
        <p className="eyebrow whitespace-nowrap">Focus · {stateLabel(m.countdown)}</p>
        <div className="flex items-center gap-1">
          {wakeSupported && (
            <label className="mr-2 flex min-h-11 items-center gap-2 text-xs text-muted">
              <span className="hidden sm:inline">Keep screen on</span>
              <Switch checked={wake} onChange={setWake} label="Keep screen on" />
            </label>
          )}
          {document.fullscreenEnabled && (
            <IconButton
              label={fs ? 'Exit full screen' : 'Full screen'}
              onClick={() =>
                fs ? void document.exitFullscreen() : void document.documentElement.requestFullscreen()
              }
            >
              {fs ? (
                <Shrink className="size-5" strokeWidth={1.5} />
              ) : (
                <Expand className="size-5" strokeWidth={1.5} />
              )}
            </IconButton>
          )}
          <IconButton label="Exit focus mode" onClick={() => navigate(`/goals/${data.goal.id}`)}>
            <X className="size-5" strokeWidth={1.5} />
          </IconButton>
        </div>
      </header>

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center gap-10 px-4 pb-16 text-center">
        <h1 className="max-w-3xl text-xl text-muted sm:text-2xl">{data.goal.title}</h1>
        <CountdownDigits c={m.countdown} size="xl" />
        <div className="flex flex-wrap items-center justify-center gap-6">
          <ProgressRing value={m.progress} size={96} stroke={3} label="Work done">
            <span className="font-mono text-xl tabular">{Math.round(m.progress * 100)}%</span>
          </ProgressRing>
          <div className="text-left">
            <p className="eyebrow mb-1">Next milestone</p>
            <p className="max-w-xs font-display text-xl">{next ? next.title : 'All milestones done'}</p>
            {next && (
              <p className="mt-1 font-mono text-sm tabular text-accent-text">{shortDate(next.target_date)}</p>
            )}
            <p className="mt-1 text-xs text-muted">
              {paceLabel(m.pace)} · Day {Math.max(1, m.countdown.dayNumber)} of {m.countdown.totalDays}
            </p>
          </div>
        </div>
        {nextTasks.length > 0 && (
          <ul className="w-full max-w-md space-y-1 text-left" aria-label="Next tasks">
            {nextTasks.map((t) => (
              <TaskCheck key={t.id} task={t} />
            ))}
          </ul>
        )}
        {wake && wakeActive && (
          <p className="text-xs text-muted" role="status">
            Screen will stay on while this tab is open.
          </p>
        )}
      </main>
    </div>
  );
}
