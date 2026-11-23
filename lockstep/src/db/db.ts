/**
 * Local-first database (IndexedDB via Dexie).
 *
 * Why local-first? The app works fully as a guest, offline, with no account.
 * Everything lives in the browser. Optional cloud sync (Supabase) mirrors the same
 * tables later; `updated_at` on every row enables last-write-wins sync.
 */
import Dexie, { type EntityTable } from 'dexie';
import type {
  Capacity,
  FeasibilityResult,
  Feasibility,
  FixSuggestions,
  Level,
  PaceStyle,
  PlanCheck,
  Difficulty,
} from '@shared/plan';
import type { AiKind } from '@shared/api';
import type { WallpaperDesign } from '@shared/wallpaper/types';

export type GoalStatus = 'planning' | 'review' | 'active' | 'completed' | 'archived';
export type MilestoneStatus = 'pending' | 'approved' | 'completed';
export type Source = 'ai' | 'user';

/** What the user typed in the wizard (kept so we can regenerate or apply one-tap fixes). */
export interface StoredIntake {
  goal: string;
  deadlineDate: string;
  deadlineTime: string;
  timezone: string;
  level: Level;
  hoursPerDay: number;
  workingDays: number[];
  constraints: string;
  pace: PaceStyle;
}

export interface PlanMeta {
  source: 'ai' | 'manual';
  modelFeasibility: Feasibility | null;
  modelReason: string | null;
  code: FeasibilityResult;
  agrees: boolean;
  checks: PlanCheck[];
  capacity: Capacity | null;
  fixes: FixSuggestions | null;
  risks: string[];
  recoveryStrategy: string;
  dailyRitual: string;
  totalEstimatedHours: number;
  /** Hours the complete goal needs when Gemini had to trim the plan to fit (else null). */
  fullScopeHours?: number | null;
  generatedAt: string | null;
  model: string | null;
  repaired: boolean;
}

export interface GoalRow {
  id: string;
  user_id: string | null;
  title: string;
  deadline_utc: string;
  timezone: string;
  start_utc: string;
  status: GoalStatus;
  pace_style: PaceStyle;
  hours_per_day: number;
  working_days: number[];
  constraints: string;
  level: Level;
  intake: StoredIntake;
  dst_note: string | null;
  plan_meta: PlanMeta | null;
  approved_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface MilestoneRow {
  id: string;
  goal_id: string;
  title: string;
  description: string;
  target_date: string; // YYYY-MM-DD in the goal's zone
  estimated_hours: number;
  difficulty: Difficulty;
  order: number;
  source: Source;
  edited: boolean;
  status: MilestoneStatus;
  approved_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskRow {
  id: string;
  milestone_id: string;
  goal_id: string;
  title: string;
  estimated_minutes: number;
  order: number;
  source: Source;
  edited: boolean;
  done_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProgressLogRow {
  id: string;
  goal_id: string;
  date: string; // YYYY-MM-DD in goal zone
  minutes: number;
  note: string;
  task_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface WallpaperRow {
  id: string;
  goal_id: string;
  name: string;
  design_json: WallpaperDesign;
  device_preset: string;
  share_token: string | null;
  share_secret: string | null;
  share_url: string | null;
  revoked_at: string | null;
  thumb: string | null; // small data URL for the library grid
  created_at: string;
  updated_at: string;
}

export interface AiRunRow {
  id: string;
  user_id: string | null;
  goal_id: string | null;
  kind: AiKind;
  model: string;
  latency_ms: number;
  ok: boolean;
  tokens: number | null;
  created_at: string;
}

/** Uploaded background images live here as Blobs so they never taint the canvas. */
export interface ImageRow {
  id: string;
  blob: Blob;
  name: string;
  created_at: string;
}

export interface KvRow {
  key: string;
  value: unknown;
  updated_at: string;
}

export class LockstepDB extends Dexie {
  goals!: EntityTable<GoalRow, 'id'>;
  milestones!: EntityTable<MilestoneRow, 'id'>;
  tasks!: EntityTable<TaskRow, 'id'>;
  progress_logs!: EntityTable<ProgressLogRow, 'id'>;
  wallpapers!: EntityTable<WallpaperRow, 'id'>;
  ai_runs!: EntityTable<AiRunRow, 'id'>;
  images!: EntityTable<ImageRow, 'id'>;
  kv!: EntityTable<KvRow, 'key'>;

  constructor(name = 'lockstep') {
    super(name);
    this.version(1).stores({
      goals: 'id, status, updated_at, created_at',
      milestones: 'id, goal_id, [goal_id+order], updated_at',
      tasks: 'id, milestone_id, goal_id, updated_at',
      progress_logs: 'id, goal_id, [goal_id+date], date, task_id',
      wallpapers: 'id, goal_id, share_token, updated_at',
      ai_runs: 'id, created_at, kind, goal_id',
      images: 'id',
      kv: 'key',
    });
  }
}

export const db = new LockstepDB();

export const nowIso = () => new Date().toISOString();
export const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
