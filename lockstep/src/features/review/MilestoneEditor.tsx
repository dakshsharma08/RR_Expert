/** Edit (or create) a milestone and its tasks. Used by Review and the Goal page. */
import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog } from '@/components/ui/dialog';
import { Button, IconButton } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/form';
import { Segmented } from '@/components/ui/controls';
import type { MilestoneRow, TaskRow } from '@/db/db';
import { addMilestone, addTask, deleteTask, restoreTask, updateMilestone, updateTask } from '@/db/repo';
import { DIFFICULTY, type Difficulty } from '@shared/plan';
import { isDayKey } from '@shared/time';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  goalId: string;
  milestone: MilestoneRow | null; // null = create
  tasks: TaskRow[];
  defaultDate: string;
  minDate: string;
  maxDate: string;
}

export function MilestoneEditor({
  open,
  onOpenChange,
  goalId,
  milestone,
  tasks,
  defaultDate,
  minDate,
  maxDate,
}: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(defaultDate);
  const [hours, setHours] = useState('4');
  const [difficulty, setDifficulty] = useState<Difficulty>('Medium');
  const [newTask, setNewTask] = useState('');
  const [newTaskMin, setNewTaskMin] = useState('30');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(milestone?.title ?? '');
    setDescription(milestone?.description ?? '');
    setDate(milestone?.target_date ?? defaultDate);
    setHours(String(milestone?.estimated_hours ?? 4));
    setDifficulty(milestone?.difficulty ?? 'Medium');
    setError(null);
  }, [open, milestone, defaultDate]);

  async function save() {
    const h = Number(hours);
    if (title.trim().length < 2) return setError('Give the milestone a title.');
    if (!isDayKey(date)) return setError('Pick a valid date.');
    if (!(h > 0 && h <= 2000)) return setError('Hours must be between 0 and 2000.');
    if (milestone) {
      const patch: Parameters<typeof updateMilestone>[1] = {};
      if (title.trim() !== milestone.title) patch.title = title.trim().slice(0, 120);
      if (description.trim() !== milestone.description) patch.description = description.trim().slice(0, 600);
      if (date !== milestone.target_date) patch.target_date = date;
      if (h !== milestone.estimated_hours) patch.estimated_hours = h;
      if (difficulty !== milestone.difficulty) patch.difficulty = difficulty;
      if (Object.keys(patch).length) {
        await updateMilestone(milestone.id, patch);
        toast.success('Milestone updated');
      }
    } else {
      await addMilestone(goalId, {
        title: title.trim().slice(0, 120),
        description: description.trim(),
        target_date: date,
        estimated_hours: h,
        difficulty,
      });
      toast.success('Milestone added');
    }
    onOpenChange(false);
  }

  async function addTaskRow() {
    if (!milestone || newTask.trim().length < 2) return;
    await addTask(
      milestone.id,
      newTask.trim().slice(0, 160),
      Math.min(600, Math.max(5, Number(newTaskMin) || 30)),
    );
    setNewTask('');
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={milestone ? 'Edit milestone' : 'Add milestone'}
      description={milestone?.source === 'ai' ? 'Your changes will be marked "Edited by you".' : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void save()}>{milestone ? 'Save changes' : 'Add milestone'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Title" error={error && title.trim().length < 2 ? error : undefined}>
          {({ id, invalid }) => (
            <Input
              id={id}
              aria-invalid={invalid}
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          )}
        </Field>
        <Field label="Description" optional>
          {({ id }) => (
            <Textarea
              id={id}
              value={description}
              maxLength={600}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-20"
            />
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Target date" hint={`${minDate} → ${maxDate}`}>
            {({ id, describedBy }) => (
              <Input
                id={id}
                type="date"
                aria-describedby={describedBy}
                value={date}
                min={minDate}
                max={maxDate}
                onChange={(e) => setDate(e.target.value)}
              />
            )}
          </Field>
          <Field label="Hours">
            {({ id }) => (
              <Input
                id={id}
                type="number"
                inputMode="decimal"
                min={0.5}
                step={0.5}
                value={hours}
                onChange={(e) => setHours(e.target.value)}
              />
            )}
          </Field>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Difficulty</p>
          <Segmented
            label="Difficulty"
            value={difficulty}
            onChange={setDifficulty}
            options={DIFFICULTY.map((d) => ({ value: d, label: d }))}
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        {milestone && (
          <div className="space-y-2 border-t border-hairline pt-4">
            <p className="text-sm font-medium">Tasks</p>
            <ul className="space-y-1.5">
              {tasks.map((t) => (
                <TaskEditRow key={t.id} task={t} />
              ))}
            </ul>
            <div className="flex gap-2">
              <Input
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
                placeholder="New task"
                aria-label="New task title"
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), void addTaskRow())}
              />
              <Input
                value={newTaskMin}
                onChange={(e) => setNewTaskMin(e.target.value)}
                type="number"
                min={5}
                max={600}
                className="w-24"
                aria-label="New task minutes"
              />
              <IconButton label="Add task" variant="subtle" onClick={() => void addTaskRow()}>
                <Plus className="size-4" strokeWidth={1.5} />
              </IconButton>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}

function TaskEditRow({ task }: { task: TaskRow }) {
  const [title, setTitle] = useState(task.title);
  const [min, setMin] = useState(String(task.estimated_minutes));
  useEffect(() => {
    setTitle(task.title);
    setMin(String(task.estimated_minutes));
  }, [task.title, task.estimated_minutes]);
  const commit = () => {
    const m = Math.min(600, Math.max(5, Number(min) || task.estimated_minutes));
    if (title.trim() && (title.trim() !== task.title || m !== task.estimated_minutes))
      void updateTask(task.id, { title: title.trim().slice(0, 160), estimated_minutes: m });
  };
  return (
    <li className="flex items-center gap-2">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={commit}
        aria-label="Task title"
        className="h-11"
      />
      <Input
        value={min}
        onChange={(e) => setMin(e.target.value)}
        onBlur={commit}
        type="number"
        min={5}
        max={600}
        className="h-11 w-24"
        aria-label="Task minutes"
      />
      <IconButton
        label={`Delete task ${task.title}`}
        onClick={async () => {
          const t = await deleteTask(task.id);
          if (t) toast('Task deleted', { action: { label: 'Undo', onClick: () => void restoreTask(t) } });
        }}
      >
        <Trash2 className="size-4" strokeWidth={1.5} />
      </IconButton>
    </li>
  );
}
