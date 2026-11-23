/**
 * The contract between the browser and the LOCKSTEP API.
 * Both sides import these types so they can never silently drift apart.
 */
import type { CountdownState, DstAdjustment, Pace } from './time';
import type {
  Capacity,
  FeasibilityResult,
  Feasibility,
  FixSuggestions,
  Plan,
  PlanCheck,
  PlanMilestone,
} from './plan';

export type AiKind = 'plan' | 'repair' | 'coach' | 'motivation' | 'insight' | 'background';

/** One AI call, as logged to ai_runs. Never contains prompts, keys or user text. */
export interface AiRunMeta {
  kind: AiKind;
  model: string;
  latencyMs: number;
  ok: boolean;
  tokens: number | null;
  at: string; // ISO time the call finished
}

export type ApiErrorCode =
  | 'AI_NOT_CONFIGURED'
  | 'AI_BUSY'
  | 'RATE_LIMITED'
  | 'INVALID_INPUT'
  | 'PLAN_INVALID'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'NOT_FOUND'
  | 'INTERNAL';

export interface ApiError {
  code: ApiErrorCode;
  /** Friendly, user-facing sentence. */
  message: string;
  retryable: boolean;
  /** Optional technical details safe to show (e.g. validation errors). */
  details?: string[];
}

// ───────────── GET /api/health ─────────────
export interface HealthResponse {
  ok: true;
  ai: {
    configured: boolean;
    model: string | null; // resolved default model (null until resolved / when not configured)
    heavyModel: string | null;
    imageModel: string | null; // only set when an image-capable model is confirmed to work
  };
  rateLimit: 'memory' | 'upstash';
  wallpaperStore: 'memory' | 'file' | 'upstash';
  time: string;
}

// ───────────── POST /api/plan (Server-Sent Events) ─────────────
// Request body: IntakeInput (see shared/plan.ts).
// Events (each `event: <name>\ndata: <json>\n\n`):
export interface PlanStatusEvent {
  phase: 'thinking' | 'streaming' | 'validating' | 'repairing' | 'done';
  message: string;
}
export interface PlanFeasibilityEvent {
  feasibility: Feasibility;
  feasibilityReason: string;
}
/** A milestone parsed from the partial stream. Preview only — final data comes in `result`. */
export interface PlanMilestoneEvent {
  index: number;
  milestone: PlanMilestone;
}
export interface PlanResult {
  plan: Plan;
  checks: PlanCheck[];
  capacity: Capacity;
  code: FeasibilityResult;
  model: { feasibility: Feasibility; reason: string } | null;
  agrees: boolean;
  fixes: FixSuggestions;
  repaired: boolean;
  deadlineUtc: string;
  dst: { adjustment: DstAdjustment; note?: string };
  todayKey: string;
  runs: AiRunMeta[];
}
export type PlanStreamEvent =
  | { event: 'status'; data: PlanStatusEvent }
  | { event: 'feasibility'; data: PlanFeasibilityEvent }
  | { event: 'milestone'; data: PlanMilestoneEvent }
  | { event: 'result'; data: PlanResult }
  | { event: 'error'; data: ApiError };

// ───────────── POST /api/motivation ─────────────
export interface MotivationRequest {
  goal: string;
  daysLeft: number;
  percentDone: number; // 0–100
  nextMilestone: string | null;
  streak: number;
  pace: Pace;
  state: CountdownState;
  dateKey: string;
}
export interface MotivationResponse {
  line: string;
  run: AiRunMeta;
}

// ───────────── POST /api/coach ─────────────
export type CoachChip = 'on-track' | 'today' | 'replan' | 'lighten' | 'improve';

export interface CoachMilestoneContext {
  id: string;
  title: string;
  targetDate: string;
  estimatedHours: number;
  status: 'pending' | 'approved' | 'completed';
  tasksDone: number;
  tasksTotal: number;
  tasks?: { title: string; done: boolean; estimatedMinutes: number }[];
}

export interface CoachContext {
  goal: {
    title: string;
    deadlineUtc: string;
    timezone: string;
    hoursPerDay: number;
    workingDays: number[];
    pace: string;
  };
  todayKey: string;
  milestones: CoachMilestoneContext[];
  progress: {
    percentDone: number;
    timePct: number;
    pace: Pace;
    streak: number;
    minutesLast7Days: number;
    daysLeft: number;
  };
}

export interface CoachRequest {
  message: string;
  chip?: CoachChip;
  context: CoachContext;
  history?: { role: 'user' | 'model'; text: string }[];
}

export interface RescheduleChange {
  milestoneId: string;
  title: string;
  oldDate: string;
  newDate: string;
  oldHours: number;
  newHours: number;
}

export interface CoachProposal {
  summary: string;
  changes: RescheduleChange[];
  /** Server-side validation of the proposal against the same rules as plans. */
  valid: boolean;
  errors: string[];
}

export interface CoachResponse {
  reply: string;
  proposal: CoachProposal | null;
  /** Which tools Gemini called, for transparency. */
  toolCalls: string[];
  runs: AiRunMeta[];
}

// ───────────── POST /api/insights/weekly ─────────────
export interface WeeklyInsightRequest {
  goal: string;
  weekStartKey: string;
  plannedMinutes: number;
  actualMinutes: number;
  tasksCompleted: number;
  milestonesCompleted: number;
  streak: number;
  pace: Pace;
  daysLeft: number;
}
export interface WeeklyInsightResponse {
  summary: string;
  run: AiRunMeta;
}

// ───────────── Living Wallpaper (POST/PUT/DELETE /api/wallpaper, GET /api/wallpaper/:token.png) ─────────────
/**
 * What the server needs to redraw today's wallpaper on its own. The server recomputes
 * days left / Day X of Y / next milestone from the clock every time the URL is fetched;
 * progress updates whenever the app re-publishes the snapshot.
 */
export interface WallpaperSnapshot {
  goalTitle: string;
  deadlineUtc: string;
  startUtc: string;
  timezone: string;
  completed: boolean;
  progressPct: number; // 0..1
  motivation: string | null;
  milestones: { title: string; targetDate: string; done: boolean }[];
}
export interface LivingWallpaperCreateRequest {
  design: unknown; // WallpaperDesign (validated + normalized server-side)
  snapshot: WallpaperSnapshot;
}
export interface LivingWallpaperCreateResponse {
  token: string; // unguessable, in the URL
  secret: string; // edit/revoke key, kept only on the device that created it
  url: string; // absolute URL of today's PNG
}

// ───────────── POST /api/background (only when HealthResponse.ai.imageModel is set) ─────────────
export interface BackgroundRequestBody {
  theme: 'champagne-gold' | 'ivory' | 'monochrome' | 'midnight-sapphire' | 'rose-gold' | 'emerald-noir';
  mood: 'calm' | 'focused' | 'bold';
}
export interface BackgroundResponse {
  image: string; // data: URL (PNG/JPEG), abstract and text-free
  model: string;
  run: AiRunMeta;
}
