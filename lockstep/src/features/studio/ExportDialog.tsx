/**
 * Preview & Export modal. Renders the PNG at the phone's native pixel size, checks the
 * size from the PNG header, then offers Share (iOS "Save Image") or Download.
 */
import { useCallback, useEffect, useState } from 'react';
import { Download, RefreshCw, Share2, BookOpen, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { WallpaperGuide } from '@/features/guide/WallpaperGuide';
import type { WallpaperData, WallpaperDesign } from '@shared/wallpaper/types';
import { getDevice } from '@shared/wallpaper/devices';
import { exportFilename, exportPng, type ExportResult } from './canvas';
import { ReadabilityNotes } from './Panels';
import { setKv } from '@/db/repo';

export function ExportDialog({
  open,
  onOpenChange,
  design,
  data,
  goalTitle,
  goalId,
  todayKey,
  onRefresh,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  design: WallpaperDesign;
  data: WallpaperData;
  goalTitle: string;
  goalId: string;
  todayKey: string;
  onRefresh: () => Promise<void>;
}) {
  const [result, setResult] = useState<ExportResult | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [guide, setGuide] = useState(false);
  const device = getDevice(design.device, design.custom);
  const filename = exportFilename(goalTitle, design.device, todayKey);

  const render = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await exportPng(design, data);
      setResult(r);
      setUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(r.blob);
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [design, data]);

  // Render on open, and again whenever the wallpaper's DATA or DESIGN really changes
  // (e.g. "Refresh with today's progress"). Then Download/Share always get the image you see.
  const dataKey = JSON.stringify(data) + JSON.stringify(design);
  useEffect(() => {
    if (open) void render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dataKey]);

  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);

  const file = result ? new File([result.blob], filename, { type: 'image/png' }) : null;
  const canShareFiles =
    !!file &&
    typeof navigator !== 'undefined' &&
    'canShare' in navigator &&
    navigator.canShare?.({ files: [file] });

  async function share() {
    if (!file) return;
    try {
      await navigator.share({ files: [file], title: 'LOCKSTEP wallpaper' });
      void setKv(`exported:${goalId}`, new Date().toISOString());
    } catch (e) {
      if ((e as Error).name !== 'AbortError') download();
    }
  }
  function download() {
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    void setKv(`exported:${goalId}`, new Date().toISOString());
    toast.success('Wallpaper saved', { description: `${filename}. Next: set it as your lock screen.` });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Preview & export"
      description={`${device.label} · ${device.width} × ${device.height} px`}
      wide
    >
      <div className="grid gap-6 md:grid-cols-[minmax(0,240px)_1fr]">
        <div className="mx-auto w-full max-w-[150px] md:max-w-[240px]">
          <div
            className="relative overflow-hidden rounded-[28px] border border-line-strong bg-surface-2"
            style={{ aspectRatio: `${device.width} / ${device.height}` }}
          >
            {url && (
              <img src={url} alt={`Exported wallpaper for ${goalTitle}`} className="size-full object-cover" />
            )}
            {busy && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <Loader2 className="size-6 animate-spin text-gold" strokeWidth={1.5} aria-label="Rendering" />
              </div>
            )}
          </div>
        </div>
        <div className="min-w-0 space-y-4">
          {error && (
            <p
              role="alert"
              className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger"
            >
              {error}
            </p>
          )}
          {result && (
            <p className="flex items-center gap-2 text-sm text-success" role="status">
              <Check className="size-4" strokeWidth={2} aria-hidden /> {result.width} × {result.height} px,
              checked from the PNG header · {(result.blob.size / 1024 / 1024).toFixed(2)} MB
            </p>
          )}
          <p className="truncate font-mono text-xs text-muted" title={filename}>
            {filename}
          </p>
          {result && <ReadabilityNotes warnings={result.report.warnings} />}
          <div className="flex flex-wrap gap-2">
            {canShareFiles && (
              <Button
                onClick={() => void share()}
                disabled={!result}
                icon={<Share2 className="size-4" strokeWidth={1.5} />}
              >
                Share / Save Image
              </Button>
            )}
            <Button
              variant={canShareFiles ? 'secondary' : 'primary'}
              onClick={download}
              disabled={!result}
              icon={<Download className="size-4" strokeWidth={1.5} />}
            >
              Download PNG
            </Button>
            <Button
              variant="ghost"
              onClick={async () => {
                await onRefresh();
                toast.success("Updated with today's progress");
              }}
              disabled={busy}
              icon={<RefreshCw className="size-4" strokeWidth={1.5} />}
            >
              Refresh with today's progress
            </Button>
          </div>
          <p className="text-xs text-muted">
            Shows {data.state === 'active' ? `${data.daysLeft} days left` : data.state.replace('-', ' ')},{' '}
            {Math.round(data.progressPct * 100)}% done
            {data.nextMilestone ? `, next: ${data.nextMilestone.title}` : ''}. {data.updatedLabel}. Wallpapers
            are a snapshot: refresh after you make progress.
          </p>
          <div className="border-t border-hairline pt-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setGuide((g) => !g)}
              aria-expanded={guide}
              icon={<BookOpen className="size-4" strokeWidth={1.5} />}
            >
              {guide ? 'Hide' : 'How to set it as your lock screen'}
            </Button>
            {guide && (
              <div className="mt-4">
                <WallpaperGuide defaultTab={/android/i.test(navigator.userAgent) ? 'android' : 'ios'} />
              </div>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
