/**
 * Local development API server (`npm run dev:api`, port 8787).
 *
 * Vite (port 5173) proxies /api here, so the browser never sees the Gemini key.
 * `.env` is loaded with Node's built-in `process.loadEnvFile` (no dotenv package).
 * We import the app AFTER loading .env, so every module sees the variables.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = resolve(process.cwd(), '.env');
if (existsSync(envPath)) process.loadEnvFile(envPath);

const { createApp } = await import('./app');

const port = Number(process.env.PORT) || 8787;
createApp().listen(port, () => {
  const ai = process.env.GEMINI_API_KEY
    ? 'configured'
    : 'NOT configured (AI routes answer 503 AI_NOT_CONFIGURED)';
  console.log(`LOCKSTEP API on http://localhost:${port}/api — Gemini ${ai}`);
});
