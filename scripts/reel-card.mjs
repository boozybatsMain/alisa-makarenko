#!/usr/bin/env node
/*
 * End cards for the showreels (site 2): name, role, city and Telegram on the site's brown-black,
 * in the site's type (Cormorant + Golos Text). Bilingual, because one reel serves both language versions.
 *
 *   node scripts/reel-card.mjs
 *
 * Writes source/reel-card-wide.png (1920x1080) and source/reel-card-vertical.png (1080x1920);
 * scripts/video_media.py appends them as the last 2.6 s of each reel (fading to black).
 * One headless browser, closed at the end.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import('playwright');
const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright');
const shell = fs.existsSync(cache) ? fs.readdirSync(cache).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse()
  .map((d) => path.join(cache, d, 'chrome-headless-shell-mac-arm64/chrome-headless-shell')).find((f) => fs.existsSync(f)) : undefined;
let browser;
try { browser = await chromium.launch({ headless: true }); }
catch { browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || shell }); }

const page = (w, h, k) => `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Cormorant:ital,wght@0,400;1,400&family=Golos+Text:wght@400;500&family=IBM+Plex+Mono:wght@400&display=swap" rel="stylesheet">
<style>
html,body{margin:0;width:${w}px;height:${h}px;background:#0b0807;color:#f3e9dc;overflow:hidden}
.c{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:${22 * k}px}
.r{width:${56 * k}px;height:1px;background:rgba(243,233,220,.35)}
h1{margin:0;font:400 ${118 * k}px/.95 Cormorant,serif;letter-spacing:-.01em}
h1 i{display:block;padding-left:.35em}
.role{font:500 ${21 * k}px/1.3 "Golos Text",sans-serif;letter-spacing:.22em;text-transform:uppercase;color:#e2adab}
.en{font:400 ${19 * k}px/1.4 "Golos Text",sans-serif;color:#ab9785;letter-spacing:.04em}
.tg{margin-top:${10 * k}px;font:400 ${26 * k}px/1 "IBM Plex Mono",monospace;color:#f3e9dc}
</style></head><body><div class="c">
<div class="r"></div>
<h1>Алиса<i>Макаренко</i></h1>
<p class="role" style="margin:0">видеограф · Алматы</p>
<p class="en" style="margin:0">Alisa Makarenko · videographer · Almaty</p>
<p class="tg" style="margin:${10 * k}px 0 0">t.me/alissayeya</p>
</div></body></html>`;

for (const [name, w, h, k] of [['wide', 1920, 1080, 1], ['vertical', 1080, 1920, 1.05]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  await p.setContent(page(w, h, k), { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  const out = path.join(ROOT, `source/reel-card-${name}.png`);
  await p.screenshot({ path: out });
  console.log('card:', path.relative(ROOT, out));
  await ctx.close();
}
await browser.close();
