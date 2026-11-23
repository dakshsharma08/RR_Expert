#!/usr/bin/env node
/**
 * Builds every Handshake submission asset FROM THE REAL APP:
 *   submission/lockscreen.png          iPhone Pro native (1206×2622), exported by the real Studio
 *   submission/lockscreen-android.png  Android 1080×2400
 *   submission/cover.png               2400×1600 cover (hidden /cover route, Playwright, DPR 1)
 *   submission/title.txt, description.txt (≤480 chars, counted), CHECKLIST.md, run.json
 *
 * With GEMINI_API_KEY set (in .env or the environment) the plan comes from REAL Gemini.
 * Without it, the script uses the app's manual-plan path and marks every Gemini-specific
 * statement as PENDING. It never fakes AI output.
 *
 * Usage: npm run submission -- [--url https://your-live-url] [--no-build] [--port 8090]
 */
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const root = new URL('..', import.meta.url).pathname;
const out = join(root, 'submission');
mkdirSync(out, { recursive: true });
const args = process.argv.slice(2);
const arg = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const liveUrl = arg('url', process.env.PUBLIC_APP_URL || '');
const port = Number(arg('port', '8090'));
const base = `http://localhost:${port}`;
try {
  process.loadEnvFile?.(join(root, '.env'));
} catch {
  /* no .env */
}

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

function pngSize(file) {
  const b = readFileSync(file);
  if (b.subarray(1, 4).toString() !== 'PNG') throw new Error(`${file} is not a PNG`);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

const GOAL = {
  goal: 'Pass the AWS Certified Cloud Practitioner exam',
  daysOut: 35,
  time: '10:00',
  hours: 1.5,
  constraints:
    'Full-time job, so I study in the evenings. I learn best with practice questions. I want a full mock exam in the final week.',
};

async function main() {
  if (!args.includes('--no-build')) {
    console.log('› building…');
    execSync('npm run build', { cwd: root, stdio: 'inherit' });
  }
  console.log(`› starting app on ${base}`);
  const server = spawn('npx', ['tsx', 'server/prod.ts'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), NODE_ENV: 'production', ALLOWED_ORIGINS: base },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  server.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));
  try {
    for (let i = 0; i < 60; i++) {
      try {
        const r = await fetch(`${base}/api/health`);
        if (r.ok) break;
      } catch {
        /* not up yet */
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    const health = await (await fetch(`${base}/api/health`)).json();
    const aiMode = health.ai?.configured === true;
    console.log(
      `› Gemini ${aiMode ? 'CONFIGURED — real plan' : 'NOT configured — manual plan, Gemini text marked PENDING'}`,
    );

    const browser = await chromium.launch();
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 1,
      acceptDownloads: true,
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.error('[page error]', e.message));

    // ── Goal via the real wizard ──
    await page.goto(`${base}/new`);
    await page.getByRole('textbox', { name: 'Your goal' }).fill(GOAL.goal);
    await page.getByRole('button', { name: 'Continue' }).click();
    const deadline = new Date(Date.now() + GOAL.daysOut * 864e5).toISOString().slice(0, 10);
    await page.getByLabel('Deadline date').fill(deadline);
    await page.getByLabel('Time', { exact: true }).fill(GOAL.time);
    await page.getByRole('button', { name: 'Continue' }).click();
    const slider = page.getByRole('slider', { name: 'Hours per working day' });
    await slider.focus();
    for (let i = 0; i < 1; i++) await page.keyboard.press('ArrowLeft'); // 2.0 → 1.5 h
    await page.getByRole('button', { name: 'Saturday' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByLabel('Constraints').fill(GOAL.constraints);

    if (aiMode) {
      await page.getByRole('button', { name: 'Plan with Gemini' }).click();
      await page.waitForURL(/\/review$/, { timeout: 180_000 });
    } else {
      await page.getByRole('button', { name: /Build my plan/ }).click();
      await page.waitForURL(/\/review$/);
      // Manual path: the developer's own milestones (clearly NOT AI output).
      const manual = [
        ['Map the exam domains and book the test', 0.15, 3],
        ['Cloud concepts + security & compliance', 0.4, 8],
        ['Core services, pricing and support', 0.7, 9],
        ['Two full practice exams + review gaps', 0.95, 6],
      ];
      for (const [title, f, h] of manual) {
        await page.getByRole('button', { name: /^Add$/ }).click();
        await page.getByLabel('Title', { exact: true }).fill(title);
        const d = new Date(Date.now() + Math.max(1, Math.round(f * GOAL.daysOut)) * 864e5);
        while (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
        await page.getByLabel('Target date').fill(d.toISOString().slice(0, 10));
        await page.getByLabel('Hours', { exact: true }).fill(String(h));
        await page.getByRole('button', { name: 'Add milestone' }).click();
        await page.waitForTimeout(250);
      }
    }

    // Facts of this run, read back from the app's own database.
    const facts = await page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const req = indexedDB.open('lockstep');
          req.onerror = () => reject(req.error);
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction(['goals', 'milestones', 'tasks'], 'readonly');
            const all = (n) =>
              new Promise((r) => (tx.objectStore(n).getAll().onsuccess = (e) => r(e.target.result)));
            Promise.all([all('goals'), all('milestones'), all('tasks')]).then(([g, m, t]) =>
              resolve({ goal: g[0], milestones: m, tasks: t }),
            );
          };
        }),
    );
    const meta = facts.goal.plan_meta;
    await page.screenshot({ path: join(root, 'docs/evidence/submission-review.png') });

    await page.getByRole('button', { name: 'Approve plan' }).click();
    await page.waitForURL(/\/goals\/[^/]+$/);
    const goalUrl = page.url();

    // ── Studio exports ──
    async function exportFor(device, file) {
      await page.goto(goalUrl.replace('/goals/', '/studio/'));
      await page.getByRole('radio', { name: /Orbit/ }).first().click();
      await page.getByRole('tab', { name: 'Layout' }).click();
      await page.getByLabel('Device').selectOption(device);
      await page.waitForTimeout(800);
      await page.getByRole('button', { name: 'Export', exact: true }).click();
      await page.getByText(/checked from the PNG header/).waitFor({ timeout: 60_000 });
      const [dl] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: 'Download PNG' }).click(),
      ]);
      await dl.saveAs(join(out, file));
      await page.keyboard.press('Escape');
      return dl.suggestedFilename();
    }
    const iosName = await exportFor('iphone-pro', 'lockscreen.png');
    const androidName = await exportFor('android-1080', 'lockscreen-android.png');

    // ── Cover 2400×1600 @ DPR 1 ──
    const coverCtx = await browser.newContext({
      viewport: { width: 2400, height: 1600 },
      deviceScaleFactor: 1,
      storageState: await ctx.storageState(),
    });
    const cover = await coverCtx.newPage();
    // IndexedDB isn't in storageState for all versions — copy the active goal via the same origin.
    await cover.goto(`${base}/cover${liveUrl ? `?url=${encodeURIComponent(liveUrl)}` : ''}`);
    let ready = await cover.locator('#cover-phones[data-ready="true"]').count();
    if (!ready) {
      await coverCtx.close();
      await page.setViewportSize({ width: 2400, height: 1600 });
      await page.goto(`${base}/cover${liveUrl ? `?url=${encodeURIComponent(liveUrl)}` : ''}`);
      await page.locator('#cover-phones[data-ready="true"]').waitFor({ timeout: 30_000 });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(1500);
      await page.screenshot({
        path: join(out, 'cover.png'),
        clip: { x: 0, y: 0, width: 2400, height: 1600 },
      });
    } else {
      await cover.evaluate(() => document.fonts.ready);
      await cover.waitForTimeout(1500);
      await cover.screenshot({
        path: join(out, 'cover.png'),
        clip: { x: 0, y: 0, width: 2400, height: 1600 },
      });
      await coverCtx.close();
    }
    await browser.close();

    // ── Verify dimensions ──
    const checks = [
      ['lockscreen.png', 1206, 2622],
      ['lockscreen-android.png', 1080, 2400],
      ['cover.png', 2400, 1600],
    ].map(([f, w, h]) => {
      const s = pngSize(join(out, f));
      return {
        file: f,
        expected: `${w}×${h}`,
        actual: `${s.width}×${s.height}`,
        ok: s.width === w && s.height === h,
      };
    });

    // ── Text assets ──
    const title = 'LOCKSTEP — Gemini-Planned Countdown Lock Screen';
    writeFileSync(join(out, 'title.txt'), title + '\n');
    const n = facts.milestones.length;
    const t = facts.tasks.length;
    const due = new Date(facts.goal.deadline_utc).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: facts.goal.timezone,
    });
    const cap = meta?.capacity?.capacityHours;
    const urlPart = liveUrl ? ` ${liveUrl}` : '';
    let description;
    if (aiMode && meta?.source === 'ai') {
      description =
        `Deadline: ${facts.goal.title}, due ${due}. Gemini turned my ${facts.goal.hours_per_day} h/day and working days into ${n} dated milestones with ${t} tasks as schema-checked JSON; ` +
        `code then verified every date and my ${cap} h capacity${meta.repaired ? ' (one auto-repair)' : ''} before I approved it. It's now a live countdown and this lock screen. ` +
        `Lesson: [DEVELOPER: write your own lesson]${urlPart}`;
    } else {
      description =
        `Deadline: ${facts.goal.title}, due ${due}. [PENDING REAL GEMINI RUN: re-run npm run submission with GEMINI_API_KEY to fill how Gemini split it into milestones.] ` +
        `Code checks every date and my ${cap} h capacity; the plan becomes a live countdown and this lock screen. Lesson: [DEVELOPER: write your own lesson]${urlPart}`;
    }
    writeFileSync(join(out, 'description.txt'), description + '\n');
    const chars = [...description].length;

    const run = {
      generated_at: new Date().toISOString(),
      mode: aiMode && meta?.source === 'ai' ? 'gemini' : 'manual-no-key',
      model: meta?.model ?? null,
      goal: facts.goal.title,
      deadline_utc: facts.goal.deadline_utc,
      timezone: facts.goal.timezone,
      milestones: n,
      tasks: t,
      repaired: meta?.repaired ?? false,
      feasibility_code: meta?.code?.feasibility ?? null,
      feasibility_gemini: meta?.modelFeasibility ?? null,
      checks_passed: (meta?.checks ?? []).filter((c) => c.ok).length + '/' + (meta?.checks ?? []).length,
      exports: { ios: iosName, android: androidName },
      dimensions: checks,
      description_chars: chars,
      live_url: liveUrl || null,
    };
    writeFileSync(join(out, 'run.json'), JSON.stringify(run, null, 2) + '\n');

    const pending = run.mode !== 'gemini';
    writeFileSync(
      join(out, 'CHECKLIST.md'),
      `# Handshake submission checklist

Generated ${run.generated_at} by \`npm run submission\` · mode: **${run.mode}**${run.model ? ` · model: ${run.model}` : ''}

| Form field | What to do | Status |
|---|---|---|
| **Project title** | paste \`title.txt\` → "${title}" | ✅ |
| **Your project** (upload your custom countdown lock screen) | upload \`lockscreen.png\` (${checks[0].actual}) · Android alt: \`lockscreen-android.png\` (${checks[1].actual}) | ${pending ? '⚠️ re-generate with a real Gemini plan first (see below)' : '✅'} |
| **Preview image** (3:2, ≥1200 px wide) | upload \`cover.png\` (${checks[2].actual}) | ${pending ? '⚠️ re-generate after the real run' : '✅'} |
| **Description** (≤500 chars) | paste \`description.txt\` (${chars} chars) after replacing \`[DEVELOPER: write your own lesson]\`${pending ? ' and the PENDING sentence' : ''} | ✏️ needs your lesson |

## Verified dimensions
${checks.map((c) => `- ${c.ok ? '✅' : '❌'} ${c.file}: ${c.actual} (expected ${c.expected})`).join('\n')}

## Privacy
Only the goal title appears. No name, email, phone, school ID, address or face.

${
  pending
    ? `## ⚠️ Before you submit
This environment had **no GEMINI_API_KEY**, so this run used the app's manual-plan path. Nothing here claims to be Gemini output. To make the assets from a real Gemini plan:

\`\`\`bash
cd lockstep && echo "GEMINI_API_KEY=…" >> .env
npm run submission -- --url https://<your-live-url>
\`\`\`
`
    : ''
}
## Before you paste the description
1. Replace \`[DEVELOPER: write your own lesson]\` with one true sentence about what *you* learned.
2. Re-count: \`node -e "console.log([...require('fs').readFileSync('submission/description.txt','utf8').trim()].length)"\`. It must stay ≤ 500.
`,
    );

    console.log('\n› dimensions:');
    for (const c of checks)
      console.log(`  ${c.ok ? '✓' : '✗'} ${c.file} ${c.actual} (expected ${c.expected})`);
    console.log(`› description: ${chars} characters (limit 500, target ≤480)`);
    console.log(`› mode: ${run.mode}`);
    if (checks.some((c) => !c.ok) || chars > 480) process.exitCode = 1;
  } finally {
    // Kill the whole process group (npx → tsx → node), or the server would outlive the script.
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {
      server.kill('SIGTERM');
    }
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
