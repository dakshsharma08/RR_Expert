/**
 * Visual + accessibility sweep of every screen (dark and light), with axe-core.
 * Fails on any "serious" or "critical" WCAG violation. Screenshots → docs/evidence/screens/.
 */
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync } from 'node:fs';

const OUT = 'docs/evidence/screens';
mkdirSync(OUT, { recursive: true });

async function audit(page: Page, name: string) {
  const w = page.viewportSize()?.width ?? 0;
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${w}-${name}.png`, fullPage: false });
  // Responsiveness: nothing may force sideways scrolling at this width.
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(overflow.scrollWidth, `${name} @${w}px scrolls horizontally`).toBeLessThanOrEqual(
    overflow.innerWidth,
  );
  const res = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const bad = res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const summary = bad.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.nodes
        .slice(0, 3)
        .map((n) => n.target.join(' '))
        .join(' | ')}`,
  );
  expect(summary, `${name}: axe violations`).toEqual([]);
}

test('every screen passes axe (serious/critical) in dark and light mode', async ({ page }) => {
  await page.goto('/');
  await audit(page, 'landing');

  await page.goto('/new');
  await audit(page, 'wizard');
  await page.getByRole('button', { name: 'Try a sample goal' }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Plan with Gemini' }).click();
  await page.waitForURL(/\/review$/, { timeout: 60_000 });
  await audit(page, 'review');
  await page.getByRole('button', { name: 'Approve plan' }).click();
  await page.waitForURL(/\/goals\/[^/]+$/);
  const goalUrl = page.url();
  const id = goalUrl.split('/').pop()!;
  await page.locator('label', { hasText: ': part A' }).first().click();
  await audit(page, 'goal');

  for (const [path, name] of [
    ['/app', 'dashboard'],
    ['/goals', 'goals'],
    [`/studio/${id}`, 'studio'],
    ['/insights', 'insights'],
    ['/settings', 'settings'],
    ['/guide', 'guide'],
    [`/focus/${id}`, 'focus'],
  ] as const) {
    await page.goto(path);
    await audit(page, name);
  }

  // Light mode
  await page.goto('/settings');
  await page.getByRole('radio', { name: 'Light' }).click();
  for (const [path, name] of [
    ['/app', 'dashboard-light'],
    [`/goals/${id}/review`, 'review-light'],
    [`/studio/${id}`, 'studio-light'],
    ['/insights', 'insights-light'],
    ['/', 'landing-light'],
  ] as const) {
    await page.goto(path);
    await audit(page, name);
  }
});
