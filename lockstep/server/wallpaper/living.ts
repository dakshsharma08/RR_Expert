/**
 * Living Wallpaper: a private URL that always returns TODAY's lock-screen PNG.
 *
 * How it works (for learners):
 * - The app publishes a design + a small progress snapshot. We answer with an
 *   unguessable `token` (in the URL) and a separate `secret` (kept on the device).
 * - Every GET recomputes days left / "Day X of Y" / next milestone from the server
 *   clock in the goal's time zone, then renders the PNG with the SAME renderer the
 *   browser uses. So the picture changes every day even if the app is never opened.
 * - We store only SHA-256 hashes of the token and secret. A leaked database can't
 *   be turned back into working links. Revoking deletes the record, so the URL 404s.
 * - The URL contains no personal data: just a random token.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Router, type Request } from 'express';
import { z } from 'zod';
import type { LivingWallpaperCreateResponse, WallpaperSnapshot } from '../../shared/api';
import type { WallpaperData, WallpaperDesign } from '../../shared/wallpaper/types';
import { normalizeDesign } from '../../shared/wallpaper/templates';
import { computeCountdown, dayKey, diffDays, formatDayKey, formatInZone, isDayKey, isValidTimeZone } from '../../shared/time';
import { AppError } from '../lib/errors';
import { renderWallpaperPng } from './node-render';

// ───────────────────────── Storage ─────────────────────────

export interface StoredWallpaper {
  secretHash: string;
  design: WallpaperDesign;
  snapshot: WallpaperSnapshot;
  createdAt: string;
  updatedAt: string;
}

export interface WallpaperStore {
  kind: 'memory' | 'file' | 'upstash';
  get(key: string): Promise<StoredWallpaper | null>;
  put(key: string, value: StoredWallpaper): Promise<void>;
  delete(key: string): Promise<void>;
}

export function memoryStore(): WallpaperStore {
  const m = new Map<string, StoredWallpaper>();
  return {
    kind: 'memory',
    get: async (k) => m.get(k) ?? null,
    put: async (k, v) => void m.set(k, v),
    delete: async (k) => void m.delete(k),
  };
}

/** Local/Cloud Run: a JSON file survives restarts (not for serverless, whose disk is ephemeral). */
export function fileStore(path: string): WallpaperStore {
  const load = (): Record<string, StoredWallpaper> => {
    try {
      return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Record<string, StoredWallpaper>) : {};
    } catch {
      return {};
    }
  };
  const save = (data: Record<string, StoredWallpaper>) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(data));
  };
  return {
    kind: 'file',
    get: async (k) => load()[k] ?? null,
    put: async (k, v) => save({ ...load(), [k]: v }),
    delete: async (k) => {
      const d = load();
      delete d[k];
      save(d);
    },
  };
}

/** Serverless: Upstash Redis over REST (no client library needed). */
export function upstashStore(cfg: { url: string; token: string }, fetchImpl: typeof fetch = fetch): WallpaperStore {
  const cmd = async (args: (string | number)[]) => {
    const res = await fetchImpl(cfg.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    if (!res.ok) throw new Error(`Upstash ${res.status}`);
    return ((await res.json()) as { result: unknown }).result;
  };
  return {
    kind: 'upstash',
    get: async (k) => {
      const r = await cmd(['GET', k]);
      return typeof r === 'string' ? (JSON.parse(r) as StoredWallpaper) : null;
    },
    put: async (k, v) => void (await cmd(['SET', k, JSON.stringify(v)])),
    delete: async (k) => void (await cmd(['DEL', k])),
  };
}

export function storeFromEnv(env: NodeJS.ProcessEnv, upstash: { url: string; token: string } | null): WallpaperStore {
  if (upstash) return upstashStore(upstash);
  if (env.VERCEL) return memoryStore(); // ephemeral disk: be honest, it's memory
  return fileStore(env.WALLPAPER_STORE_FILE || '.data/wallpapers.json');
}

// ───────────────────────── Crypto helpers ─────────────────────────

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const keyFor = (token: string) => `lw:${sha256(token)}`;
const TOKEN_RE = /^[A-Za-z0-9_-]{32,64}$/;

function sameHash(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

// ───────────────────────── Validation ─────────────────────────

const SnapshotSchema = z.object({
  goalTitle: z.string().trim().min(1).max(300),
  deadlineUtc: z.string().refine((s) => Number.isFinite(Date.parse(s)), 'Invalid deadline'),
  startUtc: z.string().refine((s) => Number.isFinite(Date.parse(s)), 'Invalid start'),
  timezone: z.string().refine(isValidTimeZone, 'Unknown time zone'),
  completed: z.boolean(),
  progressPct: z.number().min(0).max(1),
  motivation: z.string().max(200).nullable(),
  milestones: z
    .array(z.object({ title: z.string().trim().min(1).max(160), targetDate: z.string().refine(isDayKey, 'Invalid date'), done: z.boolean() }))
    .max(40),
});

const BodySchema = z.object({ design: z.record(z.string(), z.unknown()), snapshot: SnapshotSchema });

/** Only theme/gradient backgrounds: photos stay on the user's device. */
function safeDesign(raw: unknown): WallpaperDesign {
  const d = normalizeDesign(raw as WallpaperDesign);
  return d.background.kind === 'image' ? { ...d, background: { ...d.background, kind: 'theme', image: undefined } } : d;
}

// ───────────────────────── Today's data from a snapshot ─────────────────────────

export function wallpaperDataFromSnapshot(s: WallpaperSnapshot, now: Date): WallpaperData {
  const c = computeCountdown({
    nowMs: Math.max(now.getTime(), Date.parse(s.startUtc)),
    startUtc: s.startUtc,
    deadlineUtc: s.deadlineUtc,
    timezone: s.timezone,
    completed: s.completed,
  });
  const ordered = [...s.milestones].sort((a, b) => (a.targetDate < b.targetDate ? -1 : a.targetDate > b.targetDate ? 1 : 0));
  const next = ordered.find((m) => !m.done) ?? null;
  const span = Math.max(1, diffDays(c.startKey, c.deadlineKey));
  return {
    goalTitle: s.goalTitle,
    daysLeft: Math.max(0, c.daysLeft),
    state: c.state,
    dayNumber: Math.max(1, c.dayNumber),
    totalDays: c.totalDays,
    deadlineLabel: formatInZone(s.deadlineUtc, s.timezone, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
    nextMilestone: next ? { title: next.title, dateLabel: formatDayKey(next.targetDate, { weekday: 'short', day: 'numeric', month: 'short' }) } : null,
    progressPct: s.completed ? 1 : s.progressPct,
    motivation: s.motivation,
    updatedLabel: `Updated ${formatDayKey(dayKey(now, s.timezone), { day: 'numeric', month: 'short' })}`,
    milestones: ordered.map((m) => ({ title: m.title, at: Math.min(1, Math.max(0, diffDays(c.startKey, m.targetDate) / span)), done: m.done })),
  };
}

// ───────────────────────── Routes ─────────────────────────

export interface WallpaperRouterDeps {
  store: WallpaperStore;
  now: () => Date;
  publicUrl: string | null;
}

function baseUrl(req: Request, publicUrl: string | null): string {
  if (publicUrl) return publicUrl.replace(/\/+$/, '');
  const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0] ?? req.protocol;
  return `${proto}://${req.headers.host}`;
}

export function createWallpaperRouter(deps: WallpaperRouterDeps): Router {
  const r = Router();

  r.post('/wallpaper', async (req, res, next) => {
    try {
      const parsed = BodySchema.safeParse(req.body);
      if (!parsed.success) throw new AppError('INVALID_INPUT', undefined, { details: parsed.error.issues.slice(0, 6).map((i) => `${i.path.join('.')}: ${i.message}`) });
      const token = randomBytes(24).toString('base64url'); // 192 bits: unguessable
      const secret = randomBytes(24).toString('base64url');
      const now = deps.now().toISOString();
      await deps.store.put(keyFor(token), {
        secretHash: sha256(secret),
        design: safeDesign(parsed.data.design),
        snapshot: parsed.data.snapshot,
        createdAt: now,
        updatedAt: now,
      });
      const body: LivingWallpaperCreateResponse = { token, secret, url: `${baseUrl(req, deps.publicUrl)}/api/wallpaper/${token}.png` };
      res.status(201).json(body);
    } catch (e) {
      next(e);
    }
  });

  r.put('/wallpaper/:token', async (req, res, next) => {
    try {
      const token = String(req.params.token);
      const rec = TOKEN_RE.test(token) ? await deps.store.get(keyFor(token)) : null;
      const secret = String(req.header('x-wallpaper-secret') ?? '');
      // Wrong secret → 404, so nobody can probe which tokens exist.
      if (!rec || !secret || !sameHash(sha256(secret), rec.secretHash)) throw new AppError('NOT_FOUND', 'That wallpaper link no longer exists.');
      const parsed = BodySchema.safeParse(req.body);
      if (!parsed.success) throw new AppError('INVALID_INPUT', undefined, { details: parsed.error.issues.slice(0, 6).map((i) => `${i.path.join('.')}: ${i.message}`) });
      await deps.store.put(keyFor(token), { ...rec, design: safeDesign(parsed.data.design), snapshot: parsed.data.snapshot, updatedAt: deps.now().toISOString() });
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  r.delete('/wallpaper/:token', async (req, res, next) => {
    try {
      const token = String(req.params.token);
      const rec = TOKEN_RE.test(token) ? await deps.store.get(keyFor(token)) : null;
      const secret = String(req.header('x-wallpaper-secret') ?? '');
      if (!rec || !secret || !sameHash(sha256(secret), rec.secretHash)) throw new AppError('NOT_FOUND', 'That wallpaper link no longer exists.');
      await deps.store.delete(keyFor(token));
      res.json({ ok: true, revoked: true });
    } catch (e) {
      next(e);
    }
  });

  r.get('/wallpaper/:file', async (req, res, next) => {
    try {
      const m = /^([A-Za-z0-9_-]{32,64})\.png$/.exec(String(req.params.file));
      const rec = m ? await deps.store.get(keyFor(m[1]!)) : null;
      if (!rec) throw new AppError('NOT_FOUND', 'This wallpaper link was revoked or never existed.');
      const { png } = await renderWallpaperPng(rec.design, wallpaperDataFromSnapshot(rec.snapshot, deps.now()));
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Content-Length', String(png.length));
      res.setHeader('Content-Disposition', 'inline; filename="lockstep-today.png"');
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.end(png);
    } catch (e) {
      next(e);
    }
  });

  return r;
}
