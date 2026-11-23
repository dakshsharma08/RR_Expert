/** Insights: progress over time, planned vs actual hours, streak heatmap, milestones, weekly AI summary. */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3, Flame, Loader2, Sparkles, Table2 } from 'lucide-react';
import { useActiveGoalId, useGoalData, useGoals } from '@/db/hooks';
import { useMinuteMetrics } from '@/features/goals/components';
import { heatmap, progressSeries, weekStartOf, weeklyBars } from '@/lib/insights';
import { useMinute } from '@/lib/ticker';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { ApiCallError, getHealth, getWeeklyInsight } from '@/lib/api';
import { getKv, recordRuns, setActiveGoal, setKv } from '@/db/repo';
import { minutesLabel, shortDate } from '@/lib/metrics';
import { formatDayKey } from '@shared/time';
import { cn } from '@/lib/cn';
import { AchievementsCard } from '@/features/goals/Achievements';

const AXIS = { fontSize: 11, fill: 'var(--text-muted)' };

export default function InsightsPage() {
  const activeId = useActiveGoalId();
  const goals = useGoals();
  const [picked, setPicked] = useState<string | null>(null);
  const goalId = picked ?? activeId ?? undefined;
  const data = useGoalData(goalId);
  const m = useMinuteMetrics(data);
  const now = useMinute();
  const navigate = useNavigate();
  const [tables, setTables] = useState(false);

  const series = useMemo(
    () => (data ? progressSeries(data.goal, data.milestones, data.logs, now) : []),
    [data, now],
  );
  const weeks = useMemo(() => (data ? weeklyBars(data.goal, data.milestones, data.logs) : []), [data]);
  const heat = useMemo(() => (data && m ? heatmap(data.logs, m.countdown.todayKey) : []), [data, m]);

  if (goals === undefined || activeId === undefined)
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-10">
        <Skeleton className="h-72" />
      </div>
    );
  const eligible = (goals ?? []).filter((g) => g.status === 'active' || g.status === 'completed');
  if (!eligible.length)
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <EmptyState
          icon={<BarChart3 className="size-5" strokeWidth={1.5} />}
          title="Insights appear once you approve a plan and start ticking off tasks."
          action={<Button onClick={() => navigate('/new')}>New goal</Button>}
        />
      </div>
    );
  if (!data || !m)
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <Skeleton className="h-72" />
      </div>
    );

  const totalLogged = data.logs.reduce((s, l) => s + l.minutes, 0);
  const onTime = data.milestones.filter(
    (x) => x.status === 'completed' && x.completed_at && x.completed_at.slice(0, 10) <= x.target_date,
  ).length;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 px-4 pb-12 pt-6 sm:px-6 md:pt-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-1">Insights</p>
          <h1 className="text-[28px] sm:text-[40px]">How it's going</h1>
        </div>
        <div className="flex items-center gap-2">
          {eligible.length > 1 && (
            <select
              aria-label="Goal"
              value={data.goal.id}
              onChange={(e) => {
                setPicked(e.target.value);
                void setActiveGoal(e.target.value);
              }}
              className="h-11 max-w-56 rounded-[14px] border border-hairline bg-surface-2 px-3 text-sm text-text"
            >
              {eligible.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
          )}
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={tables}
            onClick={() => setTables((t) => !t)}
            icon={<Table2 className="size-4" strokeWidth={1.5} />}
          >
            {tables ? 'Charts' : 'Tables'}
          </Button>
        </div>
      </div>

      {/* Hero numbers — a stat tile beats a chart for single values */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Work done"
          value={`${Math.round(m.progress * 100)}%`}
          sub={`${m.tasksDone}/${m.tasksTotal} tasks`}
        />
        <Stat
          label="Time used"
          value={`${Math.round(m.countdown.timePct * 100)}%`}
          sub={m.pace === 'ahead' ? 'Ahead of pace' : m.pace === 'behind' ? 'Behind pace' : 'On track'}
        />
        <Stat
          label="Milestones"
          value={`${m.milestonesDone}/${m.milestonesTotal}`}
          sub={`${onTime} on time`}
        />
        <Stat
          label="Logged"
          value={minutesLabel(totalLogged)}
          sub={`Streak ${m.streak} day${m.streak === 1 ? '' : 's'}`}
          icon={<Flame className="size-4 text-accent-text" strokeWidth={1.5} aria-hidden />}
        />
      </div>

      <WeeklySummary goalId={data.goal.id} goalTitle={data.goal.title} weeks={weeks} m={m} />

      <section className="card p-5 sm:p-6" aria-labelledby="ins-progress">
        <h2 id="ins-progress" className="text-xl">
          Progress over time
        </h2>
        <p className="mb-4 text-sm text-muted">
          Cumulative share of planned work: your plan vs what you've logged.
        </p>
        {tables ? (
          <DataTable
            head={['Date', 'Planned %', 'Actual %']}
            rows={series
              .filter((p) => p.actual !== null)
              .map((p) => [shortDate(p.date), `${p.planned}%`, `${p.actual}%`])}
          />
        ) : (
          <div
            className="h-64"
            role="img"
            aria-label={`Line chart. Planned progress reaches 100% by the deadline; you are at ${Math.round(m.progress * 100)}% of planned work.`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={series} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
                <CartesianGrid stroke="var(--line-hairline)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={AXIS}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--line-hairline)' }}
                  tickFormatter={(d: string) => formatDayKey(d)}
                  minTickGap={32}
                />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} domain={[0, 100]} unit="%" width={48} />
                <Tooltip
                  content={<ChartTip unit="%" />}
                  cursor={{ stroke: 'var(--line-strong)', strokeWidth: 1 }}
                />
                <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, color: 'var(--text-muted)' }} />
                <Line
                  type="monotone"
                  dataKey="planned"
                  name="Planned"
                  stroke="var(--chart-planned)"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={false}
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="actual"
                  name="Actual"
                  stroke="var(--chart-actual)"
                  strokeWidth={2}
                  fill="var(--chart-actual)"
                  fillOpacity={0.12}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-5 sm:p-6" aria-labelledby="ins-weekly">
          <h2 id="ins-weekly" className="text-xl">
            Planned vs actual hours
          </h2>
          <p className="mb-4 text-sm text-muted">Per week (weeks start Monday).</p>
          {tables ? (
            <DataTable
              head={['Week of', 'Planned h', 'Actual h']}
              rows={weeks.map((w) => [shortDate(w.weekStart), String(w.planned), String(w.actual)])}
            />
          ) : (
            <div className="h-56" role="img" aria-label="Bar chart of planned versus actual hours per week.">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={weeks}
                  margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
                  barGap={2}
                  barCategoryGap="28%"
                >
                  <CartesianGrid stroke="var(--line-hairline)" vertical={false} />
                  <XAxis
                    dataKey="weekStart"
                    tick={AXIS}
                    tickLine={false}
                    axisLine={{ stroke: 'var(--line-hairline)' }}
                    tickFormatter={(d: string) => formatDayKey(d)}
                  />
                  <YAxis tick={AXIS} tickLine={false} axisLine={false} unit="h" width={44} />
                  <Tooltip content={<ChartTip unit=" h" />} cursor={{ fill: 'var(--line-hairline)' }} />
                  <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-muted)' }} />
                  <Bar
                    dataKey="planned"
                    name="Planned"
                    fill="var(--chart-planned)"
                    radius={[4, 4, 0, 0]}
                    isAnimationActive={false}
                  />
                  <Bar
                    dataKey="actual"
                    name="Actual"
                    fill="var(--chart-actual)"
                    radius={[4, 4, 0, 0]}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="card p-5 sm:p-6" aria-labelledby="ins-heat">
          <h2 id="ins-heat" className="text-xl">
            Streak
          </h2>
          <p className="mb-4 text-sm text-muted">Minutes logged per day, last 12 weeks.</p>
          <Heatmap cols={heat} />
        </section>
      </div>

      <AchievementsCard data={data} m={m} />

      <section className="card p-5 sm:p-6" aria-labelledby="ins-ms">
        <h2 id="ins-ms" className="mb-4 text-xl">
          Milestone completion
        </h2>
        <ul className="space-y-2">
          {data.milestones.map((ms) => {
            const t = data.tasks.filter((x) => x.milestone_id === ms.id);
            const done = t.filter((x) => x.done_at).length;
            const pct = ms.status === 'completed' ? 1 : t.length ? done / t.length : 0;
            return (
              <li
                key={ms.id}
                className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 sm:grid-cols-[minmax(0,2fr)_3fr_auto]"
              >
                <p className="truncate text-sm">{ms.title}</p>
                <div
                  className="col-span-2 h-1.5 overflow-hidden rounded-full bg-surface-2 sm:col-span-1 sm:row-start-1 sm:col-start-2"
                  aria-hidden
                >
                  <div
                    className={cn(
                      'h-full rounded-full',
                      ms.status === 'completed' ? 'bg-success' : 'bg-gold',
                    )}
                    style={{ width: `${pct * 100}%` }}
                  />
                </div>
                <p className="row-start-1 text-right font-mono text-xs tabular text-muted sm:col-start-3">
                  {ms.status === 'completed' ? 'Done' : `${Math.round(pct * 100)}%`} ·{' '}
                  {shortDate(ms.target_date)}
                </p>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string;
  sub: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="card p-4">
      <p className="eyebrow flex items-center gap-1.5">
        {icon}
        {label}
      </p>
      <p className="mt-2 font-display text-[28px] leading-none tabular sm:text-[40px]">{value}</p>
      <p className="mt-2 text-xs text-muted">{sub}</p>
    </div>
  );
}

function ChartTip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: { name: string; value: number | null; color: string }[];
  label?: string;
  unit: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-hairline bg-surface-2 px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 text-muted">{label ? shortDate(label) : ''}</p>
      {payload.map((p) =>
        p.value === null || p.value === undefined ? null : (
          <p key={p.name} className="flex items-center gap-2 text-text">
            <span className="inline-block h-0.5 w-3 rounded" style={{ background: p.color }} aria-hidden />
            {p.name}:{' '}
            <span className="font-mono tabular">
              {p.value}
              {unit}
            </span>
          </p>
        ),
      )}
    </div>
  );
}

function DataTable({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="max-h-72 overflow-auto rounded-xl border border-hairline">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 bg-surface-2 text-xs text-muted">
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-hairline">
              {r.map((c, j) => (
                <td key={j} className="px-3 py-2 font-mono text-xs tabular">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Heatmap({ cols }: { cols: { date: string; minutes: number; future: boolean }[][] }) {
  const max = Math.max(30, ...cols.flat().map((c) => c.minutes));
  const levels = [0.0, 0.25, 0.5, 0.75, 1];
  const level = (min: number) => (min <= 0 ? 0 : Math.min(4, Math.ceil((min / max) * 4)));
  return (
    <div>
      <div className="flex gap-1 overflow-x-auto pb-1" role="grid" aria-label="Daily activity heatmap">
        {cols.map((col, i) => (
          <div key={i} className="flex flex-col gap-1" role="row">
            {col.map((c) => (
              <div
                key={c.date}
                role="gridcell"
                title={`${shortDate(c.date)}: ${c.minutes ? minutesLabel(Math.round(c.minutes)) : 'nothing logged'}`}
                aria-label={`${shortDate(c.date)}: ${c.minutes ? minutesLabel(Math.round(c.minutes)) : 'nothing logged'}`}
                className={cn(
                  'size-[18px] rounded-[4px] border border-hairline sm:size-5',
                  c.future && 'opacity-30',
                )}
                style={{
                  background:
                    c.minutes > 0
                      ? `color-mix(in oklab, var(--gold) ${Math.round(levels[level(c.minutes)]! * 100)}%, var(--surface-2))`
                      : 'var(--surface-2)',
                }}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-[11px] text-muted" aria-hidden>
        Less
        {levels.map((l) => (
          <span
            key={l}
            className="size-3 rounded-[3px] border border-hairline"
            style={{
              background:
                l === 0
                  ? 'var(--surface-2)'
                  : `color-mix(in oklab, var(--gold) ${l * 100}%, var(--surface-2))`,
            }}
          />
        ))}
        More
      </div>
    </div>
  );
}

function WeeklySummary({
  goalId,
  goalTitle,
  weeks,
  m,
}: {
  goalId: string;
  goalTitle: string;
  weeks: { weekStart: string; planned: number; actual: number }[];
  m: NonNullable<ReturnType<typeof useMinuteMetrics>>;
}) {
  const health = useQuery({ queryKey: ['health'], queryFn: getHealth, staleTime: 60_000 });
  const weekStart = weekStartOf(m.countdown.todayKey);
  const cacheKey = `weekly:${goalId}:${weekStart}`;
  const cached = useQuery({
    queryKey: ['kv', cacheKey],
    queryFn: async () => (await getKv<string>(cacheKey)) ?? null,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const wk = weeks.find((w) => w.weekStart === weekStart) ?? { planned: 0, actual: 0 };

  async function generate() {
    setBusy(true);
    setErr(null);
    try {
      const r = await getWeeklyInsight({
        goal: goalTitle,
        weekStartKey: weekStart,
        plannedMinutes: Math.round(wk.planned * 60),
        actualMinutes: Math.round(wk.actual * 60),
        tasksCompleted: m.tasksDone,
        milestonesCompleted: m.milestonesDone,
        streak: m.streak,
        pace: m.pace,
        daysLeft: m.countdown.daysLeft,
      });
      await setKv(cacheKey, r.summary);
      await recordRuns([r.run], goalId);
      await cached.refetch();
    } catch (e) {
      setErr(e instanceof ApiCallError ? e.error.message : 'Could not get a summary right now.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-[20px] border border-accent/40 p-5" aria-labelledby="ins-weekly-ai">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="ins-weekly-ai" className="flex items-center gap-2 font-sans text-base font-semibold">
          <Sparkles className="size-4 text-accent-text" strokeWidth={1.5} aria-hidden /> This week, in a
          sentence or two
        </h2>
        {health.data?.ai.configured && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void generate()}
            disabled={busy}
            icon={busy ? <Loader2 className="size-4 animate-spin" /> : undefined}
          >
            {cached.data ? 'Refresh summary' : 'Summarize my week'}
          </Button>
        )}
      </div>
      {cached.data ? (
        <>
          <p className="mt-3 font-display text-lg leading-snug">{cached.data}</p>
          <p className="mt-1 text-xs text-muted">✦ AI suggestion · Gemini, from this week's real numbers</p>
        </>
      ) : (
        <p className="mt-3 text-sm text-muted">
          This week: {wk.actual} h logged of {wk.planned} h planned.{' '}
          {health.data && !health.data.ai.configured
            ? 'AI summaries appear when Gemini is connected on this server.'
            : ''}
        </p>
      )}
      {err && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {err}
        </p>
      )}
    </section>
  );
}
