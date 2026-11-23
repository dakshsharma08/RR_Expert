/**
 * Lock Screen Studio — the signature feature.
 * Desktop: template rail left · large preview centre · properties right · sticky gold Export.
 * Mobile: phone preview on top · draggable bottom sheet with tabs.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import * as Tabs from '@radix-ui/react-tabs';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Download, Smartphone } from 'lucide-react';
import { useActiveGoalId, useGoalData, useGoals } from '@/db/hooks';
import { useMinuteMetrics, useMotivation } from '@/features/goals/components';
import { getKv, setKv } from '@/db/repo';
import { Button } from '@/components/ui/button';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { cn } from '@/lib/cn';
import { defaultDesign, normalizeDesign } from '@shared/wallpaper/templates';
import { getDevice } from '@shared/wallpaper/devices';
import type { RenderReport, WallpaperDesign } from '@shared/wallpaper/types';
import { buildWallpaperData } from './wallpaperData';
import { PhonePreview } from './PhonePreview';
import { BackgroundPanel, ColorPanel, LayoutPanel, TemplatePanel, TextPanel, type Update } from './Panels';
import { ExportPanel } from './ExportPanel';
import { ExportDialog } from './ExportDialog';
import { buildSnapshot } from './living';
import { thumbnailFrom } from './canvas';

type Tab = 'template' | 'text' | 'color' | 'background' | 'layout' | 'export';
const MOBILE_TABS: { id: Tab; label: string }[] = [
  { id: 'template', label: 'Template' },
  { id: 'text', label: 'Text' },
  { id: 'color', label: 'Color' },
  { id: 'background', label: 'Background' },
  { id: 'layout', label: 'Layout' },
  { id: 'export', label: 'Export' },
];

function defaultDeviceFor(): WallpaperDesign['device'] {
  if (typeof navigator === 'undefined') return 'iphone-pro';
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua))
    return screen.height <= 667 ? 'iphone-se' : screen.height >= 932 ? 'iphone-pro-max' : 'iphone-pro';
  if (/Pixel/.test(ua)) return 'pixel';
  if (/SM-S/.test(ua)) return 'galaxy-s';
  if (/Android/.test(ua)) return 'android-1080';
  return 'iphone-pro';
}

function useStudioDesign(goalId: string | undefined) {
  // The design is stored WITH the goal it belongs to, so a save can never land on another goal.
  const [state, setState] = useState<{ goalId: string; design: WallpaperDesign } | null>(null);
  const pending = useRef<{ goalId: string; design: WallpaperDesign } | null>(null);
  useEffect(() => {
    if (!goalId) return;
    let cancelled = false;
    // Switching goals: flush the previous goal's unsaved edits first.
    if (pending.current && pending.current.goalId !== goalId) {
      void setKv(`studio:${pending.current.goalId}`, pending.current.design);
      pending.current = null;
    }
    setState(null);
    void getKv<WallpaperDesign>(`studio:${goalId}`).then((saved) => {
      if (cancelled) return;
      setState({
        goalId,
        design: saved ? normalizeDesign(saved) : defaultDesign('monolith', undefined, defaultDeviceFor()),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [goalId]);
  // Autosave (debounced) so a design survives reloads.
  useEffect(() => {
    if (!state) return;
    pending.current = state;
    const t = setTimeout(() => {
      void setKv(`studio:${state.goalId}`, state.design);
      pending.current = null;
    }, 400);
    return () => clearTimeout(t);
  }, [state]);
  // Save immediately if the Studio is left with unsaved edits.
  useEffect(
    () => () => void (pending.current && setKv(`studio:${pending.current.goalId}`, pending.current.design)),
    [],
  );
  const design = state && state.goalId === goalId ? state.design : null;
  const setDesign = useCallback((d: WallpaperDesign) => setState((s) => (s ? { ...s, design: d } : s)), []);
  const update: Update = useCallback(
    (fn) => setState((s) => (s ? { ...s, design: normalizeDesign(fn(s.design)) } : s)),
    [],
  );
  return { design, setDesign, update };
}

function useMedia(q: string) {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return m;
}

export default function StudioPage() {
  const { goalId: param } = useParams();
  const activeId = useActiveGoalId();
  const goals = useGoals();
  const goalId = param ?? activeId ?? undefined;
  const data = useGoalData(goalId);
  const m = useMinuteMetrics(data);
  const motivation = useMotivation(data?.goal, m);
  const navigate = useNavigate();
  const { design, setDesign, update } = useStudioDesign(goalId);
  const [refreshAt, setRefreshAt] = useState(() => Date.now());
  const [report, setReport] = useState<RenderReport | null>(null);
  const [showUi, setShowUi] = useState(true);
  const [showSafe, setShowSafe] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('template');
  const [sheetOpen, setSheetOpen] = useState(false);
  const desktop = useMedia('(min-width: 1024px)');
  const previewBox = useRef<HTMLDivElement>(null);
  const [previewW, setPreviewW] = useState(300);

  const wpDataMemo = useMemo(
    () => (data && m ? buildWallpaperData(data, m, motivation.line, Math.max(refreshAt, Date.now())) : null),
    [data, m, motivation.line, refreshAt],
  );

  // Fit the phone into the available space.
  const wpData = wpDataMemo;
  const hasPreview = !!design && !!wpData;
  useEffect(() => {
    const el = previewBox.current;
    if (!el || !design) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const dev = getDevice(design.device, design.custom);
      const aspect = dev.height / dev.width;
      const byH = (r.height - 24) / aspect;
      const w = Math.max(180, Math.min(desktop ? 400 : 340, r.width - 24, byH));
      setPreviewW(Math.floor(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
    // Re-measure when the preview mounts, the device (aspect) changes, or the layout switches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPreview, design?.device, design?.custom?.width, design?.custom?.height, desktop]);

  const refresh = useCallback(async () => {
    setRefreshAt(Date.now());
  }, []);

  if (goals === undefined || activeId === undefined || data === undefined)
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <Skeleton className="h-[70vh]" />
      </div>
    );
  const ready = data && (data.goal.status === 'active' || data.goal.status === 'completed');
  if (!data || !ready) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <EmptyState
          icon={<Smartphone className="size-5" strokeWidth={1.5} />}
          title={
            data
              ? 'Approve your plan first. The wallpaper shows your real days left and progress.'
              : 'Create a goal first. The Studio turns its real countdown into a lock screen.'
          }
          action={
            <Button onClick={() => navigate(data ? `/goals/${data.goal.id}/review` : '/new')}>
              {data ? 'Review plan' : 'New goal'}
            </Button>
          }
        />
      </div>
    );
  }
  if (!design || !wpData || !m)
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <Skeleton className="h-[70vh]" />
      </div>
    );

  const eligible = (goals ?? []).filter((g) => g.status === 'active' || g.status === 'completed');
  const warnings = report?.warnings ?? [];
  const snapshot = () => buildSnapshot(data, m, motivation.line);
  const makeThumb = () => {
    const c = previewBox.current?.querySelector('canvas');
    return c ? thumbnailFrom(c) : null;
  };

  const panel = (t: Tab) => {
    switch (t) {
      case 'template':
        return <TemplatePanel design={design} data={wpData} update={update} compact={!desktop} />;
      case 'text':
        return (
          <TextPanel
            design={design}
            update={update}
            motivation={motivation.line}
            motivationSource={motivation.source}
          />
        );
      case 'color':
        return <ColorPanel design={design} update={update} warnings={warnings} />;
      case 'background':
        return <BackgroundPanel design={design} update={update} />;
      case 'layout':
        return (
          <LayoutPanel
            design={design}
            update={update}
            showUi={showUi}
            setShowUi={setShowUi}
            showSafe={showSafe}
            setShowSafe={setShowSafe}
            warnings={warnings}
          />
        );
      case 'export':
        return (
          <ExportPanel
            goalId={data.goal.id}
            goalTitle={data.goal.title}
            design={design}
            setDesign={setDesign}
            onExport={() => setExportOpen(true)}
            onRefresh={refresh}
            snapshot={snapshot}
            makeThumb={makeThumb}
          />
        );
    }
  };

  const header = (
    <div className="flex items-center justify-between gap-3 px-4 pt-4 sm:px-6 lg:pt-6">
      <div className="min-w-0">
        <p className="eyebrow">Lock Screen Studio</p>
        {eligible.length > 1 ? (
          <select
            aria-label="Goal"
            value={data.goal.id}
            onChange={(e) => navigate(`/studio/${e.target.value}`)}
            className="mt-1 h-11 max-w-[60vw] truncate rounded-[12px] border border-hairline bg-surface-2 px-3 font-display text-lg text-text"
          >
            {eligible.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>
        ) : (
          <h1 className="truncate text-xl">{data.goal.title}</h1>
        )}
      </div>
      <Button
        onClick={() => setExportOpen(true)}
        icon={<Download className="size-4" strokeWidth={1.75} />}
        className="sticky top-4 shrink-0 shadow-[0_8px_24px_-10px_rgba(197,161,90,0.6)]"
      >
        Export
      </Button>
    </div>
  );

  const preview = (
    <div
      ref={previewBox}
      className={cn(
        'flex items-center justify-center',
        desktop ? 'h-[calc(100dvh-120px)]' : 'h-[calc(100dvh-8.5rem-31dvh)] min-h-[300px] pt-1',
      )}
    >
      <PhonePreview
        design={design}
        data={wpData}
        width={previewW}
        showUi={showUi}
        showSafe={showSafe}
        onReport={setReport}
      />
    </div>
  );

  if (desktop) {
    return (
      <div className="flex min-h-dvh flex-col">
        {header}
        <div className="grid flex-1 grid-cols-[240px_1fr_400px] gap-6 px-6 pb-6">
          <aside
            aria-label="Templates"
            className="max-h-[calc(100dvh-120px)] overflow-y-auto pr-1 scrollbar-none"
          >
            <p className="eyebrow mb-3 mt-2">Templates</p>
            <TemplatePanel design={design} data={wpData} update={update} />
          </aside>
          <section aria-label="Preview" className="relative">
            {preview}
            {warnings.length > 0 && (
              <p className="absolute inset-x-0 bottom-2 text-center text-xs text-muted" role="status">
                Readability: {warnings.filter((w) => w.fixed).length} soft scrim
                {warnings.filter((w) => w.fixed).length === 1 ? '' : 's'} added so text stays ≥ 4.5:1
              </p>
            )}
          </section>
          <aside aria-label="Properties" className="card max-h-[calc(100dvh-120px)] overflow-hidden p-0">
            <Tabs.Root
              value={tab === 'template' ? 'text' : tab}
              onValueChange={(v) => setTab(v as Tab)}
              className="flex h-full flex-col"
            >
              <Tabs.List
                aria-label="Properties"
                className="grid shrink-0 grid-cols-5 gap-1 border-b border-hairline p-2"
              >
                {MOBILE_TABS.filter((t) => t.id !== 'template').map((t) => (
                  <Tabs.Trigger
                    key={t.id}
                    value={t.id}
                    className="h-11 min-w-0 truncate rounded-[10px] px-1 text-[13px] text-muted data-[state=active]:bg-surface-2 data-[state=active]:text-accent-text"
                  >
                    {t.label}
                  </Tabs.Trigger>
                ))}
              </Tabs.List>
              {MOBILE_TABS.filter((t) => t.id !== 'template').map((t) => (
                <Tabs.Content key={t.id} value={t.id} className="flex-1 overflow-y-auto p-5">
                  {panel(t.id)}
                </Tabs.Content>
              ))}
            </Tabs.Root>
          </aside>
        </div>
        <ExportDialog
          open={exportOpen}
          onOpenChange={setExportOpen}
          design={design}
          data={wpData}
          goalTitle={data.goal.title}
          goalId={data.goal.id}
          todayKey={m.countdown.todayKey}
          onRefresh={refresh}
        />
      </div>
    );
  }

  return (
    <div>
      {header}
      {preview}
      {/* Spacer so the page can scroll past the sheet's resting height. */}
      <div className="h-[30dvh]" aria-hidden />
      <BottomSheet label="Studio controls" peek={0.31} expanded={sheetOpen} onExpandedChange={setSheetOpen}>
        <Tabs.Root
          value={tab}
          onValueChange={(v) => {
            setTab(v as Tab);
            setSheetOpen(true);
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <Tabs.List
            aria-label="Studio sections"
            className="flex shrink-0 gap-1 overflow-x-auto px-3 pb-2 pt-1 scrollbar-none"
          >
            {MOBILE_TABS.map((t) => (
              <Tabs.Trigger
                key={t.id}
                value={t.id}
                className="h-11 shrink-0 rounded-full border border-hairline px-4 text-sm text-muted data-[state=active]:border-accent data-[state=active]:bg-accent/15 data-[state=active]:text-accent-text"
              >
                {t.label}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          {MOBILE_TABS.map((t) => (
            <Tabs.Content
              key={t.id}
              value={t.id}
              className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-2"
            >
              {panel(t.id)}
            </Tabs.Content>
          ))}
        </Tabs.Root>
      </BottomSheet>
      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        design={design}
        data={wpData}
        goalTitle={data.goal.title}
        goalId={data.goal.id}
        todayKey={m.countdown.todayKey}
        onRefresh={refresh}
      />
    </div>
  );
}
