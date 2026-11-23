/** Export tab: export PNG, refresh, save to library, Living Wallpaper link. */
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Copy, Download, Link2, RefreshCw, Save, Trash2, BookOpen } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router';
import { Button, IconButton } from '@/components/ui/button';
import { db, nowIso, uid, type WallpaperRow } from '@/db/db';
import { ApiCallError, getHealth } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import type { WallpaperSnapshot } from '@shared/api';
import type { WallpaperDesign } from '@shared/wallpaper/types';
import { getDevice } from '@shared/wallpaper/devices';
import { normalizeDesign } from '@shared/wallpaper/templates';
import { createLivingWallpaper, revokeLivingWallpaper, updateLivingWallpaper } from './living';
import { Group } from './Panels';
import { ConfirmDialog } from '@/components/ui/dialog';

export function ExportPanel({
  goalId,
  goalTitle,
  design,
  setDesign,
  onExport,
  onRefresh,
  snapshot,
  makeThumb,
}: {
  goalId: string;
  goalTitle: string;
  design: WallpaperDesign;
  setDesign: (d: WallpaperDesign) => void;
  onExport: () => void;
  onRefresh: () => Promise<void>;
  snapshot: () => WallpaperSnapshot;
  makeThumb: () => string | null;
}) {
  const saved = useLiveQuery(
    () => db.wallpapers.where('goal_id').equals(goalId).reverse().sortBy('updated_at'),
    [goalId],
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const health = useQuery({ queryKey: ['health'], queryFn: getHealth, staleTime: 60_000 });
  const volatileStore = health.data?.wallpaperStore === 'memory';
  const device = getDevice(design.device, design.custom);
  const live = saved?.find((w) => w.share_token && !w.revoked_at) ?? null;

  async function saveToLibrary(): Promise<WallpaperRow> {
    const now = nowIso();
    const row: WallpaperRow = {
      id: uid(),
      goal_id: goalId,
      name: `${goalTitle.slice(0, 40)} · ${device.label}`,
      design_json: design,
      device_preset: design.device,
      share_token: null,
      share_secret: null,
      share_url: null,
      revoked_at: null,
      thumb: makeThumb(),
      created_at: now,
      updated_at: now,
    };
    await db.wallpapers.add(row);
    return row;
  }

  async function createLink() {
    setBusy('link');
    try {
      const row = await saveToLibrary();
      const r = await createLivingWallpaper(row, snapshot());
      toast.success('Living Wallpaper link created', {
        description: 'Add it to an iPhone Shortcuts automation (see the guide).',
      });
      if (r.share_url) void navigator.clipboard?.writeText(r.share_url).catch(() => undefined);
    } catch (e) {
      toast.error('Could not create the link', {
        description: e instanceof ApiCallError ? e.error.message : (e as Error).message,
      });
    } finally {
      setBusy(null);
    }
  }

  async function pushProgress() {
    if (!live) return;
    setBusy('push');
    try {
      await db.wallpapers.update(live.id, { design_json: design, thumb: makeThumb() });
      await updateLivingWallpaper({ ...live, design_json: design }, snapshot());
      toast.success('Link updated with your latest progress and design');
    } catch (e) {
      toast.error('Could not update the link', {
        description: e instanceof ApiCallError ? e.error.message : (e as Error).message,
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <Group title="Export">
        <Button
          size="lg"
          className="w-full"
          onClick={onExport}
          icon={<Download className="size-5" strokeWidth={1.5} />}
        >
          Export {device.width}×{device.height} PNG
        </Button>
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => void onRefresh().then(() => toast.success("Preview updated with today's progress"))}
          icon={<RefreshCw className="size-4" strokeWidth={1.5} />}
        >
          Refresh with today's progress
        </Button>
        <Link
          to="/guide"
          className="flex min-h-11 items-center justify-center gap-2 text-sm text-accent-text hover:underline"
        >
          <BookOpen className="size-4" strokeWidth={1.5} aria-hidden /> How to set it as your lock screen
        </Link>
      </Group>

      <Group title="Living Wallpaper (iPhone automation)">
        <p className="text-xs text-muted">
          A private link that always returns <em>today's</em> wallpaper: days left update daily, progress
          updates when you press "Update link". An iPhone Shortcuts automation can set it every morning. You
          set that up; LOCKSTEP never changes your phone on its own.
        </p>
        {live ? (
          <div className="space-y-2 rounded-[14px] border border-hairline p-3">
            <p className="break-all font-mono text-[11px] text-text">{live.share_url}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  void navigator.clipboard
                    ?.writeText(live.share_url ?? '')
                    .then(() => toast.success('Link copied'))
                }
                icon={<Copy className="size-4" strokeWidth={1.5} />}
              >
                Copy
              </Button>
              <Button
                size="sm"
                variant="secondary"
                loading={busy === 'push'}
                onClick={() => void pushProgress()}
                icon={<RefreshCw className="size-4" strokeWidth={1.5} />}
              >
                Update link
              </Button>
              <Button size="sm" variant="destructive" onClick={() => setConfirmRevoke(true)}>
                Revoke
              </Button>
            </div>
            <Link
              to="/guide"
              className="inline-flex min-h-11 items-center text-xs text-accent-text hover:underline"
            >
              Shortcuts setup guide →
            </Link>
          </div>
        ) : (
          <Button
            variant="secondary"
            className="w-full"
            loading={busy === 'link'}
            onClick={() => void createLink()}
            icon={<Link2 className="size-4" strokeWidth={1.5} />}
          >
            Create Living Wallpaper link
          </Button>
        )}
        {design.background.kind === 'image' && (
          <p className="text-xs text-muted">
            Photos stay on your device, so the link uses the theme background instead.
          </p>
        )}
        {volatileStore && (
          <p className="text-xs text-warning">
            This server keeps links in memory only, so they can stop working after a restart. (Developer: add
            Upstash Redis. See SETUP.md.)
          </p>
        )}
        {health.isFetched && !health.data && (
          <p className="text-xs text-warning">
            The LOCKSTEP server isn't reachable, so links can't be created right now.
          </p>
        )}
      </Group>

      <ConfirmDialog
        open={confirmRevoke}
        onOpenChange={setConfirmRevoke}
        title="Revoke this wallpaper link?"
        description="The link stops working immediately, including in any Shortcuts automation that uses it."
        confirmLabel="Revoke link"
        onConfirm={() =>
          live &&
          void revokeLivingWallpaper(live).then(() => toast.success('Link revoked. It stops working now.'))
        }
      />
      <Group title="Saved designs">
        <Button
          variant="ghost"
          onClick={() => void saveToLibrary().then(() => toast.success('Design saved to your library'))}
          icon={<Save className="size-4" strokeWidth={1.5} />}
        >
          Save this design
        </Button>
        {saved && saved.length > 0 && (
          <ul className="grid grid-cols-3 gap-2">
            {saved.map((w) => (
              <li key={w.id} className="group relative">
                <button
                  onClick={() => {
                    setDesign(normalizeDesign(w.design_json));
                    toast('Design loaded');
                  }}
                  className="block w-full overflow-hidden rounded-[10px] border border-hairline hover:border-accent"
                  aria-label={`Load design ${w.name}`}
                >
                  {w.thumb ? (
                    <img src={w.thumb} alt="" className="aspect-[9/19.5] w-full object-cover" />
                  ) : (
                    <span className="block aspect-[9/19.5] bg-surface-2" />
                  )}
                </button>
                {w.share_token && !w.revoked_at && (
                  <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[9px] text-gold-light">
                    LIVE
                  </span>
                )}
                <IconButton
                  label={`Delete design ${w.name}`}
                  className="absolute -right-1 -top-1 size-9 bg-surface-2/90"
                  onClick={async () => {
                    if (w.share_token && !w.revoked_at) await revokeLivingWallpaper(w).catch(() => undefined);
                    await db.wallpapers.delete(w.id);
                    toast('Design deleted', {
                      action: {
                        label: 'Undo',
                        onClick: () =>
                          void db.wallpapers.put({
                            ...w,
                            share_token: w.revoked_at ? w.share_token : null,
                            share_url: w.revoked_at ? w.share_url : null,
                          }),
                      },
                    });
                  }}
                >
                  <Trash2 className="size-3.5" strokeWidth={1.5} />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </Group>
    </div>
  );
}
