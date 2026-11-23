/**
 * The template kit: a tiny layout system shared by every template.
 *
 * Key ideas (for learners):
 * - Sizes are designed on a reference phone 1080 px wide and 2340 px tall.
 *   `F.u` converts "reference pixels" to real pixels for the current screen, and
 *   `F.s` is the same for TYPE (it also includes the user's text-size slider).
 *   So `40 * F.s` means "40 px on the reference phone".
 * - A template is a vertical list of ROWS (a label, a rule, the big numeral…).
 *   Each row knows its height and the gap above it. `stack()` adds them up,
 *   places the whole stack in the content band (upper / middle / lower), then
 *   asks each row to produce BLOCKS at its final y.
 * - A BLOCK is one drawable thing plus its bounding box. Text blocks also carry
 *   their colour, so the renderer can check contrast against the background
 *   behind that box BEFORE anything is drawn, and add a scrim if needed.
 * - Rows are measured by CAP HEIGHT (the height of a capital letter), the way
 *   typographers set vertical rhythm, so gaps look even regardless of font.
 */
import type {
  Align,
  CanvasFactory,
  Ctx2D,
  DevicePreset,
  ElementId,
  FontId,
  Layer,
  Position,
  Rect,
  TemplateId,
  ThemeId,
  WallpaperData,
  WallpaperDesign,
} from '../types';
import type { Palette } from '../themes';
import { fontCss } from '../fonts';
import { drawTracked, ellipsize, measureTracked, wrapLines } from '../text';

// ───────────────────────────── Strings ─────────────────────────────

export interface Strings {
  goal: string;
  numeral: string;
  /** Small caps line under the numeral: "days left", "Due today", … */
  daysLabel: string;
  dayOfTotal: string;
  /** Short form, e.g. "42 / 120". */
  dayShort: string;
  /** For label/value layouts: "Day" + "42 of 120" (or "Plan" + "120 days" before the start). */
  dayKey: string;
  dayValue: string;
  target: string;
  milestoneTitle: string | null;
  milestoneDate: string | null;
  pct: number; // 0..1
  progress: string; // "35% done"
  pctText: string; // "35%"
  motivation: string | null;
  updated: string;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** All wording in one place. A wallpaper is static, so nothing here ever shows seconds. */
export function buildStrings(data: WallpaperData, design: WallpaperDesign): Strings {
  const days = Math.max(0, Math.round(data.daysLeft));
  const startsIn = Math.max(1, Math.round(data.startsInDays ?? data.daysLeft - data.totalDays + 1));
  const pct = Math.min(1, Math.max(0, Number.isFinite(data.progressPct) ? data.progressPct : 0));
  const pctRounded = Math.round(pct * 100);

  let numeral = String(days);
  let daysLabel = plural(days, 'day left', 'days left');
  let dayOfTotal = `Day ${data.dayNumber} of ${data.totalDays}`;
  let dayShort = `${data.dayNumber} / ${data.totalDays}`;
  let dayKey = 'Day';
  let dayValue = `${data.dayNumber} of ${data.totalDays}`;
  switch (data.state) {
    case 'upcoming':
      daysLabel = `Starts in ${startsIn} ${plural(startsIn, 'day', 'days')}`;
      dayOfTotal = `${data.totalDays}-day plan`;
      dayShort = `0 / ${data.totalDays}`;
      dayKey = 'Plan';
      dayValue = `${data.totalDays} ${plural(data.totalDays, 'day', 'days')}`;
      break;
    case 'due-today':
      numeral = '0';
      daysLabel = 'Due today';
      break;
    case 'expired':
      numeral = '0';
      daysLabel = 'Deadline passed';
      break;
    case 'completed':
      numeral = 'Done';
      daysLabel = 'Completed';
      break;
    default:
      break;
  }

  const rawMotivation =
    design.text.source === 'motivation'
      ? data.motivation
      : design.text.source === 'custom'
        ? design.text.custom
        : null;
  const motivation = rawMotivation?.replace(/\s+/g, ' ').trim() || null;

  return {
    goal: data.goalTitle.trim() || 'Untitled goal',
    numeral,
    daysLabel,
    dayOfTotal,
    dayShort,
    dayKey,
    dayValue,
    target: data.deadlineLabel,
    milestoneTitle: data.nextMilestone?.title.trim() || null,
    milestoneDate: data.nextMilestone?.dateLabel.trim() || null,
    pct: data.state === 'completed' ? 1 : pct,
    progress: `${data.state === 'completed' ? 100 : pctRounded}% done`,
    pctText: `${data.state === 'completed' ? 100 : pctRounded}%`,
    motivation,
    updated: data.updatedLabel,
  };
}

// ───────────────────────────── Frame ─────────────────────────────

export interface Band {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

/** Everything a template needs to lay itself out. */
export interface Frame {
  W: number;
  H: number;
  /** Reference px → real px (includes the auto-fit shrink). */
  u: number;
  /** Same for type sizes; also includes the user's scale slider. */
  s: number;
  /** Spacing unit: follows the scale slider halfway, so big text still breathes. */
  g: number;
  band: Band;
  device: DevicePreset;
  align: Align;
  position: Exclude<Position, 'auto'> | 'auto';
  fonts: { display: FontId; ui: FontId; numbers: FontId };
  /** Weight of the big numeral. */
  weight: number;
  /** Small-caps letter spacing, in em. */
  tracking: number;
  pal: Palette;
  data: WallpaperData;
  show: Record<ElementId, boolean>;
  str: Strings;
  /** Used only for measuring text. */
  measure: Ctx2D;
}

/** Shared by the background painters. */
export interface BgFrame {
  W: number;
  H: number;
  u: number;
  band: Band;
  pal: Palette;
  hasImage: boolean;
  createCanvas: (w: number, h: number) => Layer;
  str: Strings;
  data: WallpaperData;
}

export interface Block {
  /** Which wallpaper element this belongs to (undefined = pure decoration). */
  element?: ElementId;
  box: Rect;
  /** Text colour; present only for blocks that contain text (contrast-checked). */
  color?: string;
  /** Decoration that must also stay inside the safe band (e.g. a printed frame). */
  keepInside?: boolean;
  draw(ctx: Ctx2D): void;
}

export interface Row {
  /** Height used for stacking. */
  h: number;
  /** Space above this row (ignored for the first row of a stack). */
  gap: number;
  place(y: number): Block[];
}

/** x where content anchors for the current alignment. */
export function anchorX(F: Frame, align: Align = F.align): number {
  return align === 'left' ? F.band.left : align === 'right' ? F.band.right : F.W / 2;
}

/** Left/centre/right x inside a custom column. */
export function anchorIn(x0: number, x1: number, align: Align): number {
  return align === 'left' ? x0 : align === 'right' ? x1 : (x0 + x1) / 2;
}

// ───────────────────────────── Measuring ─────────────────────────────

const metricCache = new WeakMap<Ctx2D, Map<string, { cap: number; desc: number; xh: number }>>();

/** Cap height, descender depth and x-height of a font at a size, measured from real glyphs. */
export function fontMetrics(F: Frame, font: FontId, weight: number, size: number) {
  const css = fontCss(font, weight, size);
  let cache = metricCache.get(F.measure);
  if (!cache) {
    cache = new Map();
    metricCache.set(F.measure, cache);
  }
  const hit = cache.get(css);
  if (hit) return hit;
  F.measure.font = css;
  const H = F.measure.measureText('H');
  const g = F.measure.measureText('gjpqy');
  const x = F.measure.measureText('x');
  // Fallbacks for engines that don't report bounding boxes.
  const m = {
    cap: H.actualBoundingBoxAscent || size * 0.7,
    desc: g.actualBoundingBoxDescent || size * 0.22,
    xh: x.actualBoundingBoxAscent || size * 0.5,
  };
  cache.set(css, m);
  return m;
}

// ───────────────────────────── Row builders ─────────────────────────────

export interface TextOpts {
  text: string;
  font: FontId;
  size: number;
  weight: number;
  color: string;
  /** Letter spacing in em. */
  tracking?: number;
  /** Upper-case it (our small caps). */
  caps?: boolean;
  align?: Align;
  /** Anchor x (left edge / centre / right edge per align). Defaults to the band anchor. */
  x?: number;
  maxWidth?: number;
  element?: ElementId;
  gap?: number;
}

/** One line of text, ellipsized to fit. */
export function text(F: Frame, o: TextOpts): Row {
  const align = o.align ?? F.align;
  const x = o.x ?? anchorX(F, align);
  const str = o.caps ? o.text.toUpperCase() : o.text;
  const css = fontCss(o.font, o.weight, o.size);
  const tracking = (o.tracking ?? 0) * o.size;
  const { cap, desc } = fontMetrics(F, o.font, o.weight, o.size);
  F.measure.font = css;
  const line = o.maxWidth ? ellipsize(F.measure, str, o.maxWidth, tracking) : str;
  const width = measureTracked(F.measure, line, tracking);
  return {
    h: cap,
    gap: o.gap ?? 0,
    place(y) {
      const baseline = y + cap;
      const left = align === 'left' ? x : align === 'center' ? x - width / 2 : x - width;
      const pad = o.size * 0.18;
      return [
        {
          element: o.element,
          color: o.color,
          box: { x: left - pad, y: y - pad, w: width + pad * 2, h: cap + desc + pad * 2 },
          draw(ctx) {
            ctx.font = css;
            ctx.fillStyle = o.color;
            drawTracked(ctx, line, x, baseline, tracking, align);
          },
        },
      ];
    },
  };
}

export interface ParaOpts extends TextOpts {
  maxWidth: number;
  maxLines: number;
  /** Baseline-to-baseline distance as a multiple of the size. */
  leading?: number;
}

/** Wrapped text (at most `maxLines`, ellipsized). Returns null for empty text. */
export function paragraph(F: Frame, o: ParaOpts): Row | null {
  const align = o.align ?? F.align;
  const x = o.x ?? anchorX(F, align);
  const css = fontCss(o.font, o.weight, o.size);
  const tracking = (o.tracking ?? 0) * o.size;
  F.measure.font = css;
  const lines = wrapLines(
    F.measure,
    o.caps ? o.text.toUpperCase() : o.text,
    o.maxWidth,
    o.maxLines,
    tracking,
  );
  if (lines.length === 0) return null;
  const { cap, desc } = fontMetrics(F, o.font, o.weight, o.size);
  const lead = o.size * (o.leading ?? 1.28);
  const widths = lines.map((l) => measureTracked(F.measure, l, tracking));
  const maxW = Math.max(...widths);
  const h = cap + lead * (lines.length - 1);
  return {
    h,
    gap: o.gap ?? 0,
    place(y) {
      const left = align === 'left' ? x : align === 'center' ? x - maxW / 2 : x - maxW;
      const pad = o.size * 0.18;
      return [
        {
          element: o.element,
          color: o.color,
          box: { x: left - pad, y: y - pad, w: maxW + pad * 2, h: h + desc + pad * 2 },
          draw(ctx) {
            ctx.font = css;
            ctx.fillStyle = o.color;
            lines.forEach((l, i) => drawTracked(ctx, l, x, y + cap + i * lead, tracking, align));
          },
        },
      ];
    },
  };
}

export interface NumeralOpts {
  text: string;
  font: FontId;
  weight: number;
  maxSize: number;
  maxWidth: number;
  /** Optional cap on the ink height (for fitting inside a ring). */
  maxHeight?: number;
  color: string;
  tracking?: number;
  align?: Align;
  x?: number;
  element?: ElementId;
  gap?: number;
}

/** The hero number, sized to fit its width. Height = the digits' real ink height. */
export function numeral(F: Frame, o: NumeralOpts): Row & { size: number; width: number } {
  const align = o.align ?? F.align;
  const x = o.x ?? anchorX(F, align);
  const measureAt = (size: number) => {
    F.measure.font = fontCss(o.font, o.weight, size);
    const m = F.measure.measureText(o.text);
    return {
      width: measureTracked(F.measure, o.text, (o.tracking ?? 0) * size),
      asc: m.actualBoundingBoxAscent || size * 0.72,
      desc: Math.max(0, m.actualBoundingBoxDescent || 0),
    };
  };
  let size = o.maxSize;
  let m = measureAt(size);
  if (m.width > o.maxWidth) {
    size *= o.maxWidth / m.width;
    m = measureAt(size);
  }
  if (o.maxHeight && m.asc > o.maxHeight) {
    size *= o.maxHeight / m.asc;
    m = measureAt(size);
  }
  const css = fontCss(o.font, o.weight, size);
  const tracking = (o.tracking ?? 0) * size;
  const { width, asc, desc } = m;
  return {
    h: asc,
    gap: o.gap ?? 0,
    size,
    width,
    place(y) {
      const baseline = y + asc;
      const left = align === 'left' ? x : align === 'center' ? x - width / 2 : x - width;
      return [
        {
          element: o.element,
          color: o.color,
          box: { x: left, y, w: width, h: asc + desc },
          draw(ctx) {
            ctx.font = css;
            ctx.fillStyle = o.color;
            drawTracked(ctx, o.text, x, baseline, tracking, align);
          },
        },
      ];
    },
  };
}

/** A hairline rule from x0 to x1, snapped to whole pixels so it stays crisp. */
export function rule(
  F: Frame,
  o: { x0?: number; x1?: number; color?: string; weight?: number; gap?: number; double?: boolean },
): Row {
  const x0 = Math.round(o.x0 ?? F.band.left);
  const x1 = Math.round(o.x1 ?? F.band.right);
  const t = Math.max(1, Math.round((o.weight ?? 1.5) * F.u));
  const sep = Math.max(3, Math.round(6 * F.u));
  const h = o.double ? t * 2 + sep : t;
  return {
    h,
    gap: o.gap ?? 0,
    place(y) {
      const yy = Math.round(y);
      return [
        {
          box: { x: x0, y: yy, w: x1 - x0, h },
          draw(ctx) {
            ctx.fillStyle = o.color ?? F.pal.hairline;
            ctx.fillRect(x0, yy, x1 - x0, t);
            if (o.double) ctx.fillRect(x0, yy + t + sep, x1 - x0, t);
          },
        },
      ];
    },
  };
}

/** A thin progress bar: faint track + accent fill (+ optional end dot). */
export function bar(
  F: Frame,
  o: {
    x0?: number;
    x1?: number;
    pct: number;
    thickness?: number;
    track?: string;
    fill?: string;
    dot?: boolean;
    rounded?: boolean;
    gap?: number;
  },
): Row {
  const x0 = Math.round(o.x0 ?? F.band.left);
  const x1 = Math.round(o.x1 ?? F.band.right);
  const t = Math.max(1, Math.round((o.thickness ?? 2) * F.u));
  const dotR = o.dot ? Math.max(3, 5 * F.u) : 0;
  const h = Math.max(t, dotR * 2);
  return {
    h,
    gap: o.gap ?? 0,
    place(y) {
      const cy = y + h / 2;
      const fillW = (x1 - x0) * Math.min(1, Math.max(0, o.pct));
      return [
        {
          element: 'progress',
          box: { x: x0, y, w: x1 - x0, h },
          draw(ctx) {
            const top = Math.round(cy - t / 2);
            ctx.fillStyle = o.track ?? F.pal.faint;
            if (o.rounded) {
              roundRectPath(ctx, x0, top, x1 - x0, t, t / 2);
              ctx.fill();
            } else ctx.fillRect(x0, top, x1 - x0, t);
            if (fillW > 0) {
              ctx.fillStyle = o.fill ?? F.pal.accent;
              if (o.rounded) {
                roundRectPath(ctx, x0, top, Math.max(t, fillW), t, t / 2);
                ctx.fill();
              } else ctx.fillRect(x0, top, fillW, t);
            }
            if (o.dot) {
              ctx.fillStyle = o.fill ?? F.pal.accent;
              ctx.beginPath();
              ctx.arc(x0 + fillW, cy, dotR, 0, Math.PI * 2);
              ctx.fill();
            }
          },
        },
      ];
    },
  };
}

/** Rows placed at the same y (e.g. two columns). Height = tallest. */
export function beside(rows: (Row | null)[], gap = 0): Row | null {
  const list = rows.filter((r): r is Row => r !== null);
  if (list.length === 0) return null;
  return {
    h: Math.max(...list.map((r) => r.h)),
    gap,
    place: (y) => list.flatMap((r) => r.place(y)),
  };
}

/** Rows stacked inside one row (keeps a label and its value together). */
export function column(rows: (Row | null)[], gap = 0): Row | null {
  const list = rows.filter((r): r is Row => r !== null);
  if (list.length === 0) return null;
  const h = list.reduce((sum, r, i) => sum + r.h + (i === 0 ? 0 : r.gap), 0);
  return {
    h,
    gap,
    place(y) {
      let cursor = y;
      return list.flatMap((r, i) => {
        if (i > 0) cursor += r.gap;
        const out = r.place(cursor);
        cursor += r.h;
        return out;
      });
    },
  };
}

/** A fixed-size custom drawing (rings, arcs). */
export function custom(h: number, gap: number, place: (y: number) => Block[]): Row {
  return { h, gap, place };
}

/**
 * Place rows top-to-bottom inside the content band. `fallback` is used when
 * the user picked 'auto'. If the stack is taller than the band, the renderer
 * notices (the boxes overflow) and lays out again a little smaller.
 */
export function stack(F: Frame, rows: (Row | null)[], fallback: Exclude<Position, 'auto'>): Block[] {
  const list = rows.filter((r): r is Row => r !== null);
  const total = list.reduce((sum, r, i) => sum + r.h + (i === 0 ? 0 : r.gap), 0);
  const pos = F.position === 'auto' ? fallback : F.position;
  const free = F.band.height - total;
  let y = pos === 'upper' ? F.band.top : pos === 'middle' ? F.band.top + free / 2 : F.band.bottom - total;
  y = Math.max(F.band.top, y);
  const blocks: Block[] = [];
  list.forEach((r, i) => {
    if (i > 0) y += r.gap;
    blocks.push(...r.place(y));
    y += r.h;
  });
  return blocks;
}

/** Bounding box of a list of blocks (element and keep-inside blocks only, by default). */
export function boundsOf(blocks: Block[], elementsOnly = true): Rect | null {
  const list = elementsOnly ? blocks.filter((b) => b.element || b.keepInside) : blocks;
  if (list.length === 0) return null;
  const x0 = Math.min(...list.map((b) => b.box.x));
  const y0 = Math.min(...list.map((b) => b.box.y));
  const x1 = Math.max(...list.map((b) => b.box.x + b.box.w));
  const y1 = Math.max(...list.map((b) => b.box.y + b.box.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// ───────────────────────────── Drawing primitives ─────────────────────────────

/** Rounded rectangle path made of arcs (ctx.roundRect isn't available everywhere). */
export function roundRectPath(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arc(x + w - rr, y + rr, rr, -Math.PI / 2, 0);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arc(x + w - rr, y + h - rr, rr, 0, Math.PI / 2);
  ctx.lineTo(x + rr, y + h);
  ctx.arc(x + rr, y + h - rr, rr, Math.PI / 2, Math.PI);
  ctx.lineTo(x, y + rr);
  ctx.arc(x + rr, y + rr, rr, Math.PI, Math.PI * 1.5);
  ctx.closePath();
}

/** Four-point star (a slim "sparkle"), like the indices on a fine watch dial. */
export function sparklePath(ctx: Ctx2D, x: number, y: number, r: number, waist = 0.18): void {
  const w = r * waist;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x + w * 0.35, y - w * 0.35, x + r, y);
  ctx.quadraticCurveTo(x + w * 0.35, y + w * 0.35, x, y + r);
  ctx.quadraticCurveTo(x - w * 0.35, y + w * 0.35, x - r, y);
  ctx.quadraticCurveTo(x - w * 0.35, y - w * 0.35, x, y - r);
  ctx.closePath();
}

/** Small seeded random generator (mulberry32): same seed → same "random" numbers on every device. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Milestone positions for timeline drawings; evenly spaced placeholders when the data has none. */
export function timelinePoints(F: { data: WallpaperData; str: Strings }): { at: number; done: boolean }[] {
  const ms = F.data.milestones?.filter((m) => Number.isFinite(m.at)) ?? [];
  if (ms.length > 0) return ms.map((m) => ({ at: Math.min(1, Math.max(0, m.at)), done: m.done }));
  const n = 5;
  return Array.from({ length: n }, (_, i) => {
    const at = (i + 1) / n;
    return { at, done: at <= F.str.pct + 1e-6 };
  });
}

// ───────────────────────────── Shared rows ─────────────────────────────

/** Small caps label: upper-case, tracked, muted. The workhorse of every template. */
export function caps(F: Frame, t: string, o: Partial<TextOpts> = {}): Row {
  return text(F, {
    text: t,
    font: F.fonts.ui,
    size: 26 * F.s,
    weight: 500,
    color: F.pal.muted,
    caps: true,
    tracking: F.tracking,
    maxWidth: F.band.width,
    ...o,
  });
}

/** "Next milestone" label + title (2 lines max) + date. Null when hidden or there is none. */
export function milestoneRow(
  F: Frame,
  o: {
    align?: Align;
    x?: number;
    maxWidth?: number;
    label?: string | null;
    font?: FontId;
    size?: number;
    weight?: number;
    labelSize?: number;
    dateFont?: FontId;
    gap?: number;
    inner?: number;
  } = {},
): Row | null {
  const title = F.str.milestoneTitle;
  if (!F.show.nextMilestone || !title) return null;
  const align = o.align ?? F.align;
  const maxWidth = o.maxWidth ?? F.band.width;
  const inner = (o.inner ?? 22) * F.g;
  const common = { align, x: o.x, maxWidth, element: 'nextMilestone' as const };
  return column(
    [
      o.label === null
        ? null
        : caps(F, o.label ?? 'Next milestone', { ...common, size: (o.labelSize ?? 24) * F.s }),
      paragraph(F, {
        ...common,
        text: title,
        font: o.font ?? F.fonts.display,
        size: (o.size ?? 38) * F.s,
        weight: o.weight ?? 400,
        color: F.pal.text,
        maxLines: 2,
        leading: 1.22,
        gap: o.label === null ? 0 : inner,
      }),
      F.str.milestoneDate
        ? caps(F, F.str.milestoneDate, {
            ...common,
            font: o.dateFont ?? F.fonts.ui,
            size: (o.labelSize ?? 24) * F.s,
            weight: 600,
            color: F.pal.accentInk,
            gap: inner,
          })
        : null,
    ],
    o.gap ?? 0,
  );
}

/** The motivation line in quotes, 2 lines max. Null when hidden or empty. */
export function motivationRow(
  F: Frame,
  o: {
    align?: Align;
    x?: number;
    maxWidth?: number;
    font?: FontId;
    size?: number;
    weight?: number;
    color?: string;
    quotes?: boolean;
    gap?: number;
  } = {},
): Row | null {
  const m = F.str.motivation;
  if (!F.show.motivation || !m) return null;
  return paragraph(F, {
    text: o.quotes === false ? m : `\u201C${m}\u201D`,
    font: o.font ?? F.fonts.display,
    size: (o.size ?? 34) * F.s,
    weight: o.weight ?? 300,
    color: o.color ?? F.pal.text,
    align: o.align ?? F.align,
    x: o.x,
    maxWidth: o.maxWidth ?? F.band.width,
    maxLines: 2,
    leading: 1.3,
    element: 'motivation',
    gap: o.gap ?? 0,
  });
}

/** The small "Updated 23 Nov" stamp. */
export function stampRow(F: Frame, o: Partial<TextOpts> = {}): Row | null {
  if (!F.show.updatedStamp || !F.str.updated) return null;
  return caps(F, F.str.updated, { size: 22 * F.s, element: 'updatedStamp', ...o });
}

/** A copy of the frame whose band is inset (for framed layouts). */
export function insetFrame(F: Frame, dx: number, dy: number): Frame {
  const b = F.band;
  const band: Band = {
    top: b.top + dy,
    bottom: b.bottom - dy,
    left: b.left + dx,
    right: b.right - dx,
    width: b.width - dx * 2,
    height: b.height - dy * 2,
  };
  return { ...F, band };
}

// ───────────────────────────── Offscreen helpers ─────────────────────────────

function ctxOf(layer: Layer): Ctx2D {
  const c = layer.getContext('2d');
  if (!c) throw new Error('2D canvas context unavailable');
  return c;
}
export { ctxOf };

/**
 * Blur without ctx.filter: shrink the picture by halves (each step averages
 * 2×2 pixels), then grow it back with smoothing. The more halvings, the softer.
 * `radius` is roughly the blur radius in pixels.
 */
export function blurLayer(make: CanvasFactory, src: Layer, radius: number): Layer {
  if (radius < 1) return src;
  const steps = Math.min(8, Math.max(1, Math.round(Math.log2(radius / 1.2))));
  const chain: Layer[] = [src];
  let w = src.width;
  let h = src.height;
  for (let i = 0; i < steps; i++) {
    w = Math.max(1, Math.ceil(w / 2));
    h = Math.max(1, Math.ceil(h / 2));
    const c = make(w, h);
    const cx = ctxOf(c);
    cx.imageSmoothingEnabled = true;
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(chain[i]!, 0, 0, w, h);
    chain.push(c);
  }
  for (let i = steps - 1; i >= 0; i--) {
    const target = i === 0 ? make(src.width, src.height) : chain[i]!;
    const cx = ctxOf(target);
    cx.clearRect(0, 0, target.width, target.height);
    cx.imageSmoothingEnabled = true;
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(chain[i + 1]!, 0, 0, target.width, target.height);
    chain[i] = target;
  }
  return chain[0]!;
}

/**
 * Deterministic noise tile: light and dark specks with soft alpha, from a
 * seeded generator, so the grain is identical in the browser and on the server.
 */
export function noiseTile(make: CanvasFactory, size: number, seed: number, strength = 1): Layer {
  const c = make(size, size);
  const cx = ctxOf(c);
  const img = cx.createImageData(size, size);
  const rnd = mulberry32(seed);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    // Average of three randoms ≈ bell curve: most specks are faint, a few are strong.
    const v = (rnd() + rnd() + rnd()) / 3 - 0.5;
    const lum = v > 0 ? 255 : 0;
    d[i] = lum;
    d[i + 1] = lum;
    d[i + 2] = lum;
    d[i + 3] = Math.min(255, Math.abs(v) * 2 * 255 * 1.7 * strength);
  }
  cx.putImageData(img, 0, 0);
  return c;
}

// ───────────────────────────── Template contract ─────────────────────────────

export interface TemplateDefaults {
  display: FontId;
  ui: FontId;
  numbers: FontId;
  weight: number;
  tracking: number;
  align: Align;
  scale: number;
  grain: number;
  theme: ThemeId;
}

export interface TemplateDef {
  id: TemplateId;
  label: string;
  description: string;
  defaults: TemplateDefaults;
  /** Always printed on light paper (Ivory Paper), whatever the theme. */
  paper?: boolean;
  /** Edge darkening strength (1 = default, 0 = none). */
  vignette?: number;
  /** Where the theme's soft glow sits. */
  glow?(B: BgFrame): { x: number; y: number; r: number } | null;
  /** Template-specific background texture/decoration (drawn before grain; part of contrast sampling). */
  paintBackground?(ctx: Ctx2D, B: BgFrame): void;
  layout(F: Frame): Block[];
}
