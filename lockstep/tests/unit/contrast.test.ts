import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  ensureContrast,
  mustParse,
  parseColor,
  relativeLuminance,
  scrimAlphaFor,
  blend,
  luminanceOf,
  contrastFromLuminance,
  withAlpha,
} from '../../shared/wallpaper/contrast';
import { THEME_LIST, makePalette, paperPalette } from '../../shared/wallpaper/themes';

describe('parseColor', () => {
  it('parses hex in every length', () => {
    expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor('#C5A15A')).toEqual({ r: 197, g: 161, b: 90, a: 1 });
    expect(parseColor('#00000080')?.a).toBeCloseTo(128 / 255, 5);
    expect(parseColor('#f008')?.a).toBeCloseTo(136 / 255, 5);
  });

  it('parses rgb() and rgba() in comma and space syntax', () => {
    expect(parseColor('rgb(10, 20, 30)')).toEqual({ r: 10, g: 20, b: 30, a: 1 });
    expect(parseColor('rgba(10,20,30,0.5)')).toEqual({ r: 10, g: 20, b: 30, a: 0.5 });
    expect(parseColor('rgb(10 20 30 / 50%)')).toEqual({ r: 10, g: 20, b: 30, a: 0.5 });
    expect(parseColor('rgb(100%, 0%, 0%)')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
  });

  it('rejects garbage', () => {
    for (const bad of ['', 'red', '#ggg', '#12345', 'rgb(1,2)', 'rgb(a,b,c)', 'hsl(0 0% 0%)']) {
      expect(parseColor(bad)).toBeNull();
    }
  });
});

describe('WCAG luminance and contrast', () => {
  it('has the textbook end points', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 10);
  });

  it('matches known contrast pairs', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#fff', '#fff')).toBeCloseTo(1, 10);
    // #777 on white is the classic "just fails AA" grey.
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
    // Pure red on white.
    expect(contrastRatio('#ff0000', '#ffffff')).toBeCloseTo(4.0, 1);
    // Brand gold on obsidian and ink on ivory paper.
    expect(contrastRatio('#C5A15A', '#090909')).toBeGreaterThan(7);
    expect(contrastRatio('#171717', '#F5F0E4')).toBeGreaterThan(15);
  });

  it('is symmetric and ignores alpha', () => {
    expect(contrastRatio('#123456', '#abcdef')).toBeCloseTo(contrastRatio('#abcdef', '#123456'), 12);
    expect(contrastRatio('rgba(0,0,0,0.2)', '#fff')).toBeCloseTo(21, 5);
  });
});

describe('helpers', () => {
  it('ensureContrast lifts a weak colour to the target and leaves a good one alone', () => {
    const fixed = ensureContrast('#9C7A36', '#F5F0E4', 4.5);
    expect(contrastRatio(fixed, '#F5F0E4')).toBeGreaterThanOrEqual(4.5);
    expect(ensureContrast('#ffffff', '#000000', 4.5)).toBe('#ffffff');
  });

  it('withAlpha produces rgba() strings that parse back', () => {
    expect(withAlpha('#C5A15A', 0.5)).toBe('rgba(197,161,90,0.5)');
    expect(parseColor(withAlpha('rgba(10,20,30,0.5)', 0.5))?.a).toBeCloseTo(0.25, 5);
  });

  it('scrimAlphaFor finds the smallest alpha that reaches the target', () => {
    const text = mustParse('#E8DFC9');
    const bg = mustParse('#f2f2f2');
    const scrim = mustParse('#000000');
    const a = scrimAlphaFor(text, bg, scrim, 4.5, 0.9);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(0.9);
    const after = contrastFromLuminance(luminanceOf(text), luminanceOf(blend(bg, scrim, a)));
    expect(after).toBeGreaterThanOrEqual(4.5);
    // Already fine → no scrim.
    expect(scrimAlphaFor(text, mustParse('#090909'), scrim, 4.5, 0.75)).toBe(0);
    // Impossible within the cap → returns the cap.
    expect(scrimAlphaFor(mustParse('#808080'), mustParse('#ffffff'), scrim, 4.5, 0.2)).toBe(0.2);
  });
});

describe('theme palettes', () => {
  it('every theme’s text colours reach AA on every part of its own background', () => {
    for (const theme of THEME_LIST) {
      for (const pal of [makePalette(theme), paperPalette(theme)]) {
        for (const bg of pal.stops) {
          for (const fg of [pal.text, pal.muted, pal.accentInk]) {
            expect(contrastRatio(fg, bg), `${theme.id} ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
          }
        }
      }
    }
  });

  it('a custom accent is made readable for text but kept for lines', () => {
    const pal = makePalette(THEME_LIST[0]!, { accent: '#3a2a10' });
    expect(pal.accent).toBe('#3a2a10');
    expect(contrastRatio(pal.accentInk, pal.stops[2])).toBeGreaterThanOrEqual(4.5);
  });
});
