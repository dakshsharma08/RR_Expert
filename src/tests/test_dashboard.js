'use strict';
/* Headless test for the offline dashboard. Run: node src/tests/test_dashboard.js
   Opens the built file with all non-file network requests blocked, screenshots every tab
   at 380x800 and 1280x900, and asserts: no console errors, no external requests, no
   sideways scroll at 380px, filters change the output, and five random player cards match the payload. */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const HTML = path.join(ROOT, 'outputs', 'deliverables', 'RR_Clutch_Index_Dashboard.html');
const PAYLOAD = path.join(ROOT, 'outputs', 'deliverables', 'dashboard_payload.json');
const SHOTS = path.join(ROOT, 'outputs', 'deliverables', 'screenshots');
const REPORT = path.join(ROOT, 'outputs', 'deliverables', 'dashboard_test_report.txt');
const TABS = ['summary', 'pressure', 'leaderboard', 'compare', 'squad', 'auction', 'method'];

const lines = [];
const log = s => { console.log(s); lines.push(s); };
let failures = 0;
const check = (name, ok, extra) => { if (!ok) failures++; log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -> ' + extra : ''}`); };
const r0 = v => String(Math.round(v) + 0);          // same rounding as the dashboard (Math.round, half up)

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const payload = JSON.parse(fs.readFileSync(PAYLOAD, 'utf8'));
  const size = fs.statSync(HTML).size;
  log(`Dashboard file: ${HTML}`);
  log(`File size: ${size.toLocaleString('en-US')} bytes (${(size / 1e6).toFixed(2)} MB)`);
  check('file under 5 MB', size < 5 * 1024 * 1024);

  const browser = await chromium.launch();
  const consoleErrors = [], external = [], blocked = [];
  async function newPage(w, h) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.route('**', route => {
      const u = route.request().url();
      if (u.startsWith('file:') || u.startsWith('data:') || u.startsWith('blob:') || u.startsWith('about:')) return route.continue();
      external.push(u); blocked.push(u); return route.abort();
    });
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(`[${w}] ${m.text()}`); });
    page.on('pageerror', e => consoleErrors.push(`[${w}] pageerror: ${e.message}`));
    page.on('request', rq => { const u = rq.url(); if (!/^(file|data|blob|about):/.test(u)) external.push('request:' + u); });
    return { ctx, page };
  }
  const url = (hash) => 'file://' + HTML + (hash || '');
  const hscroll = page => page.evaluate(() => {
    const d = document.documentElement, over = [];
    if (d.scrollWidth > d.clientWidth) {
      document.querySelectorAll('body *').forEach(el => {
        const r = el.getBoundingClientRect(); if (r.right > d.clientWidth + 1 && r.width > 0) {
          let p = el.parentElement, ok = false; while (p) { const cs = getComputedStyle(p); if (/(auto|scroll|hidden)/.test(cs.overflowX) && p !== document.body && p !== d) { ok = true; break; } p = p.parentElement; }
          if (!ok && over.length < 6) over.push(el.tagName + '.' + (el.className && el.className.baseVal === undefined ? el.className : '') + ' right=' + Math.round(r.right));
        }
      });
    }
    return { sw: d.scrollWidth, cw: d.clientWidth, over };
  });
  const notes = {};

  /* ---------- screenshots + layout checks ---------- */
  for (const [w, h] of [[380, 800], [1280, 900]]) {
    const { ctx, page } = await newPage(w, h);
    await page.goto(url('#tab=summary'));
    await page.waitForSelector('#view h2, #view .lead');
    for (const tab of TABS) {
      await page.evaluate(t => { location.hash = '#tab=' + t; }, tab);
      await page.waitForTimeout(250);
      const active = await page.$eval('#tabs button[aria-selected=true]', b => b.dataset.tab);
      check(`[${w}] tab ${tab} opens via URL hash`, active === tab, active);
      await page.screenshot({ path: path.join(SHOTS, `${tab}_${w}.png`), fullPage: true });
      if (w === 380) {
        const hs = await hscroll(page);
        check(`[380] no horizontal scroll on ${tab}`, hs.sw <= hs.cw, `scrollWidth ${hs.sw} vs clientWidth ${hs.cw}${hs.over.length ? ' offenders: ' + hs.over.join(' | ') : ''}`);
        notes[tab] = await page.evaluate(() => ({
          lead: (document.querySelector('#view .lead') || {}).textContent || '',
          charts: document.querySelectorAll('#view section.chart').length, svgs: document.querySelectorAll('#view svg').length,
          tables: document.querySelectorAll('#view table').length, deep: document.querySelectorAll('#view details.deep').length,
          sowhat: document.querySelectorAll('#view .sowhat').length, height: document.documentElement.scrollHeight
        }));
      }
    }
    // Detailed mode screenshot of each tab (desktop only, to audit the deep layer)
    if (w === 1280) {
      await page.click('#mode-detail');
      for (const tab of ['leaderboard', 'method', 'pressure']) {
        await page.evaluate(t => { location.hash = '#tab=' + t; }, tab); await page.waitForTimeout(250);
        await page.screenshot({ path: path.join(SHOTS, `${tab}_detailed_${w}.png`), fullPage: true });
      }
      await page.click('#mode-simple');
    }
    await ctx.close();
  }

  /* ---------- Simple / Detailed switch ---------- */
  {
    const { ctx, page } = await newPage(1280, 900);
    await page.goto(url('#tab=leaderboard')); await page.waitForSelector('#lbtable');
    const vis = () => page.evaluate(() => { const e = document.querySelector('#lbtable th.deepc'); return !!e && getComputedStyle(e).display !== 'none'; });
    check('Simple mode is the default and hides deep columns', (await vis()) === false);
    const openDeep0 = await page.evaluate(() => document.querySelectorAll('#view details.deep[open]').length);
    await page.click('#mode-detail'); await page.waitForTimeout(100);
    check('Detailed mode shows deep columns', (await vis()) === true);
    const openDeep1 = await page.evaluate(() => document.querySelectorAll('#view details.deep[open]').length);
    check('Detailed mode opens deep-dive sections', openDeep1 > openDeep0, `${openDeep0} -> ${openDeep1}`);
    await ctx.close();
  }

  /* ---------- filters change output ---------- */
  {
    const { ctx, page } = await newPage(1280, 900);
    await page.goto(url('#tab=leaderboard')); await page.waitForSelector('#lbtable');
    const snap = () => page.evaluate(() => ({ rows: document.querySelectorAll('#lbtable tbody tr').length, text: document.querySelector('#lbtable tbody').innerText.replace(/\s+/g, ' '), first: (document.querySelector('#lbtable tbody tr .plink') || {}).textContent }));
    const base = await snap();
    await page.selectOption('#f-season', '2024'); await page.waitForTimeout(100);
    const s1 = await snap();
    check('season filter changes leaderboard output', s1.text !== base.text);
    await page.selectOption('#f-pressure', 'H'); await page.waitForTimeout(100);
    const s2 = await snap();
    check('pressure filter changes leaderboard output', s2.text !== s1.text);
    await page.selectOption('#f-phase', 'D'); await page.waitForTimeout(100);
    const s2b = await snap();
    check('phase filter changes leaderboard output', s2b.text !== s2.text);
    check('Clutch score unchanged by season/pressure/phase filters', await page.evaluate(() => [...document.querySelectorAll('#lbtable tbody tr')].every(r => /\d/.test(r.querySelector('.lbbar b').textContent))) && s2b.first === base.first);
    await page.click('#f-reset'); await page.waitForTimeout(100);
    await page.selectOption('#f-role', 'bowl'); await page.waitForTimeout(100);
    const s3 = await snap();
    check('role filter switches the leaderboard to bowlers', s3.text !== base.text && s3.first !== base.first, `${base.first} -> ${s3.first}`);
    await page.selectOption('#f-origin', 'ovs'); await page.waitForTimeout(100);
    const s4 = await snap();
    check('Indian/overseas filter reduces rows', s4.rows < s3.rows, `${s3.rows} -> ${s4.rows}`);
    await page.check('#f-avail'); await page.waitForTimeout(100);
    const s5 = await snap();
    check('available-at-auction toggle reduces rows', s5.rows <= s4.rows, `${s4.rows} -> ${s5.rows}`);
    await page.fill('#f-q', 'zzzqq'); await page.waitForTimeout(100);
    const empty = await page.evaluate(() => (document.querySelector('#view .empty') || {}).textContent || '');
    check('empty result explains itself', /No .* match this slice/.test(empty), empty.slice(0, 90));
    await page.click('#f-reset'); await page.waitForTimeout(100);
    // slice with no balls
    await page.selectOption('#f-role', 'bat'); await page.fill('#f-q', 'Rutherford'); await page.selectOption('#f-phase', 'P'); await page.selectOption('#f-pressure', 'H'); await page.selectOption('#f-season', '2023');
    await page.waitForTimeout(100);
    const note = await page.evaluate(() => document.querySelector('#view').innerText.slice(0, 600));
    log('      (info) narrow slice text: ' + note.replace(/\s+/g, ' ').slice(0, 160));
    await page.click('#f-reset');
    // hash keeps tab and player
    await page.evaluate(() => { location.hash = '#tab=auction'; }); await page.waitForTimeout(150);
    await page.click('#view .plink'); await page.waitForSelector('#card.on');
    const h = await page.evaluate(() => location.hash);
    check('URL hash keeps the tab and the selected player', /tab=auction/.test(h) && /p=\d+/.test(h), h);
    await page.keyboard.press('Escape'); await page.waitForTimeout(100);
    check('Escape closes the profile card and clears the hash player', !(await page.$('#card.on')) && !/p=/.test(await page.evaluate(() => location.hash)));
    // deep link to a player
    const someId = payload.players.find(p => p.scorable).id;
    await page.goto(url(`#tab=summary&p=${someId}`)); await page.waitForSelector('#card.on');
    check('deep link opens the profile card', true);
    await ctx.close();
  }

  /* ---------- mobile filter sheet ---------- */
  {
    const { ctx, page } = await newPage(380, 800);
    await page.goto(url('#tab=leaderboard')); await page.waitForSelector('#lbtable');
    check('[380] filter bar hidden until the Filters button is tapped', !(await page.isVisible('#f-role')));
    await page.click('#fbtn'); await page.waitForSelector('#f-role', { state: 'visible' });
    await page.screenshot({ path: path.join(SHOTS, 'filters_sheet_380.png') });
    const before = await page.evaluate(() => document.querySelector('#lbtable tbody').innerText);
    await page.selectOption('#f-season', '2025');
    await page.click('#fclose'); await page.waitForTimeout(150);
    const after = await page.evaluate(() => document.querySelector('#lbtable tbody').innerText);
    check('[380] mobile Filters sheet applies a filter', before !== after);
    const chips = await page.evaluate(() => document.querySelector('#activebar').innerText);
    check('[380] active filter chips and reset are shown', /Season: 2025/.test(chips) && /Reset/.test(chips), chips.replace(/\s+/g, ' '));
    const hs = await hscroll(page); check('[380] no horizontal scroll with filters applied', hs.sw <= hs.cw, `${hs.sw}/${hs.cw}`);
    await ctx.close();
  }

  /* ---------- profile card screenshots + payload match ---------- */
  {
    const scorable = payload.players.filter(p => p.scorable);
    for (const [w, h] of [[380, 800], [1280, 900]]) {
      const { ctx, page } = await newPage(w, h);
      const ar = scorable.find(p => p.role === 'All-rounder'), bt = scorable.find(p => p.name === 'Ashutosh Sharma') || scorable[0];
      await page.goto(url(`#tab=leaderboard&p=${bt.id}`)); await page.waitForSelector('#card.on');
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(SHOTS, `profile_card_${w}.png`) });
      await page.evaluate(() => { document.querySelector('#cardpanel').scrollTop = 900; });
      await page.screenshot({ path: path.join(SHOTS, `profile_card_${w}_scrolled.png`) });
      if (w === 380) { const hs = await hscroll(page); check('[380] no horizontal scroll with profile card open', hs.sw <= hs.cw, `${hs.sw}/${hs.cw}`); const pw = await page.evaluate(() => { const p = document.querySelector('#cardpanel'); return [p.scrollWidth, p.clientWidth]; }); check('[380] profile card panel does not scroll sideways', pw[0] <= pw[1], pw.join('/')); }
      if (w === 1280) { await page.goto(url(`#tab=leaderboard&p=${ar.id}`)); await page.waitForSelector('#card.on'); await page.waitForTimeout(200); await page.screenshot({ path: path.join(SHOTS, 'profile_card_allrounder_1280.png') }); }
      await ctx.close();
    }
    // 5 random players: card numbers equal the payload (rounded as displayed)
    const { ctx, page } = await newPage(1280, 900);
    await page.goto(url('#tab=summary')); await page.waitForSelector('#view .lead');
    const pool = scorable.slice(); const pick = [];
    while (pick.length < 5) pick.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    for (const p of pick) {
      await page.evaluate(id => { location.hash = '#tab=leaderboard&p=' + id; }, p.id);
      await page.waitForSelector('#card.on .dial-score');
      await page.waitForFunction(id => document.querySelector('#card-title') && true, p.id);
      const got = await page.evaluate(() => ({ title: document.querySelector('#card-title').textContent, score: document.querySelector('.dial-score').textContent, range: document.querySelector('.dial-range').textContent, text: document.querySelector('#cardpanel').innerText }));
      const main = p.ar || p.bat || p.bowl;
      const wantRange = `${r0(main.lo)}–${r0(main.hi)}`;
      check(`random card ${p.name}: name matches`, got.title === p.name, got.title);
      check(`random card ${p.name}: score ${r0(main.score)} matches payload`, got.score === r0(main.score), got.score);
      check(`random card ${p.name}: 80% range ${wantRange} matches payload`, got.range === wantRange, got.range);
      const rk = main.rank, of = main.of;
      check(`random card ${p.name}: rank ${rk} of ${of} shown`, got.text.includes(`Rank ${rk} of ${of}`));
      if (p.role !== 'Bowler' && p.bat_hl) check(`random card ${p.name}: High-pressure balls ${r0(p.bat_hl.High_balls)} shown`, got.text.includes(r0(p.bat_hl.High_balls)));
      if (p.role !== 'Batter' && p.bowl_hl) check(`random card ${p.name}: High-pressure legal balls ${r0(p.bowl_hl.High_legal)} shown`, got.text.includes(r0(p.bowl_hl.High_legal)));
      check(`random card ${p.name}: price band text shown`, got.text.includes(p.price.split('[')[0].trim()));
      check(`random card ${p.name}: age tagged UNKNOWN`, /UNKNOWN/.test(got.text));
    }
    await ctx.close();
  }

  /* ---------- tab-specific interaction checks ---------- */
  {
    const { ctx, page } = await newPage(1280, 900);
    await page.goto(url('#tab=pressure')); await page.waitForSelector('#mx');
    const info0 = await page.textContent('#ballinfo');
    await page.fill('#ballslider', '120'); await page.dispatchEvent('#ballslider', 'input');
    await page.waitForTimeout(100);
    const info1 = await page.textContent('#ballinfo');
    check('match explorer: choosing a ball shows its situation and WPA', info0 !== info1 && /Pressure Index/.test(info1) && /Win probability added/.test(info1));
    await page.selectOption('#matchsel', '2'); await page.waitForTimeout(100);
    check('match explorer: switching match redraws', /SRH v RR/.test(await page.textContent('#view .chart .ct')));
    const t0 = await page.textContent('#view .chart:nth-of-type(1)');
    await page.click('[data-act=mapinn][data-v="2"]'); await page.waitForTimeout(100);
    check('pressure map: innings toggle works', (await page.$eval('[data-act=mapinn][data-v="2"]', b => b.getAttribute('aria-pressed'))) === 'true');
    // compare
    await page.goto(url('#tab=compare')); await page.waitForSelector('#view .ptag');
    const nTags = (await page.$$('#view .ptag')).length;
    await page.click('[data-act=cmp-preset][data-v=planA]'); await page.waitForTimeout(100);
    const v = await page.textContent('#view .lead');
    check('compare: shows a verdict sentence', v.length > 30, v.slice(0, 100));
    const hasOverlapWording = /too close to call|clearly ahead|Too close/.test(await page.textContent('#view'));
    check('compare: uses "too close to call"/"clearly ahead" wording', hasOverlapWording);
    await page.screenshot({ path: path.join(SHOTS, 'compare_planA_1280.png'), fullPage: true });
    // auction basket
    await page.goto(url('#tab=auction')); await page.waitForSelector('#basket');
    await page.click('[data-act=bk-preset][data-v=A]'); await page.waitForTimeout(100);
    const left = parseFloat(await page.textContent('#bk-left'));
    const want = payload.squad.purse - payload.squad.planA_ids.reduce((s, id) => s + payload.players.find(p => p.id === id).price_mid, 0);
    check('auction basket: purse left for Plan A equals purse minus mid prices', Math.abs(left - want) < 0.06, `${left} vs ${want.toFixed(2)}`);
    await page.click('[data-act=bk-clear]');
    for (const id of payload.auction.tiers.map(t => t.id)) await page.click(`#view .tiers [data-act=basket][data-id="${id}"]`);
    await page.waitForTimeout(100);
    const warn = await page.evaluate(() => [...document.querySelectorAll('#basket .warnbox')].map(e => e.textContent).join(' | '));
    check('auction basket: warns when a limit breaks', warn.length > 0, warn.slice(0, 120));
    await page.screenshot({ path: path.join(SHOTS, 'auction_basket_1280.png'), fullPage: true });
    // method: backtest wording
    await page.goto(url('#tab=method')); await page.waitForSelector('#view .lead');
    const mt = await page.textContent('#view');
    check('method: states prediction of 2027 is not established', /not established/i.test(mt));
    check('method: backtest shown (score did not beat naive)', /did not beat|plain ranking hit more|no clear difference/i.test(mt));
    check('method: facts ledger states no fact is VERIFIED', /0 of \d+ external facts are VERIFIED/.test(mt));
    check('method: audit shows pending when empty', payload.method.audit.length > 0 || /Pending/.test(mt));
    check('footer: public URL placeholder', /Public URL: pending \(placeholder\)/.test(await page.textContent('footer')));
    await ctx.close();
  }

  /* ---------- global checks ---------- */
  check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' || '));
  check('no external network requests', external.length === 0, external.slice(0, 3).join(' || '));
  log(`Blocked/recorded request attempts: ${blocked.length}`);
  await browser.close();

  log('\nPer-tab notes (measured at 380px, automatic):');
  for (const t of TABS) { const n = notes[t]; if (n) log(`  ${t}: lead="${n.lead.slice(0, 90).trim()}..." charts=${n.charts} svgs=${n.svgs} tables=${n.tables} deep-sections=${n.deep} so-what-lines=${n.sowhat} page-height=${n.height}px`); }
  log(`\nRESULT: ${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
  fs.writeFileSync(REPORT, lines.join('\n') + '\n');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); fs.writeFileSync(REPORT, lines.join('\n') + '\nCRASH: ' + e.stack + '\n'); process.exit(2); });
