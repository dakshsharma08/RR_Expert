/**
 * Living Wallpaper client. The server keeps the design + a progress snapshot behind
 * an unguessable token; the URL returns TODAY's PNG every time it's fetched.
 * Only this device knows the secret needed to update or revoke the link.
 */
import { db, nowIso, type WallpaperRow } from '@/db/db';
import type { GoalData } from '@/db/hooks';
import type { GoalMetrics } from '@/lib/metrics';
import type { LivingWallpaperCreateResponse, WallpaperSnapshot } from '@shared/api';
import type { WallpaperDesign } from '@shared/wallpaper/types';
import { ApiCallError } from '@/lib/api';

export function buildSnapshot(data: GoalData, m: GoalMetrics, motivation: string | null): WallpaperSnapshot {
  return {
    goalTitle: data.goal.title,
    deadlineUtc: data.goal.deadline_utc,
    // Same start as the in-app countdown (creation time, which is never after approval).
    startUtc: data.goal.start_utc,
    timezone: data.goal.timezone,
    completed: data.goal.status === 'completed',
    progressPct: m.progress,
    motivation,
    milestones: data.milestones.map((x) => ({
      title: x.title,
      targetDate: x.target_date,
      done: x.status === 'completed',
    })),
  };
}

/** Images live only on this device, so a link always uses a non-photo background. */
export function shareableDesign(design: WallpaperDesign): WallpaperDesign {
  if (design.background.kind !== 'image') return design;
  return { ...design, background: { ...design.background, kind: 'theme', image: undefined } };
}

async function call<T>(method: string, path: string, body?: unknown, secret?: string): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(secret ? { 'X-Wallpaper-Secret': secret } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }).catch(() => null);
  if (!res)
    throw new ApiCallError(
      { code: 'AI_BUSY', message: "You're offline. Try again when you're connected.", retryable: true },
      0,
    );
  const json = await res.json().catch(() => null);
  if (!res.ok)
    throw new ApiCallError(
      json ?? { code: 'INTERNAL', message: 'The wallpaper service is unavailable.', retryable: true },
      res.status,
    );
  return json as T;
}

export async function createLivingWallpaper(
  row: WallpaperRow,
  snapshot: WallpaperSnapshot,
): Promise<WallpaperRow> {
  const r = await call<LivingWallpaperCreateResponse>('POST', '/api/wallpaper', {
    design: shareableDesign(row.design_json),
    snapshot,
  });
  const next: WallpaperRow = {
    ...row,
    share_token: r.token,
    share_secret: r.secret,
    share_url: r.url,
    revoked_at: null,
    updated_at: nowIso(),
  };
  await db.wallpapers.put(next);
  return next;
}

export async function updateLivingWallpaper(row: WallpaperRow, snapshot: WallpaperSnapshot): Promise<void> {
  if (!row.share_token || !row.share_secret || row.revoked_at) return;
  await call(
    'PUT',
    `/api/wallpaper/${row.share_token}`,
    { design: shareableDesign(row.design_json), snapshot },
    row.share_secret,
  );
  await db.wallpapers.update(row.id, { updated_at: nowIso() });
}

export async function revokeLivingWallpaper(row: WallpaperRow): Promise<void> {
  if (row.share_token && row.share_secret) {
    await call('DELETE', `/api/wallpaper/${row.share_token}`, undefined, row.share_secret).catch(
      (e: ApiCallError) => {
        if (e.status !== 404) throw e; // already gone server-side → still mark revoked locally
      },
    );
  }
  await db.wallpapers.update(row.id, { revoked_at: nowIso(), share_secret: null, updated_at: nowIso() });
}
