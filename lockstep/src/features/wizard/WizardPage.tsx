/**
 * Goal wizard — 4 steps: What → When → Your time → Anything else.
 * Drafts autosave to localStorage, so closing the tab never loses typing.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Sparkles, Wand2, PenLine, Globe2, CalendarClock } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/form';
import { ChoiceChips, Segmented, Slider, WeekdayToggles } from '@/components/ui/controls';
import { ProgressBar } from '@/components/ui/misc';
import { getHealth } from '@/lib/api';
import { createGoalDraft, startManualPlan, setActiveGoal } from '@/db/repo';
import { usePlanner } from '@/stores/planner';
import type { StoredIntake } from '@/db/db';
import {
  LEVELS,
  LIMITS,
  PACES,
  MAX_HORIZON_DAYS,
  allowedMilestoneDates,
  computeCapacity,
  IntakeSchema,
  type IntakeInput,
} from '@shared/plan';
import {
  addDays,
  dayKey,
  deviceTimeZone,
  formatInZone,
  isValidTimeZone,
  listTimeZones,
  localToUtcIso,
  zoneLabel,
  computeCountdown,
} from '@shared/time';
import { SAMPLE_GOALS } from './samples';
import { useUi } from '@/stores/ui';
import { AttachmentPicker } from './AttachmentPicker';
import { VoiceButton } from './VoiceButton';

const DRAFT_KEY = 'lockstep-wizard-draft';
/** Marker for a deadline beyond the planning horizon (skips the day-by-day maths). */
const TOO_FAR = { tooFar: true, past: false, plannableDays: 0 } as const;
const STEPS = ['Goal', 'Deadline', 'Your time', 'Details'] as const;

function preferredZone(): string {
  const pref = useUi.getState().defaultTimezone;
  return pref && isValidTimeZone(pref) ? pref : deviceTimeZone();
}

function defaultDraft(): StoredIntake {
  const tz = preferredZone();
  const today = dayKey(Date.now(), tz);
  return {
    goal: '',
    deadlineDate: addDays(today, 30),
    deadlineTime: '18:00',
    timezone: tz,
    level: 'Beginner',
    hoursPerDay: 2,
    workingDays: [1, 2, 3, 4, 5],
    constraints: '',
    pace: 'Balanced',
  };
}

function loadDraft(): StoredIntake {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) return { ...defaultDraft(), ...(JSON.parse(raw) as Partial<StoredIntake>) };
  } catch {
    /* ignore */
  }
  return defaultDraft();
}

export default function WizardPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [draft, setDraft] = useState<StoredIntake>(loadDraft);
  const [errors, setErrors] = useState<Partial<Record<keyof StoredIntake, string>>>({});
  const [attachment, setAttachment] = useState<IntakeInput['attachment']>();
  const [busy, setBusy] = useState(false);
  const setPlannerAttachment = usePlanner((s) => s.setAttachment);
  const health = useQuery({ queryKey: ['health'], queryFn: getHealth, staleTime: 30_000 });
  const aiReady = health.data?.ai.configured === true;

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* storage blocked — fine */
    }
  }, [draft]);

  const update = <K extends keyof StoredIntake>(k: K, v: StoredIntake[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  // Live deadline preview + capacity, recomputed in code as the user types.
  const preview = useMemo(() => {
    if (!isValidTimeZone(draft.timezone)) return null;
    // Don't walk millions of days for a typo like year 9999: validation reports it instead.
    if (draft.deadlineDate > addDays(dayKey(Date.now(), draft.timezone), MAX_HORIZON_DAYS + 1))
      return TOO_FAR;
    try {
      const conv = localToUtcIso(draft.deadlineDate, draft.deadlineTime, draft.timezone);
      const now = Date.now();
      const c = computeCountdown({
        nowMs: now,
        startUtc: new Date(now).toISOString(),
        deadlineUtc: conv.iso,
        timezone: draft.timezone,
      });
      const cap = computeCapacity({
        todayKey: dayKey(now, draft.timezone),
        deadlineUtc: conv.iso,
        timezone: draft.timezone,
        hoursPerDay: draft.hoursPerDay,
        workingDays: draft.workingDays,
      });
      return {
        conv,
        c,
        cap,
        past: conv.utc.getTime() <= now,
        tooFar: (draft.deadlineDate > addDays(dayKey(now, draft.timezone), MAX_HORIZON_DAYS)) as boolean,
        plannableDays: allowedMilestoneDates(cap).length,
      };
    } catch {
      return null;
    }
  }, [draft]);

  function validateStep(s: number): boolean {
    const e: typeof errors = {};
    if (s === 0) {
      const g = draft.goal.trim();
      if (g.length < 3) e.goal = 'Describe your goal in a few words.';
      if (g.length > LIMITS.goalChars) e.goal = `Keep it under ${LIMITS.goalChars} characters.`;
    }
    if (s === 1) {
      if (!isValidTimeZone(draft.timezone)) e.timezone = 'Pick a time zone from the list.';
      else if (!preview) e.deadlineDate = 'Enter a real date and time.';
      else if (preview.past) e.deadlineDate = 'The deadline has to be in the future.';
      else if (preview.tooFar || !('cap' in preview))
        e.deadlineDate = 'Pick a deadline within the next 3 years.';
    }
    if (s === 2) {
      if (draft.workingDays.length === 0) e.workingDays = 'Pick at least one working day.';
      else if (preview && !preview.past && preview.plannableDays === 0)
        e.workingDays =
          'None of these working days fall between today and the deadline. Add a day or move the deadline.';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const next = () => {
    if (!validateStep(step)) return;
    setDir(1);
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };
  const back = () => {
    setDir(-1);
    setStep((s) => Math.max(0, s - 1));
  };

  function trySample() {
    const sample = SAMPLE_GOALS[Math.floor(Math.random() * SAMPLE_GOALS.length)]!;
    const tz = preferredZone();
    const today = dayKey(Date.now(), tz);
    setDraft({
      goal: sample.goal,
      deadlineDate: addDays(today, sample.daysOut),
      deadlineTime: sample.time,
      timezone: tz,
      level: sample.level,
      hoursPerDay: sample.hoursPerDay,
      workingDays: sample.workingDays,
      constraints: sample.constraints,
      pace: sample.pace,
    });
    setErrors({});
    toast.success('Sample goal filled in', {
      description: aiReady
        ? 'Gemini will still plan it for real. Edit anything you like.'
        : 'Edit anything you like.',
    });
  }

  async function submit(mode: 'ai' | 'manual') {
    for (let s = 0; s < STEPS.length; s++) {
      if (!validateStep(s)) {
        setStep(s);
        return;
      }
    }
    const parsed = IntakeSchema.safeParse({ ...draft, attachment });
    if (!parsed.success) {
      toast.error('Please check your answers', { description: parsed.error.issues[0]?.message });
      return;
    }
    setBusy(true);
    try {
      const goal = await createGoalDraft(draft);
      await setActiveGoal(goal.id);
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* ignore */
      }
      if (mode === 'manual') {
        await startManualPlan(goal.id);
        navigate(`/goals/${goal.id}/review`);
      } else {
        setPlannerAttachment(goal.id, attachment);
        navigate(`/goals/${goal.id}/plan`);
      }
    } catch (e) {
      toast.error('Could not save your goal', { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const zones = useMemo(() => listTimeZones(), []);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-6 sm:px-6 md:pt-12">
      <div className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <p className="eyebrow">
            Step {step + 1} of {STEPS.length} · {STEPS[step]}
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={trySample}
            icon={<Wand2 className="size-4" strokeWidth={1.5} />}
          >
            Try a sample goal
          </Button>
        </div>
        <ProgressBar value={(step + 1) / STEPS.length} label="Wizard progress" />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (step < STEPS.length - 1) next();
          else void submit(aiReady ? 'ai' : 'manual');
        }}
        noValidate
      >
        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.section
            key={step}
            custom={dir}
            initial={{ opacity: 0, x: dir * 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir * -24 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            aria-labelledby="wizard-q"
            className="min-h-[340px]"
          >
            {step === 0 && (
              <div className="space-y-6">
                <h1 id="wizard-q" className="text-[28px] leading-tight sm:text-[40px]">
                  What are you working towards?
                </h1>
                <Field
                  label="Your goal"
                  error={errors.goal}
                  hint="Be specific: what will be true when you're done?"
                >
                  {({ id, describedBy, invalid }) => (
                    <div className="relative">
                      <Textarea
                        id={id}
                        aria-describedby={describedBy}
                        aria-invalid={invalid}
                        value={draft.goal}
                        maxLength={LIMITS.goalChars}
                        onChange={(e) => update('goal', e.target.value)}
                        placeholder="e.g. Pass the AWS Cloud Practitioner exam"
                        className="min-h-32 pr-14 text-lg"
                        autoFocus
                      />
                      <div className="absolute bottom-2 right-2">
                        <VoiceButton
                          onText={(t) => update('goal', (draft.goal ? draft.goal + ' ' : '') + t)}
                        />
                      </div>
                    </div>
                  )}
                </Field>
                <AttachmentPicker value={attachment} onChange={setAttachment} />
              </div>
            )}

            {step === 1 && (
              <div className="space-y-6">
                <h1 id="wizard-q" className="text-[28px] leading-tight sm:text-[40px]">
                  When is it due?
                </h1>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Deadline date" error={errors.deadlineDate}>
                    {({ id, describedBy, invalid }) => (
                      <Input
                        id={id}
                        type="date"
                        aria-describedby={describedBy}
                        aria-invalid={invalid}
                        value={draft.deadlineDate}
                        min={dayKey(Date.now(), isValidTimeZone(draft.timezone) ? draft.timezone : 'UTC')}
                        onChange={(e) => update('deadlineDate', e.target.value)}
                      />
                    )}
                  </Field>
                  <Field label="Time">
                    {({ id }) => (
                      <Input
                        id={id}
                        type="time"
                        value={draft.deadlineTime}
                        onChange={(e) => update('deadlineTime', e.target.value || '00:00')}
                      />
                    )}
                  </Field>
                </div>
                <Field
                  label="Time zone"
                  error={errors.timezone}
                  hint="We count days in this zone, so travelling never shifts your deadline."
                >
                  {({ id, describedBy, invalid }) => (
                    <div className="relative">
                      <Globe2
                        className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted"
                        strokeWidth={1.5}
                        aria-hidden
                      />
                      <Input
                        id={id}
                        list="tz-list"
                        aria-describedby={describedBy}
                        aria-invalid={invalid}
                        className="pl-11"
                        value={draft.timezone}
                        onChange={(e) => update('timezone', e.target.value.trim())}
                        autoComplete="off"
                        spellCheck={false}
                      />
                      <datalist id="tz-list">
                        {zones.map((z) => (
                          <option key={z} value={z} />
                        ))}
                      </datalist>
                    </div>
                  )}
                </Field>
                {preview && 'cap' in preview && !preview.past && (
                  <div className="card flex items-start gap-3 p-4" aria-live="polite">
                    <CalendarClock
                      className="mt-0.5 size-5 shrink-0 text-accent-text"
                      strokeWidth={1.5}
                      aria-hidden
                    />
                    <div className="text-sm">
                      <p className="text-text">
                        <span className="font-mono tabular text-accent-text">{preview.c.daysLeft}</span> day
                        {preview.c.daysLeft === 1 ? '' : 's'} from today ·{' '}
                        {formatInZone(preview.conv.utc, draft.timezone)} (
                        {zoneLabel(draft.timezone, preview.conv.utc)})
                      </p>
                      {preview.conv.note && <p className="mt-1 text-warning">{preview.conv.note}</p>}
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === 2 && (
              <div className="space-y-7">
                <h1 id="wizard-q" className="text-[28px] leading-tight sm:text-[40px]">
                  How much time can you give it?
                </h1>
                <div className="space-y-2">
                  <p className="text-sm font-medium" id="level-label">
                    Your level
                  </p>
                  <ChoiceChips
                    label="Your level"
                    value={draft.level}
                    onChange={(v) => update('level', v)}
                    options={LEVELS.map((l) => ({ value: l, label: l }))}
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-baseline justify-between">
                    <p className="text-sm font-medium">Hours per working day</p>
                    <p className="font-mono tabular text-lg text-accent-text">
                      {draft.hoursPerDay.toFixed(1)} h
                    </p>
                  </div>
                  <Slider
                    label="Hours per working day"
                    value={draft.hoursPerDay}
                    min={0.5}
                    max={12}
                    step={0.5}
                    onChange={(v) => update('hoursPerDay', v)}
                    valueText={`${draft.hoursPerDay} hours`}
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Working days</p>
                  <WeekdayToggles value={draft.workingDays} onChange={(v) => update('workingDays', v)} />
                  {errors.workingDays && (
                    <p role="alert" className="text-xs text-danger">
                      {errors.workingDays}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Pace</p>
                  <Segmented
                    label="Pace"
                    value={draft.pace}
                    onChange={(v) => update('pace', v)}
                    options={PACES.map((p) => ({
                      value: p,
                      label: p,
                      hint: p === 'Steady' ? 'even + buffer' : p === 'Balanced' ? 'default' : 'front-loaded',
                    }))}
                  />
                </div>
                {preview && 'cap' in preview && !preview.past && (
                  <p className="text-sm text-muted" aria-live="polite">
                    That's <span className="font-mono tabular text-text">{preview.cap.workingDayCount}</span>{' '}
                    working days × <span className="font-mono tabular text-text">{draft.hoursPerDay}</span> h
                    ≈{' '}
                    <span className="font-mono tabular text-accent-text">
                      {preview.cap.capacityHours} hours
                    </span>{' '}
                    before your deadline.
                  </p>
                )}
              </div>
            )}

            {step === 3 && (
              <div className="space-y-6">
                <h1 id="wizard-q" className="text-[28px] leading-tight sm:text-[40px]">
                  Anything Gemini should know?
                </h1>
                <Field
                  label="Constraints"
                  optional
                  hint="Exams, travel, a busy week, resources you already have…"
                >
                  {({ id, describedBy }) => (
                    <Textarea
                      id={id}
                      aria-describedby={describedBy}
                      value={draft.constraints}
                      maxLength={LIMITS.constraintsChars}
                      onChange={(e) => update('constraints', e.target.value)}
                      placeholder="e.g. Full-time job, so evenings only. Away 12–14 Dec."
                    />
                  )}
                </Field>
                <div className="card space-y-2 p-4 text-sm">
                  <p className="eyebrow">Summary</p>
                  <p className="text-text">{draft.goal || '—'}</p>
                  {preview && 'cap' in preview && (
                    <p className="text-muted">
                      Due {formatInZone(preview.conv.utc, draft.timezone)} · {draft.level} ·{' '}
                      {draft.hoursPerDay} h/day · {draft.pace} · {preview.cap.capacityHours} h available
                    </p>
                  )}
                  {attachment && <p className="text-muted">Attached: {attachment.name}</p>}
                </div>
                {health.data && !aiReady && (
                  <div
                    role="status"
                    className="rounded-[14px] border border-warning/40 bg-warning/10 p-4 text-sm text-text"
                  >
                    <p className="font-medium">Gemini isn't connected on this server yet.</p>
                    <p className="mt-1 text-muted">
                      You can still build the plan yourself. Every rule check, the countdown and the Studio
                      work the same.
                    </p>
                  </div>
                )}
                {health.isFetched && !health.data && (
                  <div
                    role="status"
                    className="rounded-[14px] border border-warning/40 bg-warning/10 p-4 text-sm"
                  >
                    <p className="font-medium text-text">Can't reach the LOCKSTEP server right now.</p>
                    <p className="mt-1 text-muted">
                      You may be offline. You can still build the plan yourself.
                    </p>
                  </div>
                )}
              </div>
            )}
          </motion.section>
        </AnimatePresence>

        <div className="sticky bottom-20 z-10 mt-8 flex items-center justify-between gap-3 border-t border-hairline bg-bg/90 py-4 backdrop-blur md:bottom-0">
          <Button
            variant="ghost"
            onClick={back}
            disabled={step === 0}
            icon={<ArrowLeft className="size-4" strokeWidth={1.5} />}
          >
            Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button
              type="submit"
              icon={<ArrowRight className="size-4" strokeWidth={1.75} />}
              className="flex-row-reverse"
            >
              Continue
            </Button>
          ) : (
            <div className="flex flex-wrap justify-end gap-2">
              {aiReady ? (
                <>
                  <Button
                    variant="ghost"
                    onClick={() => void submit('manual')}
                    disabled={busy}
                    icon={<PenLine className="size-4" strokeWidth={1.5} />}
                  >
                    Plan it myself
                  </Button>
                  <Button
                    type="submit"
                    loading={busy}
                    icon={<Sparkles className="size-4" strokeWidth={1.75} />}
                  >
                    Plan with Gemini
                  </Button>
                </>
              ) : (
                <>
                  {health.isLoading && (
                    <Button disabled loading>
                      Checking Gemini…
                    </Button>
                  )}
                  {!health.isLoading && (
                    <Button
                      type="submit"
                      loading={busy}
                      icon={<PenLine className="size-4" strokeWidth={1.75} />}
                    >
                      Build my plan
                    </Button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
