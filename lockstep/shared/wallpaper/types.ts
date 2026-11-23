/**
 * LOCKSTEP wallpaper: shared types.
 *
 * Key ideas (for learners):
 * - The SAME renderer runs in the browser (preview + export) and on the server
 *   (the "Living Wallpaper" URL, via @napi-rs/canvas). The two canvas libraries
 *   have different TypeScript types, so instead of importing either one we
 *   describe the small slice of the Canvas 2D API we actually use (`Ctx2D`).
 *   Both real contexts match that shape, so both can be passed in.
 * - A `WallpaperDesign` is plain JSON (safe to store in IndexedDB or a URL).
 *   A `WallpaperData` is the live goal numbers the design is filled with.
 */

export type TemplateId =
  'monolith' | 'orbit' | 'ledger' | 'constellation' | 'aurora' | 'grain' | 'minimal-mono' | 'ivory-paper';
export type ThemeId =
  'champagne-gold' | 'ivory' | 'monochrome' | 'midnight-sapphire' | 'rose-gold' | 'emerald-noir';
export type DeviceId =
  'iphone-se' | 'iphone' | 'iphone-pro' | 'iphone-pro-max' | 'pixel' | 'galaxy-s' | 'android-1080' | 'custom';
export type FontId = 'fraunces' | 'instrument-serif' | 'inter' | 'geist-mono';
export type ElementId =
  | 'goalTitle'
  | 'daysLeft'
  | 'dayOfTotal'
  | 'targetDate'
  | 'nextMilestone'
  | 'progress'
  | 'motivation'
  | 'updatedStamp';

export type Align = 'left' | 'center' | 'right';
export type Position = 'auto' | 'upper' | 'middle' | 'lower';

/** Every element, in reading order. Handy for UI toggles and tests. */
export const ELEMENT_IDS: readonly ElementId[] = [
  'goalTitle',
  'daysLeft',
  'dayOfTotal',
  'targetDate',
  'nextMilestone',
  'progress',
  'motivation',
  'updatedStamp',
];

/** Fractions of the screen HEIGHT, as [top, bottom]. */
export interface SafeZones {
  statusBar: [number, number];
  clock: [number, number];
  widgets: [number, number];
  notifications: [number, number];
  bottomControls: [number, number];
}

export interface DevicePreset {
  id: DeviceId;
  label: string;
  /** Which phone the size comes from, e.g. "iPhone 17 · 6.3″". */
  detail: string;
  width: number;
  height: number;
  platform: 'ios' | 'android';
  safe: SafeZones;
  /** Fractions: where wallpaper content may go (top/bottom of height, side of width). */
  content: { top: number; bottom: number; side: number };
}

export interface WallpaperData {
  goalTitle: string;
  daysLeft: number;
  state: 'upcoming' | 'active' | 'due-today' | 'completed' | 'expired';
  dayNumber: number;
  totalDays: number;
  deadlineLabel: string;
  nextMilestone: { title: string; dateLabel: string } | null;
  progressPct: number; // 0..1
  motivation: string | null;
  updatedLabel: string; // e.g. "Updated 23 Nov"
  /** Optional: whole days until the goal starts (state 'upcoming'). Derived from daysLeft/totalDays when missing. */
  startsInDays?: number;
  /**
   * Optional: every milestone placed on the goal's timeline, for the Constellation template.
   * `at` is the position along the timeline (0 = start, 1 = deadline).
   */
  milestones?: { title: string; at: number; done: boolean }[];
}

export interface WallpaperDesign {
  version: 1;
  template: TemplateId;
  theme: ThemeId;
  device: DeviceId;
  custom?: { width: number; height: number };
  typography: {
    display: FontId;
    ui: FontId;
    numbers: FontId;
    scale: number; // 0.7–1.4
    weight: number; // 300–800 (weight of the big numeral)
    tracking: number; // em, -0.05..0.3 (letter spacing of the small-caps labels)
    align: Align;
  };
  colors: { accent?: string; text?: string };
  background: {
    kind: 'theme' | 'gradient' | 'image';
    gradient?: { from: string; to: string; angle: number };
    image?: {
      src: string;
      blur: number /*0–40 px at 1080w*/;
      dim: number /*0–0.9*/;
      zoom: number /*1–3*/;
      x: number /*-1..1*/;
      y: number; /*-1..1*/
    };
    grain: number; // 0–1
  };
  layout: { position: Position };
  text: { custom: string; source: 'motivation' | 'custom' | 'none' };
  show: Record<ElementId, boolean>;
}

export interface ReadabilityWarning {
  element: ElementId;
  contrast: number;
  fixed: boolean;
  message: string;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RenderReport {
  warnings: ReadabilityWarning[];
  boxes: { element: ElementId; x: number; y: number; w: number; h: number }[];
  width: number;
  height: number;
}

// ───────────────────────── Minimal canvas surface ─────────────────────────
// Only what the renderer uses. Methods are written in "method" style on purpose:
// TypeScript checks method parameters loosely (bivariantly), which is what lets
// both the browser's and @napi-rs/canvas's contexts be assigned to `Ctx2D`.

export interface GradientLike {
  addColorStop(offset: number, color: string): void;
}
/** A canvas pattern. We never call anything on it, we only assign it to fillStyle. */
export type PatternLike = object;
export type PaintStyle = string | GradientLike | PatternLike;

export interface TextMetricsLike {
  width: number;
  actualBoundingBoxAscent: number;
  actualBoundingBoxDescent: number;
  actualBoundingBoxLeft: number;
  actualBoundingBoxRight: number;
}

export interface ImageDataLike {
  /** RGBA bytes (a Uint8ClampedArray in practice; typed loosely so napi's ImageData also fits). */
  readonly data: { readonly length: number; [index: number]: number };
  readonly width: number;
  readonly height: number;
}

/** Anything drawImage accepts and that knows its size (canvas, image, bitmap). */
export interface ImageLike {
  readonly width: number;
  readonly height: number;
}

export interface Ctx2D {
  fillStyle: PaintStyle;
  strokeStyle: PaintStyle;
  globalAlpha: number;
  globalCompositeOperation: string;
  lineWidth: number;
  lineCap: 'butt' | 'round' | 'square';
  lineJoin: 'bevel' | 'round' | 'miter';
  font: string;
  textAlign: 'left' | 'right' | 'center' | 'start' | 'end';
  textBaseline: 'top' | 'hanging' | 'middle' | 'alphabetic' | 'ideographic' | 'bottom';
  imageSmoothingEnabled: boolean;
  imageSmoothingQuality: 'low' | 'medium' | 'high';

  save(): void;
  restore(): void;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  translate(x: number, y: number): void;
  rotate(angle: number): void;
  scale(x: number, y: number): void;

  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(
    x: number,
    y: number,
    radius: number,
    startAngle: number,
    endAngle: number,
    counterclockwise?: boolean,
  ): void;
  ellipse(
    x: number,
    y: number,
    radiusX: number,
    radiusY: number,
    rotation: number,
    startAngle: number,
    endAngle: number,
    counterclockwise?: boolean,
  ): void;
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
  rect(x: number, y: number, w: number, h: number): void;
  fill(): void;
  stroke(): void;
  clip(): void;
  setLineDash(segments: number[]): void;

  fillRect(x: number, y: number, w: number, h: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): TextMetricsLike;

  createLinearGradient(x0: number, y0: number, x1: number, y1: number): GradientLike;
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): GradientLike;
  createPattern(image: unknown, repetition: string | null): PatternLike | null;

  drawImage(image: unknown, dx: number, dy: number): void;
  drawImage(image: unknown, dx: number, dy: number, dw: number, dh: number): void;
  drawImage(
    image: unknown,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void;

  getImageData(sx: number, sy: number, sw: number, sh: number): ImageDataLike;
  createImageData(sw: number, sh: number): ImageDataLike;
  putImageData(imageData: ImageDataLike, dx: number, dy: number): void;
}

/** An offscreen canvas: a browser <canvas>/OffscreenCanvas or an @napi-rs/canvas Canvas. */
export interface Layer {
  width: number;
  height: number;
  getContext(contextId: '2d'): Ctx2D | null;
}

/** Makes offscreen layers. The browser passes one that builds <canvas> elements; the server passes napi's createCanvas. */
export type CanvasFactory = (width: number, height: number) => Layer;
