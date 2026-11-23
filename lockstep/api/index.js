/**
 * Vercel serverless entry point (plain JS on purpose).
 *
 * Vercel turns every file in /api into a serverless function. An Express app is a
 * `(req, res) => void` handler, so exporting it is enough. `npm run build` first
 * bundles server/app.ts into dist-server/app.mjs (see scripts/build-server.mjs),
 * because Node's ESM loader can't run our extensionless TypeScript imports directly.
 *
 * vercel.json rewrites /api/(.*) here; req.url keeps the original path (/api/plan),
 * so Express routes it normally. Env vars come from the Vercel project settings.
 */
import { createApp } from '../dist-server/app.mjs';

export default createApp();
