#!/usr/bin/env node
// Light "-sd" copies of the full clips and showreels for slow connections.
// The player starts with these and uses the full-size file only on a fast connection and a large screen.
// Run after scripts/video_media.py or scripts/add-clip.mjs:  node scripts/video-sd.mjs
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'video', 'assets');
const probe = (f) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', f]).toString());
for (const dir of ['clips', 'showreel']) {
  for (const name of readdirSync(join(root, dir))) {
    if (!name.endsWith('.mp4') || name.endsWith('-sd.mp4') || name.startsWith('hero-')) continue;
    const src = join(root, dir, name), out = src.replace(/\.mp4$/, '-sd.mp4');
    const p = probe(src), { width, height } = p.streams[0], dur = +p.format.duration;
    const short = Math.min(width, height);
    const kbps = statSync(src).size * 8 / dur / 1000;
    if (short <= 720 && kbps < 1700) { if (existsSync(out)) rmSync(out); console.log(`${name}: already light (${Math.round(kbps)} kbps), no -sd copy`); continue; }
    const vf = short > 720 ? (width > height ? 'scale=-2:720:flags=lanczos' : 'scale=720:-2:flags=lanczos') : 'null';
    // a 1-second GOP so playback can start from very little data
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-an', '-vf', vf, '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
      '-preset', 'slow', '-crf', '25', '-maxrate', '1500k', '-bufsize', '3000k', '-g', '30', '-movflags', '+faststart', out]);
    console.log(`${name}: ${(statSync(src).size / 1048576).toFixed(1)} MB -> ${(statSync(out).size / 1048576).toFixed(1)} MB`);
  }
}
