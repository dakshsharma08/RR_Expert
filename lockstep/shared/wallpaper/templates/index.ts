/**
 * Template registry + design defaults.
 *
 * Key ideas (for learners):
 * - Each template is a separate file with its own layout; this file just lists
 *   them and builds sensible starting designs from each template's defaults.
 * - `normalizeDesign` makes any design safe to render: it clamps every slider
 *   to its allowed range and fills in anything missing. Designs can come from
 *   old saves or a URL, so we never trust them blindly.
 */
import type { DeviceId, ElementId, TemplateId, ThemeId, WallpaperDesign } from '../types';
import { ELEMENT_IDS } from '../types';
import { THEMES } from '../themes';
import { DEVICES } from '../devices';
import { FONT_FAMILIES } from '../fonts';
import type { TemplateDef } from './kit';
import { monolith } from './monolith';
import { orbit } from './orbit';
import { ledger } from './ledger';
import { constellation } from './constellation';
import { aurora } from './aurora';
import { grain } from './grain';
import { minimalMono } from './minimal-mono';
import { ivoryPaper } from './ivory-paper';

export const TEMPLATES: Record<TemplateId, TemplateDef> = {
  monolith,
  orbit,
  ledger,
  constellation,
  aurora,
  grain,
  'minimal-mono': minimalMono,
  'ivory-paper': ivoryPaper,
};

export const TEMPLATE_LIST: TemplateDef[] = Object.values(TEMPLATES);

export function getTemplate(id: TemplateId): TemplateDef {
  return TEMPLATES[id] ?? monolith;
}

/** A complete, good-looking starting design for a template (and optionally a theme/device). */
export function defaultDesign(
  template: TemplateId = 'monolith',
  theme?: ThemeId,
  device: DeviceId = 'iphone',
): WallpaperDesign {
  const t = getTemplate(template);
  const d = t.defaults;
  return {
    version: 1,
    template: t.id,
    theme: theme ?? d.theme,
    device,
    ...(device === 'custom' ? { custom: { width: 1080, height: 2400 } } : {}),
    typography: {
      display: d.display,
      ui: d.ui,
      numbers: d.numbers,
      scale: d.scale,
      weight: d.weight,
      tracking: d.tracking,
      align: d.align,
    },
    colors: {},
    background: { kind: 'theme', grain: d.grain },
    layout: { position: 'auto' },
    text: { custom: '', source: 'motivation' },
    show: Object.fromEntries(ELEMENT_IDS.map((id) => [id, true])) as Record<ElementId, boolean>,
  };
}

const clamp = (v: unknown, lo: number, hi: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;

/** Fill gaps and clamp ranges so any stored or user-edited design renders safely. */
export function normalizeDesign(input: WallpaperDesign): WallpaperDesign {
  const template = input.template in TEMPLATES ? input.template : 'monolith';
  const base = defaultDesign(template);
  const theme = input.theme in THEMES ? input.theme : base.theme;
  const device = input.device === 'custom' || input.device in DEVICES ? input.device : 'iphone';
  const t = { ...base.typography, ...input.typography };
  const font = <K extends 'display' | 'ui' | 'numbers'>(k: K) =>
    t[k] in FONT_FAMILIES ? t[k] : base.typography[k];
  const bg = { ...base.background, ...input.background };
  const img = bg.image;
  return {
    version: 1,
    template,
    theme,
    device,
    ...(device === 'custom' ? { custom: input.custom ?? { width: 1080, height: 2400 } } : {}),
    typography: {
      display: font('display'),
      ui: font('ui'),
      numbers: font('numbers'),
      scale: clamp(t.scale, 0.7, 1.4, base.typography.scale),
      weight: clamp(t.weight, 300, 800, base.typography.weight),
      tracking: clamp(t.tracking, -0.05, 0.3, base.typography.tracking),
      align:
        t.align === 'left' || t.align === 'center' || t.align === 'right' ? t.align : base.typography.align,
    },
    colors: { ...input.colors },
    background: {
      kind: bg.kind === 'gradient' || bg.kind === 'image' ? bg.kind : 'theme',
      ...(bg.gradient
        ? {
            gradient: {
              from: bg.gradient.from,
              to: bg.gradient.to,
              angle: clamp(bg.gradient.angle, -360, 360, 180),
            },
          }
        : {}),
      ...(img
        ? {
            image: {
              src: img.src,
              blur: clamp(img.blur, 0, 40, 0),
              dim: clamp(img.dim, 0, 0.9, 0),
              zoom: clamp(img.zoom, 1, 3, 1),
              x: clamp(img.x, -1, 1, 0),
              y: clamp(img.y, -1, 1, 0),
            },
          }
        : {}),
      grain: clamp(bg.grain, 0, 1, base.background.grain),
    },
    layout: {
      position: ['auto', 'upper', 'middle', 'lower'].includes(input.layout?.position)
        ? input.layout.position
        : 'auto',
    },
    text: {
      custom: typeof input.text?.custom === 'string' ? input.text.custom.slice(0, 200) : '',
      source:
        input.text?.source === 'custom' || input.text?.source === 'none' ? input.text.source : 'motivation',
    },
    show: Object.fromEntries(ELEMENT_IDS.map((id) => [id, input.show?.[id] ?? true])) as Record<
      ElementId,
      boolean
    >,
  };
}
