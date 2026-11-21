#!/usr/bin/env node
/*
 * QA for site 2 (videographer) and the changed blocks of site 1, with ONE headless browser reused for every view.
 * Serve the PARENT of docs/ so the /docs/ subpath behaves like GitHub Pages' /alisa-makarenko/:
 *
 *   python3 -m http.server 8090 &          (from the repo root)
 *   node scripts/shots-video.mjs http://127.0.0.1:8090/docs/ source/shots-video [which]
 *
 * which: comma list of ru1440,ru390,ru768,en1440,extra,modal,lightbox,cv,site1,check,perf (default: all)
 * Uses headless Google Chrome when installed (it plays H.264; Playwright's own Chromium does not), else Chromium.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const [base = 'http://127.0.0.1:8090/docs/', outDir = 'source/shots-video', which = 'ru1440,ru390,ru768,en1440,modal,lightbox,cv,site1,check,perf'] = process.argv.slice(2);
const want = new Set(which.split(','));
fs.mkdirSync(outDir, { recursive: true });
const V = base + 'video/';

let browser;
try { browser = await chromium.launch({ headless: true, channel: 'chrome' }); }
catch {
  const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright');
  const shell = fs.existsSync(cache) ? fs.readdirSync(cache).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse()
    .map((d) => path.join(cache, d, 'chrome-headless-shell-mac-arm64/chrome-headless-shell')).find((f) => fs.existsSync(f)) : undefined;
  try { browser = await chromium.launch({ headless: true }); } catch { browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || shell }); }
}
const npl = path.join(os.homedir(), '.claude/snippets/no-pointer-lock.js');
const errors = [];
async function open(w, h, url, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: opts.dpr || 1, reducedMotion: opts.reduce ? 'reduce' : 'no-preference', hasTouch: !!opts.touch, isMobile: !!opts.touch });
  if (fs.existsSync(npl)) await ctx.addInitScript({ path: npl });
  const p = await ctx.newPage();
  p.on('console', (m) => { if (m.type() === 'error') errors.push(`${url} @${w}: ${m.text()}`); });
  p.on('pageerror', (e) => errors.push(`${url} @${w}: ${e.message}`));
  if (opts.onRequest) p.on('request', opts.onRequest);
  await p.goto(url, { waitUntil: 'load' });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(opts.wait ?? 600);
  return { ctx, p };
}
async function settle(p, h) {
  const H = await p.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < H; y += Math.floor(h * 0.6)) { await p.evaluate((yy) => window.scrollTo(0, yy), y); await p.waitForTimeout(110); }
  await p.waitForTimeout(1500);
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(2200);
}
async function full(name, w, h, url, { slices = true, touch = false } = {}) {
  const { ctx, p } = await open(w, h, url, { touch });
  await settle(p, h);
  // the first screen as the visitor sees it (a full-page capture stretches the viewport and can catch the hero mid-change)
  const first = await p.screenshot();
  await p.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: true });
  const H = await p.evaluate(() => document.documentElement.scrollHeight);
  if (slices) {
    for (const f of fs.readdirSync(outDir)) if (new RegExp(`^${name}-\\d\\d\\.png$`).test(f)) fs.unlinkSync(path.join(outDir, f));
    let i = 1;
    for (let y = 0; y < H; y += h, i++) {
      const f = path.join(outDir, `${name}-${String(i).padStart(2, '0')}.png`);
      if (i === 1) fs.writeFileSync(f, first);
      else await p.screenshot({ path: f, fullPage: true, clip: { x: 0, y, width: w, height: Math.min(h, H - y) } });
    }
  }
  console.log(`${name}: ${H}px tall`);
  await ctx.close();
}

if (want.has('ru1440')) await full('video-ru-1440', 1440, 900, V);
if (want.has('ru390')) await full('video-ru-390', 390, 844, V, { touch: true });
if (want.has('ru768')) await full('video-ru-768', 768, 1024, V, { slices: false, touch: true });
if (want.has('en1440')) await full('video-en-1440', 1440, 900, V + 'en/', { slices: false });
if (want.has('extra')) {
  await full('x-video-360', 360, 740, V, { slices: false, touch: true });
  await full('x-video-1024', 1024, 768, V, { slices: false });
  await full('x-video-1920', 1920, 1080, V, { slices: false });
}

if (want.has('modal')) {
  const { ctx, p } = await open(1440, 900, V);
  const card = p.locator('#ch-hospitality [data-piece]').nth(1);
  await card.scrollIntoViewIfNeeded();
  await card.focus();
  await p.keyboard.press('Enter');
  await p.waitForTimeout(2500);
  const st = await p.evaluate(() => { const v = document.querySelector('#player video'); return v && { rs: v.readyState, t: +v.currentTime.toFixed(2), paused: v.paused, err: v.error && v.error.code, active: document.activeElement.className }; });
  await p.screenshot({ path: path.join(outDir, 'modal.png') });
  await p.keyboard.press('ArrowRight');
  await p.waitForTimeout(400);
  const next = await p.evaluate(() => document.querySelector('#player [data-title]').textContent + ' ' + document.querySelector('#player [data-count]').textContent);
  // focus trap: Tab many times, focus must stay inside the dialog
  for (let k = 0; k < 8; k++) await p.keyboard.press('Tab');
  const inside = await p.evaluate(() => !!document.activeElement.closest('#player'));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  const after = await p.evaluate(() => ({ open: document.getElementById('player').open, videos: document.querySelectorAll('#player video').length, focus: document.activeElement.dataset.title }));
  console.log('modal:', JSON.stringify(st), '| ArrowRight ->', next, '| trap ok:', inside, '| after Esc:', JSON.stringify(after));
  // showreel from the hero, vertical card, and the player on a phone
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.locator('.hero [data-reel]').click();
  await p.waitForTimeout(2500);
  const reel = await p.evaluate(() => { const v = document.querySelector('#player video'); return { src: v.currentSrc.split('/').pop(), rs: v.readyState, t: +v.currentTime.toFixed(2) }; });
  await p.screenshot({ path: path.join(outDir, 'modal-showreel.png') });
  console.log('showreel:', JSON.stringify(reel));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(1500);
  console.log('hero resumes after the player closes:', await p.evaluate(() => { const v = document.querySelector('.hero__video'); return !v.paused; }));
  await ctx.close();
  {
    const { ctx: c2, p: p2 } = await open(390, 844, V, { touch: true });
    const vcard = p2.locator('#ch-hospitality .pc--v [data-piece]').first();
    await vcard.scrollIntoViewIfNeeded();
    await vcard.click();
    await p2.waitForTimeout(2200);
    await p2.screenshot({ path: path.join(outDir, 'modal-390.png') });
    await p2.keyboard.press('Escape');
    const rf = p2.locator('.reel__frame');
    await rf.scrollIntoViewIfNeeded();
    await rf.click();
    await p2.waitForTimeout(2500);
    console.log('showreel on a phone:', await p2.evaluate(() => document.querySelector('#player video').currentSrc.split('/').pop()));
    await p2.screenshot({ path: path.join(outDir, 'modal-showreel-390.png') });
    await c2.close();
  }
}

if (want.has('lightbox')) {
  const { ctx, p } = await open(1440, 900, V);
  const a = p.locator('[data-lb]').nth(1);
  await a.scrollIntoViewIfNeeded();
  await a.focus();
  await p.keyboard.press('Enter');
  await p.waitForTimeout(900);
  await p.keyboard.press('ArrowRight');
  await p.waitForTimeout(900);
  await p.screenshot({ path: path.join(outDir, 'lightbox.png') });
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  console.log('lightbox: focus after Esc on', await p.evaluate(() => document.activeElement.className));
  await ctx.close();
}

if (want.has('cv')) {
  for (const [name, url] of [['cv-ru', 'cv/'], ['cv-en', 'en/cv/']]) {
    const { ctx, p } = await open(1000, 1300, V + url);
    await p.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: true });
    await ctx.close();
  }
  console.log('cv: done');
}

if (want.has('site1')) {
  for (const [w, h, suffix, touch] of [[1440, 900, '', false], [390, 844, '-390', true]]) {
    const { ctx, p } = await open(w, h, base, { touch });
    await settle(p, h);
    await p.addStyleTag({ content: '.bar{visibility:hidden!important}' });
    const vg = p.locator('#videography');
    await vg.scrollIntoViewIfNeeded();
    await p.waitForTimeout(1500);
    await vg.screenshot({ path: path.join(outDir, `site1-videography${suffix}.png`) });
    const ct = p.locator('#contact');
    await ct.scrollIntoViewIfNeeded();
    await p.waitForTimeout(800);
    await ct.screenshot({ path: path.join(outDir, `site1-contact${suffix}.png`) });
    await p.locator('.foot').screenshot({ path: path.join(outDir, `site1-footer${suffix}.png`) });
    await ctx.close();
  }
  // hover a clip on desktop: the loop must play
  const { ctx, p } = await open(1440, 900, base);
  const f = p.locator('.vgc').nth(1);
  await f.scrollIntoViewIfNeeded();
  await f.hover();
  await p.waitForTimeout(2000);
  console.log('site1 hover loop:', JSON.stringify(await p.evaluate(() => { const v = document.querySelectorAll('.vgc video'); return [...v].map((x) => ({ rs: x.readyState, t: +x.currentTime.toFixed(2) })); })));
  console.log('site1 links:', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('.vg__links a, .foot a')].map((a) => a.getAttribute('href')))));
  await ctx.close();
}

if (want.has('check')) {
  for (const w of [360, 390, 768, 1024, 1440, 1920]) {
    const { ctx, p } = await open(w, 800, V, { touch: w < 1024 });
    const r = await p.evaluate(() => {
      const de = document.documentElement;
      const wide = [...document.querySelectorAll('body *')].filter((el) => { const b = el.getBoundingClientRect(); return b.right > de.clientWidth + 1 && getComputedStyle(el).position !== 'fixed' && !el.closest('dialog'); }).slice(0, 5).map((el) => el.className || el.tagName);
      const small = [...document.querySelectorAll('a, button, summary')].filter((el) => { if (el.closest('dialog')) return false; const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 && b.height < 44 && b.width < 44; }).slice(0, 8).map((el) => (el.className || el.tagName) + ' ' + Math.round(el.getBoundingClientRect().width) + 'x' + Math.round(el.getBoundingClientRect().height));
      const noDims = [...document.querySelectorAll('img, video')].filter((m) => !m.getAttribute('width') || !m.getAttribute('height')).length;
      const noAlt = [...document.querySelectorAll('img')].filter((m) => !m.hasAttribute('alt')).length;
      return { scrollW: de.scrollWidth, clientW: de.clientWidth, wide, small, h1: document.querySelectorAll('h1').length, noDims, noAlt, landmarks: ['header', 'nav', 'main', 'footer'].map((t) => document.querySelectorAll(t).length).join('/') };
    });
    console.log(`check ${w}px: scrollWidth ${r.scrollW}/${r.clientW}${r.scrollW > r.clientW ? ' OVERFLOW' : ''} | h1=${r.h1} | landmarks h/nav/main/foot ${r.landmarks} | media w/o size ${r.noDims} | img w/o alt ${r.noAlt}${r.wide.length ? ' | wide: ' + r.wide.join(', ') : ''}${r.small.length ? ' | small: ' + r.small.join(', ') : ''}`);
    await ctx.close();
  }
  // CLS while scrolling
  const { ctx, p } = await open(1440, 900, V);
  await p.evaluate(() => { window.__cls = 0; new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) window.__cls += e.value; })).observe({ type: 'layout-shift', buffered: true }); });
  await settle(p, 900);
  console.log(`CLS @1440 after full scroll: ${(await p.evaluate(() => window.__cls)).toFixed(3)}`);
  await ctx.close();
  // hero playback, reduced motion
  for (const [w, h, reduce] of [[1440, 900, false], [390, 844, false], [1440, 900, true]]) {
    const { ctx: c, p: q } = await open(w, h, V, { reduce, touch: w < 900, wait: 2500 });
    const s = await q.evaluate(() => { const v = document.querySelector('.hero__video'); return { src: (v.currentSrc || '').split('/').pop() || null, rs: v.readyState, t: +v.currentTime.toFixed(2), playing: document.querySelector('.hero').classList.contains('is-playing'), toggle: !document.querySelector('[data-hero-toggle]').hidden }; });
    console.log(`hero @${w}${reduce ? ' reduced-motion' : ''}: ${JSON.stringify(s)}`);
    if (!reduce && w === 1440) await q.screenshot({ path: path.join(outDir, 'hero-playing-1440.png') });
    await c.close();
  }
}

if (want.has('perf')) {
  for (const [w, h, touch] of [[1440, 900, false], [390, 844, true]]) {
    const reqs = [];
    const { ctx, p } = await open(w, h, V, { touch, wait: 6000, onRequest: (r) => reqs.push(r.url()) });
    const r = await p.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const res = performance.getEntriesByType('resource');
      const sum = (list) => list.reduce((a, e) => a + (e.transferSize || e.encodedBodySize || 0), 0);
      const vids = res.filter((e) => /\.mp4/.test(e.name));
      // media served with range requests may not report sizes: read the bytes the element actually buffered
      return { total: sum(res) + (nav.transferSize || nav.encodedBodySize || 0), video: sum(vids), byType: Object.entries(res.reduce((m, e) => { const k = (e.name.match(/\.(\w+)(\?|$)/) || [, 'other'])[1]; m[k] = (m[k] || 0) + (e.transferSize || e.encodedBodySize || 0); return m; }, {})).map(([k, v]) => `${k} ${(v / 1024).toFixed(0)}K`).join(', ') };
    });
    const mp4 = [...new Set(reqs.filter((u) => /\.mp4/.test(u)))];
    // python http.server ignores Range, so a requested mp4 is downloaded whole: count file sizes for the honest total
    const docs = path.resolve('docs');
    const mp4Bytes = mp4.reduce((a, u) => { const f = path.join(docs, decodeURIComponent(new URL(u).pathname).replace(/^\/docs\//, '')); return a + (fs.existsSync(f) ? fs.statSync(f).size : 0); }, 0);
    console.log(`perf @${w}: non-video ${((r.total - r.video) / 1048576).toFixed(2)} MB + video ${(mp4Bytes / 1048576).toFixed(2)} MB = ${((r.total - r.video + mp4Bytes) / 1048576).toFixed(2)} MB before interaction | video requests: ${mp4.length} ${mp4.map((u) => u.split('/').pop()).join(', ')} | ${r.byType}`);
    await ctx.close();
  }
  for (const [label, opts] of [['reduced-motion', { reduce: true }], ['save-data', {}]]) {
    const reqs = [];
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: opts.reduce ? 'reduce' : 'no-preference' });
    if (label === 'save-data') await ctx.addInitScript(() => { Object.defineProperty(navigator, 'connection', { value: { saveData: true } }); });
    const p = await ctx.newPage();
    p.on('request', (r) => reqs.push(r.url()));
    await p.goto(V, { waitUntil: 'load' });
    await p.waitForTimeout(3000);
    console.log(`perf ${label}: video requests ${reqs.filter((u) => /\.mp4/.test(u)).length}`);
    await ctx.close();
  }
}

await browser.close();
console.log(errors.length ? 'CONSOLE ERRORS:\n' + [...new Set(errors)].join('\n') : 'no console errors');
