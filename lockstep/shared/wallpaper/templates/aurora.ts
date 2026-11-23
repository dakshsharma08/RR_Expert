/**
 * Aurora: two or three soft colour blooms behind a light modern numeral.
 * Restraint is the point: low-opacity theme hues, heavily blurred, plus grain
 * so the gradients never band.
 */
import {
  bar,
  blurLayer,
  caps,
  column,
  ctxOf,
  milestoneRow,
  motivationRow,
  numeral,
  stack,
  stampRow,
  text,
  type Row,
  type TemplateDef,
} from './kit';
import { withAlpha } from '../contrast';

export const aurora: TemplateDef = {
  id: 'aurora',
  label: 'Aurora',
  description: 'Soft blurred colour blooms behind a light modern numeral.',
  defaults: {
    display: 'inter',
    ui: 'inter',
    numbers: 'inter',
    weight: 300,
    tracking: 0.22,
    align: 'center',
    scale: 1,
    grain: 0.22,
    theme: 'rose-gold',
  },
  glow: () => null, // the blooms are the light
  paintBackground(ctx, B) {
    if (B.hasImage) return;
    // Paint the blooms small (1/10 size), blur them, then scale up: smooth and cheap.
    const k = 10;
    const sw = Math.ceil(B.W / k);
    const sh = Math.ceil(B.H / k);
    const small = B.createCanvas(sw, sh);
    const sctx = ctxOf(small);
    const dark = B.pal.mode === 'dark';
    const blooms = [
      { x: 0.78, y: B.band.top / B.H + 0.02, rx: 0.62, ry: 0.2, c: B.pal.blooms[1], a: dark ? 0.5 : 0.6 },
      { x: 0.12, y: B.band.top / B.H + 0.16, rx: 0.55, ry: 0.18, c: B.pal.blooms[0], a: dark ? 0.55 : 0.5 },
      { x: 0.62, y: 0.9, rx: 0.7, ry: 0.16, c: B.pal.blooms[2], a: dark ? 0.6 : 0.32 },
    ];
    for (const b of blooms) {
      const cx = b.x * sw;
      const cy = b.y * sh;
      const rx = b.rx * sw;
      const ry = b.ry * sh;
      sctx.save();
      sctx.translate(cx, cy);
      sctx.scale(1, ry / rx); // a radial gradient squashed into an ellipse
      const g = sctx.createRadialGradient(0, 0, 0, 0, 0, rx);
      g.addColorStop(0, withAlpha(b.c, b.a));
      g.addColorStop(0.55, withAlpha(b.c, b.a * 0.45));
      g.addColorStop(1, withAlpha(b.c, 0));
      sctx.fillStyle = g;
      sctx.fillRect(-rx, -rx, rx * 2, rx * 2);
      sctx.restore();
    }
    const soft = blurLayer(B.createCanvas, small, 6);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(soft, 0, 0, B.W, B.H);
    ctx.restore();
  },
  layout(F) {
    const { s, g, band, pal, str, show } = F;
    const barW = Math.min(band.width, 560 * F.u);
    const bx0 = F.align === 'left' ? band.left : F.align === 'right' ? band.right - barW : F.W / 2 - barW / 2;
    const rows: (Row | null)[] = [
      show.goalTitle
        ? caps(F, str.goal, { color: pal.text, weight: 500, size: 27 * s, element: 'goalTitle' })
        : null,
      show.daysLeft
        ? numeral(F, {
            text: str.numeral,
            font: F.fonts.numbers,
            weight: F.weight,
            maxSize: 520 * s,
            maxWidth: band.width,
            color: pal.text,
            tracking: -0.05,
            element: 'daysLeft',
            gap: 70 * g,
          })
        : null,
      show.daysLeft
        ? caps(F, str.daysLabel, { size: 29 * s, color: pal.text, element: 'daysLeft', gap: 50 * g })
        : null,
      show.progress
        ? column(
            [
              bar(F, {
                x0: bx0,
                x1: bx0 + barW,
                pct: str.pct,
                thickness: 3,
                rounded: true,
                dot: true,
                track: withAlpha(pal.text, 0.16),
                fill: pal.text,
              }),
              caps(F, str.progress, { size: 23 * s, color: pal.text, element: 'progress', gap: 34 * g }),
            ],
            78 * g,
          )
        : null,
      show.dayOfTotal ? caps(F, str.dayOfTotal, { size: 23 * s, element: 'dayOfTotal', gap: 70 * g }) : null,
      show.targetDate
        ? text(F, {
            text: str.target,
            font: F.fonts.display,
            size: 36 * s,
            weight: 400,
            color: pal.text,
            maxWidth: band.width,
            element: 'targetDate',
            gap: (show.dayOfTotal ? 24 : 70) * g,
          })
        : null,
      milestoneRow(F, { gap: 62 * g, size: 36, weight: 400 }),
      motivationRow(F, { gap: 60 * g, size: 32, weight: 300 }),
      stampRow(F, { gap: 60 * g }),
    ];
    return stack(F, rows, 'upper');
  },
};
