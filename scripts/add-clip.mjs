#!/usr/bin/env node
/*
 * Add one clip to the videographer site (site 2).
 *
 *   node scripts/add-clip.mjs <file.mp4|.mov> <category> [options]
 *
 * category: hospitality | lifestyle | brands | nature
 * options:  --id mountain-walk            file name on the site (default: from the source file name)
 *           --title-ru "…" --title-en "…"  card title
 *           --caption-ru "…" --caption-en "…"  one line under the title
 *           --alt-ru "…" --alt-en "…"      what the poster shows (for screen readers)
 *           --start 2.5 --end 14           use only this part of the source (seconds)
 *           --poster 6.2                   poster frame time in the clip (default: one third in)
 *           --loop-start 3                 start of the 5-second hover loop (default: same as the poster)
 *           --stacked                      the clip is her stacked three-band format: phones never crop it
 *
 * It writes, next to the existing pieces (colour untouched: only scale, crop to even sizes, 30 fps):
 *   docs/video/assets/clips/ID.mp4         H.264 High, yuv420p, 30 fps, faststart, no sound;
 *                                          1920x1080 / 1080x1920 when the source is that large, else its own size
 *   docs/video/assets/posters/ID.jpg/.webp, ID-960 (wide clips) and ID-480
 *   docs/video/assets/loops/ID.mp4         silent 360 px loop, 5 s (small cards)
 *   docs/video/assets/loops/ID-lg.mp4      silent 720 px (wide) / 540 px (vertical) loop for large cards
 * and appends the entry to content/video/media.json ("pieces"). Then run: node build.mjs
 * Texts you leave out are written as "TODO" — fill them in media.json before publishing.
 * Needs ffmpeg, ffprobe and cwebp in PATH (brew install ffmpeg webp).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs/video/assets');
const [src, group, ...rest] = process.argv.slice(2);
const GROUPS = ['hospitality', 'lifestyle', 'brands', 'nature'];
if (!src || !GROUPS.includes(group)) {
  console.error('Usage: node scripts/add-clip.mjs <file> <hospitality|lifestyle|brands|nature> [--id …] [--title-ru …] [--title-en …] …');
  process.exit(1);
}
const opt = {};
for (let i = 0; i < rest.length; i++) {
  const k = rest[i].replace(/^--/, '');
  if (k === 'stacked') { opt.stacked = true; continue; }
  opt[k] = rest[++i];
}
const id = (opt.id || path.basename(src).replace(/\.[^.]+$/, '')).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `clip-${Date.now()}`;
const run = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const probe = (f) => {
  const j = JSON.parse(run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:stream_side_data=rotation:format=duration', '-of', 'json', f]));
  const s = j.streams[0];
  const rot = Math.abs(((s.side_data_list || []).find((d) => 'rotation' in d) || {}).rotation || 0);
  const [w, h] = rot === 90 || rot === 270 ? [s.height, s.width] : [s.width, s.height];
  return { w, h, d: parseFloat(j.format.duration) };
};
const mf = path.join(ROOT, 'content/video/media.json');
const media = JSON.parse(fs.readFileSync(mf, 'utf8'));
if (media.pieces.some((p) => p.id === id)) { console.error(`A piece with id "${id}" already exists in media.json. Pass --id with another name.`); process.exit(1); }

const info = probe(src);
const vertical = info.h > info.w;
const start = +(opt.start || 0), end = +(opt.end || info.d);
const dur = Math.max(1, end - start);
// 1080p when the source has it, otherwise its own size (720p Instagram downloads stay 720p): never upscaled
const big = Math.min(info.w, info.h) >= 1080;
const [W, H] = vertical ? (big ? [1080, 1920] : [720, 1280]) : (big ? [1920, 1080] : [1280, 720]);
// scale to cover the 16:9 / 9:16 frame and crop the centre
const fit = `scale=w=${W}:h=${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=30,format=yuv420p`;
for (const d of ['clips', 'posters', 'loops']) fs.mkdirSync(path.join(OUT, d), { recursive: true });
const clip = path.join(OUT, 'clips', `${id}.mp4`);
console.log(`encoding ${id} (${vertical ? 'vertical' : 'horizontal'}, ${dur.toFixed(1)} s)…`);
run('ffmpeg', ['-y', '-v', 'error', '-ss', String(start), '-t', String(dur), '-i', src, '-vf', fit, '-an', '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', '22', '-maxrate', big ? '4200k' : '3200k', '-bufsize', big ? '8400k' : '6400k', '-color_range', 'tv', '-movflags', '+faststart', clip]);
const pt = Math.min(dur - 0.1, +(opt.poster ?? dur / 3));
const poster = (w, suffix) => {
  const jpg = path.join(OUT, 'posters', `${id}${suffix}.jpg`), webp = path.join(OUT, 'posters', `${id}${suffix}.webp`);
  const vf = `scale=${w}:-2:flags=lanczos`;
  run('ffmpeg', ['-y', '-v', 'error', '-ss', String(pt), '-i', clip, '-frames:v', '1', '-vf', vf, '-q:v', '3', jpg]);
  // webp: cwebp from the jpg (ffmpeg builds often lack libwebp); ffmpeg as a fallback
  try { run('cwebp', ['-quiet', '-q', '80', jpg, '-o', webp]); }
  catch { run('ffmpeg', ['-y', '-v', 'error', '-i', jpg, '-c:v', 'libwebp', '-quality', '80', webp]); }
  return { jpg, webp };
};
const pFull = poster(W, ''), p480 = poster(480, '-480');
const p960 = !vertical && W > 960 ? poster(960, '-960') : null;
const ls = Math.max(0, Math.min(dur - 5, +(opt['loop-start'] ?? pt)));
const loop = path.join(OUT, 'loops', `${id}.mp4`);
run('ffmpeg', ['-y', '-v', 'error', '-ss', String(ls), '-t', String(Math.min(5, dur)), '-i', clip, '-vf', 'scale=360:-2:flags=lanczos', '-an', '-c:v', 'libx264', '-profile:v', 'high', '-crf', '27', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', loop]);
const loopLg = path.join(OUT, 'loops', `${id}-lg.mp4`);
run('ffmpeg', ['-y', '-v', 'error', '-ss', String(ls), '-t', String(Math.min(5, dur)), '-i', clip, '-vf', `scale=${vertical ? 540 : 720}:-2:flags=lanczos`, '-an', '-c:v', 'libx264', '-profile:v', 'high', '-crf', '25', '-maxrate', '1800k', '-bufsize', '3600k', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', loopLg]);

const base = path.join(ROOT, 'docs/video');
const vfile = (f) => {
  const isVideo = f.endsWith('.mp4');
  const p = isVideo ? probe(f) : null;
  let w, h;
  if (p) ({ w, h } = p);
  else { const j = JSON.parse(run('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'json', f])); ({ width: w, height: h } = j.streams[0]); }
  return { path: path.relative(ROOT, f), url: path.relative(base, f), width: w, height: h, bytes: fs.statSync(f).size, duration: p ? Math.round(p.d * 100) / 100 : null, format: path.extname(f).slice(1) };
};
const pair = (k, fallback = 'TODO') => ({ ru: opt[`${k}-ru`] || fallback, en: opt[`${k}-en`] || fallback });
const clipInfo = vfile(clip);
const entry = {
  id, group, orientation: vertical ? 'vertical' : 'horizontal', ...(opt.stacked ? { stacked: true } : {}),
  title: pair('title'), caption: pair('caption'), alt: pair('alt'),
  muted: true, muted_reason: 'Web files carry no audio track.',
  duration: clipInfo.duration,
  files: {
    clip: clipInfo,
    poster: { jpg: vfile(pFull.jpg), webp: vfile(pFull.webp) },
    poster_480: { jpg: vfile(p480.jpg), webp: vfile(p480.webp) },
    ...(p960 ? { poster_960: { jpg: vfile(p960.jpg), webp: vfile(p960.webp) } } : {}),
    loop: vfile(loop),
    loop_lg: vfile(loopLg),
  },
  encode: 'crf22',
  source: { segments: [{ file: path.relative(ROOT, path.resolve(src)), original_name: path.basename(src), in: start, out: end, crop: null }], poster_frame: { file: path.relative(ROOT, path.resolve(src)), t: start + pt }, loop_segments: [] },
  note: 'Added with scripts/add-clip.mjs',
};
media.pieces.push(entry);
fs.writeFileSync(mf, JSON.stringify(media, null, 1) + '\n');
console.log(`added "${id}" to content/video/media.json (${group}). ${Object.values(entry.title).includes('TODO') ? 'Fill in the TODO texts, then ' : ''}run: node build.mjs`);
