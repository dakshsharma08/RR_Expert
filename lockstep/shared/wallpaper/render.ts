/**
 * The wallpaper renderer: one function for the browser AND the server.
 *
 * Key ideas (for learners):
 * - Pipeline: (1) paint the background on an offscreen layer; (2) lay out the
 *   template, shrinking it a little if it doesn't fit the safe band; (3) copy
 *   the background to the real canvas; (4) for every text block, look at the
 *   background pixels behind it and, if the contrast is under 4.5:1, put a soft
 *   rounded "scrim" behind it; (5) draw the text and lines.
 * - Nothing here touches the DOM. Offscreen canvases come from the
 *   `createCanvas` function the caller passes in, so the browser can pass one
 *   that makes <canvas> elements and the server passes @napi-rs/canvas.
 * - We avoid ctx.filter, ctx.letterSpacing and ctx.roundRect, which Safari and
 *   napi support differently: blur, tracking and rounded rects are done by hand.
 */
import type {
  CanvasFactory,
  Ctx2D,
  ElementId,
  ImageLike,
  Layer,
  ReadabilityWarning,
  Rect,
  RenderReport,
  WallpaperData,
  WallpaperDesign,
} from './types';
import { ELEMENT_IDS } from './types';
import { getDevice, resolveSize } from './devices';
import { THEMES, makePalette, paperPalette, type Palette } from './themes';
import {
  blend,
  contrastFromLuminance,
  contrastRatio,
  luminanceOf,
  mix,
  mustParse,
  parseColor,
  scrimAlphaFor,
  withAlpha,
  type RGBA,
} from './contrast';
import { FONT_FAMILIES } from './fonts';
import { getTemplate, normalizeDesign } from './templates';
import {
  blurLayer,
  boundsOf,
  buildStrings,
  ctxOf,
  noiseTile,
  roundRectPath,
  type Band,
  type BgFrame,
  type Block,
  type Frame,
  type TemplateDef,
} from './templates/kit';

export interface RenderArgs {
  design: WallpaperDesign;
  data: WallpaperData;
  /** Makes offscreen canvases (browser: document.createElement('canvas'); server: napi createCanvas). */
  createCanvas: CanvasFactory;
  /** The already-loaded background image, when design.background.kind is 'image'. */
  image?: ImageLike | null;
  /** Render at another size than the device's (e.g. a small live preview). Same aspect ratio recommended. */
  size?: { width: number; height: number };
}

/** WCAG AA for normal text. */
export const MIN_CONTRAST = 4.5;
/** Scrims never go darker than this, so the photo still shows through. */
export const MAX_SCRIM_ALPHA = 0.75;

/**
 * Text boxes carry a little invisible padding (and descenders hang below a
 * row), so a box may poke this far (in reference px) outside the band while
 * all the ink is still inside it.
 */
export const BAND_SLACK = 24;

/** Reference phone the template sizes are designed on. */
const REF_W = 1080;
const REF_H = 2340;

export function renderWallpaper(ctx: Ctx2D, args: RenderArgs): RenderReport {
  const design = normalizeDesign(args.design);
  const { width: W, height: H } = args.size ?? resolveSize(design);
  const device = getDevice(design.device, design.custom);
  const template = getTemplate(design.template);
  const theme = THEMES[design.theme];
  const hasImage =
    design.background.kind === 'image' && !!args.image && args.image.width > 0 && args.image.height > 0;
  const themePal = template.paper ? paperPalette(theme, design.colors) : makePalette(theme, design.colors);
  // On a photo, grey "muted" text is the first thing to get lost, so lift it toward the main text colour.
  const pal: Palette = hasImage ? { ...themePal, muted: mix(themePal.text, themePal.muted, 0.45) } : themePal;
  const str = buildStrings(args.data, design);
  const ref = Math.min(W / REF_W, H / REF_H);
  const band: Band = {
    top: H * device.content.top,
    bottom: H * device.content.bottom,
    left: W * device.content.side,
    right: W * (1 - device.content.side),
    width: W * (1 - 2 * device.content.side),
    height: H * (device.content.bottom - device.content.top),
  };

  // 1 ─ Background on its own layer (we sample it later for contrast).
  const bgLayer = args.createCanvas(W, H);
  const bg = ctxOf(bgLayer);
  const B: BgFrame = {
    W,
    H,
    u: ref,
    band,
    pal,
    hasImage,
    createCanvas: args.createCanvas,
    str,
    data: args.data,
  };
  paintBackground(bg, B, design, template, hasImage ? args.image! : null);

  // 2 ─ Layout, shrinking until everything sits inside the safe band.
  const scale = design.typography.scale;
  let fit = 1;
  let blocks: Block[] = [];
  for (let attempt = 0; attempt < 6; attempt++) {
    const u = ref * fit;
    const F: Frame = {
      W,
      H,
      u,
      s: u * scale,
      g: u * (0.5 + 0.5 * scale),
      band,
      device,
      align: design.typography.align,
      position: design.layout.position,
      fonts: {
        display: design.typography.display,
        ui: design.typography.ui,
        numbers: design.typography.numbers,
      },
      weight: design.typography.weight,
      tracking: design.typography.tracking,
      pal,
      data: args.data,
      show: design.show,
      str,
      measure: ctx,
    };
    ctx.save();
    blocks = template.layout(F);
    ctx.restore();
    const b = boundsOf(blocks);
    if (!b) break;
    const slack = BAND_SLACK * ref;
    const tooTall = b.h > band.height + slack * 2;
    const outside = b.y < band.top - slack || b.y + b.h > band.bottom + slack;
    if (!tooTall && !outside) break;
    fit *= Math.min(0.97, band.height / Math.max(1, b.h));
  }

  // 3 ─ Copy the background to the real canvas.
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(bgLayer, 0, 0);

  // 4 ─ Readability: measure contrast behind each text block, add scrims.
  const { scrims, warnings } = checkReadability(bg, blocks, pal, band, W, H, ref);
  for (const s of scrims) {
    roundRectPath(ctx, s.rect.x, s.rect.y, s.rect.w, s.rect.h, Math.min(30 * ref, s.rect.h / 2));
    ctx.fillStyle = withAlpha(s.color, s.alpha);
    ctx.fill();
  }

  // 5 ─ Draw lines, rings and text.
  for (const block of blocks) {
    ctx.save();
    block.draw(ctx);
    ctx.restore();
  }
  ctx.restore();

  return { warnings, boxes: elementBoxes(blocks, W, H), width: W, height: H };
}

// ───────────────────────────── Background ─────────────────────────────

/** Fixed seed: the grain pattern is the same on every render and every device. */
const GRAIN_SEED = 0x10c5;

function paintBackground(
  ctx: Ctx2D,
  B: BgFrame,
  design: WallpaperDesign,
  template: TemplateDef,
  image: ImageLike | null,
): void {
  const { W, H, pal } = B;
  const bgSpec = design.background;

  // Base: the user's gradient, or the theme's three-stop vertical gradient.
  const custom = bgSpec.kind === 'gradient' && bgSpec.gradient ? bgSpec.gradient : null;
  if (custom && parseColor(custom.from) && parseColor(custom.to)) {
    const rad = (custom.angle * Math.PI) / 180;
    // CSS convention: 0° points up, 90° points right. Length covers the corners.
    const dx = Math.sin(rad);
    const dy = -Math.cos(rad);
    const half = (Math.abs(W * dx) + Math.abs(H * dy)) / 2;
    const g = ctx.createLinearGradient(
      W / 2 - dx * half,
      H / 2 - dy * half,
      W / 2 + dx * half,
      H / 2 + dy * half,
    );
    g.addColorStop(0, custom.from);
    g.addColorStop(1, custom.to);
    ctx.fillStyle = g;
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, pal.stops[0]);
    g.addColorStop(0.5, pal.stops[1]);
    g.addColorStop(1, pal.stops[2]);
    ctx.fillStyle = g;
  }
  ctx.fillRect(0, 0, W, H);

  // A soft light behind the content (theme backgrounds only).
  if (!custom && !image) {
    const at = template.glow
      ? template.glow(B)
      : { x: W / 2, y: B.band.top + B.band.height * 0.28, r: W * 0.85 };
    if (at) {
      const g = ctx.createRadialGradient(at.x, at.y, 0, at.x, at.y, at.r);
      g.addColorStop(0, pal.glow);
      g.addColorStop(1, withAlpha(pal.glow, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
  }

  if (image && bgSpec.image) drawPhoto(ctx, B, image, bgSpec.image);

  template.paintBackground?.(ctx, B);

  // Vignette: edges a touch darker (or warmer on paper) to hold the eye in the middle.
  const v = template.vignette ?? 1;
  if (v > 0) {
    const g = ctx.createRadialGradient(W / 2, H * 0.48, H * 0.28, W / 2, H * 0.48, H * 0.78);
    const edge = pal.mode === 'dark' ? 'rgba(0,0,0,1)' : 'rgba(92,70,30,1)';
    g.addColorStop(0, withAlpha(edge, 0));
    g.addColorStop(1, withAlpha(edge, (pal.mode === 'dark' ? 0.38 : 0.1) * v));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // Grain: a 256 px tile of seeded noise, repeated. Also hides gradient banding.
  if (bgSpec.grain > 0) {
    const small = noiseTile(B.createCanvas, 128, GRAIN_SEED);
    const tile = B.createCanvas(256, 256);
    const tctx = ctxOf(tile);
    tctx.imageSmoothingEnabled = true;
    tctx.imageSmoothingQuality = 'high';
    tctx.drawImage(small, 0, 0, 256, 256); // upscaled → soft 2 px clumps, like film
    const pattern = ctx.createPattern(tile, 'repeat');
    if (pattern) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, bgSpec.grain * (pal.mode === 'dark' ? 0.26 : 0.2));
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }
}

/** Cover-fit the photo (with zoom and pan), blur it, then veil it toward the theme colour. */
function drawPhoto(
  ctx: Ctx2D,
  B: BgFrame,
  image: ImageLike,
  spec: NonNullable<WallpaperDesign['background']['image']>,
): void {
  const { W, H } = B;
  const scale = Math.max(W / image.width, H / image.height) * spec.zoom;
  const dw = image.width * scale;
  const dh = image.height * scale;
  // x = -1 shows the left edge, 0 the centre, 1 the right edge (same for y).
  const dx = (W - dw) / 2 - (spec.x * (dw - W)) / 2;
  const dy = (H - dh) / 2 - (spec.y * (dh - H)) / 2;

  const layer = B.createCanvas(W, H);
  const lctx = ctxOf(layer);
  lctx.imageSmoothingEnabled = true;
  lctx.imageSmoothingQuality = 'high';
  lctx.drawImage(image, dx, dy, dw, dh);

  // Blur is specified at 1080 px wide; scale it to this canvas.
  const radius = spec.blur * (W / REF_W);
  const blurred = radius >= 1 ? blurLayer(B.createCanvas, layer, radius) : layer;
  ctx.drawImage(blurred, 0, 0);

  if (spec.dim > 0) {
    // "Dim" veils the photo toward the theme's base colour: darker on dark
    // themes, paler on light ones, so the theme's text keeps its contrast.
    ctx.fillStyle = withAlpha(B.pal.base, spec.dim);
    ctx.fillRect(0, 0, W, H);
  }
}

// ───────────────────────────── Readability ─────────────────────────────

interface Sample {
  mean: RGBA;
  p10: RGBA;
  p90: RGBA;
}

/** Read the background behind a box (every few pixels) and summarise it. */
function sampleBox(bg: Ctx2D, box: Rect, W: number, H: number): Sample | null {
  const x0 = Math.max(0, Math.floor(box.x));
  const y0 = Math.max(0, Math.floor(box.y));
  const x1 = Math.min(W, Math.ceil(box.x + box.w));
  const y1 = Math.min(H, Math.ceil(box.y + box.h));
  const w = x1 - x0;
  const h = y1 - y0;
  if (w < 1 || h < 1) return null;
  const { data } = bg.getImageData(x0, y0, w, h);
  // About 4,000 samples is plenty for a stable average and percentiles.
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 4000)));
  const px: { c: RGBA; l: number }[] = [];
  let r = 0;
  let g = 0;
  let b = 0;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      const c = { r: data[i]!, g: data[i + 1]!, b: data[i + 2]!, a: 1 };
      r += c.r;
      g += c.g;
      b += c.b;
      px.push({ c, l: luminanceOf(c) });
    }
  }
  const n = px.length;
  if (n === 0) return null;
  px.sort((a, z) => a.l - z.l);
  return {
    mean: { r: r / n, g: g / n, b: b / n, a: 1 },
    p10: px[Math.floor(n * 0.1)]!.c,
    p90: px[Math.min(n - 1, Math.floor(n * 0.9))]!.c,
  };
}

interface Scrim {
  rect: Rect;
  alpha: number;
  color: string;
}

function checkReadability(
  bg: Ctx2D,
  blocks: Block[],
  pal: Palette,
  band: Band,
  W: number,
  H: number,
  u: number,
): { scrims: Scrim[]; warnings: ReadabilityWarning[] } {
  const raw: Scrim[] = [];
  const worst = new Map<ElementId, ReadabilityWarning>();
  const darkScrim = mix(pal.mode === 'dark' ? pal.base : '#0b0b0b', '#000000', 0.55);
  const lightScrim = pal.mode === 'light' ? pal.base : '#F5F0E4';

  for (const block of blocks) {
    if (!block.element || !block.color) continue;
    const s = sampleBox(bg, block.box, W, H);
    if (!s) continue;
    const text = mustParse(block.color);
    const tl = luminanceOf(text);
    // Worst case of: the average colour, the brightest 10% and the darkest 10%.
    const candidates = [s.mean, s.p90, s.p10];
    const before = Math.min(...candidates.map((c) => contrastFromLuminance(tl, luminanceOf(c))));
    if (before >= MIN_CONTRAST) continue;

    // Light text gets a dark scrim; dark text a light one.
    const scrimColor =
      contrastRatio(block.color, '#000000') >= contrastRatio(block.color, '#ffffff') ? darkScrim : lightScrim;
    const scrim = mustParse(scrimColor);
    const alpha = Math.max(
      ...candidates.map((c) => scrimAlphaFor(text, c, scrim, MIN_CONTRAST + 0.1, MAX_SCRIM_ALPHA)),
    );
    const after = Math.min(
      ...candidates.map((c) => contrastFromLuminance(tl, luminanceOf(blend(c, scrim, alpha)))),
    );
    // Every scrim spans the whole content column (not just its text), so
    // neighbouring scrims merge into one calm, straight-edged panel.
    const pad = 28 * u;
    const x0 = Math.max(0, Math.min(band.left, block.box.x) - pad);
    const x1 = Math.min(W, Math.max(band.right, block.box.x + block.box.w) + pad);
    raw.push({
      rect: { x: x0, y: block.box.y - pad * 0.75, w: x1 - x0, h: block.box.h + pad * 1.5 },
      alpha,
      color: scrimColor,
    });

    const fixed = after >= MIN_CONTRAST;
    const label = ELEMENT_LABEL[block.element];
    const warning: ReadabilityWarning = {
      element: block.element,
      contrast: Math.round(before * 100) / 100,
      fixed,
      message: fixed
        ? `${label} sat on a busy or low-contrast area (${before.toFixed(1)}:1), so a soft backdrop was added to reach ${after.toFixed(1)}:1.`
        : `${label} is hard to read (${after.toFixed(1)}:1 even with a backdrop). Try more Dim or Blur, a calmer photo, another text colour or a different theme.`,
    };
    const prev = worst.get(block.element);
    if (!prev || (prev.fixed && !fixed) || (prev.fixed === fixed && warning.contrast < prev.contrast)) {
      worst.set(block.element, warning);
    }
  }

  return { scrims: mergeScrims(raw, 60 * u), warnings: ELEMENT_IDS.flatMap((id) => worst.get(id) ?? []) };
}

/** Join scrims that touch (within `slack` px) into one calm panel instead of a patchwork. */
function mergeScrims(list: Scrim[], slack: number): Scrim[] {
  const out = list.map((s) => ({ ...s, rect: { ...s.rect } }));
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i]!;
        const b = out[j]!;
        if (a.color !== b.color) continue;
        const touch =
          a.rect.x - slack < b.rect.x + b.rect.w &&
          b.rect.x - slack < a.rect.x + a.rect.w &&
          a.rect.y - slack < b.rect.y + b.rect.h &&
          b.rect.y - slack < a.rect.y + a.rect.h;
        if (!touch) continue;
        const x = Math.min(a.rect.x, b.rect.x);
        const y = Math.min(a.rect.y, b.rect.y);
        a.rect = {
          x,
          y,
          w: Math.max(a.rect.x + a.rect.w, b.rect.x + b.rect.w) - x,
          h: Math.max(a.rect.y + a.rect.h, b.rect.y + b.rect.h) - y,
        };
        a.alpha = Math.max(a.alpha, b.alpha);
        out.splice(j, 1);
        merged = true;
        break outer;
      }
    }
  }
  return out;
}

const ELEMENT_LABEL: Record<ElementId, string> = {
  goalTitle: 'The goal title',
  daysLeft: 'The days-left number',
  dayOfTotal: '“Day X of Y”',
  targetDate: 'The target date',
  nextMilestone: 'The next milestone',
  progress: 'The progress label',
  motivation: 'The motivation line',
  updatedStamp: 'The “Updated” stamp',
};

/** One box per element (union of its blocks), clipped to the canvas, for snap guides in the UI. */
function elementBoxes(blocks: Block[], W: number, H: number): RenderReport['boxes'] {
  return ELEMENT_IDS.flatMap((element) => {
    const b = boundsOf(blocks.filter((x) => x.element === element));
    if (!b) return [];
    const x = Math.max(0, Math.round(b.x));
    const y = Math.max(0, Math.round(b.y));
    return [
      { element, x, y, w: Math.min(W, Math.round(b.x + b.w)) - x, h: Math.min(H, Math.round(b.y + b.h)) - y },
    ];
  });
}

/** Font families a design uses (for the browser to preload before rendering). */
export function familiesFor(design: WallpaperDesign): string[] {
  const t = design.typography;
  return [...new Set([t.display, t.ui, t.numbers])].map((f) => FONT_FAMILIES[f].family);
}

/** Convenience for callers that want a layer back (e.g. the browser export). */
export function renderToLayer(args: RenderArgs): { layer: Layer; report: RenderReport } {
  const size = args.size ?? resolveSize(normalizeDesign(args.design));
  const layer = args.createCanvas(size.width, size.height);
  const report = renderWallpaper(ctxOf(layer), { ...args, size });
  return { layer, report };
}
