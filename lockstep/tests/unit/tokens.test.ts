/**
 * Design-system guard: every text/background pair we use must pass WCAG AA (4.5:1)
 * in both dark and light modes. Large display text / UI marks only need 3:1.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { contrastRatio } from '../../shared/wallpaper/contrast';

const css = readFileSync(new URL('../../src/styles/index.css', import.meta.url), 'utf8');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  const vars: Record<string, string> = {};
  for (const m of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) vars[m[1]!] = m[2]!.trim();
  return vars;
}

function resolve(vars: Record<string, string>, base: Record<string, string>, name: string): string {
  let v = vars[name] ?? base[name];
  for (let i = 0; v && v.startsWith('var(') && i < 5; i++) {
    const ref = v.slice(6, -1);
    v = vars[ref] ?? base[ref];
  }
  if (!v) throw new Error(`missing --${name}`);
  return v;
}

const dark = block(":root,\n[data-mode='dark']");
const light = block("[data-mode='light']");

const TEXT_PAIRS: [string, string][] = [
  ['text', 'bg'],
  ['text', 'surface'],
  ['text', 'surface-2'],
  ['text-muted', 'bg'],
  ['text-muted', 'surface'],
  ['text-muted', 'surface-2'],
  ['accent-text', 'bg'],
  ['accent-text', 'surface'],
  ['accent-text', 'surface-2'],
  ['success', 'surface'],
  ['warning', 'surface'],
  ['danger', 'surface'],
  ['info', 'surface'],
  ['danger', 'bg'],
  ['success', 'bg'],
  ['warning', 'bg'],
];

describe.each([
  ['dark', dark, dark],
  ['light', { ...dark, ...light }, dark],
])('%s mode tokens', (_mode, vars, base) => {
  it.each(TEXT_PAIRS)('%s on %s passes AA 4.5:1', (fg, bg) => {
    const ratio = contrastRatio(resolve(vars, base, fg), resolve(vars, base, bg));
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
  it('primary button text (obsidian) on gold passes AA', () => {
    expect(contrastRatio('#090909', resolve(vars, base, 'gold'))).toBeGreaterThanOrEqual(4.5);
  });
  it('focus ring is visible (≥3:1) against the page', () => {
    expect(contrastRatio(resolve(vars, base, 'focus'), resolve(vars, base, 'bg'))).toBeGreaterThanOrEqual(3);
  });
});

describe('approved badge', () => {
  it('obsidian on ivory passes AA', () =>
    expect(contrastRatio('#090909', '#E8DFC9')).toBeGreaterThanOrEqual(4.5));
});
