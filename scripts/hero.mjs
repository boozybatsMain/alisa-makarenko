#!/usr/bin/env node
/*
 * Rebuilds the hero background and the social preview images.
 *
 *   node scripts/hero.mjs
 *
 * Source: source/youtube/channel/banner.jpg (the show's channel banner).
 * Only the lamp-lit bookshelf parts are used: no window, no castle, no floating book.
 *   desktop  left shelves + lamp, mirrored so the lamp sits on the right, away from the text
 *   mobile   right-hand shelves with a table lamp
 * Writes docs/assets/hero/hero(.jpg|.webp|.avif), hero-mobile(...), docs/assets/brand/og.jpg, og-en.jpg
 * Needs ffmpeg (libsvtav1 for AVIF), cwebp and Playwright (for the OG text rendering).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'source/youtube/channel/banner.jpg');
const OUT = path.join(ROOT, 'docs/assets/hero');
const BRAND = path.join(ROOT, 'docs/assets/brand');
const ff = (...a) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...a], { stdio: 'inherit' });
// No upscaling and no blur: the banner is a soft render, so it is exported at its native size and the page
// shows it at about 1x (desktop: a right-hand panel, feathered into the dark side), heavily darkened.
const grade = 'eq=brightness=-0.07:saturation=0.82:contrast=1.04';

const jobs = [
  { name: 'hero', vf: `delogo=x=1138:y=568:w=70:h=104,crop=1188:900:860:90,scale=1600:-2:flags=lanczos,gblur=sigma=1.2,${grade}` },
  { name: 'hero-mobile', vf: `delogo=x=1138:y=568:w=70:h=104,crop=640:900:870:90,scale=900:-2:flags=lanczos,gblur=sigma=1,${grade}` },
];
for (const j of jobs) {
  const jpg = path.join(OUT, `${j.name}.jpg`);
  ff('-i', SRC, '-vf', j.vf, '-q:v', '3', jpg);
  execFileSync('cwebp', ['-quiet', '-q', '72', jpg, '-o', path.join(OUT, `${j.name}.webp`)]);
  try { ff('-i', jpg, '-c:v', 'libsvtav1', '-crf', '40', '-frames:v', '1', path.join(OUT, `${j.name}.avif`)); }
  catch { console.warn(`  ! could not write ${j.name}.avif (ffmpeg without libsvtav1?)`); }
  console.log(`hero: ${j.name}`);
}

/* ---- OG images: text over the new still, rendered headless ---- */
const { chromium } = await import('playwright');
const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright');
const shell = fs.existsSync(cache) ? fs.readdirSync(cache).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse()
  .map((d) => path.join(cache, d, 'chrome-headless-shell-mac-arm64/chrome-headless-shell')).find((f) => fs.existsSync(f)) : undefined;
let browser;
try { browser = await chromium.launch({ headless: true }); }
catch { browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || shell }); }
const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 } });
const img = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(OUT, 'hero.jpg')).toString('base64');
const og = [
  { file: 'og.jpg', name: ['Алиса', 'Макаренко'], role: 'Креативный продюсер · YouTube и подкасты', sub: 'Кейс: шоу и подкаст «Ведьмин час»' },
  { file: 'og-en.jpg', name: ['Alisa', 'Makarenko'], role: 'Creative Producer · YouTube & Podcasts', sub: 'Case study: the Witching Hour show and podcast' },
];
for (const o of og) {
  const p = await ctx.newPage();
  await p.setContent(`<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Cormorant:wght@400;500&family=Golos+Text:wght@400;500&display=swap&subset=cyrillic" rel="stylesheet">
<style>body{margin:0;width:1200px;height:630px;background:#0a0706;overflow:hidden;font-family:"Golos Text",sans-serif}
.bg{position:absolute;inset:0;background:url(${img}) 70% 40%/cover}
.g{position:absolute;inset:0;background:linear-gradient(90deg,rgba(10,7,6,.97) 0,rgba(10,7,6,.9) 42%,rgba(10,7,6,.35) 78%,rgba(10,7,6,.45) 100%)}
.t{position:absolute;left:84px;top:150px;color:#f3e9dc}
.r{width:56px;height:1px;background:rgba(243,233,220,.4);margin-bottom:34px}
h1{margin:0;font:400 104px/.95 Cormorant,serif;letter-spacing:-.01em}
.role{margin-top:30px;font-size:27px;color:#e2adab}.sub{margin-top:12px;font-size:19px;color:#ab9785}</style></head>
<body><div class="bg"></div><div class="g"></div><div class="t"><div class="r"></div><h1>${o.name[0]}<br>${o.name[1]}</h1><p class="role">${o.role}</p><p class="sub">${o.sub}</p></div></body></html>`, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: path.join(BRAND, o.file), type: 'jpeg', quality: 86 });
  await p.close();
  console.log(`og: ${o.file}`);
}
await ctx.close();
await browser.close();
