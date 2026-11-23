/**
 * Constellation: the plan as a shallow arc across the sky. Milestones are small
 * stars; the ones already reached are lit, the rest are faint points. A fine
 * dust of seeded stars sits in the background.
 */
import {
  caps,
  custom,
  milestoneRow,
  motivationRow,
  mulberry32,
  numeral,
  sparklePath,
  stack,
  stampRow,
  text,
  timelinePoints,
  type Block,
  type Row,
  type TemplateDef,
} from './kit';
import { withAlpha } from '../contrast';

export const constellation: TemplateDef = {
  id: 'constellation',
  label: 'Constellation',
  description: 'Milestones as small stars on a faint arc; the path so far is lit.',
  defaults: {
    display: 'instrument-serif',
    ui: 'inter',
    numbers: 'instrument-serif',
    weight: 400,
    tracking: 0.24,
    align: 'center',
    scale: 1,
    grain: 0.1,
    theme: 'midnight-sapphire',
  },
  glow: (B) => ({ x: B.W / 2, y: B.band.top + B.band.height * 0.18, r: B.W * 0.8 }),
  paintBackground(ctx, B) {
    if (B.hasImage) return;
    // Star dust: same seed → same sky every time.
    const rnd = mulberry32(0x57a2);
    const count = Math.round(170 * ((B.W * B.H) / (1080 * 2340)));
    const ink = B.pal.mode === 'dark' ? '#ffffff' : B.pal.accent;
    for (let i = 0; i < count; i++) {
      const x = rnd() * B.W;
      const y = rnd() * B.H;
      const big = rnd() > 0.93;
      const r = (big ? 1.5 + rnd() * 1.1 : 0.6 + rnd() * 0.8) * B.u;
      const a = big ? 0.22 + rnd() * 0.2 : 0.05 + rnd() * 0.16;
      ctx.fillStyle = withAlpha(ink, a);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  layout(F) {
    const { s, g, u, band, pal, str, show } = F;
    const x0 = band.left;
    const x1 = band.right;
    const chord = x1 - x0;
    const sag = Math.min(chord * 0.2, 190 * u); // how high the arc rises in the middle
    const top = 32 * u; // room for the tallest star / ring above the apex
    const labelSize = 21 * s;
    const labelGap = 46 * g;
    const labels = [
      caps(F, 'Start', { align: 'left', x: x0, size: labelSize, element: 'progress' }),
      caps(F, str.progress, {
        align: 'center',
        x: (x0 + x1) / 2,
        size: labelSize,
        color: pal.accentInk,
        element: 'progress',
      }),
      caps(F, 'Due', { align: 'right', x: x1, size: labelSize, element: 'progress' }),
    ];
    const arcH = top + sag + labelGap + labels[0]!.h;

    const arc: Row | null = show.progress
      ? custom(arcH, 0, (y) => {
          const apexY = y + top;
          const baseY = apexY + sag;
          // Circle through both ends and the apex.
          const R = (chord * chord) / 4 / (2 * sag) + sag / 2;
          const cx = (x0 + x1) / 2;
          const cy = apexY + R;
          const aL = Math.atan2(baseY - cy, x0 - cx);
          const aR = Math.atan2(baseY - cy, x1 - cx);
          const at = (t: number) => aL + (aR - aL) * t;
          const point = (t: number) => ({ x: cx + Math.cos(at(t)) * R, y: cy + Math.sin(at(t)) * R });
          const pts = timelinePoints(F);
          const pct = str.pct;
          const blocks: Block[] = [
            {
              element: 'progress',
              box: { x: x0 - 20 * u, y, w: chord + 40 * u, h: top + sag + 20 * u },
              draw(ctx) {
                // Path still to travel: a dotted line.
                ctx.strokeStyle = pal.hairline;
                ctx.lineWidth = Math.max(1, 2.2 * u);
                ctx.lineCap = 'round';
                ctx.setLineDash([0.001, 12 * u]);
                ctx.beginPath();
                ctx.arc(cx, cy, R, at(pct), aR);
                ctx.stroke();
                ctx.setLineDash([]);
                // Path travelled: a solid fine line.
                if (pct > 0.001) {
                  ctx.strokeStyle = pal.accent;
                  ctx.lineWidth = Math.max(1, 1.8 * u);
                  ctx.beginPath();
                  ctx.arc(cx, cy, R, aL, at(pct));
                  ctx.stroke();
                }
                // Milestone stars: reached ones are lit sparkles, the rest dim points.
                for (const m of pts) {
                  const p = point(m.at);
                  const isEnd = m.at >= 0.999;
                  if (m.done) {
                    ctx.fillStyle = pal.accentSoft;
                    sparklePath(ctx, p.x, p.y, (isEnd ? 24 : 18) * u);
                    ctx.fill();
                  } else if (isEnd) {
                    ctx.strokeStyle = pal.hairline;
                    ctx.lineWidth = Math.max(1, 1.4 * u);
                    sparklePath(ctx, p.x, p.y, 22 * u);
                    ctx.stroke();
                  } else {
                    ctx.fillStyle = pal.hairline;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, 4.5 * u, 0, Math.PI * 2);
                    ctx.fill();
                  }
                }
                // Start point.
                const s0 = point(0);
                ctx.fillStyle = pal.accent;
                ctx.beginPath();
                ctx.arc(s0.x, s0.y, 4 * u, 0, Math.PI * 2);
                ctx.fill();
                // "You are here": a fine ring. If a star sits right there, the ring circles that star.
                const near = pts.find((m) => Math.abs(m.at - pct) < 0.04 && m.at < 0.999);
                const here = point(near ? near.at : pct);
                ctx.strokeStyle = pal.accent;
                ctx.lineWidth = Math.max(1, 1.6 * u);
                ctx.beginPath();
                ctx.arc(here.x, here.y, (near ? 28 : 11) * u, 0, Math.PI * 2);
                ctx.stroke();
                if (!near) {
                  ctx.fillStyle = pal.text;
                  ctx.beginPath();
                  ctx.arc(here.x, here.y, 3.5 * u, 0, Math.PI * 2);
                  ctx.fill();
                }
              },
            },
          ];
          const ly = baseY + labelGap;
          for (const l of labels) blocks.push(...l.place(ly));
          return blocks;
        })
      : null;

    const rows: (Row | null)[] = [
      show.goalTitle
        ? caps(F, str.goal, { color: pal.accentInk, weight: 600, size: 26 * s, element: 'goalTitle' })
        : null,
      arc ? { ...arc, gap: 44 * g } : null,
      show.daysLeft
        ? numeral(F, {
            text: str.numeral,
            font: F.fonts.numbers,
            weight: F.weight,
            maxSize: 560 * s,
            maxWidth: band.width * 0.9,
            color: pal.text,
            tracking: -0.02,
            element: 'daysLeft',
            gap: 84 * g,
          })
        : null,
      show.daysLeft
        ? caps(F, str.daysLabel, { size: 29 * s, color: pal.text, element: 'daysLeft', gap: 46 * g })
        : null,
      show.dayOfTotal
        ? caps(F, str.dayOfTotal, { size: 23 * s, color: pal.accentInk, element: 'dayOfTotal', gap: 64 * g })
        : null,
      show.targetDate
        ? text(F, {
            text: `Due ${str.target}`,
            font: F.fonts.display,
            size: 38 * s,
            weight: 400,
            color: pal.text,
            maxWidth: band.width,
            element: 'targetDate',
            gap: (show.dayOfTotal ? 26 : 64) * g,
          })
        : null,
      milestoneRow(F, { gap: 60 * g, size: 40 }),
      motivationRow(F, { gap: 58 * g, size: 38, weight: 400 }),
      stampRow(F, { gap: 60 * g }),
    ];
    return stack(F, rows, 'upper');
  },
};
