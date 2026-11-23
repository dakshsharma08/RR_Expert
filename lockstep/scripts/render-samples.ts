/**
 * Render sample wallpapers for every template × theme (plus a few device,
 * state and photo variants) into docs/evidence/wallpapers/.
 *
 *   npx tsx scripts/render-samples.ts            # everything
 *   npx tsx scripts/render-samples.ts orbit      # only templates whose id contains "orbit"
 *
 * Also writes contact sheets (all themes of each template side by side) so the
 * whole set can be reviewed at a glance.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { registerWallpaperFonts, renderWallpaperPng } from '../server/wallpaper/node-render';
import {
  DEVICES,
  TEMPLATE_LIST,
  THEME_LIST,
  defaultDesign,
  type DeviceId,
  type WallpaperData,
  type WallpaperDesign,
} from '../shared/wallpaper';

const OUT = join(process.cwd(), 'docs', 'evidence', 'wallpapers');
mkdirSync(OUT, { recursive: true });

export const SAMPLE_DATA: WallpaperData = {
  goalTitle: 'Finish thesis draft',
  daysLeft: 42,
  state: 'active',
  dayNumber: 78,
  totalDays: 120,
  deadlineLabel: 'Fri 15 Jan 2027',
  nextMilestone: { title: 'Write chapter 4: results and discussion', dateLabel: 'Mon 7 Dec' },
  progressPct: 0.62,
  motivation: 'Small steps, every single day.',
  updatedLabel: 'Updated 23 Nov',
  milestones: [
    { title: 'Literature review', at: 0.2, done: true },
    { title: 'Methods', at: 0.42, done: true },
    { title: 'Experiments', at: 0.6, done: true },
    { title: 'Chapter 4', at: 0.78, done: false },
    { title: 'Submit', at: 1, done: false },
  ],
};

const filter = process.argv[2] ?? '';

/**
 * Render one sample. Full-size PNGs are written only when `keep` is true; the
 * device and state checks go into contact sheets instead (grain makes
 * full-size PNGs 1–4 MB each, so 100+ of them would bloat the repo).
 */
async function save(name: string, design: WallpaperDesign, data = SAMPLE_DATA, image?: Buffer, keep = true) {
  const { png, report } = await renderWallpaperPng(design, data, { image });
  if (keep) writeFileSync(join(OUT, `${name}.png`), png);
  const warn = report.warnings.map((w) => `${w.element}:${w.contrast}${w.fixed ? '✓' : '✗'}`).join(' ');
  console.log(`${name.padEnd(44)} ${report.width}×${report.height}${warn ? `  warnings: ${warn}` : ''}`);
  return png;
}

/** A busy, bright "photo" made on a canvas (no network needed). */
function makeBusyPhoto(): Buffer {
  const c = createCanvas(900, 1600);
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 900, 1600);
  g.addColorStop(0, '#f6e7c8');
  g.addColorStop(0.5, '#d9b47a');
  g.addColorStop(1, '#7aa6c2');
  x.fillStyle = g;
  x.fillRect(0, 0, 900, 1600);
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 260; i++) {
    x.fillStyle = `hsla(${Math.floor(rnd() * 360)}, 60%, ${55 + rnd() * 40}%, ${0.4 + rnd() * 0.5})`;
    x.beginPath();
    x.arc(rnd() * 900, rnd() * 1600, 10 + rnd() * 120, 0, Math.PI * 2);
    x.fill();
  }
  return c.toBuffer('image/png');
}

async function contactSheet(name: string, pngs: Buffer[], cols: number) {
  const thumbW = 300;
  const imgs = await Promise.all(pngs.map((p) => loadImage(p)));
  const first = imgs[0]!;
  const thumbH = Math.round((thumbW * first.height) / first.width);
  const gap = 16;
  const rows = Math.ceil(imgs.length / cols);
  const sheet = createCanvas(cols * thumbW + (cols + 1) * gap, rows * thumbH + (rows + 1) * gap);
  const ctx = sheet.getContext('2d');
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(0, 0, sheet.width, sheet.height);
  imgs.forEach((img, i) => {
    const cx = gap + (i % cols) * (thumbW + gap);
    const cy = gap + Math.floor(i / cols) * (thumbH + gap);
    ctx.drawImage(img, cx, cy, thumbW, thumbH);
  });
  writeFileSync(join(OUT, `_sheet-${name}.png`), sheet.toBuffer('image/png'));
}

async function main() {
  const fonts = registerWallpaperFonts();
  for (const f of fonts) if (!f.ok) console.warn(`Font not registered: ${f.family} (${f.path ?? 'missing'})`);

  const t0 = Date.now();
  // Every template × every theme, on the standard iPhone.
  for (const t of TEMPLATE_LIST) {
    if (filter && !t.id.includes(filter)) continue;
    const pngs: Buffer[] = [];
    for (const th of THEME_LIST)
      pngs.push(await save(`${t.id}--${th.id}`, defaultDesign(t.id, th.id, 'iphone')));
    await contactSheet(t.id, pngs, 6);
  }

  if (!filter) {
    // Each template in its default theme on every device (aspect-ratio check).
    const devices: DeviceId[] = Object.keys(DEVICES) as DeviceId[];
    for (const t of TEMPLATE_LIST) {
      const pngs: Buffer[] = [];
      for (const dev of devices) {
        const design = defaultDesign(t.id, undefined, dev);
        pngs.push(await save(`device--${t.id}--${dev}`, design, SAMPLE_DATA, undefined, false));
      }
      await contactSheet(`devices-${t.id}`, pngs, devices.length);
    }

    // States.
    const states: [string, Partial<WallpaperData>][] = [
      ['upcoming', { state: 'upcoming', daysLeft: 134, dayNumber: 0, startsInDays: 14, progressPct: 0 }],
      ['due-today', { state: 'due-today', daysLeft: 0, dayNumber: 120, progressPct: 0.94 }],
      ['expired', { state: 'expired', daysLeft: -3, dayNumber: 120, progressPct: 0.88, nextMilestone: null }],
      ['completed', { state: 'completed', daysLeft: 0, dayNumber: 120, progressPct: 1, nextMilestone: null }],
    ];
    const statePngs: Buffer[] = [];
    for (const [name, patch] of states) {
      for (const t of ['monolith', 'orbit'] as const) {
        const data = { ...SAMPLE_DATA, ...patch };
        statePngs.push(await save(`state--${name}--${t}`, defaultDesign(t), data, undefined, false));
      }
    }
    await contactSheet('states', statePngs, 8);

    // Busy bright photo: must trigger readability scrims.
    const photo = makeBusyPhoto();
    for (const t of ['monolith', 'aurora', 'minimal-mono'] as const) {
      const d = defaultDesign(t, 'champagne-gold');
      d.background = {
        kind: 'image',
        grain: 0.1,
        image: { src: '', blur: 12, dim: 0.15, zoom: 1, x: 0, y: 0 },
      };
      await save(`photo--${t}`, d, SAMPLE_DATA, photo);
    }

    // A custom gradient + right alignment + larger type + long text.
    const g = defaultDesign('monolith', 'rose-gold', 'iphone-pro-max');
    g.background = { kind: 'gradient', gradient: { from: '#1b1020', to: '#3a2233', angle: 160 }, grain: 0.2 };
    g.typography = { ...g.typography, align: 'right', scale: 1.3, weight: 500 };
    await save('variant--gradient-right-large', g, {
      ...SAMPLE_DATA,
      goalTitle: 'Run the Lisbon marathon under four hours, finally',
      nextMilestone: {
        title: 'Long run: 30 km at easy pace along the river, then stretch and refuel properly',
        dateLabel: 'Sun 6 Dec',
      },
      motivation:
        'The miles you run today are the ones that carry you on race day, when your legs are tired and the crowd is loud.',
    });
  }
  console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)} s → ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
