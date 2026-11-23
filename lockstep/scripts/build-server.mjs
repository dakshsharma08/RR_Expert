/**
 * Bundles the Express API (server/ + shared/, TypeScript) into ONE plain-ESM file:
 * dist-server/app.mjs. Why? Node's ESM loader on Vercel can't resolve our
 * extensionless TS imports, so the serverless function (api/index.js) imports this
 * pre-built bundle instead. npm packages stay external and are traced by Vercel.
 */
import { build } from 'esbuild';

await build({
  entryPoints: ['server/app.ts'],
  outfile: 'dist-server/app.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  packages: 'external',
  sourcemap: false,
  logLevel: 'warning',
  banner: { js: '// Built by scripts/build-server.mjs — do not edit.' },
});
console.log('✓ API bundled → dist-server/app.mjs');
