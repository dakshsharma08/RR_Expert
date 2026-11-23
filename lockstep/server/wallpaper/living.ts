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
import { Router, type Request, type RequestHandler } from 'express';
import { z } from 'zod';
import type { LivingWallpaperCreateResponse, WallpaperSnapshot } from '../../shared/api';
import type { WallpaperData, WallpaperDesign } from '../../shared/wallpaper/types';
import { normalizeDesign } from '../../shared/wallpaper/templates';
import {
  computeCountdown,
  dayKey,
  diffDays,
  formatDayKey,
  formatInZone,
  isDayKey,
  isValidTimeZone,
} from '../../shared/time';
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
  // Parsed once and kept in memory (this process is the only writer).
  let cache: Record<string, StoredWallpaper> | null = null;
  const load = (): Record<string, StoredWallpaper> => {
    if (cache) return cache;
    try {
      cache = existsSync(path)
        ? (JSON.parse(readFileSync(path, 'utf8')) as Record<string, StoredWallpaper>)
        : {};
    } catch {
      cache = {};
    }
    return cache;
  };
  const save = (data: Record<string, StoredWallpaper>) => {
    cache = data;
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
export function upstashStore(
  cfg: { url: string; token: string },
  fetchImpl: typeof fetch = fetch,
): WallpaperStore {
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

export function storeFromEnv(
  env: NodeJS.ProcessEnv,
  upstash: { url: string; token: string } | null,
): WallpaperStore {
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
    .array(
      z.object({
        title: z.string().trim().min(1).max(160),
        targetDate: z.string().refine(isDayKey, 'Invalid date'),
        done: z.boolean(),
      }),
    )
    .max(40),
});

const BodySchema = z.object({ design: z.record(z.string(), z.unknown()), snapshot: SnapshotSchema });

const HEX = /^#[0-9a-fA-F]{6}$/;
const hexOr = (v: unknown, fallback?: string) => (typeof v === 'string' && HEX.test(v) ? v : fallback);
/** Links render on our server, so cap custom sizes to real-phone dimensions. */
export const LINK_MAX = { width: 1600, height: 3600 };

/**
 * Only what a wallpaper needs: theme/gradient backgrounds (photos stay on the user's
 * device), hex colours only, phone-sized custom dimensions. Everything else is dropped.
 */
export function safeDesign(raw: unknown): WallpaperDesign {
  const d = normalizeDesign(raw as WallpaperDesign);
  const colors = { accent: hexOr(d.colors.accent), text: hexOr(d.colors.text) };
  const gradient = d.background.gradient
    ? {
        from: hexOr(d.background.gradient.from, '#171717')!,
        to: hexOr(d.background.gradient.to, '#090909')!,
        angle: d.background.gradient.angle,
      }
    : undefined;
  const kind = d.background.kind === 'image' ? 'theme' : d.background.kind;
  const custom = d.custom
    ? { width: Math.min(LINK_MAX.width, d.custom.width), height: Math.min(LINK_MAX.height, d.custom.height) }
    : undefined;
  return {
    ...d,
    ...(custom ? { custom } : {}),
    colors: Object.fromEntries(Object.entries(colors).filter(([, v]) => v)) as WallpaperDesign['colors'],
    background: { kind, grain: d.background.grain, ...(gradient ? { gradient } : {}) },
    text: { ...d.text, custom: String(d.text.custom ?? '').slice(0, 120) },
  };
}

/** Requests over this size are refused before parsing (a design + snapshot is ~3 KB). */
export const MAX_BODY_BYTES = 64 * 1024;

// ───────────────────────── Today's data from a snapshot ─────────────────────────

export function wallpaperDataFromSnapshot(s: WallpaperSnapshot, now: Date): WallpaperData {
  const c = computeCountdown({
    nowMs: Math.max(now.getTime(), Date.parse(s.startUtc)),
    startUtc: s.startUtc,
    deadlineUtc: s.deadlineUtc,
    timezone: s.timezone,
    completed: s.completed,
  });
  const ordered = [...s.milestones].sort((a, b) =>
    a.targetDate < b.targetDate ? -1 : a.targetDate > b.targetDate ? 1 : 0,
  );
  const next = ordered.find((m) => !m.done) ?? null;
  const span = Math.max(1, diffDays(c.startKey, c.deadlineKey));
  return {
    goalTitle: s.goalTitle,
    daysLeft: Math.max(0, c.daysLeft),
    state: c.state,
    dayNumber: Math.max(1, c.dayNumber),
    totalDays: c.totalDays,
    deadlineLabel: formatInZone(s.deadlineUtc, s.timezone, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }),
    nextMilestone: next
      ? {
          title: next.title,
          dateLabel: formatDayKey(next.targetDate, { weekday: 'short', day: 'numeric', month: 'short' }),
        }
      : null,
    progressPct: s.completed ? 1 : s.progressPct,
    motivation: s.motivation,
    updatedLabel: `Updated ${formatDayKey(dayKey(now, s.timezone), { day: 'numeric', month: 'short' })}`,
    milestones: ordered.map((m) => ({
      title: m.title,
      at: Math.min(1, Math.max(0, diffDays(c.startKey, m.targetDate) / span)),
      done: m.done,
    })),
  };
}

// ───────────────────────── Routes ─────────────────────────

export interface WallpaperRouterDeps {
  store: WallpaperStore;
  now: () => Date;
  publicUrl: string | null;
  writeLimit?: RequestHandler;
  readLimit?: RequestHandler;
}

const pass: RequestHandler = (_req, _res, next) => next();

/** Refuse oversized bodies (express.json allows 15 MB for plan attachments). */
const sizeCap: RequestHandler = (req, _res, next) => {
  const len = Number(req.headers['content-length'] ?? 0);
  if (len > MAX_BODY_BYTES)
    return next(new AppError('INVALID_INPUT', 'That wallpaper is too large.', { status: 413 }));
  next();
};

/** Today's PNG per link, so repeated fetches don't re-render (small LRU). */
const pngCache = new Map<string, Buffer>();
function cachePng(key: string, png: Buffer) {
  if (pngCache.size >= 32) pngCache.delete(pngCache.keys().next().value!);
  pngCache.set(key, png);
}

function baseUrl(req: Request, publicUrl: string | null): string {
  if (publicUrl) return publicUrl.replace(/\/+$/, '');
  const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0] ?? req.protocol;
  return `${proto}://${req.headers.host}`;
}

export function createWallpaperRouter(deps: WallpaperRouterDeps): Router {
  const r = Router();
  const writeLimit = deps.writeLimit ?? pass;
  const readLimit = deps.readLimit ?? pass;

  r.post('/wallpaper', writeLimit, sizeCap, async (req, res, next) => {
    try {
      const parsed = BodySchema.safeParse(req.body);
      if (!parsed.success)
        throw new AppError('INVALID_INPUT', undefined, {
          details: parsed.error.issues.slice(0, 6).map((i) => `${i.path.join('.')}: ${i.message}`),
        });
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
      const body: LivingWallpaperCreateResponse = {
        token,
        secret,
        url: `${baseUrl(req, deps.publicUrl)}/api/wallpaper/${token}.png`,
      };
      res.status(201).json(body);
    } catch (e) {
      next(e);
    }
  });

  r.put('/wallpaper/:token', writeLimit, sizeCap, async (req, res, next) => {
    try {
      const token = String(req.params.token);
      const rec = TOKEN_RE.test(token) ? await deps.store.get(keyFor(token)) : null;
      const secret = String(req.header('x-wallpaper-secret') ?? '');
      // Wrong secret → 404, so nobody can probe which tokens exist.
      if (!rec || !secret || !sameHash(sha256(secret), rec.secretHash))
        throw new AppError('NOT_FOUND', 'That wallpaper link no longer exists.');
      const parsed = BodySchema.safeParse(req.body);
      if (!parsed.success)
        throw new AppError('INVALID_INPUT', undefined, {
          details: parsed.error.issues.slice(0, 6).map((i) => `${i.path.join('.')}: ${i.message}`),
        });
      await deps.store.put(keyFor(token), {
        ...rec,
        design: safeDesign(parsed.data.design),
        snapshot: parsed.data.snapshot,
        updatedAt: deps.now().toISOString(),
      });
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  r.delete('/wallpaper/:token', writeLimit, async (req, res, next) => {
    try {
      const token = String(req.params.token);
      const rec = TOKEN_RE.test(token) ? await deps.store.get(keyFor(token)) : null;
      const secret = String(req.header('x-wallpaper-secret') ?? '');
      if (!rec || !secret || !sameHash(sha256(secret), rec.secretHash))
        throw new AppError('NOT_FOUND', 'That wallpaper link no longer exists.');
      await deps.store.delete(keyFor(token));
      res.json({ ok: true, revoked: true });
    } catch (e) {
      next(e);
    }
  });

  r.get('/wallpaper/:file', readLimit, async (req, res, next) => {
    try {
      const m = /^([A-Za-z0-9_-]{32,64})\.png$/.exec(String(req.params.file));
      const key = m ? keyFor(m[1]!) : null;
      const rec = key ? await deps.store.get(key) : null;
      if (!rec || !key) throw new AppError('NOT_FOUND', 'This wallpaper link was revoked or never existed.');
      const now = deps.now();
      const cacheKey = `${key}:${dayKey(now, rec.snapshot.timezone)}:${rec.updatedAt}`;
      let png = pngCache.get(cacheKey);
      if (!png) {
        png = (await renderWallpaperPng(safeDesign(rec.design), wallpaperDataFromSnapshot(rec.snapshot, now)))
          .png;
        cachePng(cacheKey, png);
      }
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
