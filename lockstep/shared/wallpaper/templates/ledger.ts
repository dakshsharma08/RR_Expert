/**
 * Ledger: a page from a fine stationery ledger. Small-caps labels in the left
 * column, figures right-aligned in the right column, ruled lines between
 * entries and an accountant's double rule under the "total" (days left).
 *
 * Alignment note: a ledger is a table, so labels stay left and figures stay
 * right whatever `align` says; `align` only moves the motivation footnote.
 */
import {
  bar,
  beside,
  caps,
  column,
  custom,
  motivationRow,
  numeral,
  paragraph,
  rule,
  stack,
  stampRow,
  text,
  type Block,
  type Frame,
  type Row,
  type TemplateDef,
} from './kit';
import type { ElementId } from '../types';

export const ledger: TemplateDef = {
  id: 'ledger',
  label: 'Ledger',
  description: 'Editorial ledger: ruled entries, small-caps labels, right-aligned figures.',
  defaults: {
    display: 'fraunces',
    ui: 'inter',
    numbers: 'fraunces',
    weight: 350,
    tracking: 0.18,
    align: 'left',
    scale: 1,
    grain: 0.14,
    theme: 'emerald-noir',
  },
  glow: (B) => ({ x: B.W * 0.65, y: B.band.top + B.band.height * 0.25, r: B.W * 0.9 }),
  layout(F) {
    const { s, g, band, pal, str, show } = F;
    const x0 = band.left;
    const x1 = band.right;
    const labelW = band.width * 0.3;
    const vx0 = x0 + labelW; // value column starts here
    const valueW = x1 - vx0;
    const rowGap = 30 * g;

    const label = (t: string, element: ElementId) =>
      caps(F, t, { align: 'left', x: x0, size: 23 * s, element, maxWidth: labelW - 44 * F.u });
    const value = (t: string, element: ElementId, size = 34) =>
      text(F, {
        text: t,
        font: F.fonts.display,
        size: size * s,
        weight: 400,
        color: pal.text,
        align: 'right',
        x: x1,
        maxWidth: valueW,
        element,
      });
    const entry = (r: Row | null) =>
      r ? [{ ...r, gap: rowGap }, rule(F, { gap: rowGap, color: pal.faint })] : [];

    // The "total" row: label sits on the numeral's baseline, accountant style.
    let totalRow: Row | null = null;
    if (show.daysLeft) {
      const num = numeral(F, {
        text: str.numeral,
        font: F.fonts.numbers,
        weight: F.weight,
        maxSize: 400 * s,
        maxWidth: valueW,
        color: pal.text,
        tracking: -0.03,
        align: 'right',
        x: x1,
        element: 'daysLeft',
      });
      const lab = label('Remaining', 'daysLeft');
      const sub = caps(F, str.daysLabel, {
        align: 'right',
        x: x1,
        color: pal.accentInk,
        size: 24 * s,
        element: 'daysLeft',
        gap: 30 * g,
        maxWidth: valueW,
      });
      const col = column([num, sub])!;
      totalRow = custom(col.h, 0, (y) => [...col.place(y), ...lab.place(y + num.h - lab.h)]);
    }

    const goal = show.goalTitle
      ? beside([
          label('Goal', 'goalTitle'),
          paragraph(F, {
            text: str.goal,
            font: F.fonts.display,
            size: 34 * s,
            weight: 400,
            color: pal.text,
            align: 'right',
            x: x1,
            maxWidth: valueW,
            maxLines: 2,
            leading: 1.2,
            element: 'goalTitle',
          }),
        ])
      : null;

    const next =
      show.nextMilestone && str.milestoneTitle
        ? beside([
            label('Next', 'nextMilestone'),
            column([
              paragraph(F, {
                text: str.milestoneTitle,
                font: F.fonts.display,
                size: 32 * s,
                weight: 400,
                color: pal.text,
                align: 'right',
                x: x1,
                maxWidth: valueW,
                maxLines: 2,
                leading: 1.22,
                element: 'nextMilestone',
              }),
              str.milestoneDate
                ? caps(F, str.milestoneDate, {
                    align: 'right',
                    x: x1,
                    size: 23 * s,
                    weight: 600,
                    color: pal.accentInk,
                    element: 'nextMilestone',
                    gap: 20 * g,
                  })
                : null,
            ]),
          ])
        : null;

    const progress = show.progress
      ? beside([
          label('Progress', 'progress'),
          column([
            value(str.progress, 'progress'),
            bar(F, { x0: vx0 + valueW * 0.25, x1, pct: str.pct, thickness: 2, gap: 24 * g }),
          ]),
        ])
      : null;

    const rows: (Row | null)[] = [
      rule(F, { double: true, color: pal.hairline }),
      ...entry(goal),
      ...(totalRow
        ? [{ ...totalRow, gap: rowGap + 6 * g }, rule(F, { gap: rowGap, double: true, color: pal.hairline })]
        : []),
      ...entry(
        show.dayOfTotal ? beside([label(str.dayKey, 'dayOfTotal'), value(str.dayValue, 'dayOfTotal')]) : null,
      ),
      ...entry(
        show.targetDate ? beside([label('Due', 'targetDate'), value(str.target, 'targetDate')]) : null,
      ),
      ...entry(next),
      ...entry(progress),
      motivationRow(F, {
        gap: 52 * g,
        size: 30,
        x: F.align === 'right' ? x1 : F.align === 'center' ? F.W / 2 : x0,
      }),
      stampRow(F, { gap: 52 * g, align: 'left', x: x0 }),
    ];
    const blocks = stack(F, rows, 'upper');
    return [...columnRule(F, blocks, vx0 - 22 * F.u), ...blocks];
  },
};

/** A faint vertical rule between the label and figure columns, from the first to the last rule. */
function columnRule(F: Frame, blocks: Block[], x: number): Block[] {
  const rules = blocks.filter((b) => !b.element);
  if (rules.length < 2) return [];
  const top = Math.min(...rules.map((b) => b.box.y));
  const bottom = Math.max(...rules.map((b) => b.box.y + b.box.h));
  const xx = Math.round(x);
  return [
    {
      box: { x: xx, y: top, w: 1, h: bottom - top },
      draw(ctx) {
        ctx.fillStyle = F.pal.faint;
        ctx.fillRect(xx, Math.round(top), Math.max(1, Math.round(F.u)), Math.round(bottom - top));
      },
    },
  ];
}
