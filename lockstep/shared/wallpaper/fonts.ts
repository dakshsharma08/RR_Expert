/**
 * Fonts used by the wallpaper.
 *
 * Key ideas (for learners):
 * - Canvas text uses the CSS `font` shorthand ("300 120px 'Fraunces Variable', serif"),
 *   so fonts are referenced by FAMILY NAME only. The browser gets the files from
 *   fontsource's CSS; the server registers the same files under the same names
 *   (see server/wallpaper/node-render.ts). Same name → same look on both sides.
 * - Three families are "variable" fonts: one file holds every weight from 100 to
 *   900. Instrument Serif has a single weight (400); asking for 700 would make the
 *   renderer smear a fake bold, so we clamp it.
 */
import type { FontId } from './types';

export interface FontInfo {
  family: string;
  fallback: string;
  label: string;
  kind: 'serif' | 'sans' | 'mono';
}

export const FONT_FAMILIES: Record<FontId, FontInfo> = {
  fraunces: { family: 'Fraunces Variable', fallback: 'Georgia, serif', label: 'Fraunces', kind: 'serif' },
  'instrument-serif': {
    family: 'Instrument Serif',
    fallback: "'Times New Roman', serif",
    label: 'Instrument Serif',
    kind: 'serif',
  },
  inter: {
    family: 'Inter Variable',
    fallback: 'system-ui, -apple-system, sans-serif',
    label: 'Inter',
    kind: 'sans',
  },
  'geist-mono': {
    family: 'Geist Mono Variable',
    fallback: "ui-monospace, 'SF Mono', Menlo, monospace",
    label: 'Geist Mono',
    kind: 'mono',
  },
};

export const FONT_IDS = Object.keys(FONT_FAMILIES) as FontId[];

/** The weights each font file really contains. */
const WEIGHT_RANGE: Record<FontId, [number, number]> = {
  fraunces: [100, 900],
  'instrument-serif': [400, 400],
  inter: [100, 900],
  'geist-mono': [100, 900],
};

export function clampWeight(font: FontId, weight: number): number {
  const [lo, hi] = WEIGHT_RANGE[font];
  return Math.round(Math.min(hi, Math.max(lo, weight)));
}

/** CSS font shorthand for canvas, e.g. `300 96px "Fraunces Variable", Georgia, serif`. */
export function fontCss(font: FontId, weight: number, sizePx: number): string {
  const f = FONT_FAMILIES[font];
  return `${clampWeight(font, weight)} ${Math.max(1, Math.round(sizePx * 100) / 100)}px "${f.family}", ${f.fallback}`;
}

/**
 * Font strings the browser should load (with `document.fonts.load`) before
 * rendering, so the first preview isn't drawn in a fallback font.
 */
export function fontsToLoad(fonts: FontId[]): string[] {
  return [...new Set(fonts)].map(
    (f) => `${WEIGHT_RANGE[f][0] === 400 ? 400 : 300} 32px "${FONT_FAMILIES[f].family}"`,
  );
}
