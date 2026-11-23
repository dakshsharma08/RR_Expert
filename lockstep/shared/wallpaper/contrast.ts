/**
 * Colour parsing and WCAG contrast maths.
 *
 * Key ideas (for learners):
 * - Screens store colour as sRGB numbers (0–255), but our eyes respond to LIGHT,
 *   which is not linear in those numbers. WCAG's "relative luminance" first undoes
 *   the sRGB curve ("linearise"), then weights red/green/blue by how bright each
 *   looks to us (green counts most).
 * - Contrast ratio = (lighter + 0.05) / (darker + 0.05). It runs from 1 (same
 *   colour) to 21 (black on white). WCAG AA asks for at least 4.5 for normal text.
 */

export interface RGBA {
  r: number; // 0–255
  g: number;
  b: number;
  a: number; // 0–1
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Parse "#rgb", "#rgba", "#rrggbb", "#rrggbbaa", "rgb(1, 2, 3)", "rgba(1,2,3,0.5)"
 * and the modern space syntax "rgb(1 2 3 / 50%)". Returns null when it can't.
 */
export function parseColor(input: string): RGBA | null {
  const s = input.trim().toLowerCase();
  if (s.startsWith('#')) {
    const hex = s.slice(1);
    if (!/^[0-9a-f]+$/.test(hex)) return null;
    if (hex.length === 3 || hex.length === 4) {
      const n = [...hex].map((c) => parseInt(c + c, 16));
      return { r: n[0]!, g: n[1]!, b: n[2]!, a: hex.length === 4 ? n[3]! / 255 : 1 };
    }
    if (hex.length === 6 || hex.length === 8) {
      const n = [0, 2, 4, 6].map((i) => parseInt(hex.slice(i, i + 2), 16));
      return { r: n[0]!, g: n[1]!, b: n[2]!, a: hex.length === 8 ? n[3]! / 255 : 1 };
    }
    return null;
  }
  const m = /^rgba?\(\s*([^)]*)\)$/.exec(s);
  if (!m) return null;
  // Accept both "1, 2, 3, 0.5" and "1 2 3 / 0.5".
  const parts = m[1]!.split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3 || parts.length > 4) return null;
  const channel = (p: string) => (p.endsWith('%') ? (parseFloat(p) / 100) * 255 : parseFloat(p));
  const alpha = (p: string) => (p.endsWith('%') ? parseFloat(p) / 100 : parseFloat(p));
  const [r, g, b] = parts.slice(0, 3).map(channel) as [number, number, number];
  const a = parts[3] !== undefined ? alpha(parts[3]) : 1;
  if ([r, g, b, a].some((v) => Number.isNaN(v))) return null;
  return { r: clamp(r, 0, 255), g: clamp(g, 0, 255), b: clamp(b, 0, 255), a: clamp(a, 0, 1) };
}

/** Like parseColor, but throws on bad input (for our own hard-coded theme colours). */
export function mustParse(color: string): RGBA {
  const c = parseColor(color);
  if (!c) throw new Error(`Unrecognised colour: ${color}`);
  return c;
}

/** sRGB channel (0–255) → linear light (0–1). */
function linearise(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance of an opaque colour, 0 (black) – 1 (white). */
export function luminanceOf(c: { r: number; g: number; b: number }): number {
  return 0.2126 * linearise(c.r) + 0.7152 * linearise(c.g) + 0.0722 * linearise(c.b);
}

/** Relative luminance of a colour string (alpha is ignored here). */
export function relativeLuminance(color: string): number {
  return luminanceOf(mustParse(color));
}

/** Contrast between two luminances. */
export function contrastFromLuminance(la: number, lb: number): number {
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG contrast ratio between two colours (1–21). Translucent colours are treated as opaque. */
export function contrastRatio(a: string, b: string): number {
  return contrastFromLuminance(relativeLuminance(a), relativeLuminance(b));
}

/** Paint `top` over `bottom` with opacity `alpha`, the way a canvas blends (in sRGB). */
export function blend(bottom: RGBA, top: RGBA, alpha: number): RGBA {
  const t = clamp(alpha, 0, 1);
  return {
    r: bottom.r + (top.r - bottom.r) * t,
    g: bottom.g + (top.g - bottom.g) * t,
    b: bottom.b + (top.b - bottom.b) * t,
    a: 1,
  };
}

/** Mix two colour strings; returns "#rrggbb". t=0 → a, t=1 → b. */
export function mix(a: string, b: string, t: number): string {
  return toHex(blend(mustParse(a), mustParse(b), t));
}

export function toHex(c: { r: number; g: number; b: number }): string {
  const h = (v: number) =>
    Math.round(clamp(v, 0, 255))
      .toString(16)
      .padStart(2, '0');
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}

/** "rgba(r,g,b,a)" for a colour string at a given opacity (multiplies any alpha it already has). */
export function withAlpha(color: string, alpha: number): string {
  const c = mustParse(color);
  const a = Math.round(clamp(c.a * alpha, 0, 1) * 1000) / 1000;
  return `rgba(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)},${a})`;
}

/**
 * Nudge `fg` toward black or white (whichever helps) until it reaches `min`
 * contrast against `bg`. Used so an accent colour stays readable as TEXT while
 * the original accent is still used for lines and rings.
 */
export function ensureContrast(fg: string, bg: string, min = 4.5): string {
  if (contrastRatio(fg, bg) >= min) return toHex(mustParse(fg));
  const target = relativeLuminance(bg) > 0.4 ? '#000000' : '#ffffff';
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (contrastRatio(mix(fg, target, mid), bg) >= min) hi = mid;
    else lo = mid;
  }
  return mix(fg, target, hi);
}

/**
 * Smallest opacity of `scrim` (painted over `bg`) that lifts the contrast with
 * `text` to `target`. Returns `cap` when even that is not enough.
 */
export function scrimAlphaFor(text: RGBA, bg: RGBA, scrim: RGBA, target: number, cap: number): number {
  const tl = luminanceOf(text);
  const ok = (a: number) => contrastFromLuminance(tl, luminanceOf(blend(bg, scrim, a))) >= target;
  if (ok(0)) return 0;
  if (!ok(cap)) return cap;
  let lo = 0;
  let hi = cap;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (ok(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}
