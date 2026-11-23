/**
 * Ivory Paper: a printed card on fine cotton paper. Dark ink, a double
 * hairline frame, a small diamond ornament and a gentle paper texture.
 * It always prints on light paper; dark themes only tint the paper and ink.
 */
import {
  bar,
  beside,
  blurLayer,
  boundsOf,
  caps,
  column,
  ctxOf,
  custom,
  insetFrame,
  milestoneRow,
  motivationRow,
  mulberry32,
  numeral,
  stack,
  stampRow,
  text,
  type Block,
  type Frame,
  type Row,
  type TemplateDef,
} from './kit';
import { withAlpha } from '../contrast';
import type { Align } from '../types';

export const ivoryPaper: TemplateDef = {
  id: 'ivory-paper',
  label: 'Ivory Paper',
  description: 'Dark ink on textured ivory paper, framed like a letterpress card.',
  defaults: {
    display: 'fraunces',
    ui: 'inter',
    numbers: 'fraunces',
    weight: 400,
    tracking: 0.2,
    align: 'center',
    scale: 1,
    grain: 0.25,
    theme: 'ivory',
  },
  paper: true,
  vignette: 1.2,
  glow: (B) => ({ x: B.W / 2, y: B.band.top + B.band.height * 0.3, r: B.W * 0.9 }),
  paintBackground(ctx, B) {
    if (B.hasImage) return;
    const ink = '#5a4a2a';
    // Mottling: a coarse random field, blurred and stretched → uneven paper tone.
    const rnd = mulberry32(0x9a9e);
    const mw = 36;
    const mh = Math.ceil((36 * B.H) / B.W);
    const m = B.createCanvas(mw, mh);
    const mctx = ctxOf(m);
    for (let y = 0; y < mh; y++) {
      for (let x = 0; x < mw; x++) {
        mctx.fillStyle = withAlpha(rnd() > 0.5 ? ink : '#ffffff', rnd() * 0.5);
        mctx.fillRect(x, y, 1, 1);
      }
    }
    const soft = blurLayer(B.createCanvas, m, 3);
    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(soft, 0, 0, B.W, B.H);
    ctx.restore();
    // Fibres: many very faint short strokes.
    const fr = mulberry32(0xf1b2);
    const n = Math.round(900 * ((B.W * B.H) / (1080 * 2340)));
    ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const x = fr() * B.W;
      const y = fr() * B.H;
      const len = (6 + fr() * 22) * B.u;
      const a = fr() * Math.PI;
      ctx.strokeStyle = withAlpha(fr() > 0.3 ? ink : '#ffffff', 0.035 + fr() * 0.05);
      ctx.lineWidth = Math.max(0.6, (0.5 + fr() * 0.8) * B.u);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(
        x + Math.cos(a + 0.6) * len * 0.5,
        y + Math.sin(a + 0.6) * len * 0.5,
        x + Math.cos(a) * len,
        y + Math.sin(a) * len,
      );
      ctx.stroke();
    }
  },
  layout(F) {
    const padX = 64 * F.u;
    const padY = 84 * F.u;
    const I = insetFrame(F, padX, padY); // content sits inside the printed frame
    const blocks = stack(I, rows(I), 'upper');
    const b = boundsOf(blocks);
    if (!b) return blocks;
    return [frame(F, b.y - padY + 6 * F.u, b.y + b.h + padY - 6 * F.u), ...blocks];
  },
};

function rows(F: Frame): (Row | null)[] {
  const { s, g, u, band, pal, str, show } = F;
  const both = show.dayOfTotal && show.targetDate;
  const colW = band.width * 0.48;
  const pair = (
    label: string,
    value: string,
    element: 'dayOfTotal' | 'targetDate',
    align: Align,
    x: number,
  ) =>
    column([
      caps(F, label, { align, x, element, size: 22 * s, maxWidth: colW }),
      text(F, {
        text: value,
        font: F.fonts.display,
        size: 34 * s,
        weight: 400,
        color: pal.text,
        align,
        x,
        maxWidth: colW,
        element,
        gap: 20 * g,
      }),
    ]);
  // In a centred card, two pairs sit at the quarter points; otherwise they follow the alignment.
  const q = (k: number) => band.left + band.width * k;
  const dayPair = show.dayOfTotal
    ? pair(str.dayKey, str.dayValue, 'dayOfTotal', both ? 'center' : F.align, both ? q(0.25) : anchor(F))
    : null;
  const duePair = show.targetDate
    ? pair('Target', str.target, 'targetDate', both ? 'center' : F.align, both ? q(0.75) : anchor(F))
    : null;
  const barW = Math.min(band.width * 0.7, 460 * u);
  const bx = F.align === 'left' ? band.left : F.align === 'right' ? band.right - barW : F.W / 2 - barW / 2;

  return [
    show.goalTitle ? flanked(F, str.goal) : null,
    show.daysLeft
      ? numeral(F, {
          text: str.numeral,
          font: F.fonts.numbers,
          weight: F.weight,
          maxSize: 500 * s,
          maxWidth: band.width,
          color: pal.text,
          tracking: -0.03,
          element: 'daysLeft',
          gap: 72 * g,
        })
      : null,
    show.daysLeft
      ? caps(F, str.daysLabel, {
          size: 29 * s,
          color: pal.accentInk,
          weight: 600,
          element: 'daysLeft',
          gap: 46 * g,
        })
      : null,
    ornament(F, 56 * g),
    beside([dayPair, duePair], 56 * g),
    milestoneRow(F, { gap: 60 * g, size: 36 }),
    show.progress
      ? column(
          [
            caps(F, str.progress, { size: 22 * s, element: 'progress' }),
            bar(F, { x0: bx, x1: bx + barW, pct: str.pct, thickness: 2, track: pal.faint, gap: 22 * g }),
          ],
          60 * g,
        )
      : null,
    motivationRow(F, { gap: 60 * g, size: 40, weight: 400, font: 'instrument-serif' }),
    stampRow(F, { gap: 60 * g }),
  ];
}

function anchor(F: Frame): number {
  return F.align === 'left' ? F.band.left : F.align === 'right' ? F.band.right : F.W / 2;
}

/** "——  GOAL TITLE  ——": small caps with short rules on each side (only when centred). */
function flanked(F: Frame, goal: string): Row {
  const label = caps(F, goal, {
    size: 26 * F.s,
    weight: 600,
    color: F.pal.text,
    element: 'goalTitle',
    maxWidth: F.band.width * 0.7,
  });
  if (F.align !== 'center') return label;
  return custom(label.h, 0, (y) => {
    const blocks = label.place(y);
    const box = blocks[0]!.box;
    const len = 56 * F.u;
    const gap = 10 * F.u;
    const yy = Math.round(y + label.h / 2);
    blocks.push({
      box: { x: box.x - gap - len, y: yy, w: box.w + 2 * (gap + len), h: 1 },
      draw(ctx) {
        ctx.fillStyle = F.pal.hairline;
        const t = Math.max(1, Math.round(1.2 * F.u));
        ctx.fillRect(Math.round(box.x - gap - len), yy, Math.round(len), t);
        ctx.fillRect(Math.round(box.x + box.w + gap), yy, Math.round(len), t);
      },
    });
    return blocks;
  });
}

/** A small diamond between two hairlines. */
function ornament(F: Frame, gap: number): Row {
  const r = 7 * F.u;
  return custom(r * 2, gap, (y) => {
    const cx = anchor(F);
    const cy = y + r;
    const len = 90 * F.u;
    const x0 = F.align === 'left' ? cx : F.align === 'right' ? cx - (len * 2 + r * 4) : cx - len - r * 2;
    const dx = x0 + len + r * 2;
    return [
      {
        box: { x: x0, y, w: len * 2 + r * 4, h: r * 2 },
        draw(ctx) {
          const t = Math.max(1, Math.round(1.2 * F.u));
          ctx.fillStyle = F.pal.hairline;
          ctx.fillRect(Math.round(x0), Math.round(cy), Math.round(len), t);
          ctx.fillRect(Math.round(dx + r * 2), Math.round(cy), Math.round(len), t);
          ctx.fillStyle = F.pal.accent;
          ctx.beginPath();
          ctx.moveTo(dx, cy - r);
          ctx.lineTo(dx + r, cy);
          ctx.lineTo(dx, cy + r);
          ctx.lineTo(dx - r, cy);
          ctx.closePath();
          ctx.fill();
        },
      },
    ];
  });
}

/** The printed double frame around the card. */
function frame(F: Frame, top: number, bottom: number): Block {
  const x0 = Math.round(F.band.left);
  const x1 = Math.round(F.band.right);
  // Not clamped on purpose: if the card is too tall, the renderer sees the frame
  // poke out of the safe band and lays everything out a little smaller.
  const y0 = Math.round(top);
  const y1 = Math.round(bottom);
  return {
    keepInside: true,
    box: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
    draw(ctx) {
      const t = Math.max(1, Math.round(1.4 * F.u));
      const inset = Math.round(9 * F.u);
      ctx.strokeStyle = F.pal.hairline;
      ctx.lineWidth = t;
      ctx.beginPath();
      ctx.rect(x0 + t / 2, y0 + t / 2, x1 - x0 - t, y1 - y0 - t);
      ctx.stroke();
      ctx.strokeStyle = F.pal.faint;
      ctx.lineWidth = Math.max(1, Math.round(F.u));
      ctx.beginPath();
      ctx.rect(x0 + inset, y0 + inset, x1 - x0 - inset * 2, y1 - y0 - inset * 2);
      ctx.stroke();
    },
  };
}
