// Helper for src/step7_docs.py: prints HTML files to PDF with headless Chromium (Node Playwright)
// and reports any overflow. Usage: node src/step7_render.js jobs.json
// jobs.json: [{"html": "/abs/in.html", "pdf": "/abs/out.pdf", "kind": "deck" | "a4" | "a4flow"}]
const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const jobs = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const browser = await chromium.launch();
  let problems = 0;
  for (const job of jobs) {
    const page = await browser.newPage({ viewport: job.kind === 'deck' ? { width: 1280, height: 720 } : { width: 794, height: 1123 } });
    const errs = [];
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', (e) => errs.push(String(e)));
    await page.goto('file://' + job.html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    // overflow checks
    const issues = await page.evaluate((kind) => {
      const out = [];
      const boxes = kind === 'deck' ? [...document.querySelectorAll('.slide')] : kind === 'a4' ? [...document.querySelectorAll('.page')] : [];
      boxes.forEach((box, i) => {
        const r = box.getBoundingClientRect();
        if (box.scrollHeight > box.clientHeight + 1) out.push(`box ${i + 1}: content taller than the page by ${box.scrollHeight - box.clientHeight}px`);
        box.querySelectorAll('*').forEach((el) => {
          const e = el.getBoundingClientRect();
          if (e.width === 0 || e.height === 0) return;
          if (e.right > r.right + 1 || e.bottom > r.bottom + 1) out.push(`box ${i + 1}: <${el.tagName.toLowerCase()} class="${el.className}"> sticks out (right ${Math.round(e.right - r.right)}px, bottom ${Math.round(e.bottom - r.bottom)}px)`);
          if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'visible') out.push(`box ${i + 1}: <${el.tagName.toLowerCase()} class="${el.className}"> clips text horizontally`);
        });
      });
      if (kind === 'a4flow') {
        document.querySelectorAll('table').forEach((t, i) => { if (t.getBoundingClientRect().right > 794) out.push(`table ${i + 1} wider than the page`); });
      }
      return out;
    }, job.kind);
    if (issues.length || errs.length) {
      problems += issues.length + errs.length;
      console.log(`CHECK ${job.pdf}`);
      issues.slice(0, 15).forEach((s) => console.log('  overflow:', s));
      errs.forEach((s) => console.log('  console error:', s));
    }
    await page.pdf({ path: job.pdf, preferCSSPageSize: true, printBackground: true });
    await page.close();
  }
  await browser.close();
  console.log(problems ? `render done with ${problems} issue(s)` : 'render done, no overflow or console errors');
})().catch((e) => { console.error(e); process.exit(1); });
