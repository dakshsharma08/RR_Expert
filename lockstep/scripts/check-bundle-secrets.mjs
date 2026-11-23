#!/usr/bin/env node
/**
 * Build guard: fail if a server secret leaked into the browser bundle (dist/).
 * Checks (1) the literal value of GEMINI_API_KEY / SUPABASE_SERVICE_ROLE_KEY /
 * UPSTASH token if set, (2) Google API key patterns (AIza…), and
 * (3) the variable names themselves next to a value.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const dist = join(root, 'dist');
if (!existsSync(dist)) {
  console.error('check-bundle-secrets: dist/ not found. Run vite build first.');
  process.exit(1);
}
try {
  process.loadEnvFile?.(join(root, '.env'));
} catch {
  /* no .env — fine */
}

const secrets = ['GEMINI_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'UPSTASH_REDIS_REST_TOKEN']
  .map((k) => [k, process.env[k]])
  .filter(([, v]) => v && v.length >= 8);
const patterns = [
  { name: 'Google API key', re: /AIza[0-9A-Za-z_-]{35}/ },
  { name: 'GEMINI_API_KEY assignment', re: /GEMINI_API_KEY["']?\s*[:=]\s*["'][^"']{8,}/ },
  { name: 'service role JWT', re: /service_role/ },
];

const files = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(js|mjs|html|css|json|webmanifest|map)$/.test(f)) files.push(p);
  }
})(dist);

const problems = [];
for (const f of files) {
  const text = readFileSync(f, 'utf8');
  for (const [k, v] of secrets) if (text.includes(v)) problems.push(`${f}: contains the value of ${k}`);
  for (const { name, re } of patterns) if (re.test(text)) problems.push(`${f}: matches ${name}`);
}

if (problems.length) {
  console.error('✖ Secret leak check FAILED:\n' + problems.map((p) => '  - ' + p).join('\n'));
  process.exit(1);
}
console.log(
  `✓ Secret leak check passed (${files.length} files scanned, ${secrets.length} secret value(s) checked).`,
);
