/**
 * Colour themes.
 *
 * Key ideas (for learners):
 * - Each theme is a small palette, like the dial of a watch: a background
 *   (base colour + three gradient stops), the main text colour, a muted colour
 *   for secondary text, an accent for rings and rules, and a hairline colour.
 * - Every text colour here was checked to reach WCAG 4.5:1 on its own
 *   background (see tests/unit/contrast.test.ts), so a plain theme background
 *   never needs a scrim. Busy photos are handled at render time.
 */
import type { ThemeId } from './types';
import { ensureContrast, mix, withAlpha } from './contrast';

/** Brand tokens. */
export const BRAND = {
  obsidian: '#090909',
  charcoal: '#171717',
  graphite: '#222222',
  gold: '#C5A15A',
  goldLight: '#E5CC91',
  goldDeep: '#8E7037',
  ivory: '#E8DFC9',
  muted: '#9A9A9A',
  paper: '#F5F0E4',
  ink: '#171717',
  paperAccent: '#9C7A36',
} as const;

export interface Theme {
  id: ThemeId;
  label: string;
  mode: 'dark' | 'light';
  /** Flat fallback colour; also what "dim" veils an image toward. */
  base: string;
  /** Top → middle → bottom background gradient. */
  stops: [string, string, string];
  /** Very soft light behind the content (low alpha). */
  glow: string;
  text: string;
  muted: string;
  accent: string;
  /** A lighter/brighter accent for small highlights (dots, lit stars). */
  accentSoft: string;
  /** Rules and tracks: accent at low alpha. */
  hairline: string;
  /** Aurora blooms: two or three restrained hues. */
  blooms: [string, string, string];
}

export const THEMES: Record<ThemeId, Theme> = {
  'champagne-gold': {
    id: 'champagne-gold',
    label: 'Champagne Gold',
    mode: 'dark',
    base: BRAND.obsidian,
    stops: ['#0B0A09', '#0F0D0B', '#17130D'],
    glow: 'rgba(197,161,90,0.10)',
    text: BRAND.ivory,
    muted: BRAND.muted,
    accent: BRAND.gold,
    accentSoft: BRAND.goldLight,
    hairline: 'rgba(197,161,90,0.38)',
    blooms: ['#8E7037', '#C5A15A', '#3A2E1A'],
  },
  ivory: {
    id: 'ivory',
    label: 'Ivory',
    mode: 'light',
    base: BRAND.paper,
    stops: ['#F7F3EA', '#F5F0E4', '#EEE6D3'],
    glow: 'rgba(255,255,255,0.55)',
    text: BRAND.ink,
    muted: '#6A6356',
    accent: BRAND.paperAccent,
    accentSoft: '#B8964F',
    hairline: 'rgba(156,122,54,0.45)',
    blooms: ['#E9D9B4', '#F1E6CC', '#D9C49A'],
  },
  monochrome: {
    id: 'monochrome',
    label: 'Monochrome',
    mode: 'dark',
    base: BRAND.obsidian,
    stops: ['#0A0A0A', '#0E0E0E', '#171717'],
    glow: 'rgba(255,255,255,0.06)',
    text: '#EDEDED',
    muted: BRAND.muted,
    accent: '#CFCFCF',
    accentSoft: '#FFFFFF',
    hairline: 'rgba(255,255,255,0.24)',
    blooms: ['#3A3A3A', '#5A5A5A', '#222222'],
  },
  'midnight-sapphire': {
    id: 'midnight-sapphire',
    label: 'Midnight Sapphire',
    mode: 'dark',
    base: '#070A12',
    stops: ['#070A12', '#0A1020', '#101B36'],
    glow: 'rgba(92,126,214,0.14)',
    text: '#E7ECF6',
    muted: '#8E99B2',
    accent: '#A8BCEB',
    accentSoft: '#D4DFFA',
    hairline: 'rgba(168,188,235,0.32)',
    blooms: ['#1E3A8A', '#3B5BB5', '#0F1E4A'],
  },
  'rose-gold': {
    id: 'rose-gold',
    label: 'Rose Gold',
    mode: 'dark',
    base: '#0D0909',
    stops: ['#0D0909', '#120C0C', '#1D1213'],
    glow: 'rgba(216,163,145,0.11)',
    text: '#F3E6E0',
    muted: '#A4948F',
    accent: '#D9A694',
    accentSoft: '#F0CDBF',
    hairline: 'rgba(217,166,148,0.36)',
    blooms: ['#8C5A4E', '#C78E7C', '#3D2424'],
  },
  'emerald-noir': {
    id: 'emerald-noir',
    label: 'Emerald Noir',
    mode: 'dark',
    base: '#050A08',
    stops: ['#050A08', '#08120E', '#0D1F17'],
    glow: 'rgba(72,150,112,0.12)',
    text: '#E5EEE8',
    muted: '#8EA399',
    accent: '#C9B27A',
    accentSoft: '#E6D5A4',
    hairline: 'rgba(201,178,122,0.34)',
    blooms: ['#0F5138', '#2E7D5B', '#0A2A1E'],
  },
};

export const THEME_LIST: Theme[] = Object.values(THEMES);

/** The colours a template actually paints with, after user overrides. */
export interface Palette {
  mode: 'dark' | 'light';
  base: string;
  stops: [string, string, string];
  glow: string;
  text: string;
  muted: string;
  /** Accent for lines, rings and stars. */
  accent: string;
  /** Accent safe to use for TEXT (≥ 4.5:1 on the base). */
  accentInk: string;
  accentSoft: string;
  hairline: string;
  /** Even fainter than hairline: tracks, ticks, dust. */
  faint: string;
  blooms: [string, string, string];
}

/** A little above WCAG's 4.5 so grain and glow never tip plain text under the line. */
const TEXT_TARGET = 4.8;

/**
 * The background colour that is hardest for text: the lightest stop plus the
 * soft glow on dark themes, the darkest stop plus the vignette on light ones.
 */
function worstBackground(mode: 'dark' | 'light', stops: [string, string, string]): string {
  return mode === 'dark' ? mix(stops[2], '#ffffff', 0.04) : mix(stops[2], '#5c461e', 0.1);
}

export function makePalette(theme: Theme, overrides: { accent?: string; text?: string } = {}): Palette {
  const accent = overrides.accent ?? theme.accent;
  const text = overrides.text ?? theme.text;
  // When the user picks a custom accent, rebuild the hairline from it.
  const hairline = overrides.accent ? withAlpha(accent, theme.mode === 'dark' ? 0.38 : 0.5) : theme.hairline;
  const worst = worstBackground(theme.mode, theme.stops);
  return {
    mode: theme.mode,
    base: theme.base,
    stops: theme.stops,
    glow: theme.glow,
    text,
    // A custom text colour also shifts muted toward it so the two stay related.
    muted: ensureContrast(overrides.text ? mix(text, theme.base, 0.35) : theme.muted, worst, TEXT_TARGET),
    accent,
    accentInk: ensureContrast(accent, worst, TEXT_TARGET),
    accentSoft: overrides.accent ? mix(accent, '#ffffff', 0.35) : theme.accentSoft,
    hairline,
    faint: withAlpha(accent, theme.mode === 'dark' ? 0.16 : 0.22),
    blooms: theme.blooms,
  };
}

/**
 * A light "paper" palette derived from any theme, for the Ivory Paper template
 * (it is always printed on paper, whatever theme is picked; the theme tints it).
 */
export function paperPalette(theme: Theme, overrides: { accent?: string; text?: string } = {}): Palette {
  if (theme.mode === 'light') return makePalette(theme, overrides);
  const tint = overrides.accent ?? theme.accent;
  const paper = mix(BRAND.paper, tint, 0.06);
  const stops: [string, string, string] = [mix(paper, '#ffffff', 0.25), paper, mix(paper, tint, 0.07)];
  const accent = ensureContrast(mix(tint, BRAND.paperAccent, 0.35), paper, 3);
  const text = overrides.text && overrides.text !== theme.text ? overrides.text : BRAND.ink;
  const worst = worstBackground('light', stops);
  return {
    mode: 'light',
    base: paper,
    stops,
    glow: 'rgba(255,255,255,0.5)',
    text,
    muted: ensureContrast('#6A6356', worst, TEXT_TARGET),
    accent,
    accentInk: ensureContrast(accent, worst, TEXT_TARGET),
    accentSoft: mix(accent, '#ffffff', 0.3),
    hairline: withAlpha(accent, 0.5),
    faint: withAlpha(accent, 0.22),
    blooms: THEMES.ivory.blooms,
  };
}
