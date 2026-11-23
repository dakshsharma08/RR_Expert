/**
 * Milestone review: edit, delete (with Undo), drag or keyboard-reorder, live
 * re-validation, then a sticky "Approve plan". Nothing is final until you approve.
 */
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowDownUp,
  CalendarPlus,
  Check,
  ChevronDown,
  Clock,
  GripVertical,
  Hourglass,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  Scissors,
} from 'lucide-react';
import { Button, IconButton } from '@/components/ui/button';
import {
  AiBadge,
  ApprovedBadge,
  CompletedBadge,
  EditedBadge,
  FeasibilityBadge,
  GeneratedStamp,
} from '@/components/ui/badges';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { useGoalData } from '@/db/hooks';
import {
  approvePlan,
  deleteMilestone,
  reorderMilestones,
  restoreMilestone,
  updateGoalIntake,
  refreshGoalMeta,
} from '@/db/repo';
import { db, type GoalRow, type MilestoneRow, type TaskRow } from '@/db/db';
import { liveChecks, type MilestoneIssues } from '@/lib/liveChecks';
import { minutesLabel, shortDate } from '@/lib/metrics';
import { usePlanner } from '@/stores/planner';
import { MilestoneEditor } from './MilestoneEditor';
import { addDays, formatInZone, zoneLabel } from '@shared/time';
import { cn } from '@/lib/cn';

export default function ReviewPage() {
  const { goalId } = useParams();
  const data = useGoalData(goalId);
  const navigate = useNavigate();
  const [editing, setEditing] = useState<MilestoneRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [approving, setApproving] = useState(false);
  const setAdjustment = usePlanner((s) => s.setAdjustment);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const checks = useMemo(() => (data ? liveChecks(data.goal, data.milestones) : null), [data]);

  if (data === undefined)
    return (
      <div className="mx-auto max-w-3xl space-y-3 px-4 py-10">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    );
  if (data === null)
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <EmptyState
          icon={<TriangleAlert className="size-5" strokeWidth={1.5} />}
          title="This goal no longer exists."
          action={<Button onClick={() => navigate('/new')}>New goal</Button>}
        />
      </div>
    );

  const { goal, milestones, tasks } = data;
  const meta = goal.plan_meta;
  const isActive = goal.status === 'active' || goal.status === 'completed';
  const tasksFor = (id: string) => tasks.filter((t) => t.milestone_id === id);
  const sortedByDate = [...milestones].every((m, i, a) => i === 0 || a[i - 1]!.target_date <= m.target_date);

  async function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const ids = milestones.map((m) => m.id);
    const next = arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)));
    await reorderMilestones(goal.id, next);
  }

  async function sortByDate() {
    const next = [...milestones]
      .sort((a, b) =>
        a.target_date < b.target_date ? -1 : a.target_date > b.target_date ? 1 : a.order - b.order,
      )
      .map((m) => m.id);
    await reorderMilestones(goal.id, next);
    toast.success('Sorted by date');
  }

  async function remove(m: MilestoneRow) {
    const snap = await deleteMilestone(m.id);
    if (snap)
      toast('Milestone deleted', {
        description: m.title,
        action: { label: 'Undo', onClick: () => void restoreMilestone(snap) },
      });
  }

  async function approve() {
    if (!checks) return;
    if (milestones.length === 0) return toast.error('Add at least one milestone first.');
    if (checks.hardCount > 0)
      return toast.error('Fix the highlighted dates first', {
        description: 'Each milestone needs a date after today, on or before the deadline, in order.',
      });
    setApproving(true);
    await approvePlan(goal.id);
    setApproving(false);
    toast.success('Plan locked in', { description: 'Your countdown is live.' });
    navigate(`/goals/${goal.id}`);
  }

  async function applyFix(kind: 'extend-deadline' | 'add-hours' | 'reduce-scope') {
    const fixes = meta?.fixes;
    const intake = { ...goal.intake };
    if (kind === 'extend-deadline' && fixes?.extendTo) intake.deadlineDate = fixes.extendTo;
    if (kind === 'add-hours' && fixes?.hoursPerDay) intake.hoursPerDay = fixes.hoursPerDay;
    await updateGoalIntake(goal.id, intake);
    // Never regenerate an approved plan: that would wipe completed milestones and ticked tasks.
    // For active goals a fix only changes the settings (the coach can propose a replan instead).
    if (meta?.source === 'ai' && !isActive) {
      setAdjustment(goal.id, kind);
      await db.goals.update(goal.id, { status: 'planning' });
      navigate(`/goals/${goal.id}/plan`);
    } else {
      await refreshGoalMeta(goal.id);
      toast.success(kind === 'extend-deadline' ? 'Deadline extended' : 'Hours updated');
    }
  }

  const today = checks!.today;
  const minDate = addDays(today, 1) > checks!.deadlineKey ? today : addDays(today, 1);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-10 pt-6 sm:px-6 md:pt-10">
      <p className="eyebrow mb-2">{isActive ? 'Your plan' : 'Review your plan'}</p>
      <h1 className="text-[28px] leading-tight sm:text-[40px]">{goal.title}</h1>
      <p className="mt-2 text-sm text-muted">
        Due {formatInZone(goal.deadline_utc, goal.timezone)} (
        {zoneLabel(goal.timezone, new Date(goal.deadline_utc))}) · {goal.hours_per_day} h/day ·{' '}
        {goal.pace_style}
      </p>
      {goal.dst_note && <p className="mt-1 text-xs text-warning">{goal.dst_note}</p>}
      {meta?.source === 'ai' && <GeneratedStamp className="mt-2" model={meta.model} at={meta.generatedAt} />}
      {meta?.source === 'manual' && (
        <p className="mt-2 text-xs text-muted">
          Built by you{meta.generatedAt ? ' (started from a Gemini plan)' : ''}.
        </p>
      )}

      {meta && milestones.length > 0 && (
        <FeasibilityPanel goal={goal} onFix={applyFix} regenerates={meta.source === 'ai' && !isActive} />
      )}

      <div className="mb-3 mt-10 flex items-center justify-between gap-3">
        <h2 className="text-xl">
          Milestones <span className="font-mono text-base text-muted tabular">{milestones.length}</span>
        </h2>
        <div className="flex gap-1">
          {!sortedByDate && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void sortByDate()}
              icon={<ArrowDownUp className="size-4" strokeWidth={1.5} />}
            >
              Sort by date
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setCreating(true)}
            icon={<Plus className="size-4" strokeWidth={1.5} />}
          >
            Add
          </Button>
        </div>
      </div>
      <p className="mb-4 text-xs text-muted">
        Drag the handle, or focus it and use Space then the arrow keys, to reorder.
      </p>

      {milestones.length === 0 ? (
        <EmptyState
          icon={<CalendarPlus className="size-5" strokeWidth={1.5} />}
          title="No milestones yet. Add your first checkpoint on the way to the deadline."
          action={<Button onClick={() => setCreating(true)}>Add milestone</Button>}
        />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => void onDragEnd(e)}>
          <SortableContext items={milestones.map((m) => m.id)} strategy={verticalListSortingStrategy}>
            <ol className="relative space-y-3 border-l border-hairline pl-6">
              {milestones.map((m, i) => (
                <SortableMilestone
                  key={m.id}
                  index={i}
                  milestone={m}
                  tasks={tasksFor(m.id)}
                  issues={checks!.byId.get(m.id)}
                  onEdit={() => setEditing(m)}
                  onDelete={() => void remove(m)}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}

      {meta && (meta.risks.length > 0 || meta.recoveryStrategy || meta.dailyRitual) && (
        <section className="mt-10 grid gap-3 sm:grid-cols-3" aria-label="Plan notes">
          {meta.risks.length > 0 && (
            <div className="card p-4">
              <p className="eyebrow mb-2">Risks</p>
              <ul className="space-y-1.5 text-sm text-text">
                {meta.risks.map((r) => (
                  <li key={r} className="flex gap-2">
                    <span className="text-accent-text" aria-hidden>
                      ·
                    </span>
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {meta.recoveryStrategy && (
            <div className="card p-4">
              <p className="eyebrow mb-2">If you fall behind</p>
              <p className="text-sm">{meta.recoveryStrategy}</p>
            </div>
          )}
          {meta.dailyRitual && (
            <div className="card p-4">
              <p className="eyebrow mb-2">Daily ritual</p>
              <p className="text-sm">{meta.dailyRitual}</p>
            </div>
          )}
        </section>
      )}

      {/* Sticky approve bar */}
      <div className="sticky bottom-20 z-30 mt-10 rounded-[20px] border border-hairline bg-bg/95 shadow-[0_-12px_32px_-16px_rgba(0,0,0,0.6)] backdrop-blur md:bottom-4">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <p className="text-xs text-muted sm:text-sm" aria-live="polite">
            {checks!.hardCount > 0 ? (
              <span className="text-danger">
                {checks!.hardCount} issue{checks!.hardCount === 1 ? '' : 's'} to fix
              </span>
            ) : (
              <>
                <span className="tabular whitespace-nowrap">
                  <span className="font-medium text-text">{meta?.totalEstimatedHours ?? 0}</span>
                  {meta?.capacity && <> of {meta.capacity.capacityHours}</>} h planned
                </span>
              </>
            )}
          </p>
          {isActive ? (
            <Button
              onClick={() => navigate(`/goals/${goal.id}`)}
              icon={<Check className="size-4" strokeWidth={2} />}
            >
              Done
            </Button>
          ) : (
            <Button
              onClick={() => void approve()}
              loading={approving}
              disabled={milestones.length === 0}
              size="lg"
              icon={<ShieldCheck className="size-5" strokeWidth={1.5} />}
            >
              Approve plan
            </Button>
          )}
        </div>
      </div>

      <MilestoneEditor
        open={!!editing || creating}
        onOpenChange={(o) => {
          if (!o) {
            setEditing(null);
            setCreating(false);
          }
        }}
        goalId={goal.id}
        milestone={editing}
        tasks={editing ? tasksFor(editing.id) : []}
        defaultDate={milestones.at(-1)?.target_date ?? checks!.deadlineKey}
        minDate={minDate}
        maxDate={checks!.deadlineKey}
      />
    </div>
  );
}

function FeasibilityPanel({
  goal,
  onFix,
  regenerates,
}: {
  goal: GoalRow;
  onFix: (k: 'extend-deadline' | 'add-hours' | 'reduce-scope') => void;
  regenerates: boolean;
}) {
  const meta = goal.plan_meta!;
  const [open, setOpen] = useState(false);
  const code = meta.code;
  const showFixes = code.feasibility !== 'Achievable' && meta.totalEstimatedHours > 0;
  return (
    <section className="card mt-6 p-5" aria-label="Feasibility">
      <div className="flex flex-wrap items-center gap-2">
        <FeasibilityBadge value={code.feasibility} prefix="Our check:" />
        {meta.modelFeasibility && <FeasibilityBadge value={meta.modelFeasibility} prefix="Gemini:" />}
      </div>
      <p className="mt-3 text-sm text-text">{code.reason}</p>
      {meta.modelFeasibility && !meta.agrees && (
        <p className="mt-2 text-sm text-muted">
          Gemini rated this <strong className="text-text">{meta.modelFeasibility}</strong>; we show our own
          number-based result because it's computed from your real hours and dates.
          {meta.modelReason && <span className="block pt-1 italic">Gemini said: "{meta.modelReason}"</span>}
        </p>
      )}
      {meta.modelFeasibility && meta.agrees && meta.modelReason && (
        <p className="mt-2 text-sm text-muted">Gemini agrees: {meta.modelReason}</p>
      )}

      {showFixes && (
        <div className="mt-4 flex flex-wrap gap-2">
          {meta.fixes?.extendTo && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onFix('extend-deadline')}
              icon={<CalendarPlus className="size-4" strokeWidth={1.5} />}
            >
              Extend to {shortDate(meta.fixes.extendTo)}
            </Button>
          )}
          {meta.fixes?.hoursPerDay && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onFix('add-hours')}
              icon={<Hourglass className="size-4" strokeWidth={1.5} />}
            >
              Work {meta.fixes.hoursPerDay} h/day
            </Button>
          )}
          {regenerates && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onFix('reduce-scope')}
              icon={<Scissors className="size-4" strokeWidth={1.5} />}
            >
              Reduce scope
            </Button>
          )}
        </div>
      )}
      {showFixes && regenerates && (
        <p className="mt-2 text-xs text-muted">Each fix asks Gemini for a new plan with the new settings.</p>
      )}
      {showFixes && !regenerates && goal.status === 'active' && (
        <p className="mt-2 text-xs text-muted">
          Your plan is approved, so a fix only changes your deadline or hours. Your progress stays. Ask the
          coach to rebalance the milestones.
        </p>
      )}

      {meta.checks.length > 0 && (
        <div className="mt-4 border-t border-hairline pt-3">
          <button
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="flex min-h-11 items-center gap-2 text-sm text-muted hover:text-text"
          >
            <ShieldCheck className="size-4 text-success" strokeWidth={1.5} aria-hidden />
            {meta.checks.filter((c) => c.ok).length}/{meta.checks.length} code checks passed
            {meta.repaired ? ' (after one automatic repair)' : ''}
            <ChevronDown
              className={cn('size-4 transition-transform', open && 'rotate-180')}
              strokeWidth={1.5}
              aria-hidden
            />
          </button>
          {open && (
            <ul className="mt-2 space-y-2">
              {meta.checks.map((c) => (
                <li key={c.id} className="flex gap-2 text-sm">
                  {c.ok ? (
                    <Check
                      className="mt-0.5 size-4 shrink-0 text-success"
                      strokeWidth={2}
                      aria-label="Passed"
                    />
                  ) : (
                    <TriangleAlert
                      className="mt-0.5 size-4 shrink-0 text-warning"
                      strokeWidth={1.5}
                      aria-label="Needs attention"
                    />
                  )}
                  <span>
                    <span className="text-text">{c.label}.</span>{' '}
                    <span className="text-muted">{c.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function SortableMilestone({
  milestone: m,
  tasks,
  issues,
  index,
  onEdit,
  onDelete,
}: {
  milestone: MilestoneRow;
  tasks: TaskRow[];
  issues?: MilestoneIssues;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: m.id });
  const [expanded, setExpanded] = useState(false);
  const hard = issues?.hard ?? [];
  const soft = issues?.soft ?? [];
  return (
    <motion.li
      ref={setNodeRef}
      layout="position"
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'card relative p-4',
        isDragging && 'z-10 border-accent shadow-2xl',
        hard.length > 0 && 'border-danger/50',
      )}
    >
      <span
        className={cn(
          'absolute -left-[31px] top-6 size-2.5 rounded-full border bg-bg',
          m.status === 'completed' ? 'border-success bg-success' : 'border-gold',
        )}
        aria-hidden
      />
      <div className="flex items-start gap-2">
        <button
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Reorder milestone ${index + 1}: ${m.title}`}
          className="-ml-2 inline-flex size-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-xl text-muted hover:text-text active:cursor-grabbing"
        >
          <GripVertical className="size-5" strokeWidth={1.5} />
        </button>
        <div className="min-w-0 flex-1 pt-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {m.status === 'completed' ? (
              <CompletedBadge />
            ) : m.approved_at ? (
              <ApprovedBadge />
            ) : m.source === 'ai' ? (
              <AiBadge />
            ) : null}
            {m.edited && <EditedBadge />}
            {m.source === 'user' && !m.edited && <span className="text-[11px] text-muted">Added by you</span>}
          </div>
          <h3 className="mt-2 font-sans text-base font-semibold leading-snug">{m.title}</h3>
          {m.description && <p className="mt-1 text-sm text-muted">{m.description}</p>}
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span className="inline-flex items-center gap-1 font-mono tabular text-accent-text">
              <CalendarPlus className="size-3.5" strokeWidth={1.5} aria-hidden />
              {safeDate(m.target_date)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" strokeWidth={1.5} aria-hidden />
              {m.estimated_hours} h
            </span>
            <span>{m.difficulty}</span>
            {tasks.length > 0 && (
              <button
                onClick={() => setExpanded((e) => !e)}
                aria-expanded={expanded}
                className="inline-flex min-h-8 items-center gap-1 hover:text-text"
              >
                {tasks.length} task{tasks.length === 1 ? '' : 's'}{' '}
                <ChevronDown
                  className={cn('size-3.5 transition-transform', expanded && 'rotate-180')}
                  strokeWidth={1.5}
                  aria-hidden
                />
              </button>
            )}
          </p>
          {expanded && (
            <ul className="mt-3 space-y-1.5 border-t border-hairline pt-3">
              {tasks.map((t) => (
                <li key={t.id} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className={cn(t.done_at && 'text-muted line-through')}>{t.title}</span>
                  <span className="shrink-0 font-mono text-xs tabular text-muted">
                    {minutesLabel(t.estimated_minutes)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {(hard.length > 0 || soft.length > 0) && (
            <ul className="mt-3 space-y-1 text-xs" aria-live="polite">
              {hard.map((h) => (
                <li key={h} className="flex gap-1.5 text-danger">
                  <TriangleAlert className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
                  {h}
                </li>
              ))}
              {soft.map((h) => (
                <li key={h} className="flex gap-1.5 text-warning">
                  <TriangleAlert className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
                  {h}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex shrink-0 flex-col sm:flex-row">
          <IconButton label={`Edit ${m.title}`} onClick={onEdit}>
            <Pencil className="size-4" strokeWidth={1.5} />
          </IconButton>
          <IconButton label={`Delete ${m.title}`} onClick={onDelete}>
            <Trash2 className="size-4" strokeWidth={1.5} />
          </IconButton>
        </div>
      </div>
    </motion.li>
  );
}

function safeDate(k: string) {
  try {
    return shortDate(k);
  } catch {
    return k;
  }
}
