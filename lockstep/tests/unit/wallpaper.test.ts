import { describe, expect, it, beforeAll } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import {
  BAND_SLACK,
  DEVICES,
  TEMPLATE_LIST,
  defaultDesign,
  getDevice,
  normalizeDesign,
  resolveSize,
  wrapLines,
  ellipsize,
  type DeviceId,
  type ThemeId,
  type WallpaperData,
  type WallpaperDesign,
} from '../../shared/wallpaper';
import { buildStrings } from '../../shared/wallpaper/templates/kit';
import { registerWallpaperFonts, renderWallpaperPng } from '../../server/wallpaper/node-render';

const DATA: WallpaperData = {
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
};

/** Width and height from a PNG's IHDR chunk (bytes 16–23, big-endian). */
function pngSize(png: Buffer): { width: number; height: number } {
  expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  expect(png.subarray(12, 16).toString('ascii')).toBe('IHDR');
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

/** A bright, busy "photo" drawn on a canvas, so tests need no network or files. */
function busyBrightImage() {
  const c = createCanvas(800, 1400);
  const x = c.getContext('2d');
  x.fillStyle = '#fbf3df';
  x.fillRect(0, 0, 800, 1400);
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 300; i++) {
    x.fillStyle = `hsla(${Math.floor(rnd() * 360)}, 70%, ${60 + rnd() * 35}%, 0.8)`;
    x.fillRect(rnd() * 800, rnd() * 1400, 20 + rnd() * 160, 20 + rnd() * 160);
  }
  return c;
}

beforeAll(() => {
  const fonts = registerWallpaperFonts();
  expect(fonts.every((f) => f.ok)).toBe(true);
});

describe('devices and designs', () => {
  it('resolves every preset to its native size', () => {
    for (const d of Object.values(DEVICES)) {
      expect(resolveSize({ device: d.id })).toEqual({ width: d.width, height: d.height });
      // The content band sits below the widgets and above the bottom controls.
      expect(d.content.top).toBeGreaterThanOrEqual(d.safe.widgets[1]);
      expect(d.content.bottom).toBeLessThanOrEqual(d.safe.bottomControls[0]);
    }
    expect(resolveSize({ device: 'iphone-pro-max' })).toEqual({ width: 1320, height: 2868 });
    expect(resolveSize({ device: 'iphone-se' })).toEqual({ width: 750, height: 1334 });
  });

  it('clamps custom sizes and borrows the closest safe zones', () => {
    expect(resolveSize({ device: 'custom', custom: { width: 10, height: 99999 } })).toEqual({
      width: 320,
      height: 4096,
    });
    expect(getDevice('custom', { width: 720, height: 1280 }).safe).toEqual(DEVICES['iphone-se'].safe);
  });

  it('normalizeDesign clamps out-of-range values and fills gaps', () => {
    const d = defaultDesign('orbit');
    const messy = {
      ...d,
      typography: { ...d.typography, scale: 9, weight: 50, tracking: 4 },
      background: { kind: 'image', grain: -1, image: { src: 'x', blur: 400, dim: 2, zoom: 0, x: 5, y: -5 } },
      show: { daysLeft: false },
    } as unknown as WallpaperDesign;
    const n = normalizeDesign(messy);
    expect(n.typography).toMatchObject({ scale: 1.4, weight: 300, tracking: 0.3 });
    expect(n.background).toMatchObject({ grain: 0, image: { blur: 40, dim: 0.9, zoom: 1, x: 1, y: -1 } });
    expect(n.show.daysLeft).toBe(false);
    expect(n.show.motivation).toBe(true);
  });
});

describe('wording', () => {
  it('labels every state and never shows seconds', () => {
    const d = defaultDesign();
    const s = (patch: Partial<WallpaperData>) => buildStrings({ ...DATA, ...patch }, d);
    expect(s({}).daysLabel).toBe('days left');
    expect(s({ daysLeft: 1 }).daysLabel).toBe('day left');
    expect(s({ state: 'due-today', daysLeft: 0 }).daysLabel).toBe('Due today');
    expect(s({ state: 'expired', daysLeft: -2 })).toMatchObject({
      daysLabel: 'Deadline passed',
      numeral: '0',
    });
    expect(s({ state: 'completed' })).toMatchObject({ daysLabel: 'Completed', progress: '100% done' });
    expect(s({ state: 'upcoming', daysLeft: 134, startsInDays: 14 }).daysLabel).toBe('Starts in 14 days');
    const all = Object.values(s({})).join(' ');
    expect(all).not.toMatch(/\d{1,2}:\d{2}:\d{2}/);
    expect(all).not.toMatch(/second/i);
  });

  it('takes the motivation line from the chosen source', () => {
    const d = defaultDesign();
    expect(buildStrings(DATA, { ...d, text: { source: 'none', custom: 'x' } }).motivation).toBeNull();
    expect(buildStrings(DATA, { ...d, text: { source: 'custom', custom: '  Keep going ' } }).motivation).toBe(
      'Keep going',
    );
  });
});

describe('text helpers', () => {
  it('wraps to at most N lines and ellipsizes the rest', () => {
    const ctx = createCanvas(10, 10).getContext('2d');
    ctx.font = '400 40px "Inter Variable"';
    const lines = wrapLines(ctx, 'one two three four five six seven eight nine ten eleven twelve', 300, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1]!.endsWith('…')).toBe(true);
    for (const l of lines) expect(ctx.measureText(l).width).toBeLessThanOrEqual(300);
    expect(ellipsize(ctx, 'Supercalifragilisticexpialidocious', 200).endsWith('…')).toBe(true);
    expect(wrapLines(ctx, 'short', 300, 2)).toEqual(['short']);
  });
});

// Every template × two themes (its own + a contrasting one) × three screen shapes.
const DEVICE_SET: DeviceId[] = ['iphone-se', 'iphone-pro-max', 'pixel'];
const cases = TEMPLATE_LIST.flatMap((t) => {
  const themes: ThemeId[] = [t.defaults.theme, t.defaults.theme === 'ivory' ? 'midnight-sapphire' : 'ivory'];
  return themes.flatMap((theme) => DEVICE_SET.map((device) => ({ template: t.id, theme, device })));
});

describe('renderWallpaper (node)', () => {
  it.each(cases)(
    '$template / $theme / $device renders at native size, inside the safe band',
    async ({ template, theme, device }) => {
      const design = defaultDesign(template, theme, device);
      const { png, report } = await renderWallpaperPng(design, DATA);
      const preset = DEVICES[device as Exclude<DeviceId, 'custom'>];
      expect(pngSize(png)).toEqual({ width: preset.width, height: preset.height });
      expect(report).toMatchObject({ width: preset.width, height: preset.height });

      // Plain theme backgrounds are designed to be readable without any scrim.
      expect(report.warnings).toEqual([]);

      // Every element is drawn, and stays inside the content band.
      expect(new Set(report.boxes.map((b) => b.element)).size).toBe(8);
      const slack = BAND_SLACK * Math.min(preset.width / 1080, preset.height / 2340) + 1;
      for (const b of report.boxes) {
        expect(b.y, `${b.element} top`).toBeGreaterThanOrEqual(preset.height * preset.content.top - slack);
        expect(b.y + b.h, `${b.element} bottom`).toBeLessThanOrEqual(
          preset.height * preset.content.bottom + slack,
        );
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w).toBeLessThanOrEqual(preset.width);
      }
    },
  );

  it('adds a scrim (fixed warning) over a busy bright photo', async () => {
    for (const template of ['monolith', 'aurora', 'minimal-mono'] as const) {
      const design = defaultDesign(template, 'champagne-gold', 'iphone');
      design.background = {
        kind: 'image',
        grain: 0.1,
        image: { src: '', blur: 4, dim: 0, zoom: 1, x: 0, y: 0 },
      };
      const { png, report } = await renderWallpaperPng(design, DATA, { image: busyBrightImage() });
      expect(pngSize(png)).toEqual({ width: 1206, height: 2622 });
      expect(report.warnings.length).toBeGreaterThan(0);
      expect(report.warnings.some((w) => w.fixed)).toBe(true);
      for (const w of report.warnings) {
        expect(w.contrast).toBeLessThan(4.5);
        expect(w.message.length).toBeGreaterThan(10);
      }
    }
  });

  it('reports an unfixable case honestly', async () => {
    // Mid-grey text on a white photo can't reach 4.5:1 under a capped scrim.
    const design = defaultDesign('monolith', 'champagne-gold', 'iphone-se');
    design.colors = { text: '#8a8a8a' };
    design.background = { kind: 'image', grain: 0, image: { src: '', blur: 0, dim: 0, zoom: 1, x: 0, y: 0 } };
    const white = createCanvas(100, 100);
    const wctx = white.getContext('2d');
    wctx.fillStyle = '#ffffff';
    wctx.fillRect(0, 0, 100, 100);
    const { report } = await renderWallpaperPng(design, DATA, { image: white });
    const unfixed = report.warnings.filter((w) => !w.fixed);
    expect(unfixed.length).toBeGreaterThan(0);
    expect(unfixed[0]!.message).toMatch(/Try/);
  });

  it('is deterministic (seeded grain): same input → identical PNG', async () => {
    const design = defaultDesign('grain', 'monochrome', 'iphone-se');
    const a = await renderWallpaperPng(design, DATA);
    const b = await renderWallpaperPng(design, DATA);
    expect(a.png.equals(b.png)).toBe(true);
  });

  it('hides elements that are switched off', async () => {
    const design = defaultDesign('monolith', undefined, 'pixel');
    design.show = { ...design.show, motivation: false, goalTitle: false, updatedStamp: false };
    const { report } = await renderWallpaperPng(design, { ...DATA, nextMilestone: null });
    const shown = report.boxes.map((b) => b.element).sort();
    expect(shown).toEqual(['dayOfTotal', 'daysLeft', 'progress', 'targetDate']);
  });

  it('copes with long text, big type, a custom gradient and every state', async () => {
    const design = defaultDesign('ledger', 'rose-gold', 'iphone-se');
    design.typography = { ...design.typography, scale: 1.4, align: 'right' };
    design.background = {
      kind: 'gradient',
      gradient: { from: '#101820', to: '#2a1a2a', angle: 135 },
      grain: 0.3,
    };
    for (const state of ['upcoming', 'active', 'due-today', 'completed', 'expired'] as const) {
      const { png, report } = await renderWallpaperPng(design, {
        ...DATA,
        state,
        daysLeft: state === 'upcoming' ? 1234 : DATA.daysLeft,
        goalTitle: 'A very long goal title that keeps going well past the width of any phone screen',
        nextMilestone: { title: 'An extremely long milestone title '.repeat(6), dateLabel: 'Wed 30 Dec' },
        motivation: 'A long motivational sentence '.repeat(8),
      });
      expect(pngSize(png)).toEqual({ width: 750, height: 1334 });
      const band = DEVICES['iphone-se'];
      for (const b of report.boxes)
        expect(b.y + b.h).toBeLessThanOrEqual(band.height * band.content.bottom + 20);
    }
  });
});
