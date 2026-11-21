#!/usr/bin/env node
/*
 * Social preview images for the videographer site.
 *
 *   node scripts/video-og.mjs
 *
 * Background: docs/video/assets/stills/lake-from-above.jpg (her frame, not re-graded; only darkened
 * under the text by a gradient). Writes docs/video/assets/og.jpg and og-en.jpg (1200x630).
 * Same type and colours as site 1 (scripts/hero.mjs): Cormorant + Golos Text, cream on brown-black.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs/video/assets');
const STILL = path.join(OUT, 'stills/lake-from-above.jpg');

const { chromium } = await import('playwright');
const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright');
const shell = fs.existsSync(cache) ? fs.readdirSync(cache).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse()
  .map((d) => path.join(cache, d, 'chrome-headless-shell-mac-arm64/chrome-headless-shell')).find((f) => fs.existsSync(f)) : undefined;
let browser;
try { browser = await chromium.launch({ headless: true }); }
catch { browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || shell }); }
const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 } });
const img = 'data:image/jpeg;base64,' + fs.readFileSync(STILL).toString('base64');
const og = [
  { file: 'og.jpg', name: ['Алиса', 'Макаренко'], role: 'Видеограф · Визуальный контент · Алматы', sub: 'Визуальные истории для брендов и пространств' },
  { file: 'og-en.jpg', name: ['Alisa', 'Makarenko'], role: 'Videographer · Visual Content Creator · Almaty', sub: 'Creating visual stories for brands & spaces' },
];
for (const o of og) {
  const p = await ctx.newPage();
  await p.setContent(`<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Cormorant:wght@400;500&family=Golos+Text:wght@400;500&display=swap&subset=cyrillic" rel="stylesheet">
<style>body{margin:0;width:1200px;height:630px;background:#0a0706;overflow:hidden;font-family:"Golos Text",sans-serif}
.bg{position:absolute;inset:0;background:url(${img}) 62% 50%/cover}
.g{position:absolute;inset:0;background:linear-gradient(90deg,rgba(10,7,6,.96) 0,rgba(10,7,6,.86) 38%,rgba(10,7,6,.3) 72%,rgba(10,7,6,.12) 100%)}
.t{position:absolute;left:84px;top:150px;color:#f3e9dc}
.r{width:56px;height:1px;background:rgba(243,233,220,.4);margin-bottom:34px}
h1{margin:0;font:400 104px/.95 Cormorant,serif;letter-spacing:-.01em}
.role{margin-top:30px;font-size:25px;color:#e2adab}.sub{margin-top:12px;font-size:19px;color:#ab9785}</style></head>
<body><div class="bg"></div><div class="g"></div><div class="t"><div class="r"></div><h1>${o.name[0]}<br>${o.name[1]}</h1><p class="role">${o.role}</p><p class="sub">${o.sub}</p></div></body></html>`, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: path.join(OUT, o.file), type: 'jpeg', quality: 86 });
  await p.close();
  console.log(`og: ${o.file}`);
}
await ctx.close();
await browser.close();
