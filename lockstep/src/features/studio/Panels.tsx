/** Studio property panels: Template / Text / Color / Background / Layout. */
import { useEffect, useRef, useState } from 'react';
import { Check, ImagePlus, Trash2, Sparkles, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { ApiCallError, generateBackground, getHealth } from '@/lib/api';
import { recordRuns } from '@/db/repo';
import { toast } from 'sonner';
import { Segmented, Slider, SwitchRow } from '@/components/ui/controls';
import { Input, Textarea } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { TEMPLATE_LIST, defaultDesign, normalizeDesign } from '@shared/wallpaper/templates';
import { THEME_LIST } from '@shared/wallpaper/themes';
import { FONT_FAMILIES, FONT_IDS } from '@shared/wallpaper/fonts';
import { CUSTOM_LIMITS, DEVICE_LIST } from '@shared/wallpaper/devices';
import type {
  DeviceId,
  ElementId,
  FontId,
  ReadabilityWarning,
  TemplateId,
  WallpaperData,
  WallpaperDesign,
} from '@shared/wallpaper/types';
import { ensureFonts, renderTo, saveImageBlob } from './canvas';
import { ELEMENT_LABEL } from './PhonePreview';

export type Update = (fn: (d: WallpaperDesign) => WallpaperDesign) => void;

// ───────────────────────── Template ─────────────────────────

export function TemplatePanel({
  design,
  data,
  update,
  compact,
}: {
  design: WallpaperDesign;
  data: WallpaperData;
  update: Update;
  compact?: boolean;
}) {
  return (
    <div
      className={cn('grid gap-3', compact ? 'grid-cols-4 sm:grid-cols-4' : 'grid-cols-2')}
      role="radiogroup"
      aria-label="Template"
    >
      {TEMPLATE_LIST.map((t) => (
        <TemplateThumb
          key={t.id}
          id={t.id}
          label={t.label}
          description={t.description}
          selected={design.template === t.id}
          data={data}
          device={design.device}
          onSelect={() =>
            update((d) => {
              const base = defaultDesign(t.id, undefined, d.device);
              // Keep the user's background/text/show choices; take the template's typography + theme.
              return {
                ...base,
                custom: d.custom,
                background: d.background.kind === 'image' ? d.background : base.background,
                text: d.text,
                show: d.show,
                layout: d.layout,
              };
            })
          }
        />
      ))}
    </div>
  );
}

function TemplateThumb({
  id,
  label,
  description,
  selected,
  data,
  device,
  onSelect,
}: {
  id: TemplateId;
  label: string;
  description: string;
  selected: boolean;
  data: WallpaperData;
  device: DeviceId;
  onSelect: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    const design = defaultDesign(id, undefined, device === 'custom' ? 'iphone' : device);
    void ensureFonts(design).then(() => {
      if (cancelled || !ref.current) return;
      const c = ref.current;
      c.width = 180;
      c.height = Math.round(180 * (2622 / 1206));
      try {
        renderTo(c, { design, data, image: null });
      } catch {
        /* thumbnail is decorative */
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, device, data.daysLeft, data.progressPct, data.nextMilestone?.title, data.goalTitle]);
  return (
    <button
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      title={description}
      className={cn(
        'group relative overflow-hidden rounded-[14px] border text-left transition-colors',
        selected ? 'border-accent ring-1 ring-accent' : 'border-hairline hover:border-line-strong',
      )}
    >
      <canvas ref={ref} className="block aspect-[1206/2622] w-full bg-surface-2" aria-hidden />
      <span className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/85 to-transparent px-2 pb-1.5 pt-6 text-[11px] font-medium text-white">
        {label}
        {selected && <Check className="size-3.5 text-gold-light" strokeWidth={2.5} aria-hidden />}
      </span>
    </button>
  );
}

// ───────────────────────── Text ─────────────────────────

export function TextPanel({
  design,
  update,
  motivation,
  motivationSource,
}: {
  design: WallpaperDesign;
  update: Update;
  motivation: string | null;
  motivationSource: 'ai' | 'local' | null;
}) {
  const t = design.typography;
  const setT = (patch: Partial<WallpaperDesign['typography']>) =>
    update((d) => ({ ...d, typography: { ...d.typography, ...patch } }));
  return (
    <div className="space-y-6">
      <Group title="Line under the numbers">
        <Segmented
          label="Text source"
          value={design.text.source}
          onChange={(v) => update((d) => ({ ...d, text: { ...d.text, source: v } }))}
          options={[
            { value: 'motivation', label: motivationSource === 'ai' ? '✦ AI line' : 'Auto line' },
            { value: 'custom', label: 'Custom' },
            { value: 'none', label: 'None' },
          ]}
        />
        {design.text.source === 'motivation' && motivation && (
          <p className="text-xs text-muted">
            {motivationSource === 'ai' ? (
              <>
                <Sparkles className="mr-1 inline size-3 text-accent-text" strokeWidth={1.5} aria-hidden />
                Gemini, from your real numbers:{' '}
              </>
            ) : (
              'Built from your real numbers: '
            )}
            "{motivation}"
          </p>
        )}
        {design.text.source === 'custom' && (
          <Textarea
            aria-label="Custom text"
            value={design.text.custom}
            maxLength={90}
            onChange={(e) => update((d) => ({ ...d, text: { ...d.text, custom: e.target.value } }))}
            placeholder="e.g. One page a day."
            className="min-h-20"
          />
        )}
      </Group>
      <Group title="Fonts">
        <FontSelect label="Display (big number)" value={t.display} onChange={(v) => setT({ display: v })} />
        <FontSelect label="Numbers" value={t.numbers} onChange={(v) => setT({ numbers: v })} />
        <FontSelect label="Labels" value={t.ui} onChange={(v) => setT({ ui: v })} />
      </Group>
      <Group title="Size & weight">
        <LabeledSlider
          label="Size"
          value={t.scale}
          min={0.7}
          max={1.4}
          step={0.05}
          fmt={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => setT({ scale: v })}
        />
        <LabeledSlider
          label="Numeral weight"
          value={t.weight}
          min={300}
          max={800}
          step={50}
          fmt={(v) => String(v)}
          onChange={(v) => setT({ weight: v })}
        />
        <LabeledSlider
          label="Label spacing"
          value={t.tracking}
          min={-0.05}
          max={0.3}
          step={0.01}
          fmt={(v) => `${v.toFixed(2)} em`}
          onChange={(v) => setT({ tracking: v })}
        />
      </Group>
      <Group title="Alignment">
        <Segmented
          label="Alignment"
          value={t.align}
          onChange={(v) => setT({ align: v })}
          options={[
            { value: 'left', label: 'Left' },
            { value: 'center', label: 'Center' },
            { value: 'right', label: 'Right' },
          ]}
        />
      </Group>
    </div>
  );
}

function FontSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: FontId;
  onChange: (v: FontId) => void;
}) {
  return (
    <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
      <span className="text-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as FontId)}
        className="h-11 rounded-[12px] border border-hairline bg-surface-2 px-3 text-sm text-text"
        style={{ fontFamily: `"${FONT_FAMILIES[value].family}"` }}
      >
        {FONT_IDS.map((f) => (
          <option key={f} value={f}>
            {FONT_FAMILIES[f].label}
          </option>
        ))}
      </select>
    </label>
  );
}

// ───────────────────────── Color ─────────────────────────

export function ColorPanel({
  design,
  update,
  warnings,
}: {
  design: WallpaperDesign;
  update: Update;
  warnings: ReadabilityWarning[];
}) {
  return (
    <div className="space-y-6">
      <Group title="Theme">
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Theme">
          {THEME_LIST.map((th) => (
            <button
              key={th.id}
              role="radio"
              aria-checked={design.theme === th.id}
              onClick={() => update((d) => ({ ...d, theme: th.id, colors: {} }))}
              className={cn(
                'flex min-h-11 flex-col items-start gap-2 rounded-[12px] border p-2 text-left text-[11px] transition-colors',
                design.theme === th.id
                  ? 'border-accent ring-1 ring-accent'
                  : 'border-hairline hover:border-line-strong',
              )}
            >
              <span className="flex h-8 w-full overflow-hidden rounded-md" aria-hidden>
                <span
                  className="flex-1"
                  style={{ background: `linear-gradient(180deg, ${th.stops[0]}, ${th.stops[2]})` }}
                />
                <span className="w-3" style={{ background: th.accent }} />
                <span className="w-3" style={{ background: th.text }} />
              </span>
              <span className="text-text">{th.label}</span>
            </button>
          ))}
        </div>
      </Group>
      <Group title="Custom colors">
        <ColorRow
          label="Accent"
          value={design.colors.accent}
          onChange={(v) => update((d) => ({ ...d, colors: { ...d.colors, accent: v } }))}
        />
        <ColorRow
          label="Text"
          value={design.colors.text}
          onChange={(v) => update((d) => ({ ...d, colors: { ...d.colors, text: v } }))}
        />
      </Group>
      <ReadabilityNotes warnings={warnings} />
    </div>
  );
}

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: string;
  onChange: (v: string | undefined) => void;
}) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 text-sm">
      <span className="text-muted">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} color`}
          value={value ?? '#c5a15a'}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-14 cursor-pointer rounded-lg border border-hairline bg-transparent"
        />
        {value && (
          <Button variant="ghost" size="sm" onClick={() => onChange(undefined)}>
            Reset
          </Button>
        )}
      </div>
    </div>
  );
}

export function ReadabilityNotes({ warnings }: { warnings: ReadabilityWarning[] }) {
  if (!warnings.length)
    return (
      <p className="flex items-center gap-2 text-xs text-success">
        <Check className="size-3.5" strokeWidth={2} aria-hidden /> Every text block passes 4.5:1 contrast.
      </p>
    );
  return (
    <ul className="space-y-1.5 text-xs" aria-live="polite">
      {warnings.map((w) => (
        <li key={w.element} className={w.fixed ? 'text-muted' : 'text-warning'}>
          {w.fixed ? '✓ ' : '! '}
          {w.message}
        </li>
      ))}
    </ul>
  );
}

// ───────────────────────── Background ─────────────────────────

export function BackgroundPanel({ design, update }: { design: WallpaperDesign; update: Update }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [mood, setMood] = useState<'calm' | 'focused' | 'bold'>('calm');
  const health = useQuery({ queryKey: ['health'], queryFn: getHealth, staleTime: 60_000 });
  // Only offered when the server confirmed an image-capable Gemini model for its key.
  const imageModel = health.data?.ai.imageModel ?? null;

  async function aiBackground() {
    setAiBusy(true);
    try {
      const r = await generateBackground({ theme: design.theme, mood });
      await recordRuns([r.run]);
      const blob = await (await fetch(r.image)).blob();
      const src = await saveImageBlob(blob, `gemini-background-${Date.now()}.png`);
      update((d) => ({
        ...d,
        background: {
          ...d.background,
          kind: 'image',
          image: { src, blur: 0, dim: 0.25, zoom: 1, x: 0, y: 0 },
        },
      }));
      toast.success('AI background added', {
        description: `✦ AI suggestion · ${r.model}. Not what you wanted? Generate again or remove it.`,
      });
    } catch (e) {
      toast.error('Could not generate a background', {
        description: e instanceof ApiCallError ? e.error.message : (e as Error).message,
      });
      void health.refetch();
    } finally {
      setAiBusy(false);
    }
  }
  const bg = design.background;
  const img = bg.image;
  const setImg = (patch: Partial<NonNullable<WallpaperDesign['background']['image']>>) =>
    update((d) =>
      d.background.image
        ? { ...d, background: { ...d.background, image: { ...d.background.image, ...patch } } }
        : d,
    );

  async function onFile(f?: File) {
    if (!f) return;
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) return toast.error('Use a PNG, JPG or WEBP image.');
    if (f.size > 15 * 1024 * 1024) return toast.error('That image is over 15 MB.');
    setBusy(true);
    try {
      const src = await saveImageBlob(f, f.name);
      update((d) => ({
        ...d,
        background: {
          ...d.background,
          kind: 'image',
          image: { src, blur: 8, dim: 0.45, zoom: 1, x: 0, y: 0 },
        },
      }));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="space-y-6">
      <Segmented
        label="Background type"
        value={bg.kind}
        onChange={(v) =>
          update((d) => ({
            ...d,
            background: {
              ...d.background,
              kind: v,
              gradient:
                v === 'gradient'
                  ? (d.background.gradient ?? { from: '#171717', to: '#090909', angle: 180 })
                  : d.background.gradient,
            },
          }))
        }
        options={[
          { value: 'theme', label: 'Theme' },
          { value: 'gradient', label: 'Gradient' },
          { value: 'image', label: 'Photo' },
        ]}
      />
      {bg.kind === 'gradient' && (
        <Group title="Gradient">
          <ColorRow
            label="Top"
            value={bg.gradient?.from}
            onChange={(v) =>
              update((d) => ({
                ...d,
                background: {
                  ...d.background,
                  gradient: {
                    ...(d.background.gradient ?? { from: '#171717', to: '#090909', angle: 180 }),
                    from: v ?? '#171717',
                  },
                },
              }))
            }
          />
          <ColorRow
            label="Bottom"
            value={bg.gradient?.to}
            onChange={(v) =>
              update((d) => ({
                ...d,
                background: {
                  ...d.background,
                  gradient: {
                    ...(d.background.gradient ?? { from: '#171717', to: '#090909', angle: 180 }),
                    to: v ?? '#090909',
                  },
                },
              }))
            }
          />
          <LabeledSlider
            label="Angle"
            value={bg.gradient?.angle ?? 180}
            min={0}
            max={360}
            step={5}
            fmt={(v) => `${v}°`}
            onChange={(v) =>
              update((d) => ({
                ...d,
                background: {
                  ...d.background,
                  gradient: {
                    ...(d.background.gradient ?? { from: '#171717', to: '#090909', angle: 180 }),
                    angle: v,
                  },
                },
              }))
            }
          />
        </Group>
      )}
      {bg.kind === 'image' && (
        <Group title="Photo">
          <div className="flex gap-2">
            <Button
              variant="subtle"
              loading={busy}
              onClick={() => fileRef.current?.click()}
              icon={<ImagePlus className="size-4" strokeWidth={1.5} />}
            >
              {img ? 'Replace photo' : 'Upload photo'}
            </Button>
            {img && (
              <Button
                variant="ghost"
                onClick={() =>
                  update((d) => ({ ...d, background: { ...d.background, kind: 'theme', image: undefined } }))
                }
                icon={<Trash2 className="size-4" strokeWidth={1.5} />}
              >
                Remove
              </Button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          <p className="text-xs text-muted">
            Stays on this device. Use abstract images without people for a calm lock screen.
          </p>
          {img && (
            <>
              <LabeledSlider
                label="Blur"
                value={img.blur}
                min={0}
                max={40}
                step={1}
                fmt={(v) => `${v}px`}
                onChange={(v) => setImg({ blur: v })}
              />
              <LabeledSlider
                label="Dim"
                value={img.dim}
                min={0}
                max={0.9}
                step={0.05}
                fmt={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => setImg({ dim: v })}
              />
              <LabeledSlider
                label="Zoom"
                value={img.zoom}
                min={1}
                max={3}
                step={0.05}
                fmt={(v) => `${v.toFixed(2)}×`}
                onChange={(v) => setImg({ zoom: v })}
              />
              <LabeledSlider
                label="Horizontal"
                value={img.x}
                min={-1}
                max={1}
                step={0.05}
                fmt={(v) => v.toFixed(2)}
                onChange={(v) => setImg({ x: v })}
              />
              <LabeledSlider
                label="Vertical"
                value={img.y}
                min={-1}
                max={1}
                step={0.05}
                fmt={(v) => v.toFixed(2)}
                onChange={(v) => setImg({ y: v })}
              />
            </>
          )}
        </Group>
      )}
      {imageModel && (
        <Group title="✦ AI background">
          <p className="text-xs text-muted">
            Gemini paints an abstract, text-free background in your theme's colours. No people, nothing
            personal.
          </p>
          <Segmented
            label="Mood"
            value={mood}
            onChange={setMood}
            options={[
              { value: 'calm', label: 'Calm' },
              { value: 'focused', label: 'Focused' },
              { value: 'bold', label: 'Bold' },
            ]}
          />
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => void aiBackground()}
            disabled={aiBusy}
            icon={
              aiBusy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" strokeWidth={1.5} />
              )
            }
          >
            {aiBusy ? 'Painting…' : 'Generate with Gemini'}
          </Button>
        </Group>
      )}
      <Group title="Texture">
        <LabeledSlider
          label="Grain"
          value={bg.grain}
          min={0}
          max={1}
          step={0.05}
          fmt={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => update((d) => ({ ...d, background: { ...d.background, grain: v } }))}
        />
      </Group>
    </div>
  );
}

// ───────────────────────── Layout ─────────────────────────

export function LayoutPanel({
  design,
  update,
  showUi,
  setShowUi,
  showSafe,
  setShowSafe,
  warnings,
}: {
  design: WallpaperDesign;
  update: Update;
  showUi: boolean;
  setShowUi: (v: boolean) => void;
  showSafe: boolean;
  setShowSafe: (v: boolean) => void;
  warnings: ReadabilityWarning[];
}) {
  const custom = design.custom ?? { width: 1080, height: 2400 };
  return (
    <div className="space-y-6">
      <Group title="Device">
        <select
          aria-label="Device"
          value={design.device}
          onChange={(e) =>
            update((d) =>
              normalizeDesign({
                ...d,
                device: e.target.value as DeviceId,
                custom: e.target.value === 'custom' ? (d.custom ?? { width: 1080, height: 2400 }) : undefined,
              }),
            )
          }
          className="h-11 w-full rounded-[12px] border border-hairline bg-surface-2 px-3 text-sm text-text"
        >
          {DEVICE_LIST.map((dv) => (
            <option key={dv.id} value={dv.id}>
              {dv.label} · {dv.width}×{dv.height}
            </option>
          ))}
          <option value="custom">Custom size…</option>
        </select>
        <p className="text-xs text-muted">
          {DEVICE_LIST.find((x) => x.id === design.device)?.detail ??
            `Custom · ${custom.width} × ${custom.height}`}
        </p>
        {design.device === 'custom' && (
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              aria-label="Width in pixels"
              min={CUSTOM_LIMITS.min}
              max={CUSTOM_LIMITS.max}
              value={custom.width}
              onChange={(e) =>
                update((d) => ({ ...d, custom: { ...custom, width: Number(e.target.value) || 1080 } }))
              }
            />
            <Input
              type="number"
              aria-label="Height in pixels"
              min={CUSTOM_LIMITS.min}
              max={CUSTOM_LIMITS.max}
              value={custom.height}
              onChange={(e) =>
                update((d) => ({ ...d, custom: { ...custom, height: Number(e.target.value) || 2400 } }))
              }
            />
          </div>
        )}
      </Group>
      <Group title="Vertical position">
        <Segmented
          label="Vertical position"
          value={design.layout.position}
          onChange={(v) => update((d) => ({ ...d, layout: { ...d.layout, position: v } }))}
          options={[
            { value: 'auto', label: 'Auto' },
            { value: 'upper', label: 'Upper' },
            { value: 'middle', label: 'Middle' },
            { value: 'lower', label: 'Lower' },
          ]}
        />
      </Group>
      <Group title="Show on wallpaper">
        {(Object.keys(ELEMENT_LABEL) as ElementId[]).map((id) => (
          <SwitchRow
            key={id}
            label={ELEMENT_LABEL[id]}
            checked={design.show[id]}
            onChange={(v) => update((d) => ({ ...d, show: { ...d.show, [id]: v } }))}
          />
        ))}
      </Group>
      <Group title="Guides">
        <SwitchRow
          label="Lock screen UI"
          description="Clock, widgets and buttons as your phone draws them"
          checked={showUi}
          onChange={setShowUi}
        />
        <SwitchRow
          label="Safe zones & snap guides"
          description="Red: covered by the phone. Green: where content goes"
          checked={showSafe}
          onChange={setShowSafe}
        />
      </Group>
      <Group title="Readability">
        <ReadabilityNotes warnings={warnings} />
      </Group>
    </div>
  );
}

// ───────────────────────── Bits ─────────────────────────

export function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="eyebrow mb-3">{title}</legend>
      {children}
    </fieldset>
  );
}

function LabeledSlider({
  label,
  value,
  min,
  max,
  step,
  fmt,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  fmt: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-muted">{label}</span>
        <span className="font-mono text-xs tabular text-text">{fmt(value)}</span>
      </div>
      <Slider
        label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={onChange}
        valueText={fmt(value)}
      />
    </div>
  );
}
