/**
 * Adaptive AI coach. Gemini can read your plan and progress (function calling) and
 * PROPOSE a reschedule. Proposals show as an old → new diff; nothing changes until
 * you press Accept.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Check, Loader2, MessageCircle, Send, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button, IconButton } from '@/components/ui/button';
import { Input } from '@/components/ui/form';
import { ApiCallError, askCoach, getHealth } from '@/lib/api';
import { applyReschedule, recordRuns } from '@/db/repo';
import type { GoalData } from '@/db/hooks';
import type { GoalMetrics } from '@/lib/metrics';
import { shortDate } from '@/lib/metrics';
import type { CoachChip, CoachContext, CoachProposal } from '@shared/api';
import { addDays } from '@shared/time';
import { cn } from '@/lib/cn';

const CHIPS: { id: CoachChip; label: string }[] = [
  { id: 'on-track', label: 'Am I on track?' },
  { id: 'today', label: 'What should I do today?' },
  { id: 'replan', label: 'I missed milestones — replan' },
  { id: 'lighten', label: 'Lighten my schedule' },
  { id: 'improve', label: 'How can I improve?' },
];

interface Turn {
  role: 'user' | 'model';
  text: string;
  proposal?: CoachProposal | null;
  decided?: 'accepted' | 'rejected';
  tools?: string[];
}

export function buildCoachContext(data: GoalData, m: GoalMetrics): CoachContext {
  const today = m.countdown.todayKey;
  const weekAgo = addDays(today, -6);
  return {
    goal: {
      title: data.goal.title,
      deadlineUtc: data.goal.deadline_utc,
      timezone: data.goal.timezone,
      hoursPerDay: data.goal.hours_per_day,
      workingDays: data.goal.working_days,
      pace: data.goal.pace_style,
    },
    todayKey: today,
    // The API accepts up to 20 milestones: send every open one first, then the latest completed.
    milestones: [
      ...data.milestones.filter((x) => x.status !== 'completed'),
      ...data.milestones.filter((x) => x.status === 'completed').reverse(),
    ]
      .slice(0, 20)
      .sort((a, b) => a.order - b.order)
      .map((ms) => {
        const t = data.tasks.filter((x) => x.milestone_id === ms.id);
        return {
          id: ms.id,
          title: ms.title,
          targetDate: ms.target_date,
          estimatedHours: ms.estimated_hours,
          status: ms.status,
          tasksDone: t.filter((x) => x.done_at).length,
          tasksTotal: t.length,
          tasks: t
            .slice(0, 8)
            .map((x) => ({ title: x.title, done: !!x.done_at, estimatedMinutes: x.estimated_minutes })),
        };
      }),
    progress: {
      percentDone: Math.round(m.progress * 100),
      timePct: Math.round(m.countdown.timePct * 100),
      pace: m.pace,
      streak: m.streak,
      minutesLast7Days: data.logs
        .filter((l) => l.date >= weekAgo && l.date <= today)
        .reduce((s, l) => s + l.minutes, 0),
      daysLeft: m.countdown.daysLeft,
    },
  };
}

export function CoachCard({ data, m }: { data: GoalData; m: GoalMetrics }) {
  const health = useQuery({ queryKey: ['health'], queryFn: getHealth, staleTime: 60_000 });
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = health.data?.ai.configured === true;

  async function send(message: string, chip?: CoachChip) {
    if (!message.trim() || busy) return;
    setError(null);
    const history = turns.slice(-10).map((t) => ({ role: t.role, text: t.text.slice(0, 1000) }));
    setTurns((t) => [...t, { role: 'user', text: message }]);
    setInput('');
    setBusy(true);
    try {
      const res = await askCoach({
        message: message.slice(0, 1000),
        chip,
        context: buildCoachContext(data, m),
        history,
      });
      await recordRuns(res.runs, data.goal.id);
      setTurns((t) => [
        ...t,
        { role: 'model', text: res.reply, proposal: res.proposal, tools: res.toolCalls },
      ]);
    } catch (e) {
      setError(e instanceof ApiCallError ? e.error.message : 'The coach could not answer. Try again.');
      setTurns((t) => t.slice(0, -1));
    } finally {
      setBusy(false);
    }
  }

  async function decide(i: number, accept: boolean) {
    const turn = turns[i];
    if (!turn?.proposal) return;
    if (accept) {
      await applyReschedule(data.goal.id, turn.proposal.changes);
      toast.success('Plan updated', {
        description: `${turn.proposal.changes.length} milestone${turn.proposal.changes.length === 1 ? '' : 's'} rescheduled. Marked "Edited by you".`,
      });
    }
    setTurns((t) => t.map((x, j) => (j === i ? { ...x, decided: accept ? 'accepted' : 'rejected' } : x)));
  }

  return (
    <section className="card flex flex-col p-5 sm:p-6" aria-labelledby="coach-title">
      <div className="mb-3 flex items-center gap-2">
        <MessageCircle className="size-5 text-accent-text" strokeWidth={1.5} aria-hidden />
        <h2 id="coach-title" className="text-xl">
          Coach
        </h2>
        <span className="ml-auto text-[11px] text-muted">Gemini · reads your plan & progress</span>
      </div>

      {!ready && health.isFetched ? (
        <p className="rounded-[14px] border border-hairline p-4 text-sm text-muted">
          The coach needs Gemini, which isn't connected on this server yet. Your plan, countdown and wallpaper
          all keep working.
        </p>
      ) : (
        <>
          {turns.length > 0 && (
            <ol className="mb-3 max-h-96 space-y-3 overflow-y-auto pr-1" aria-live="polite">
              {turns.map((t, i) => (
                <li
                  key={i}
                  className={cn(
                    'text-sm',
                    t.role === 'user' ? 'ml-8 rounded-[14px] bg-surface-2 px-3 py-2 text-text' : 'text-text',
                  )}
                >
                  {t.role === 'model' && (
                    <p className="mb-1 inline-flex items-center gap-1 text-[11px] text-accent-text">
                      <Sparkles className="size-3" strokeWidth={1.5} aria-hidden /> ✦ AI suggestion
                      {t.tools?.length
                        ? ` · checked ${t.tools.filter((x) => x !== 'proposeReschedule').join(', ') || 'your plan'}`
                        : ''}
                    </p>
                  )}
                  <p className="whitespace-pre-line leading-relaxed">{t.text}</p>
                  {t.proposal && t.proposal.changes.length > 0 && (
                    <ProposalDiff
                      proposal={t.proposal}
                      decided={t.decided}
                      onAccept={() => void decide(i, true)}
                      onReject={() => void decide(i, false)}
                    />
                  )}
                </li>
              ))}
              {busy && (
                <li className="flex items-center gap-2 text-sm text-muted">
                  <Loader2 className="size-4 animate-spin" strokeWidth={1.5} aria-hidden /> Thinking with your
                  data…
                </li>
              )}
            </ol>
          )}
          <div className="flex flex-wrap gap-2">
            {CHIPS.map((c) => (
              <button
                key={c.id}
                disabled={busy || health.isLoading}
                onClick={() => void send(c.label, c.id)}
                className="min-h-11 rounded-full border border-hairline px-3.5 text-xs text-text transition-colors hover:border-accent hover:text-accent-text disabled:opacity-50"
              >
                {c.label}
              </button>
            ))}
          </div>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={1000}
              placeholder="Ask the coach…"
              aria-label="Message the coach"
              disabled={busy}
            />
            <IconButton label="Send" type="submit" variant="primary" disabled={busy || !input.trim()}>
              <Send className="size-4" strokeWidth={1.75} />
            </IconButton>
          </form>
          {error && (
            <p role="alert" className="mt-2 text-xs text-danger">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  );
}

function ProposalDiff({
  proposal,
  decided,
  onAccept,
  onReject,
}: {
  proposal: CoachProposal;
  decided?: 'accepted' | 'rejected';
  onAccept: () => void;
  onReject: () => void;
}) {
  return (
    <div className="mt-3 rounded-[14px] border border-accent/50 p-3">
      <p className="mb-2 text-xs font-medium text-accent-text">Proposed change · {proposal.summary}</p>
      <ul className="space-y-2">
        {proposal.changes.map((c) => (
          <li key={c.milestoneId} className="text-xs">
            <p className="font-medium text-text">{c.title}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 font-mono tabular text-muted">
              <span className="line-through decoration-danger/70">{shortDate(c.oldDate)}</span>
              <ArrowRight className="size-3" strokeWidth={1.5} aria-label="becomes" />
              <span className="text-success">{shortDate(c.newDate)}</span>
              {c.oldHours !== c.newHours && (
                <>
                  <span className="mx-1">·</span>
                  <span className="line-through decoration-danger/70">{c.oldHours} h</span>
                  <ArrowRight className="size-3" strokeWidth={1.5} aria-label="becomes" />
                  <span className="text-success">{c.newHours} h</span>
                </>
              )}
            </p>
          </li>
        ))}
      </ul>
      {!proposal.valid && (
        <p className="mt-2 text-xs text-warning">
          This proposal breaks a rule ({proposal.errors[0]}). You can still reject it, or ask again.
        </p>
      )}
      {decided ? (
        <p className="mt-3 text-xs text-muted">
          {decided === 'accepted' ? 'Accepted. Your plan is updated.' : 'Rejected. Nothing changed.'}
        </p>
      ) : (
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            onClick={onAccept}
            disabled={!proposal.valid}
            icon={<Check className="size-4" strokeWidth={2} />}
          >
            Accept
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onReject}
            icon={<X className="size-4" strokeWidth={1.5} />}
          >
            Reject
          </Button>
        </div>
      )}
    </div>
  );
}
