/* Hero text contrast over every second of the background loop (text hidden, 95th-percentile background).
   Serve the repo root on :8090, then: node scripts/hero-contrast.mjs 1440x900,390x844 */
import { chromium } from 'playwright';
const b = await chromium.launch({ headless: true, channel: 'chrome' });
const lum = (r, g, bb) => { const f = (c) => { c /= 255; return c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(bb); };
for (const [w, h] of (process.argv[2]||'1440x900,390x844').split(',').map((v)=>v.split('x').map(Number))) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  await p.goto('http://127.0.0.1:8090/docs/video/'); await p.waitForTimeout(2500);
  const sels = ['.hero__role', '.hero__name', '.hero__tagline', '.hero__lede', '.hero__loc', '.bar__name', '.bar__lang'];
  const boxes = await p.evaluate((sels) => sels.map((s) => { const e = document.querySelector(s); const r = e.getBoundingClientRect(); const c = getComputedStyle(e).color.match(/\d+/g).map(Number); return { s, r: [r.x, r.y, r.width, r.height], c, vis: r.width > 0 && getComputedStyle(e).display !== 'none' }; }), sels);
  await p.addStyleTag({ content: '.hero__copy *,.hero__loc,.bar *{color:transparent!important;border-color:transparent!important}.btn,.hero__toggle{background:transparent!important}' });
  const worst = {};
  for (let t = 0; t < 13; t++) {
    const b64 = (await p.screenshot()).toString('base64');
    const data = await p.evaluate(async ([b64, w, h]) => { const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode(); const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.drawImage(im, 0, 0); const d = x.getImageData(0, 0, w, h).data; let s = ''; for (let i = 0; i < d.length; i += 8192) s += String.fromCharCode.apply(null, d.subarray(i, i + 8192)); return btoa(s); }, [b64, w, h]);
    const png = { data: Buffer.from(data, 'base64') };
    for (const bx of boxes) {
      if (!bx.vis) continue;
      const [x, y, bw, bh] = bx.r.map(Math.round); const L = [];
      for (let yy = Math.max(0, y); yy < Math.min(h, y + bh); yy += 3) for (let xx = Math.max(0, x); xx < Math.min(w, x + bw); xx += 3) { const i = (yy * w + xx) * 4; L.push(lum(png.data[i], png.data[i + 1], png.data[i + 2])); }
      L.sort((a, c) => a - c); const bg = L[Math.floor(L.length * .95)] ?? 0;
      const cr = (lum(...bx.c) + .05) / (bg + .05);
      worst[bx.s] = Math.min(worst[bx.s] ?? 99, cr);
    }
    await p.waitForTimeout(1000);
  }
  console.log(w, Object.entries(worst).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(' | '));
  await ctx.close();
}
await b.close();
