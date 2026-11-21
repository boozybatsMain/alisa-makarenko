#!/usr/bin/env node
/*
 * Prints the CV pages to PDF with headless Chromium (Playwright).
 *
 *   node build.mjs && node scripts/pdf.mjs            (all four CVs)
 *   node scripts/pdf.mjs video | producer              (only one site's CVs)
 *
 * Output: docs/cv/Alisa-Makarenko-CV-RU.pdf and docs/cv/Alisa-Makarenko-CV-EN.pdf (producer),
 *         docs/video/cv/Alisa-Makarenko-Videographer-CV-RU.pdf and -EN.pdf (videographer)
 * A4, one page each, backgrounds on, selectable text, clickable links, fonts embedded.
 *
 * Needs:  npm install            (installs the playwright package)
 *         npx playwright install chromium   (once, if no Chromium is installed)
 * Or set CHROMIUM_PATH to any Chrome/Chromium binary.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = path.join(ROOT, 'docs');

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { console.error('Playwright is not installed. Run: npm install'); process.exit(1); }

/* tiny static server for docs/ so relative URLs and fonts load exactly as on the site */
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.avif': 'image/avif', '.pdf': 'application/pdf' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(DOCS, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
  if (!f.startsWith(DOCS) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const cache = path.join(os.homedir(), process.platform === 'darwin' ? 'Library/Caches/ms-playwright' : '.cache/ms-playwright');
  if (!fs.existsSync(cache)) return undefined;
  const dirs = fs.readdirSync(cache).filter((d) => /^chromium(_headless_shell)?-\d+/.test(d)).sort().reverse();
  for (const d of dirs) {
    for (const rel of [
      'chrome-headless-shell-mac-arm64/chrome-headless-shell', 'chrome-headless-shell-mac-x64/chrome-headless-shell',
      'chrome-headless-shell-linux64/chrome-headless-shell', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
      'chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium', 'chrome-linux/chrome', 'chrome-linux64/chrome',
    ]) {
      const f = path.join(cache, d, rel);
      if (fs.existsSync(f)) return f;
    }
  }
  return undefined;
}

let browser;
try { browser = await chromium.launch({ headless: true }); }
catch {
  const exe = findChromium();
  if (!exe) { console.error('No Chromium found. Run: npx playwright install chromium'); server.close(); process.exit(1); }
  browser = await chromium.launch({ headless: true, executablePath: exe });
}

const jobs = [
  { url: 'cv/', out: 'cv/Alisa-Makarenko-CV-RU.pdf', title: 'Алиса Макаренко — CV' },
  { url: 'en/cv/', out: 'cv/Alisa-Makarenko-CV-EN.pdf', title: 'Alisa Makarenko — CV' },
  // site 2: videographer
  { url: 'video/cv/', out: 'video/cv/Alisa-Makarenko-Videographer-CV-RU.pdf', title: 'Алиса Макаренко — CV видеографа' },
  { url: 'video/en/cv/', out: 'video/cv/Alisa-Makarenko-Videographer-CV-EN.pdf', title: 'Alisa Makarenko — Videographer CV' },
];
// optional filter: "node scripts/pdf.mjs video" prints only site 2, "node scripts/pdf.mjs producer" only site 1
const only = process.argv[2];
if (only) jobs.splice(0, jobs.length, ...jobs.filter((j) => (only === 'video') === j.url.startsWith('video/')));
let failed = false;
const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/site.json'), 'utf8'));
if (!(site.base_url || '').trim()) console.warn('  ! content/site.json base_url is empty: the PDFs have NO link to the portfolio site. Fill it in, then run node build.mjs && node scripts/pdf.mjs again.');
const ctx = await browser.newContext();
const npl = path.join(os.homedir(), '.claude/snippets/no-pointer-lock.js');
if (fs.existsSync(npl)) await ctx.addInitScript({ path: npl });
for (const j of jobs) {
  const page = await ctx.newPage();
  await page.goto(base + j.url, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => Promise.all([...document.images].map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; })))));
  await page.emulateMedia({ media: 'print' });
  // overflow anywhere: the sheet, either column, or column content running into the footer
  const overflow = await page.evaluate(() => {
    const sheet = document.querySelector('.sheet');
    const over = [sheet ? sheet.scrollHeight - sheet.clientHeight : 0];
    const foot = document.querySelector('.cv__foot');
    const secs = [...document.querySelectorAll('.cv__sec')];
    if (foot && secs.length) over.push(Math.max(...secs.flatMap((s) => [...s.querySelectorAll('*')]).map((e) => e.getBoundingClientRect().bottom)) - foot.getBoundingClientRect().top + 4);
    return Math.max(...over);
  });
  if (overflow > 1) { console.error(`  ! ${j.url}: content is ${overflow}px taller than the A4 sheet — shorten the CV text.`); failed = true; }
  const file = path.join(DOCS, j.out);
  await page.pdf({ path: file, format: 'A4', printBackground: true, preferCSSPageSize: true, tagged: true, outline: false });
  await page.close();
  const pdf = fs.readFileSync(file, 'latin1');
  const pages = (pdf.match(/\/Type\s*\/Page(?!s)/g) || []).length;
  console.log(`${j.out}: ${pages} page${pages === 1 ? '' : 's'}, ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
  if (pages !== 1) failed = true;
}
await ctx.close();
await browser.close();
server.close();
if (failed) { console.error('PDF check failed: each CV must be exactly one page.'); process.exit(1); }
