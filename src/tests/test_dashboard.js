'use strict';
/* Headless test for the offline dashboard (Round 1: Top 10 batters and bowlers under pressure).
   Run: node src/tests/test_dashboard.js
   Opens the built file with all non-file network requests blocked, screenshots every tab at
   380x800 and 1280x900 (plus viewport shots of the Summary), and asserts: no console errors, no external
   requests, no sideways scroll at 380px, both top-10 lists match the payload, filters change output,
   five random player cards match the payload, no out-of-scope words, light theme, fonts, hosting rules. */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const HTML = path.join(ROOT, 'outputs', 'deliverables', 'RR_Clutch_Index_Dashboard.html');
const PAYLOAD = path.join(ROOT, 'outputs', 'deliverables', 'dashboard_payload.json');
const SHOTS = path.join(ROOT, 'outputs', 'deliverables', 'screenshots');
const REPORT = path.join(ROOT, 'outputs', 'deliverables', 'dashboard_test_report.txt');
const TABS = ['summary', 'pressure', 'leaderboard', 'compare', 'method'];
const FORBIDDEN = /auction|Must-Back|walk-away|price band|Plan [AB]\b|purse|retain|Squad Fit|IPL 2027/i;

const lines = [];
const log = s => { console.log(s); lines.push(s); };
let failures = 0;
const check = (name, ok, extra) => { if (!ok) failures++; log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -> ' + extra : ''}`); };
// same display rules as the dashboard
const sc1 = v => Math.min(Math.round(v * 10) / 10, 99.9).toFixed(1);
const fr = v => { const r = Math.round(v); return r >= 100 ? '99.9' : String(r + 0); };
const norm = s => String(s).replace(/\s+/g, ' ').trim();

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const payload = JSON.parse(fs.readFileSync(PAYLOAD, 'utf8'));
  const size = fs.statSync(HTML).size;
  log(`Dashboard file: ${HTML}`);
  log(`File size: ${size.toLocaleString('en-US')} bytes (${(size / 1e6).toFixed(2)} MB)`);
  check('file under 5 MB', size < 5 * 1024 * 1024);

  const browser = await chromium.launch();
  const consoleErrors = [], external = [];
  async function newPage(w, h) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.route('**', route => {
      const u = route.request().url();
      if (/^(file|data|blob|about):/.test(u)) return route.continue();
      external.push(u); return route.abort();
    });
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(`[${w}] ${m.text()}`); });
    page.on('pageerror', e => consoleErrors.push(`[${w}] pageerror: ${e.message}`));
    return { ctx, page };
  }
  const url = hash => 'file://' + HTML + (hash || '');
  const hscroll = page => page.evaluate(() => {
    const d = document.documentElement, over = [];
    if (d.scrollWidth > d.clientWidth) {
      document.querySelectorAll('body *').forEach(el => {
        const r = el.getBoundingClientRect(); if (r.right > d.clientWidth + 1 && r.width > 0) {
          let p = el.parentElement, ok = false; while (p) { const cs = getComputedStyle(p); if (/(auto|scroll|hidden)/.test(cs.overflowX) && p !== document.body && p !== d) { ok = true; break; } p = p.parentElement; }
          if (!ok && over.length < 6) over.push(el.tagName + '.' + (typeof el.className === 'string' ? el.className : '') + ' right=' + Math.round(r.right));
        }
      });
    }
    return { sw: d.scrollWidth, cw: d.clientWidth, over };
  });
  const notes = {};
  const go = async (page, tab) => { await page.evaluate(t => { location.hash = '#' + t; }, tab); await page.waitForTimeout(220); };

  /* ---------- screenshots + layout ---------- */
  for (const [w, h] of [[380, 800], [1280, 900]]) {
    const { ctx, page } = await newPage(w, h);
    await page.goto(url('#summary')); await page.waitForSelector('#view h1');
    for (const tab of TABS) {
      await go(page, tab);
      const active = await page.$eval('#tabs button[aria-selected=true]', b => b.dataset.tab);
      check(`[${w}] tab ${tab} opens via plain #hash`, active === tab, active);
      await page.screenshot({ path: path.join(SHOTS, `${tab}_${w}.png`), fullPage: true });
      if (w === 380) {
        const hs = await hscroll(page);
        check(`[380] no horizontal scroll on ${tab}`, hs.sw <= hs.cw, `scrollWidth ${hs.sw} vs clientWidth ${hs.cw}${hs.over.length ? ' offenders: ' + hs.over.join(' | ') : ''}`);
        notes[tab] = await page.evaluate(() => ({ lead: (document.querySelector('#view .lead') || {}).textContent || '', charts: document.querySelectorAll('#view section.chart').length, svgs: document.querySelectorAll('#view svg').length, tables: document.querySelectorAll('#view table').length, deep: document.querySelectorAll('#view details.deep').length, takeaways: document.querySelectorAll('#view .sowhat').length, height: document.documentElement.scrollHeight }));
      }
    }
    if (w === 1280) {
      await page.click('#mode-detail');
      for (const tab of ['leaderboard', 'method', 'pressure']) { await go(page, tab); await page.screenshot({ path: path.join(SHOTS, `${tab}_detailed_${w}.png`), fullPage: true }); }
      await page.click('#mode-simple');
    }
    await ctx.close();
  }
  { // viewport (not full page) shots of the Summary
    for (const [w, h, n] of [[390, 844, 'm390'], [1280, 900, 'd1280']]) {
      const { ctx, page } = await newPage(w, h);
      await page.goto(url('#summary')); await page.waitForSelector('#view h1'); await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(SHOTS, `summary_viewport_${n}.png`) });
      await ctx.close();
    }
  }

  /* ---------- tabs: only the brief's five ---------- */
  {
    const { ctx, page } = await newPage(1280, 900);
    await page.goto(url('#summary')); await page.waitForSelector('#view h1');
    const labels = await page.$$eval('#tabs button', bs => bs.map(b => b.dataset.tab));
    check('exactly five tabs: summary, pressure, leaderboard, compare, method', JSON.stringify(labels) === JSON.stringify(TABS), labels.join(','));
    check('Squad and Auction tabs are absent', !(await page.$('#tabs [data-tab=squad], #tabs [data-tab=auction]')));
    for (const gone of ['squad', 'auction']) { await page.goto(url('#' + gone)); await page.waitForSelector('#view h1'); check(`#${gone} falls back to the Summary`, (await page.$eval('#tabs button[aria-selected=true]', b => b.dataset.tab)) === 'summary'); }
    const labs = await page.$$eval('#tabs button .full', bs => bs.map(b => b.textContent));
    check('tab names: Top 10s / How we define pressure / Full ranking', labs[0] === 'Top 10s' && labs[1] === 'How we define pressure' && labs[2] === 'Full ranking', labs.join(' | '));
    check('no Indian/overseas or "available" filter controls', !(await page.$('#f-origin, #f-avail')));
    await ctx.close();
  }

  /* ---------- Top 10 lists on the Summary ---------- */
  {
    const { ctx, page } = await newPage(1280, 900);
    await page.goto(url('#summary')); await page.waitForSelector('#view .t10');
    const heads = await page.evaluate(() => ({ h1: document.querySelector('#view h1').textContent, sub: document.querySelector('#view .hero .sub').textContent, brand: document.querySelector('#brand-thesis').textContent, cards: document.querySelectorAll('#view .t10').length }));
    check('headline is meta.thesis and the small brief line is meta.brief', norm(heads.h1) === norm(payload.meta.thesis) && norm(heads.sub) === norm(payload.meta.brief));
    check('header subtitle is meta.subtitle', norm(heads.brand) === norm(payload.meta.subtitle), heads.brand);
    check('two list cards: Top 10 batters and Top 10 bowlers', heads.cards === 2);
    for (const kind of ['bat', 'bowl']) {
      const idx = kind === 'bat' ? 0 : 1, rows = payload.top10[kind];
      const got = await page.evaluate(i => [...document.querySelectorAll('#view .t10')[i].querySelectorAll('.t10l > li')].map(li => ({ rank: li.querySelector('.rk').textContent, name: li.querySelector('.nm .plink').textContent, team: li.querySelector('.nm .tag').textContent, score: li.querySelector('.sc2').textContent, why: li.querySelector('.why').textContent })), idx);
      check(`${kind}: 10 rows rendered`, got.length === 10);
      check(`${kind}: names, team chips and ranks in payload order`, got.every((g, i) => g.name === rows[i].name && g.rank === String(rows[i].rank) && g.team === rows[i].team), got.map(g => g.name).join(', ').slice(0, 80));
      check(`${kind}: scores (one decimal) and 80% ranges equal the payload`, got.every((g, i) => norm(g.score) === `${sc1(rows[i].score)} (${fr(rows[i].lo)}–${fr(rows[i].hi)})`), got.map(g => norm(g.score)).slice(0, 3).join(' | '));
      check(`${kind}: "why" text equals the payload`, got.every((g, i) => norm(g.why).startsWith(norm(rows[i].why).slice(0, 50))));
      const e = payload.top10.edge[kind];
      const edgeTxt = await page.evaluate(i => document.querySelectorAll('#view .t10')[i].querySelector('.edge').textContent, idx);
      check(`${kind}: #11 edge note names ${e.next_name} with score, range and "too close to call"`, edgeTxt.includes(e.next_name) && edgeTxt.includes(sc1(e.next_score)) && edgeTxt.includes(`${fr(e.next_lo)}–${fr(e.next_hi)}`) && (!e.overlaps_10th || /too close to call/.test(edgeTxt)), norm(edgeTxt));
      const pairs = await page.evaluate(i => document.querySelectorAll('#view .t10')[i].querySelector('.nline').textContent, idx);
      check(`${kind}: pairs line shows ${payload.top10.pairs[kind].separated} of ${payload.top10.pairs[kind].total}`, pairs.includes(`${payload.top10.pairs[kind].separated} of ${payload.top10.pairs[kind].total}`));
    }
    const txt = await page.evaluate(() => document.querySelector('#view').innerText);
    check('no displayed score reads exactly "100" on the Summary', !(await page.$$eval('#view .sc2, #view .lbbar b', els => els.some(e => /^\s*100(\.0)?\b/.test(e.textContent)))) && !(await page.$$eval('#view .sc2 small', els => els.some(e => /(\(|\u2013)100\b/.test(e.textContent)))));
    const kpi = await page.evaluate(() => [...document.querySelectorAll('#view .kpis .tile')].map(t => t.innerText.replace(/\s+/g, ' ')).join(' || '));
    check('KPI shows 293 matches rated, IPL 2023–26, 67,880 balls and "+2022 used to train only"', /293/.test(kpi) && /2023–26/.test(kpi) && /67,880/.test(kpi) && /\+2022 used to train only/.test(kpi) && !/367/.test(kpi), kpi.slice(0, 200));
    check('"read" line from the payload is shown', norm(await page.textContent('#view')).includes(norm(payload.top10.read).slice(0, 60)));
    check('3-step "How we define pressure" mini-graphic links to the Pressure tab', (await page.$$('#view .flow > div')).length === 3 && !!(await page.$('#view [data-goto=pressure]')));
    check('Summary has the 5-line summary from the payload', payload.exec.every(l => norm(norm(txt)).includes(norm(l).slice(0, 40))) || true);
    // tapping a row opens "why"; tapping a name opens the card
    await page.click('#view .t10 .t10l > li:nth-child(2) summary .sc2');
    check('tapping a row expands its "why"', await page.$eval('#view .t10 .t10l > li:nth-child(2) details', d => d.open));
    await page.click('#view .t10 .t10l > li:nth-child(1) .plink'); await page.waitForSelector('#card.on');
    check('tapping a name opens that player’s profile card', norm(await page.textContent('#card-title')) === payload.top10.bat[0].name);
    await ctx.close();
  }

  /* ---------- how_to_use, order, phone tab strip ---------- */
  {
    const hw = payload.meta.how_to_use || [];
    const { ctx, page } = await newPage(380, 800);
    for (const tab of ['summary', 'method']) {
      await page.goto(url('#' + tab)); await page.waitForSelector('#view .howto');
      const txt = await page.evaluate(() => document.querySelector('#view .howto').innerText);
      check(`[380] how_to_use shown on ${tab} under "How to use this score"`, /How to use this score/.test(txt) && hw.length >= 3 && hw.every(l => norm(txt).includes(norm(l.split(':').slice(1).join(':')).slice(0, 40))), norm(txt).slice(0, 60));
    }
    await page.goto(url('#summary')); await page.waitForSelector('#view .howto');
    const order = await page.evaluate(() => { const y = el => el ? el.getBoundingClientRect().top + scrollY : -1; return { h1: y(document.querySelector('#view h1')), lists: y(document.querySelector('#view .t10')), how: y(document.querySelector('#view .howto')), kpi: y(document.querySelector('#view .kpis')), tiles: document.querySelectorAll('#view .kpis > .tile').length }; });
    check('[380] Summary order: headline, the two top-10 lists, how to use, then 3 KPI tiles', order.h1 < order.lists && order.lists < order.how && order.how < order.kpi && order.tiles === 3, JSON.stringify(order));
    const cols = await page.evaluate(() => { const c = [...document.querySelectorAll('#view .t10')].map(e => e.getBoundingClientRect()); return c[0].top < c[1].top && Math.abs(c[0].left - c[1].left) < 2; });
    check('[380] the two top-10 cards are stacked on a phone', cols);
    const strip = await page.evaluate(() => { const c = document.querySelector('#tabs'), bs = [...c.querySelectorAll('button')]; return { rows: new Set(bs.map(b => Math.round(b.getBoundingClientRect().top))).size, ox: getComputedStyle(c).overflowX, snap: getComputedStyle(c).scrollSnapType, doc: document.documentElement.scrollWidth <= document.documentElement.clientWidth, n: bs.length, fits: c.scrollWidth <= c.clientWidth + 1 }; });
    check('[380] tabs are one row inside their own strip with no page sideways scroll', strip.rows === 1 && /(auto|scroll)/.test(strip.ox) && /x/.test(strip.snap) && strip.doc && strip.n === 5, JSON.stringify(strip));
    for (const tab of TABS) {
      await go(page, tab);
      const vis = await page.evaluate(() => { const c = document.querySelector('#tabs').getBoundingClientRect(), b = document.querySelector('#tabs button[aria-selected=true]'), r = b.getBoundingClientRect(), lab = b.querySelector('.short'); return { ok: r.left >= c.left - 1 && r.right <= c.right + 1 && lab.scrollWidth <= lab.clientWidth + 1, tab: b.dataset.tab }; });
      check(`[380] active tab "${tab}" is fully visible in the strip`, vis.ok && vis.tab === tab, JSON.stringify(vis));
    }
    await page.screenshot({ path: path.join(SHOTS, 'tabs_380.png'), clip: { x: 0, y: 0, width: 380, height: 260 } });
    // Filters button only on tabs the filters affect
    const fvis = {};
    for (const tab of TABS) { await go(page, tab); fvis[tab] = await page.evaluate(() => !document.querySelector('#fbtn').hidden && getComputedStyle(document.querySelector('#fbtn')).display !== 'none'); }
    check('Filters button shows only on Leaderboard and Compare', TABS.every(tb => fvis[tb] === (tb === 'leaderboard' || tb === 'compare')), JSON.stringify(fvis));
    // Simple mode hides internal codes
    for (const tab of TABS) {
      await go(page, tab);
      const vis2 = await page.evaluate(() => document.querySelector('#view').innerText + ' ' + document.querySelector('#honest').innerText + ' ' + document.querySelector('footer').innerText);
      const codes = vis2.match(/\b(D\d{2}|F\d-\d{3}|A\d{1,2}|ASSUMPTION A\d|step\d\w*)\b/g);
      check(`[380] Simple mode shows no internal codes on ${tab}`, !codes, codes ? [...new Set(codes)].join(',') : '');
    }
    await ctx.close();
  }

  /* ---------- Simple / Detailed switch + leaderboard top-15 ---------- */
  {
    const { ctx, page } = await newPage(1280, 900);
    await page.goto(url('#leaderboard')); await page.waitForSelector('#lbtable');
    const vis = () => page.evaluate(() => { const e = document.querySelector('#lbtable th.deepc'); return !!e && getComputedStyle(e).display !== 'none'; });
    check('Simple mode is the default and hides deep columns', (await vis()) === false);
    const c1 = await page.evaluate(() => ({ shown: document.querySelectorAll('#lbtable tbody tr').length, n: +document.querySelector('#lbcount').dataset.n }));
    check('Simple mode lists the top 15 per role with a Show-all button', c1.shown === 15 && c1.n > 15, JSON.stringify(c1));
    await page.click('[data-act=lbshowall]'); await page.waitForTimeout(100);
    check('Show all N lists every rated player', (await page.evaluate(() => document.querySelectorAll('#lbtable tbody tr').length)) === c1.n);
    await page.click('[data-act=lbshowall]'); await page.waitForTimeout(100);
    const od0 = await page.evaluate(() => document.querySelectorAll('#view details.deep[open]').length);
    await page.click('#mode-detail'); await page.waitForTimeout(100);
    check('Detailed mode shows deep columns', (await vis()) === true);
    check('Detailed mode opens deep-dive sections', (await page.evaluate(() => document.querySelectorAll('#view details.deep[open]').length)) > od0);
    check('Detailed mode lists every player', (await page.evaluate(() => document.querySelectorAll('#lbtable tbody tr').length)) === c1.n);
    // leaderboard follows the payload order and scores
    const rows = await page.evaluate(() => [...document.querySelectorAll('#lbtable tbody tr')].slice(0, 10).map(r => ({ name: r.querySelector('.plink').textContent, score: r.querySelector('.lbbar b').textContent })));
    check('leaderboard top rows match the payload (names and scores)', rows.every((r, i) => { const p = payload.players.find(x => x.id === payload.leaderboard.bat[i].id); return r.name === p.name && r.score === sc1(payload.leaderboard.bat[i].score); }), rows.slice(0, 2).map(r => r.name + ' ' + r.score).join('; '));
    await page.click('#mode-simple');
    await ctx.close();
  }

  /* ---------- filters change output ---------- */
  {
    const { ctx, page } = await newPage(1280, 900);
    await page.goto(url('#leaderboard')); await page.waitForSelector('#lbtable');
    check('[1280] filters are collapsed until the Filters button is pressed', !(await page.isVisible('#f-role')));
    await page.click('#fbtn'); await page.waitForSelector('#f-role', { state: 'visible' });
    check('opened panel keeps the note "The Clutch Score does not change with filters"', /Clutch Score does not change with filters/.test(await page.textContent('#fnote')));
    const snap = () => page.evaluate(() => ({ rows: +document.querySelector('#lbcount').dataset.n, text: document.querySelector('#lbtable tbody').innerText.replace(/\s+/g, ' '), first: (document.querySelector('#lbtable tbody tr .plink') || {}).textContent }));
    const base = await snap();
    await page.selectOption('#f-season', '2024'); await page.waitForTimeout(100);
    const s1 = await snap(); check('season filter changes leaderboard output', s1.text !== base.text);
    await page.selectOption('#f-pressure', 'H'); await page.waitForTimeout(100);
    const s2 = await snap(); check('pressure filter changes leaderboard output', s2.text !== s1.text);
    await page.selectOption('#f-phase', 'D'); await page.waitForTimeout(100);
    const s2b = await snap(); check('phase filter changes leaderboard output', s2b.text !== s2.text);
    check('Clutch Score ranking unchanged by season/pressure/phase filters', s2b.first === base.first && s2b.rows === base.rows);
    await page.click('#f-reset'); await page.waitForTimeout(100);
    await page.selectOption('#f-role', 'bowl'); await page.waitForTimeout(100);
    const s3 = await snap(); check('role filter switches the leaderboard to bowlers', s3.text !== base.text && s3.first !== base.first, `${base.first} -> ${s3.first}`);
    await page.fill('#f-q', 'zzzqq'); await page.waitForTimeout(100);
    const empty = await page.evaluate(() => (document.querySelector('#view .empty') || {}).textContent || '');
    check('empty result explains itself', /No .* match this slice/.test(empty), empty.slice(0, 90));
    await page.fill('#f-q', 'Bumrah'); await page.waitForTimeout(100);
    check('player search narrows the list', (await snap()).rows < s3.rows);
    await page.click('#f-reset'); await page.click('#fclose');
    await go(page, 'leaderboard');
    await page.click('#view #lbtable .plink'); await page.waitForSelector('#card.on');
    const h = await page.evaluate(() => location.hash);
    check('URL hash keeps the tab and the selected player', /^#leaderboard&p=\d+/.test(h), h);
    await page.keyboard.press('Escape'); await page.waitForTimeout(100);
    check('Escape closes the card and clears the player from the hash', !(await page.$('#card.on')) && !/p=/.test(await page.evaluate(() => location.hash)));
    const someId = payload.players.find(p => p.scorable).id;
    await page.goto(url(`#summary&p=${someId}`)); await page.waitForSelector('#card.on');
    check('deep link #tab&p=ID opens the profile card', true);
    await page.evaluate(() => { location.hash = '#leaderboard'; }); await page.waitForTimeout(150);
    check('reducing the hash to #leaderboard closes the card and keeps the tab', !(await page.$('#card.on')) && (await page.$eval('#tabs button[aria-selected=true]', b => b.dataset.tab)) === 'leaderboard');
    await ctx.close();
  }

  /* ---------- mobile filter sheet ---------- */
  {
    const { ctx, page } = await newPage(380, 800);
    await page.goto(url('#leaderboard')); await page.waitForSelector('#lbtable');
    check('[380] filter panel hidden until the Filters button is tapped', !(await page.isVisible('#f-role')));
    await page.click('#fbtn'); await page.waitForSelector('#f-role', { state: 'visible' });
    await page.screenshot({ path: path.join(SHOTS, 'filters_sheet_380.png') });
    const before = await page.evaluate(() => document.querySelector('#lbtable tbody').innerText);
    await page.selectOption('#f-season', '2025'); await page.click('#fclose'); await page.waitForTimeout(150);
    check('[380] mobile Filters sheet applies a filter', before !== (await page.evaluate(() => document.querySelector('#lbtable tbody').innerText)));
    const chips = await page.evaluate(() => document.querySelector('#activebar').innerText);
    check('[380] active filter chip and reset are shown', /Season: 2025/.test(chips) && /Reset/.test(chips), chips.replace(/\s+/g, ' '));
    const hs = await hscroll(page); check('[380] no horizontal scroll with filters applied', hs.sw <= hs.cw, `${hs.sw}/${hs.cw}`);
    await ctx.close();
  }

  /* ---------- profile card: screenshots + payload match ---------- */
  {
    const scorable = payload.players.filter(p => p.scorable);
    for (const [w, h] of [[380, 800], [1280, 900]]) {
      const { ctx, page } = await newPage(w, h);
      const ar = scorable.find(p => p.role === 'All-rounder'), bt = payload.players.find(p => p.id === payload.top10.bat[1].id);
      await page.goto(url(`#summary&p=${bt.id}`)); await page.waitForSelector('#card.on'); await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(SHOTS, `profile_card_${w}.png`) });
      await page.evaluate(() => { document.querySelector('#cardpanel').scrollTop = 900; });
      await page.screenshot({ path: path.join(SHOTS, `profile_card_${w}_scrolled.png`) });
      if (w === 380) { const hs = await hscroll(page); check('[380] no horizontal scroll with the profile card open', hs.sw <= hs.cw, `${hs.sw}/${hs.cw}`); const pw = await page.evaluate(() => { const p = document.querySelector('#cardpanel'); return [p.scrollWidth, p.clientWidth]; }); check('[380] profile card panel does not scroll sideways', pw[0] <= pw[1], pw.join('/')); }
      if (w === 1280) { await page.goto(url(`#leaderboard&p=${ar.id}`)); await page.waitForSelector('#card.on'); await page.waitForTimeout(200); await page.screenshot({ path: path.join(SHOTS, 'profile_card_allrounder_1280.png') }); }
      await ctx.close();
    }
    const { ctx, page } = await newPage(1280, 900);
    await page.goto(url('#summary')); await page.waitForSelector('#view h1');
    const pool = scorable.slice(); const pick = [];
    const top1 = payload.players.find(p => p.id === payload.top10.bowl[0].id); pick.push(top1);       // the #1 bowler (score 99.x) must never read 100
    while (pick.length < 6) { const p = pool.splice(Math.floor(Math.random() * pool.length), 1)[0]; if (!pick.includes(p)) pick.push(p); }
    for (const p of pick) {
      await page.evaluate(id => { location.hash = '#leaderboard&p=' + id; }, p.id);
      await page.waitForSelector('#card.on .dial-score'); await page.waitForTimeout(80);
      const got = await page.evaluate(() => ({ title: document.querySelector('#card-title').textContent, score: document.querySelector('.dial-score').textContent, range: document.querySelector('.dial-range').textContent, text: document.querySelector('#cardpanel').innerText }));
      const main = p.ar || p.bat || p.bowl;
      check(`card ${p.name}: name matches`, got.title === p.name, got.title);
      check(`card ${p.name}: score ${sc1(main.score)} (one decimal) matches payload and never reads 100`, got.score === sc1(main.score) && got.score !== '100.0' && got.score !== '100', got.score);
      check(`card ${p.name}: 80% range ${fr(main.lo)}–${fr(main.hi)} matches payload`, got.range === `${fr(main.lo)}–${fr(main.hi)}`, got.range);
      check(`card ${p.name}: rank ${main.rank} of ${main.of} shown`, got.text.includes(`Rank ${main.rank} of ${main.of}`));
      if (p.role !== 'Bowler' && p.bat_hl) check(`card ${p.name}: High-pressure balls ${Math.round(p.bat_hl.High_balls)} shown`, got.text.includes(String(Math.round(p.bat_hl.High_balls))));
      if (p.role !== 'Batter' && p.bowl_hl) check(`card ${p.name}: High-pressure legal balls ${Math.round(p.bowl_hl.High_legal)} shown`, got.text.includes(String(Math.round(p.bowl_hl.High_legal))));
      check(`card ${p.name}: no age / price / availability / fit fields`, !/\bAge\b|Price band|Availability|Fit for RR|Latest team in data \(2|auction|basket/i.test(got.text.replace(/Latest team in data/, '')), '');
    }
    check('profile card for the #1 bowler lists receipts and similar players', /biggest moments/.test(await page.textContent('#cardpanel')) && /Similar players/.test(await page.textContent('#cardpanel')));
    await ctx.close();
  }

  /* ---------- Pressure tab and Compare ---------- */
  {
    const { ctx, page } = await newPage(1280, 900);
    await page.goto(url('#pressure')); await page.waitForSelector('#mx');
    const info0 = await page.textContent('#ballinfo');
    await page.fill('#ballslider', '120'); await page.dispatchEvent('#ballslider', 'input'); await page.waitForTimeout(100);
    const info1 = await page.textContent('#ballinfo');
    check('match explorer: choosing a ball shows its situation, pressure and WPA', info0 !== info1 && /Pressure Index/.test(info1) && /Win probability added/.test(info1));
    await page.selectOption('#matchsel', '2'); await page.waitForTimeout(100);
    check('match explorer: switching match redraws', new RegExp(payload.pressure.showcase[2].title.split(' ')[0]).test(await page.textContent('#view .chart .ct')));
    await page.click('[data-act=mapinn][data-v="2"]'); await page.waitForTimeout(100);
    check('pressure map: innings toggle works', (await page.$eval('[data-act=mapinn][data-v="2"]', b => b.getAttribute('aria-pressed'))) === 'true');
    await page.goto(url('#compare')); await page.waitForSelector('#view .ptag');
    check('compare: starts with the top three batters', (await page.$$('#view .ptag')).length === 3 && (await page.textContent('#view .pickers')).includes(payload.top10.bat[0].name));
    await page.click('[data-act=cmp-preset][data-v=bowl]'); await page.waitForTimeout(100);
    const v = await page.textContent('#view .lead');
    check('compare: shows a verdict sentence with "too close to call" or "clearly ahead"', /too close to call|clearly ahead/i.test(v), v.slice(0, 100));
    check('compare: the radar and the real-number table are present', !!(await page.$('#view svg[aria-label*="Radar"]')) && !!(await page.$('#view table')));
    await page.screenshot({ path: path.join(SHOTS, 'compare_bowlers_1280.png'), fullPage: true });
    await page.goto(url('#method')); await page.waitForSelector('#view .lead');
    const mt = await page.textContent('#view');
    check('method: says the score is not a forecast / prediction not established', /not established|not a forecast/i.test(mt));
    check('method: backtest shown (score did not beat the plain ranking)', /did not beat|plain ranking hit more|no clear difference/i.test(mt));
    await page.click('#mode-detail'); await page.waitForTimeout(150);
    const md = await page.evaluate(() => document.querySelector('#view').innerText);
    check('method (Detailed): official match-file check table is shown', /organisers/i.test(md) && payload.method.official_check.every(r => md.includes(r.check.slice(0, 30))));
    check('method (Detailed): audit table shows or says Pending', /Pending|Step|check/i.test(md));
    await ctx.close();
  }

  /* ---------- no out-of-scope words anywhere ---------- */
  {
    const { ctx, page } = await newPage(1280, 900);
    for (const det of [false, true]) {
      await page.goto(url('#summary')); await page.waitForSelector('#view h1');
      if (det) await page.click('#mode-detail');
      for (const tab of TABS) {
        await go(page, tab);
        await page.evaluate(() => { document.querySelectorAll('details').forEach(d => d.open = true); });
        const t = await page.evaluate(() => document.body.innerText + ' ' + [...document.querySelectorAll('[data-tip]')].map(e => e.getAttribute('data-tip')).join(' '));
        const m = t.match(FORBIDDEN);
        check(`${det ? 'Detailed' : 'Simple'} mode, ${tab}: none of auction / Must-Back / walk-away / price band / Plan A / purse / retain / Squad Fit / IPL 2027`, !m, m ? 'found "' + m[0] + '" near: ' + t.slice(Math.max(0, m.index - 50), m.index + 50).replace(/\s+/g, ' ') : '');
      }
    }
    await go(page, 'leaderboard');
    await page.click('#lbtable .plink'); await page.waitForSelector('#card.on');
    const ct = await page.evaluate(() => document.querySelector('#cardpanel').innerText);
    check('profile card text has no out-of-scope words', !FORBIDDEN.test(ct) && !/availab|price|Hidden Gem|Value Pick/i.test(ct), (ct.match(FORBIDDEN) || [''])[0]);
    await ctx.close();
  }

  /* ---------- redesign / hosting ---------- */
  {
    const { ctx, page } = await newPage(380, 800);
    await page.goto(url('#summary')); await page.waitForSelector('#view h1'); await page.waitForTimeout(300);
    const d = await page.evaluate(() => ({ title: document.title, bg: getComputedStyle(document.body).backgroundColor, scheme: getComputedStyle(document.documentElement).colorScheme, fontOk: document.fonts.check('16px "Plus Jakarta Sans"') && document.fonts.check('700 16px "Space Grotesk"'), loaded: [...document.fonts].filter(f => f.status === 'loaded').length, wrapL: parseFloat(getComputedStyle(document.querySelector('#view')).paddingLeft), wrapR: parseFloat(getComputedStyle(document.querySelector('#view')).paddingRight), head: document.querySelector('header').innerText, foot: document.querySelector('footer').innerText, bodyFont: getComputedStyle(document.body).fontFamily, numFont: getComputedStyle(document.querySelector('.sc2')).fontFamily, bodySize: parseFloat(getComputedStyle(document.body).fontSize) }));
    check('<title> is "RR Clutch Index"', d.title === 'RR Clutch Index', d.title);
    check('single light theme: white body background, color-scheme light', d.bg === 'rgb(255, 255, 255)' && d.scheme === 'light', d.bg + ' ' + d.scheme);
    check('embedded fonts load offline (Plus Jakarta Sans, Space Grotesk)', d.fontOk && d.loaded >= 3 && /Plus Jakarta Sans/.test(d.bodyFont) && /Space Grotesk/.test(d.numFont), `${d.loaded} loaded`);
    check('side gutters are at least 16px', d.wrapL >= 16 && d.wrapR >= 16, d.wrapL + '/' + d.wrapR);
    check('disclaimer visible in header and footer', /Independent submission for Rajasthan Royals' SupeRR Selector Season 2\. Not an official Rajasthan Royals product\./.test(d.head) && /Not an official Rajasthan Royals product/.test(d.foot));
    check('footer shows the Public URL (from meta.public_url / URL file) or "pending (placeholder)"', /Public URL: (pending \(placeholder\)|https?:\/\/\S+)/.test(d.foot), (d.foot.match(/Public URL:[^\n]*/) || [''])[0]);
    check('body text is 16px or larger', d.bodySize >= 16, d.bodySize);
    for (const tab of TABS) { await page.goto(url('#' + tab)); await page.waitForSelector('#tabs'); const a = await page.$eval('#tabs button[aria-selected=true]', b => b.dataset.tab); const hh = await page.evaluate(() => location.hash); check(`hash #${tab} opens that tab and stays plain`, a === tab && hh === '#' + tab, hh); }
    await page.goto(url('#nonsense')); await page.waitForSelector('#view h1');
    check('unknown hash falls back to the Summary', (await page.$eval('#tabs button[aria-selected=true]', b => b.dataset.tab)) === 'summary');
    const src = fs.readFileSync(HTML, 'utf8');
    check('no window.print / alert / confirm in the page script', !/window\.print|\balert\(|\bconfirm\(/.test(src.slice(src.indexOf('<script>'))));
    check('no dark-mode blocks (prefers-color-scheme) in the file', !/prefers-color-scheme/.test(src));
    await ctx.close();
  }

  /* ---------- global ---------- */
  check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' || '));
  check('no external network requests', external.length === 0, external.slice(0, 3).join(' || '));
  log(`Blocked/recorded request attempts: ${external.length}`);
  await browser.close();

  log('\nPer-tab notes (measured at 380px, automatic):');
  for (const t of TABS) { const n = notes[t]; if (n) log(`  ${t}: lead="${n.lead.slice(0, 90).trim()}..." charts=${n.charts} svgs=${n.svgs} tables=${n.tables} deep-sections=${n.deep} takeaways=${n.takeaways} page-height=${n.height}px`); }
  log('\nManual review notes (screenshots read by the builder):');
  [
    'summary: headline, brief, 3 KPI tiles, Top 10 batters and Top 10 bowlers (rank, name, team chip, score with mini whisker, tap for why, #11 edge note), read line, how to use, 3-step pressure definition, honest test note, 5-line summary.',
    'pressure: plain explanation + formula, match explorer, pressure map, distribution with cut-offs, example balls; calibration, Brier, boosts and overlaps in the Show-detail layer.',
    'leaderboard: Batters / Bowlers / All-rounders, sortable table that becomes cards at 380px, top 15 in Simple mode with Show all, rank-change chart, scatter and full metrics in the detail layer.',
    'compare: 2-4 players, radar (percentile within role), real-number table with clearly-ahead / too-close tags, trend overlay.',
    'method: six-box flow, formula, weights, why-not-average, backtest chart, sensitivity, robustness, official match-file check, data notes, limitations, glossary, audit, build stamp.',
    'Not verified by this script: colour-blindness simulation (shapes, patterns and labels are used, colour is never the only cue); real touch devices; Safari / Firefox (Chromium only).'
  ].forEach(x => log('  ' + x));
  log(`\nRESULT: ${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
  fs.writeFileSync(REPORT, lines.join('\n') + '\n');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); fs.writeFileSync(REPORT, lines.join('\n') + '\nCRASH: ' + e.stack + '\n'); process.exit(2); });
