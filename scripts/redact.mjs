#!/usr/bin/env node
/*
 * Re-exports evidence screenshots that need a privacy blur.
 *
 *   node scripts/redact.mjs
 *
 * notion-workspace: blurs the «ПАРОЛИ И ССЫЛКИ» page title (it is only a label, but has no place in a portfolio).
 * notion-script-dreams: the «Сновидения» script outline without the «бустик и тгшечка» row (cut out) and without
 *   the private note after «ТЕОРИЯ ПРО СОН ГАРРИ» (painted over in the page's white).
 * Needs ffmpeg and cwebp.
 */
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const jobs = [
  { src: 'source/disk-ascii/notion-workspace.png', out: 'docs/assets/evidence/notion-workspace', boxes: [[96, 616, 250, 40]] },
  { src: 'source/disk-ascii/notion-scripts-1.png', out: 'docs/assets/evidence/notion-script-dreams',
    filter: '[0:v]split[a][b];[a]crop=830:599:0:0[t];[b]crop=830:220:0:631,drawbox=x=306:y=130:w=150:h=30:color=white:t=fill[u];[t][u]vstack[out]', last: 'out' },
];
for (const j of jobs) {
  if (j.filter) {
    const jpg = path.join(ROOT, j.out + '.jpg');
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', path.join(ROOT, j.src), '-filter_complex', j.filter, '-map', `[${j.last}]`, '-q:v', '3', jpg], { stdio: 'inherit' });
    execFileSync('cwebp', ['-quiet', '-q', '82', jpg, '-o', path.join(ROOT, j.out + '.webp')]);
    console.log('redacted', j.out);
    continue;
  }
  // each box: crop, heavy blur, lay back on top
  let fc = '[0:v]split=' + (j.boxes.length + 1) + '[base]' + j.boxes.map((_, i) => `[c${i}]`).join('') + ';';
  j.boxes.forEach(([x, y, w, h], i) => { fc += `[c${i}]crop=${w}:${h}:${x}:${y},boxblur=luma_radius=14:luma_power=3:chroma_radius=8:chroma_power=3[b${i}];`; });
  let last = 'base';
  j.boxes.forEach(([x, y], i) => { fc += `[${last}][b${i}]overlay=${x}:${y}[o${i}];`; last = `o${i}`; });
  fc = fc.replace(/;$/, '');
  const jpg = path.join(ROOT, j.out + '.jpg');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', path.join(ROOT, j.src), '-filter_complex', fc, '-map', `[${last}]`, '-q:v', '3', jpg], { stdio: 'inherit' });
  execFileSync('cwebp', ['-quiet', '-q', '82', jpg, '-o', path.join(ROOT, j.out + '.webp')]);
  console.log('redacted', j.out);
}
