#!/usr/bin/env node
/*
 * QA screenshots with ONE headless browser (reused for every view).
 *
 *   python3 -m http.server 8080 --directory docs &
 *   node scripts/shots.mjs http://127.0.0.1:8080/ source/shots [which]
 *
 * which: comma list of ru1440,ru390,ru768,en1440,cv,modal,lightbox,timeline,extra (default: all but extra)
 * Prints console errors and checks horizontal overflow at 360 px.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const [base = 'http://127.0.0.1:8080/', outDir = 'source/shots', which = 'ru1440,ru390,ru768,en1440,cv,modal,lightbox,timeline,check'] = process.argv.slice(2);
const want = new Set(which.split(','));
fs.mkdirSync(outDir, { recursive: true });

const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright');
const shell = fs.existsSync(cache) ? fs.readdirSync(cache).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse()
  .map((d) => path.join(cache, d, 'chrome-headless-shell-mac-arm64/chrome-headless-shell')).find((f) => fs.existsSync(f)) : undefined;
let browser;
try { browser = await chromium.launch({ headless: true }); }
catch { browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || shell }); }

const npl = path.join(os.homedir(), '.claude/snippets/no-pointer-lock.js');
const errors = [];
async function open(w, h, url, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: opts.dpr || 1, reducedMotion: opts.reduce ? 'reduce' : 'no-preference' });
  if (fs.existsSync(npl)) await ctx.addInitScript({ path: npl });
  const p = await ctx.newPage();
  p.on('console', (m) => { if (m.type() === 'error') errors.push(`${url} @${w}: ${m.text()}`); });
  p.on('pageerror', (e) => errors.push(`${url} @${w}: ${e.message}`));
  await p.goto(base + url, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  return { ctx, p };
}
async function settle(p, h) {
  const H = await p.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < H; y += Math.floor(h * 0.6)) { await p.evaluate((yy) => window.scrollTo(0, yy), y); await p.waitForTimeout(90); }
  await p.waitForTimeout(1600);
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(900);
}
async function full(name, w, h, url, { slices = true } = {}) {
  const { ctx, p } = await open(w, h, url);
  await settle(p, h);
  const file = path.join(outDir, `${name}.png`);
  await p.screenshot({ path: file, fullPage: true });
  if (slices) {
    const H = await p.evaluate(() => document.documentElement.scrollHeight);
    let i = 1;
    for (let y = 0; y < H; y += h, i++) {
      await p.screenshot({ path: path.join(outDir, `${name}-${String(i).padStart(2, '0')}.png`), fullPage: true, clip: { x: 0, y, width: w, height: Math.min(h, H - y) } });
    }
  }
  console.log(`${name}: ${await p.evaluate(() => document.documentElement.scrollHeight)}px tall`);
  await ctx.close();
}

if (want.has('ru1440')) await full('home-ru-1440', 1440, 900, '');
if (want.has('ru390')) await full('home-ru-390', 390, 844, '');
if (want.has('ru768')) await full('home-ru-768', 768, 1024, '', { slices: false });
if (want.has('en1440')) await full('home-en-1440', 1440, 900, 'en/', { slices: false });
if (want.has('extra')) {
  await full('x-ru-1024', 1024, 768, '', { slices: false });
  await full('x-ru-1920', 1920, 1080, '', { slices: false });
  await full('x-ru-360', 360, 740, '', { slices: false });
}
if (want.has('cv')) {
  for (const [name, url] of [['cv-ru', 'cv/'], ['cv-en', 'en/cv/']]) {
    const { ctx, p } = await open(1000, 1300, url);
    await p.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: true });
    await ctx.close();
  }
  console.log('cv: done');
}
if (want.has('modal')) {
  const { ctx, p } = await open(1440, 900, '');
  await p.locator('.eps [data-yt]').first().scrollIntoViewIfNeeded();
  await p.waitForTimeout(600);
  await p.locator('.eps [data-yt]').first().click();
  await p.waitForTimeout(3500);
  await p.screenshot({ path: path.join(outDir, 'modal.png') });
  const focused = await p.evaluate(() => document.activeElement && document.activeElement.className);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  const restored = await p.evaluate(() => ({ open: document.getElementById('video-modal').open, iframes: document.querySelectorAll('#video-modal iframe').length, active: document.activeElement && document.activeElement.className }));
  console.log('modal: focus on open =', focused, '| after Esc =', JSON.stringify(restored));
  await ctx.close();
}
if (want.has('lightbox')) {
  const { ctx, p } = await open(1440, 900, '');
  await p.locator('[data-lb]').nth(4).scrollIntoViewIfNeeded();
  await p.waitForTimeout(500);
  await p.locator('[data-lb]').nth(4).focus();
  await p.keyboard.press('Enter');
  await p.waitForTimeout(900);
  await p.keyboard.press('ArrowRight');
  await p.waitForTimeout(700);
  await p.screenshot({ path: path.join(outDir, 'lightbox.png') });
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  console.log('lightbox: after Esc focus on', await p.evaluate(() => document.activeElement && document.activeElement.className));
  await ctx.close();
}
if (want.has('timeline')) {
  const { ctx, p } = await open(1440, 900, '');
  await p.evaluate(() => document.querySelector('.stages').scrollIntoView({ block: 'end' }));
  await p.waitForTimeout(1200);
  await p.evaluate(() => document.querySelector('.process').scrollIntoView({ block: 'start' }));
  await p.waitForTimeout(4200);
  await p.locator('.process').screenshot({ path: path.join(outDir, 'timeline.png') });
  await ctx.close();
  console.log('timeline: done');
}
if (want.has('check')) {
  // video modal on small screens: the close button must stay on screen
  for (const [w, h, sel] of [[390, 664, '.proofs [data-yt]'], [844, 390, '.eps [data-yt]']]) {
    const { ctx, p } = await open(w, h, '');
    await p.locator(sel).first().scrollIntoViewIfNeeded();
    await p.locator(sel).first().click();
    await p.waitForTimeout(800);
    const b = await p.evaluate(() => { const r = document.querySelector('#video-modal [data-close]').getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), right: Math.round(r.right), vw: innerWidth, vh: innerHeight }; });
    console.log(`modal close @${w}x${h}: top ${b.top}, bottom ${b.bottom}, right ${b.right} / ${b.vw}x${b.vh}${b.top < 0 || b.right > b.vw ? '  OFF-SCREEN' : ''}`);
    await ctx.close();
  }
  // layout shift while scrolling the whole page (count-up, reveals)
  {
    const { ctx, p } = await open(1920, 1080, '');
    await p.evaluate(() => { window.__cls = 0; new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) window.__cls += e.value; })).observe({ type: 'layout-shift', buffered: true }); });
    await settle(p, 1080);
    console.log(`CLS @1920 after full scroll: ${(await p.evaluate(() => window.__cls)).toFixed(3)}`);
    await ctx.close();
  }
  for (const w of [360, 390, 768, 1024, 1440, 1920]) {
    const { ctx, p } = await open(w, 800, '');
    const r = await p.evaluate(() => {
      const de = document.documentElement;
      const wide = [...document.querySelectorAll('body *')].filter((el) => { const b = el.getBoundingClientRect(); return b.right > de.clientWidth + 1 && getComputedStyle(el).position !== 'fixed' && !el.closest('dialog'); }).slice(0, 5).map((el) => el.className || el.tagName);
      const small = [...document.querySelectorAll('a, button, summary')].filter((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 && (b.height < 44 && b.width < 44); }).slice(0, 8).map((el) => (el.className || el.tagName) + ' ' + Math.round(el.getBoundingClientRect().width) + 'x' + Math.round(el.getBoundingClientRect().height));
      return { scrollW: de.scrollWidth, clientW: de.clientWidth, wide, small, h1: document.querySelectorAll('h1').length };
    });
    console.log(`check ${w}px: scrollWidth ${r.scrollW} / ${r.clientW}${r.scrollW > r.clientW ? '  OVERFLOW' : ''} | h1=${r.h1}${r.wide.length ? ' | wide: ' + r.wide.join(', ') : ''}${r.small.length ? ' | small targets: ' + r.small.join(', ') : ''}`);
    await ctx.close();
  }
  const bytes = await (async () => {
    const { ctx, p } = await open(1440, 900, '');
    await settle(p, 900);
    const sum = await p.evaluate(() => performance.getEntriesByType('resource').filter((e) => !/\.mp4/.test(e.name)).reduce((a, e) => a + (e.transferSize || e.encodedBodySize || 0), 0) + (performance.getEntriesByType('navigation')[0].transferSize || 0));
    await ctx.close();
    return sum;
  })();
  console.log(`transfer (no video, after full scroll): ${(bytes / 1024 / 1024).toFixed(2)} MB`);
}
await browser.close();
console.log(errors.length ? 'CONSOLE ERRORS:\n' + [...new Set(errors)].join('\n') : 'no console errors');
