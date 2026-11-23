import { defineConfig } from '@playwright/test';

/**
 * E2E: the full acceptance flow at 360/390/430/1440px against the production build
 * (vite preview + service worker) and a test-only API whose Gemini calls are mocked.
 * Run: npm run build && npm run test:e2e
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'off',
    serviceWorkers: 'allow',
    acceptDownloads: true,
  },
  projects: [
    { name: 'w360', use: { viewport: { width: 360, height: 780 }, isMobile: false, hasTouch: true } },
    { name: 'w390', use: { viewport: { width: 390, height: 844 }, hasTouch: true } },
    { name: 'w430', use: { viewport: { width: 430, height: 932 }, hasTouch: true } },
    { name: 'w1440', use: { viewport: { width: 1440, height: 900 } } },
  ],
  webServer: [
    { command: 'PORT=8787 npx tsx e2e/mock-api.ts', port: 8787, reuseExistingServer: false, timeout: 60_000 },
    {
      command: 'npx vite preview --port 4173 --strictPort',
      port: 4173,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
