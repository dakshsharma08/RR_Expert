/**
 * Minimal Mono: Swiss and quiet. Everything is monospaced and small except
 * the number; entries are indexed 01, 02… on a strict three-column grid, and
 * progress is a row of square cells. Tiny registration marks frame the band.
 *
 * Alignment note: the grid stays left-aligned; `align` moves only the numeral.
 */
import {
  beside,
  caps,
  column,
  custom,
  motivationRow,
  numeral,
  paragraph,
  boundsOf,
  rule,
  stack,
  stampRow,
  text,
  type Block,
  type Frame,
  type Row,
  type TemplateDef,
} from './kit';
import type { Ctx2D, ElementId } from '../types';

export const minimalMono: TemplateDef = {
  id: 'minimal-mono',
  label: 'Minimal Mono',
  description: 'Monospaced, tiny and Swiss: an indexed grid and one clean number.',
  defaults: {
    display: 'geist-mono',
    ui: 'geist-mono',
    numbers: 'geist-mono',
    weight: 300,
    tracking: 0.08,
    align: 'left',
    scale: 1,
    grain: 0,
    theme: 'monochrome',
  },
  vignette: 0.4,
  glow: () => null,
  layout(F) {
    const { s, g, u, band, pal, str, show } = F;
    const mono = F.fonts.ui;
    const x0 = band.left;
    const kx = x0 + band.width * 0.12; // key column
    const vx = x0 + band.width * 0.36; // value column
    const vw = band.right - vx;
    const size = 26 * s;
    let index = 0;

    const cell = (t: string, x: number, element: ElementId, color = pal.muted) =>
      text(F, {
        text: t,
        font: mono,
        size,
        weight: 400,
        color,
        caps: true,
        tracking: F.tracking,
        align: 'left',
        x,
        element,
      });
    /** "01  KEY   value" with an auto-incrementing index. */
    const entry = (key: string, element: ElementId, valueRow: Row | null): Row | null => {
      if (!valueRow) return null;
      index += 1;
      return beside(
        [cell(String(index).padStart(2, '0'), x0, element), cell(key, kx, element), valueRow],
        36 * g,
      );
    };
    const value = (t: string, element: ElementId) =>
      text(F, {
        text: t,
        font: mono,
        size,
        weight: 400,
        color: pal.text,
        caps: true,
        tracking: F.tracking * 0.5,
        align: 'left',
        x: vx,
        maxWidth: vw,
        element,
      });

    // Progress as 20 square-ish cells.
    const cells = 20;
    const gapX = 5 * u;
    const cw = Math.min(26 * u, (vw - gapX * (cells - 1)) / cells);
    const cellH = 13 * u;
    const progressCells: Row = custom(cellH, 0, (y) => [
      {
        element: 'progress',
        box: { x: vx, y, w: cells * cw + (cells - 1) * gapX, h: cellH },
        draw(ctx) {
          const lit = Math.round(str.pct * cells);
          for (let i = 0; i < cells; i++) {
            ctx.fillStyle = i < lit ? pal.accent : pal.faint;
            ctx.fillRect(Math.round(vx + i * (cw + gapX)), Math.round(y), Math.round(cw), Math.round(cellH));
          }
        },
      },
    ]);

    const entries = [
      entry(str.dayKey, 'dayOfTotal', show.dayOfTotal ? value(str.dayValue, 'dayOfTotal') : null),
      entry('Due', 'targetDate', show.targetDate ? value(str.target, 'targetDate') : null),
      entry(
        'Next',
        'nextMilestone',
        show.nextMilestone && str.milestoneTitle
          ? column([
              paragraph(F, {
                text: str.milestoneTitle,
                font: mono,
                size,
                weight: 400,
                color: pal.text,
                align: 'left',
                x: vx,
                maxWidth: vw,
                maxLines: 2,
                leading: 1.5,
                element: 'nextMilestone',
              }),
              str.milestoneDate
                ? { ...cell(str.milestoneDate, vx, 'nextMilestone', pal.accentInk), gap: 18 * g }
                : null,
            ])
          : null,
      ),
      entry(
        'Done',
        'progress',
        show.progress ? column([value(str.pctText, 'progress'), { ...progressCells, gap: 20 * g }]) : null,
      ),
      entry(
        'Note',
        'motivation',
        motivationRow(F, {
          font: mono,
          size: 22,
          weight: 400,
          quotes: false,
          align: 'left',
          x: vx,
          maxWidth: vw,
        }),
      ),
    ]
      .filter((r): r is Row => r !== null)
      // The first entry sits a little further from the rule above it.
      .map((r, i) => (i === 0 ? { ...r, gap: 44 * g } : r));

    const rows: (Row | null)[] = [
      show.goalTitle
        ? beside([
            cell('00', x0, 'goalTitle'),
            text(F, {
              text: str.goal,
              font: mono,
              size,
              weight: 500,
              color: pal.text,
              caps: true,
              tracking: F.tracking,
              align: 'left',
              x: kx,
              maxWidth: band.right - kx,
              element: 'goalTitle',
            }),
          ])
        : null,
      rule(F, { gap: 34 * g, color: pal.hairline, weight: 1 }),
      show.daysLeft
        ? numeral(F, {
            text: str.numeral,
            font: F.fonts.numbers,
            weight: F.weight,
            maxSize: 330 * s,
            maxWidth: band.width,
            color: pal.text,
            tracking: -0.06,
            element: 'daysLeft',
            gap: 64 * g,
          })
        : null,
      show.daysLeft
        ? caps(F, str.daysLabel, {
            font: mono,
            size,
            weight: 500,
            color: pal.accentInk,
            element: 'daysLeft',
            gap: 40 * g,
          })
        : null,
      rule(F, { gap: 60 * g, color: pal.hairline, weight: 1 }),
      ...entries,
      entries.length > 0 ? rule(F, { gap: 60 * g, color: pal.hairline, weight: 1 }) : null,
      stampRow(F, { font: mono, gap: 32 * g, align: 'left', x: x0 }),
    ];
    const blocks = stack(F, rows, 'upper');
    const b = boundsOf(blocks);
    return b ? [...registrationMarks(F, b.y - 44 * u, b.y + b.h + 40 * u), ...blocks] : blocks;
  },
};

/** Tiny "+" registration marks at the four corners of the content, like a print proof. */
function registrationMarks(F: Frame, top: number, bottom: number): Block[] {
  const arm = 14 * F.u;
  const t = Math.max(1, Math.round(1.2 * F.u));
  const ys = [Math.max(F.band.top, top), Math.min(F.band.bottom, bottom)];
  const xs = [F.band.left, F.band.right];
  return ys.flatMap((y) =>
    xs.map((x) => ({
      box: { x: x - arm, y: y - arm, w: arm * 2, h: arm * 2 },
      draw(ctx: Ctx2D) {
        ctx.fillStyle = F.pal.hairline;
        ctx.fillRect(Math.round(x - arm), Math.round(y), Math.round(arm * 2), t);
        ctx.fillRect(Math.round(x), Math.round(y - arm), t, Math.round(arm * 2));
      },
    })),
  );
}
