/**
 * Orbit: progress drawn as a thin gold orbit around the number, with minute
 * ticks like a watch bezel. The planet (dot) sits where today is.
 */
import {
  caps,
  column,
  custom,
  milestoneRow,
  motivationRow,
  numeral,
  stack,
  stampRow,
  text,
  type Block,
  type Row,
  type TemplateDef,
} from './kit';

export const orbit: TemplateDef = {
  id: 'orbit',
  label: 'Orbit',
  description: 'Progress as a fine gold orbit around the number, ticked like a watch bezel.',
  defaults: {
    display: 'fraunces',
    ui: 'inter',
    numbers: 'fraunces',
    weight: 300,
    tracking: 0.22,
    align: 'center',
    scale: 1,
    grain: 0.08,
    theme: 'champagne-gold',
  },
  glow: (B) => ({ x: B.W / 2, y: B.band.top + B.band.height * 0.3, r: B.W * 0.7 }),
  layout(F) {
    const { s, g, u, band, pal, str, show } = F;
    const D = Math.min(band.width * 0.86, 680 * s);
    const R = D / 2;
    const cx = F.align === 'left' ? band.left + R : F.align === 'right' ? band.right - R : F.W / 2;

    // Everything inside the ring is centred on the ring.
    const inner = column([
      show.dayOfTotal
        ? caps(F, str.dayOfTotal, {
            align: 'center',
            x: cx,
            maxWidth: D * 0.6,
            color: pal.accentInk,
            size: 23 * s,
            element: 'dayOfTotal',
          })
        : null,
      show.daysLeft
        ? numeral(F, {
            text: str.numeral,
            font: F.fonts.numbers,
            weight: F.weight,
            maxSize: 0.46 * D,
            maxWidth: 0.64 * D,
            maxHeight: 0.3 * D,
            color: pal.text,
            tracking: -0.03,
            align: 'center',
            x: cx,
            element: 'daysLeft',
            gap: 44 * g,
          })
        : null,
      show.daysLeft
        ? caps(F, str.daysLabel, {
            align: 'center',
            x: cx,
            maxWidth: D * 0.62,
            color: pal.text,
            size: 27 * s,
            element: 'daysLeft',
            gap: 40 * g,
          })
        : null,
    ]);

    const ring: Row = custom(D, 0, (y) => {
      const cy = y + R;
      const pct = str.pct;
      const blocks: Block[] = [
        {
          element: show.progress ? 'progress' : undefined,
          box: { x: cx - R, y, w: D, h: D },
          draw(ctx) {
            const hair = Math.max(1, 1.4 * u);
            // Track.
            ctx.strokeStyle = pal.faint;
            ctx.lineWidth = hair;
            ctx.beginPath();
            ctx.arc(cx, cy, R, 0, Math.PI * 2);
            ctx.stroke();
            // Bezel: 60 minute ticks, every fifth one longer and brighter.
            for (let i = 0; i < 60; i++) {
              const a = -Math.PI / 2 + (i / 60) * Math.PI * 2;
              const major = i % 5 === 0;
              const r0 = R - (major ? 30 : 17) * u;
              const r1 = R - 9 * u;
              ctx.strokeStyle = major ? pal.hairline : pal.faint;
              ctx.lineWidth = major ? Math.max(1, 2 * u) : hair;
              ctx.beginPath();
              ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
              ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
              ctx.stroke();
            }
            if (!show.progress) return;
            // The orbit itself: from 12 o'clock, clockwise.
            const end = -Math.PI / 2 + pct * Math.PI * 2;
            if (pct > 0.001) {
              ctx.strokeStyle = pal.accent;
              ctx.lineWidth = Math.max(1.5, 3 * u);
              ctx.lineCap = 'round';
              ctx.beginPath();
              ctx.arc(cx, cy, R, -Math.PI / 2, end);
              ctx.stroke();
            }
            // The planet: a small solid dot with a hairline halo (no glow).
            const px = cx + Math.cos(end) * R;
            const py = cy + Math.sin(end) * R;
            ctx.strokeStyle = pal.hairline;
            ctx.lineWidth = hair;
            ctx.beginPath();
            ctx.arc(px, py, 15 * u, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = pal.accentSoft;
            ctx.beginPath();
            ctx.arc(px, py, 7 * u, 0, Math.PI * 2);
            ctx.fill();
          },
        },
      ];
      // Optically centre the inner stack (a hair above true centre).
      if (inner) blocks.push(...inner.place(cy - inner.h / 2 - D * 0.01));
      return blocks;
    });

    // Details line up with the ring: its centre, or its left/right edge.
    const tx = F.align === 'center' ? cx : F.align === 'left' ? band.left : band.right;
    const align = F.align;
    const rows: (Row | null)[] = [
      show.goalTitle
        ? caps(F, str.goal, {
            color: pal.accentInk,
            weight: 600,
            size: 27 * s,
            element: 'goalTitle',
            align,
            x: tx,
          })
        : null,
      { ...ring, gap: show.goalTitle ? 64 * g : 0 },
      show.progress
        ? caps(F, str.progress, {
            color: pal.accentInk,
            element: 'progress',
            size: 24 * s,
            gap: 56 * g,
            align,
            x: tx,
          })
        : null,
      show.targetDate
        ? column(
            [
              caps(F, 'Target', { element: 'targetDate', size: 22 * s, align, x: tx }),
              text(F, {
                text: str.target,
                font: F.fonts.display,
                size: 36 * s,
                weight: 400,
                color: pal.text,
                element: 'targetDate',
                maxWidth: band.width,
                gap: 20 * g,
                align,
                x: tx,
              }),
            ],
            64 * g,
          )
        : null,
      milestoneRow(F, { gap: 60 * g, size: 36, align, x: tx }),
      motivationRow(F, { gap: 60 * g, size: 32, align, x: tx }),
      stampRow(F, { gap: 64 * g, align, x: tx }),
    ];
    return stack(F, rows, 'upper');
  },
};
