/**
 * Text helpers: letter spacing, wrapping and ellipsis.
 *
 * Key ideas (for learners):
 * - `ctx.letterSpacing` exists in Chrome but not everywhere (Safari, older
 *   napi builds), so we space letters ourselves. We place each character at
 *   "width of everything before it + n × spacing". Measuring the whole prefix
 *   (not each letter alone) keeps the font's kerning between letter pairs.
 * - Strings are split with Array.from so emoji and accented letters made of
 *   two code units stay in one piece.
 */
import type { Ctx2D } from './types';

/** Width of `text` with `tracking` extra pixels between characters. */
export function measureTracked(ctx: Ctx2D, text: string, tracking: number): number {
  const chars = Array.from(text);
  if (chars.length === 0) return 0;
  return ctx.measureText(text).width + tracking * (chars.length - 1);
}

/**
 * Draw `text` with manual letter spacing. `x` is the left, centre or right edge
 * depending on `align`; `y` is the alphabetic baseline. Returns the drawn width.
 */
export function drawTracked(
  ctx: Ctx2D,
  text: string,
  x: number,
  y: number,
  tracking: number,
  align: 'left' | 'center' | 'right' = 'left',
): number {
  const width = measureTracked(ctx, text, tracking);
  const left = align === 'left' ? x : align === 'center' ? x - width / 2 : x - width;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  if (Math.abs(tracking) < 0.01) {
    ctx.fillText(text, left, y); // no spacing: one call keeps full kerning and is faster
    return width;
  }
  const chars = Array.from(text);
  let prefix = '';
  chars.forEach((ch, i) => {
    const offset = prefix ? ctx.measureText(prefix).width : 0;
    ctx.fillText(ch, left + offset + i * tracking, y);
    prefix += ch;
  });
  return width;
}

const ELLIPSIS = '…';

/** Shorten `text` with an ellipsis until it fits in `maxWidth`. */
export function ellipsize(ctx: Ctx2D, text: string, maxWidth: number, tracking = 0): string {
  if (measureTracked(ctx, text, tracking) <= maxWidth) return text;
  const chars = Array.from(text);
  // Binary search for the longest prefix that fits with the ellipsis.
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = chars.slice(0, mid).join('').trimEnd() + ELLIPSIS;
    if (measureTracked(ctx, candidate, tracking) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return lo === 0 ? ELLIPSIS : chars.slice(0, lo).join('').trimEnd() + ELLIPSIS;
}

/**
 * Greedy word wrap into at most `maxLines` lines. If the text doesn't fit, the
 * last line ends with an ellipsis. A single word longer than a line is cut.
 */
export function wrapLines(
  ctx: Ctx2D,
  text: string,
  maxWidth: number,
  maxLines: number,
  tracking = 0,
): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (words.length === 0 || maxLines < 1) return [];
  const fits = (s: string) => measureTracked(ctx, s, tracking) <= maxWidth;
  const lines: string[] = [];
  let current = '';
  let i = 0;
  for (; i < words.length; i++) {
    const word = words[i]!;
    const candidate = current ? `${current} ${word}` : word;
    if (fits(candidate)) {
      current = candidate;
      continue;
    }
    if (current) {
      lines.push(current);
      current = '';
      if (lines.length === maxLines) break;
    }
    // The word alone is too wide for a line: put as much as fits, carry on.
    if (!fits(word)) {
      const cut = ellipsize(ctx, word, maxWidth, tracking);
      lines.push(cut);
      if (lines.length === maxLines) {
        i++;
        break;
      }
      continue;
    }
    current = word;
  }
  if (current && lines.length < maxLines) {
    lines.push(current);
    i = words.length;
  }
  const truncated = i < words.length;
  if (truncated && lines.length > 0) {
    const last = lines[lines.length - 1]!;
    const rest = words.slice(i).join(' ');
    lines[lines.length - 1] = ellipsize(ctx, `${last} ${rest}`, maxWidth, tracking);
  }
  return lines;
}
