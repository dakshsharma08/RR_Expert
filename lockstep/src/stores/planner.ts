/**
 * In-memory state for an in-flight Gemini planning stream, keyed by goal.
 * The attachment (syllabus PDF / photo) is kept ONLY in memory: never stored, never synced.
 */
import { create } from 'zustand';
import type { IntakeInput } from '@shared/plan';

interface PlannerState {
  attachments: Record<string, IntakeInput['attachment']>;
  pendingAdjustment: Record<string, IntakeInput['adjustment']>;
  setAttachment: (goalId: string, a: IntakeInput['attachment']) => void;
  setAdjustment: (goalId: string, a: IntakeInput['adjustment']) => void;
}

export const usePlanner = create<PlannerState>()((set) => ({
  attachments: {},
  pendingAdjustment: {},
  setAttachment: (goalId, a) => set((s) => ({ attachments: { ...s.attachments, [goalId]: a } })),
  setAdjustment: (goalId, a) => set((s) => ({ pendingAdjustment: { ...s.pendingAdjustment, [goalId]: a } })),
}));
