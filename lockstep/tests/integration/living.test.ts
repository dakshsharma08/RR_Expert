/** Living Wallpaper links: create → today's PNG → update (secret) → revoke → 404. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../../server/app';
import { memoryStore, wallpaperDataFromSnapshot } from '../../server/wallpaper/living';
import { defaultDesign } from '../../shared/wallpaper/templates';
import type { WallpaperSnapshot } from '../../shared/api';

const NOW = new Date('2026-11-23T12:00:00Z');
const snapshot: WallpaperSnapshot = {
  goalTitle: 'Ship the portfolio',
  deadlineUtc: '2026-12-04T18:00:00.000Z',
  startUtc: '2026-11-20T09:00:00.000Z',
  timezone: 'Europe/London',
  completed: false,
  progressPct: 0.25,
  motivation: 'One page a day.',
  milestones: [
    { title: 'Wireframes', targetDate: '2026-11-21', done: true },
    { title: 'Case study one', targetDate: '2026-11-27', done: false },
  ],
};

let server: Server;
let base = '';
const inner = memoryStore();
const puts: { design: { background: { kind: string } } }[] = [];
const store = {
  ...inner,
  put: async (k: string, v: Parameters<typeof inner.put>[1]) => {
    puts.push(v as never);
    return inner.put(k, v);
  },
};

beforeAll(async () => {
  server = createApp({ env: { ALLOWED_ORIGINS: '' }, now: () => NOW, wallpapers: store }).listen(
    0,
    '127.0.0.1',
  );
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

const json = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });

describe('living wallpaper', () => {
  it("computes today's data from the snapshot (server clock, goal zone)", () => {
    const d = wallpaperDataFromSnapshot(snapshot, NOW);
    expect(d.daysLeft).toBe(11);
    expect(d.dayNumber).toBe(4);
    expect(d.nextMilestone?.title).toBe('Case study one');
    expect(d.updatedLabel).toBe('Updated 23 Nov');
  });

  it('creates, renders, updates with the secret, and revokes', async () => {
    const design = {
      ...defaultDesign('orbit', undefined, 'android-1080'),
      background: { kind: 'image', image: { src: 'data:x', blur: 0, dim: 0, zoom: 1, x: 0, y: 0 }, grain: 0 },
    };
    const created = await json('POST', '/api/wallpaper', { design, snapshot });
    expect(created.status).toBe(201);
    const { token, secret, url } = (await created.json()) as { token: string; secret: string; url: string };
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(url).toBe(`${base}/api/wallpaper/${token}.png`);
    expect(url).not.toContain('portfolio'); // no personal data in the URL

    const png = await fetch(url);
    expect(png.status).toBe(200);
    expect(png.headers.get('content-type')).toBe('image/png');
    const buf = Buffer.from(await png.arrayBuffer());
    expect([buf.readUInt32BE(16), buf.readUInt32BE(20)]).toEqual([1080, 2400]);

    // Photos never leave the device: the stored design falls back to the theme background.
    expect(puts.at(-1)!.design.background.kind).toBe('theme');

    const wrong = await json(
      'PUT',
      `/api/wallpaper/${token}`,
      { design, snapshot },
      { 'X-Wallpaper-Secret': 'nope' },
    );
    expect(wrong.status).toBe(404);
    const ok = await json(
      'PUT',
      `/api/wallpaper/${token}`,
      { design, snapshot: { ...snapshot, progressPct: 0.5 } },
      { 'X-Wallpaper-Secret': secret },
    );
    expect(ok.status).toBe(200);

    const del = await json('DELETE', `/api/wallpaper/${token}`, undefined, { 'X-Wallpaper-Secret': secret });
    expect(del.status).toBe(200);
    expect((await fetch(url)).status).toBe(404);
  });

  it('strips everything but hex colours and caps link sizes', async () => {
    const { safeDesign } = await import('../../server/wallpaper/living');
    const d = safeDesign({
      ...defaultDesign('monolith', undefined, 'custom'),
      custom: { width: 4096, height: 4096 },
      colors: { accent: 'x'.repeat(1000), text: '#ffffff', junk: 'y' },
    } as never);
    expect(d.colors).toEqual({ text: '#ffffff' });
    expect(d.custom).toEqual({ width: 1600, height: 3600 });
  });

  it('refuses oversized bodies before parsing them', async () => {
    const big = { design: { colors: { accent: 'x'.repeat(200_000) } }, snapshot };
    expect((await json('POST', '/api/wallpaper', big)).status).toBe(413);
  });

  it('rejects bad input and unknown tokens', async () => {
    expect(
      (await json('POST', '/api/wallpaper', { design: {}, snapshot: { ...snapshot, timezone: 'Mars/Base' } }))
        .status,
    ).toBe(400);
    expect((await fetch(`${base}/api/wallpaper/${'a'.repeat(32)}.png`)).status).toBe(404);
    expect((await fetch(`${base}/api/wallpaper/short.png`)).status).toBe(404);
  });
});
