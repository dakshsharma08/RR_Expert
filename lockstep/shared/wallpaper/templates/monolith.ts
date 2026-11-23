/**
 * Monolith: one monumental serif numeral between two hairline rules,
 * with the details set like the caption of an editorial photograph.
 */
import type { Align } from '../types';
import {
  anchorX,
  beside,
  caps,
  column,
  milestoneRow,
  motivationRow,
  numeral,
  bar,
  rule,
  stack,
  stampRow,
  text,
  type Frame,
  type Row,
  type TemplateDef,
} from './kit';

/** Small-caps label over a serif value. */
function pair(
  F: Frame,
  label: string,
  value: string,
  element: 'dayOfTotal' | 'targetDate',
  align: Align,
  x: number,
): Row | null {
  return column([
    caps(F, label, { align, x, element, size: 23 * F.s }),
    text(F, {
      text: value,
      font: F.fonts.display,
      size: 36 * F.s,
      weight: 400,
      color: F.pal.text,
      align,
      x,
      maxWidth: F.band.width * 0.47,
      element,
      gap: 22 * F.g,
    }),
  ]);
}

export const monolith: TemplateDef = {
  id: 'monolith',
  label: 'Monolith',
  description: 'A single monumental serif numeral between hairline rules.',
  defaults: {
    display: 'fraunces',
    ui: 'inter',
    numbers: 'fraunces',
    weight: 300,
    tracking: 0.2,
    align: 'left',
    scale: 1,
    grain: 0.12,
    theme: 'champagne-gold',
  },
  glow: (B) => ({ x: B.W * 0.3, y: B.band.top + B.band.height * 0.3, r: B.W * 0.9 }),
  layout(F) {
    const { s, g, band, pal, str, show } = F;
    const left = band.left;
    const right = band.right;

    // Day and target sit as two columns (left + right) when both are on,
    // otherwise the single one follows the chosen alignment.
    const both = show.dayOfTotal && show.targetDate;
    const dayCol = show.dayOfTotal
      ? pair(F, str.dayKey, str.dayValue, 'dayOfTotal', both ? 'left' : F.align, both ? left : anchorX(F))
      : null;
    const dueCol = show.targetDate
      ? pair(F, 'Target', str.target, 'targetDate', both ? 'right' : F.align, both ? right : anchorX(F))
      : null;

    const rows: (Row | null)[] = [
      show.goalTitle
        ? caps(F, str.goal, { color: pal.accentInk, weight: 600, size: 29 * s, element: 'goalTitle' })
        : null,
      rule(F, { gap: 34 * g }),
      ...(show.daysLeft
        ? [
            numeral(F, {
              text: str.numeral,
              font: F.fonts.numbers,
              weight: F.weight,
              maxSize: 700 * s,
              maxWidth: band.width,
              color: pal.text,
              tracking: -0.035,
              element: 'daysLeft',
              gap: 80 * g,
            }),
            caps(F, str.daysLabel, { size: 32 * s, color: pal.text, element: 'daysLeft', gap: 50 * g }),
          ]
        : []),
      rule(F, { gap: 60 * g }),
      beside([dayCol, dueCol], 56 * g),
      milestoneRow(F, { gap: 64 * g }),
      show.progress
        ? column(
            [
              caps(F, str.progress, { element: 'progress', size: 23 * s }),
              bar(F, { pct: str.pct, thickness: 2, gap: 22 * g }),
            ],
            64 * g,
          )
        : null,
      motivationRow(F, { gap: 64 * g, size: 34 }),
      stampRow(F, { gap: 68 * g }),
    ];
    return stack(F, rows, 'upper');
  },
};
