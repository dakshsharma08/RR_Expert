/**
 * Live phone preview. Renders the same canvas code as the export, at preview size,
 * with optional overlays: the lock-screen UI (clock, widgets, buttons) and the
 * safe zones / snap guides so you can see that content stays clear of them.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { getDevice } from '@shared/wallpaper/devices';
import { getTemplate, normalizeDesign } from '@shared/wallpaper/templates';
import { THEMES } from '@shared/wallpaper/themes';
import type { ElementId, RenderReport, WallpaperData, WallpaperDesign } from '@shared/wallpaper/types';
import { ensureFonts, loadDesignImage, renderTo } from './canvas';

export interface PreviewProps {
  design: WallpaperDesign;
  data: WallpaperData;
  /** CSS width of the phone screen. */
  width: number;
  showUi?: boolean;
  /** Draw the three widget placeholders (kept in the Studio, where they show placement). */
  widgets?: boolean;
  showSafe?: boolean;
  onReport?: (r: RenderReport) => void;
  className?: string;
  label?: string;
}

const ELEMENT_LABEL: Record<ElementId, string> = {
  goalTitle: 'Goal',
  daysLeft: 'Days left',
  dayOfTotal: 'Day X of Y',
  targetDate: 'Target date',
  nextMilestone: 'Next milestone',
  progress: 'Progress',
  motivation: 'Motivation',
  updatedStamp: 'Updated',
};

export function PhonePreview({
  design,
  data,
  width,
  showUi,
  widgets = true,
  showSafe,
  onReport,
  className,
  label,
}: PreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [report, setReport] = useState<RenderReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const d = normalizeDesign(design);
  const device = getDevice(d.device, d.custom);
  const aspect = device.height / device.width;
  const height = Math.round(width * aspect);
  const onReportRef = useRef(onReport);
  useLayoutEffect(() => {
    onReportRef.current = onReport;
  });

  useEffect(() => {
    let cancelled = false;
    let raf = 0;
    const draw = async () => {
      try {
        await ensureFonts(d);
        const image = d.background.kind === 'image' ? await loadDesignImage(d.background.image?.src) : null;
        if (cancelled) return;
        raf = requestAnimationFrame(() => {
          const c = canvasRef.current;
          if (!c) return;
          const dpr = Math.min(2, window.devicePixelRatio || 1);
          // Preview resolution: crisp on retina, but never above the export size.
          const pw = Math.min(device.width, Math.round(width * dpr));
          const ph = Math.round(pw * aspect);
          if (c.width !== pw || c.height !== ph) {
            c.width = pw;
            c.height = ph;
          }
          const r = renderTo(c, { design: d, data, image });
          setReport(r);
          setError(null);
          onReportRef.current?.(r);
        });
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    };
    void draw();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(d), JSON.stringify(data), width]);

  const radius = Math.round(width * 0.13);
  const ios = device.platform === 'ios';
  // Phones tint the clock dark over light wallpapers; mirror that so the mock stays readable.
  const lightBg =
    !!getTemplate(d.template).paper || (d.background.kind === 'theme' && THEMES[d.theme].mode === 'light');
  const sx = report ? width / report.width : 0;

  return (
    <div className={cn('relative shrink-0', className)} style={{ width: width + 16, height: height + 16 }}>
      {/* Phone body */}
      <div
        className="absolute inset-0 rounded-[calc(var(--r)+8px)] border border-line-strong bg-[#050505] shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9),inset_0_0_0_1px_rgba(255,255,255,0.04)]"
        style={{ ['--r' as string]: `${radius}px` }}
        aria-hidden
      />
      <div className="absolute left-2 top-2 overflow-hidden" style={{ width, height, borderRadius: radius }}>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={
            label ??
            `Wallpaper preview: ${data.daysLeft} days left, ${Math.round(data.progressPct * 100)}% done${data.nextMilestone ? `, next milestone ${data.nextMilestone.title}` : ''}`
          }
          className="block size-full"
        />
        {error && <p className="absolute inset-x-4 top-1/2 text-center text-xs text-danger">{error}</p>}

        {showUi && (
          <LockScreenUi
            width={width}
            height={height}
            ios={ios}
            safe={device.safe}
            light={lightBg}
            widgets={widgets}
          />
        )}

        {showSafe && (
          <div className="pointer-events-none absolute inset-0" aria-hidden>
            {(['statusBar', 'clock', 'widgets', 'notifications', 'bottomControls'] as const).map((k) => {
              const [a, b] = device.safe[k];
              return (
                <div
                  key={k}
                  className="absolute inset-x-0 border-y border-dashed border-danger/60 bg-danger/12"
                  style={{ top: a * height, height: (b - a) * height }}
                >
                  <span className="absolute left-1.5 top-1 rounded bg-black/60 px-1 text-[9px] uppercase tracking-wider text-white/85">
                    {k === 'statusBar' ? 'status bar' : k === 'bottomControls' ? 'controls' : k}
                  </span>
                </div>
              );
            })}
            <div
              className="absolute border border-dashed border-success/80"
              style={{
                top: device.content.top * height,
                height: (device.content.bottom - device.content.top) * height,
                left: device.content.side * width,
                right: device.content.side * width,
              }}
            >
              <span className="absolute -top-4 right-0 rounded bg-black/60 px-1 text-[9px] uppercase tracking-wider text-success">
                content zone
              </span>
            </div>
            {/* centre snap guide */}
            <div className="absolute inset-y-0 left-1/2 w-px bg-info/50" />
            {report?.boxes.map((b) => (
              <div
                key={b.element}
                className="absolute rounded-sm border border-info/80"
                style={{ left: b.x * sx, top: b.y * sx, width: b.w * sx, height: b.h * sx }}
              >
                <span className="absolute -top-3.5 left-0 whitespace-nowrap text-[8px] text-info">
                  {ELEMENT_LABEL[b.element]}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** A faint mock of the phone's own lock-screen UI, to judge placement. */
function LockScreenUi({
  width,
  height,
  ios,
  safe,
  light,
  widgets,
}: {
  width: number;
  height: number;
  ios: boolean;
  safe: ReturnType<typeof getDevice>['safe'];
  light?: boolean;
  widgets: boolean;
}) {
  const clockTop = safe.clock[0] * height;
  const clockH = (safe.clock[1] - safe.clock[0]) * height;
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: false });
  const date = now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <div
      className={cn('pointer-events-none absolute inset-0', light ? 'text-black/75' : 'text-white/85')}
      aria-hidden
    >
      {ios ? (
        <div
          className="absolute left-1/2 rounded-full bg-black"
          style={{
            top: height * 0.014,
            width: width * 0.3,
            height: width * 0.085,
            transform: 'translateX(-50%)',
          }}
        />
      ) : (
        <div
          className="absolute left-1/2 rounded-full bg-black"
          style={{
            top: height * 0.014,
            width: width * 0.035,
            height: width * 0.035,
            transform: 'translateX(-50%)',
          }}
        />
      )}
      <div
        className={cn('absolute inset-x-0 flex flex-col', ios ? 'items-center' : 'items-start pl-[8%]')}
        style={{ top: clockTop + clockH * 0.08 }}
      >
        <span style={{ fontSize: width * 0.045 }} className="font-sans font-medium">
          {date}
        </span>
        <span
          style={{ fontSize: clockH * 0.62, lineHeight: 1 }}
          className="font-sans font-semibold tracking-tight"
        >
          {time}
        </span>
      </div>
      {widgets && (
        <div
          className="absolute inset-x-[10%] flex justify-center gap-[3%]"
          style={{
            top: safe.widgets[0] * height + 4,
            height: (safe.widgets[1] - safe.widgets[0]) * height - 10,
          }}
        >
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={cn('flex-1 rounded-[22%] backdrop-blur-sm', light ? 'bg-black/8' : 'bg-white/12')}
            />
          ))}
        </div>
      )}
      <div
        className="absolute flex w-full justify-between px-[12%]"
        style={{ top: (safe.bottomControls[0] + 0.03) * height }}
      >
        <span
          className={cn('rounded-full backdrop-blur-sm', light ? 'bg-black/10' : 'bg-white/15')}
          style={{ width: width * 0.13, height: width * 0.13 }}
        />
        <span
          className={cn('rounded-full backdrop-blur-sm', light ? 'bg-black/10' : 'bg-white/15')}
          style={{ width: width * 0.13, height: width * 0.13 }}
        />
      </div>
      {ios && (
        <div
          className={cn(
            'absolute left-1/2 h-[4px] w-[34%] -translate-x-1/2 rounded-full',
            light ? 'bg-black/60' : 'bg-white/70',
          )}
          style={{ bottom: height * 0.01 }}
        />
      )}
    </div>
  );
}

export { ELEMENT_LABEL };
