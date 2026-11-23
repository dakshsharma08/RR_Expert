/**
 * Grain: a film-grain texture, a deep vignette and one bold numeral.
 * Details are set in a monospace, like the edge print on a film strip.
 */
import {
  anchorX,
  bar,
  caps,
  column,
  custom,
  milestoneRow,
  motivationRow,
  numeral,
  stack,
  stampRow,
  type Row,
  type TemplateDef,
} from './kit';

export const grain: TemplateDef = {
  id: 'grain',
  label: 'Grain',
  description: 'Film-grain texture with a bold numeral and monospaced edge print.',
  defaults: {
    display: 'fraunces',
    ui: 'geist-mono',
    numbers: 'fraunces',
    weight: 700,
    tracking: 0.14,
    align: 'left',
    scale: 1,
    grain: 0.5,
    theme: 'monochrome',
  },
  vignette: 1.6,
  glow: (B) => ({ x: B.W * 0.35, y: B.band.top + B.band.height * 0.22, r: B.W * 1.0 }),
  layout(F) {
    const { s, g, u, band, pal, str, show } = F;
    const mono = F.fonts.ui;
    const ax = anchorX(F);
    const tick = 72 * u;
    const tickRow: Row = custom(Math.max(2, Math.round(3 * u)), 46 * g, (y) => {
      const x = F.align === 'left' ? ax : F.align === 'right' ? ax - tick : ax - tick / 2;
      return [
        {
          box: { x, y, w: tick, h: 3 * u },
          draw(ctx) {
            ctx.fillStyle = pal.accent;
            ctx.fillRect(Math.round(x), Math.round(y), Math.round(tick), Math.max(2, Math.round(3 * u)));
          },
        },
      ];
    });

    const rows: (Row | null)[] = [
      show.goalTitle
        ? caps(F, str.goal, { font: mono, size: 27 * s, color: pal.text, element: 'goalTitle' })
        : null,
      show.daysLeft
        ? numeral(F, {
            text: str.numeral,
            font: F.fonts.numbers,
            weight: F.weight,
            maxSize: 620 * s,
            maxWidth: band.width,
            color: pal.text,
            tracking: -0.045,
            element: 'daysLeft',
            gap: 60 * g,
          })
        : null,
      show.daysLeft
        ? caps(F, str.daysLabel, {
            font: mono,
            size: 32 * s,
            color: pal.accentInk,
            weight: 500,
            element: 'daysLeft',
            gap: 48 * g,
          })
        : null,
      tickRow,
      show.dayOfTotal
        ? caps(F, str.dayOfTotal, {
            font: mono,
            size: 27 * s,
            color: pal.text,
            element: 'dayOfTotal',
            gap: 52 * g,
          })
        : null,
      show.targetDate
        ? caps(F, `Due ${str.target}`, {
            font: mono,
            size: 27 * s,
            color: pal.text,
            element: 'targetDate',
            gap: (show.dayOfTotal ? 26 : 52) * g,
          })
        : null,
      milestoneRow(F, { gap: 60 * g, label: 'Next', size: 38, weight: 500, dateFont: mono }),
      show.progress
        ? column(
            [
              caps(F, str.progress, { font: mono, size: 23 * s, element: 'progress' }),
              bar(F, { pct: str.pct, thickness: 5, rounded: true, track: pal.faint, gap: 22 * g }),
            ],
            60 * g,
          )
        : null,
      motivationRow(F, { gap: 60 * g, size: 34, weight: 400 }),
      stampRow(F, { font: mono, gap: 60 * g }),
    ];
    return stack(F, rows, 'upper');
  },
};
