/**
 * Production server for local production runs (`npm start`) and Cloud Run.
 *
 * It serves the built SPA from dist/ AND the API from one process:
 *   /api/*            → the Express API (createApp)
 *   /assets/*         → hashed build files, cached for a year (their names change on every build)
 *   any other GET     → dist/index.html (SPA fallback so deep links like /app/plan work)
 * The JSON 404 for unknown /api routes is inside createApp, so the SPA fallback
 * never swallows API typos.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import express from 'express';

const envPath = resolve(process.cwd(), '.env');
if (existsSync(envPath)) process.loadEnvFile(envPath);

const { createApp } = await import('./app');

const dist = resolve(process.cwd(), 'dist');
const indexHtml = resolve(dist, 'index.html');
const app = createApp();

app.use(
  '/assets',
  express.static(resolve(dist, 'assets'), { immutable: true, maxAge: '1y', index: false, fallthrough: true }),
);
app.use(
  express.static(dist, {
    index: false,
    // index.html and the service worker must always be revalidated so updates reach users.
    setHeaders: (res, filePath) => {
      if (/(index\.html|sw\.js|workbox-[^/]*\.js|manifest\.webmanifest)$/.test(filePath)) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  }),
);

app.use((req, res, next) => {
  const isPage = req.method === 'GET' || req.method === 'HEAD';
  // API routes and missing build files must 404, not get index.html.
  if (!isPage || req.path.startsWith('/api') || req.path.startsWith('/assets/')) return next();
  if (!existsSync(indexHtml)) {
    res.status(503).type('text/plain').send('dist/ not found — run `npm run build` first.');
    return;
  }
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(indexHtml);
});

const port = Number(process.env.PORT) || 8080;
app.listen(port, () => {
  console.log(`LOCKSTEP (production) on http://localhost:${port}`);
});
