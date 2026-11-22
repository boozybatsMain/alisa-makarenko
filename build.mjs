#!/usr/bin/env node
/*
 * Static site build for Alisa Makarenko's portfolio. No dependencies.
 * One command builds BOTH sites: site 1 (producer, below) and site 2 (videographer, src/video/build.mjs → docs/video/).
 *
 *   node build.mjs
 *
 * Reads   content/copy.json   all texts, RU and EN
 *         content/media.json  image sizes and alt texts
 *         content/site.json   public address (optional)
 *         src/index.html      page template
 *         src/cv.html         CV template
 *         src/styles.css, src/cv.css, src/main.js
 * Writes  docs/index.html            RU home
 *         docs/en/index.html         EN home
 *         docs/cv/index.html         RU CV (print page)
 *         docs/en/cv/index.html      EN CV (print page)
 *         docs/css/*, docs/js/*, docs/.nojekyll
 *
 * Template placeholders:
 *   {{t:path.to.text}}  text from copy.json in the page language, HTML-escaped
 *   {{v:name}}          a build variable (paths, language, etc.)
 *   {{part:name}}       a block rendered by a function below
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildVideo } from './src/video/build.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DOCS = path.join(ROOT, 'docs');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const json = (p) => JSON.parse(rd(p));

const copy = json('content/copy.json');
const media = json('content/media.json');
const site = fs.existsSync(path.join(ROOT, 'content/site.json')) ? json('content/site.json') : {};
const BASE = (site.base_url || '').trim().replace(/\/?$/, (m) => (site.base_url ? '/' : ''));
const mediaById = new Map(media.assets.map((a) => [a.id, a]));
const warnings = [];

/* ---------------- helpers ---------------- */
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const isPair = (o) => o && typeof o === 'object' && ('ru' in o || 'en' in o) && !Array.isArray(o);
/*
 * Typography pass (runs on every text from copy.json):
 *  - a non-breaking space after short prepositions/conjunctions and between a number and the next word
 *    («5 ноября», «8,2 тыс. просмотров», «1 ч 4 мин», "3 seasons");
 *  - hyphenated compounds such as «AI-инструменты», «контент-план», «Telegram-канал» never break at the hyphen.
 * Compounds are wrapped in private-use markers U+E000…U+E001; finish() turns them into <span class="nw"> in text
 * and drops them inside tags (attributes), so nothing invisible ends up in the page or in the PDF text.
 */
const NW_OPEN = '\uE000', NW_CLOSE = '\uE001';
const typo = (s, lang) => {
  if (typeof s !== 'string') return s;
  if (lang === 'ru') {
    // short words stick to the next word; the lookbehind does not consume the space before them,
    // so chains such as «и в», «и о», «и не» are all bound in one pass
    s = s.replace(/(?<=^|[\s(«—…\u00a0])(в|и|с|к|о|у|а|я|на|по|из|за|до|от|не|ни|для|без|что|как|или|об|со|во|но|же|ли|бы|при|про|под|над)[ \t\n]+/giu, '$1\u00a0');
    s = s.replace(/(\d)\s+(?=[\p{L}%№])/gu, '$1\u00a0');
    s = s.replace(/(\s)(млн|тыс\.)\s+/gu, '$1$2\u00a0');
    s = s.replace(/(\d\u00a0)(ч|мин|с)\s+(?=\d)/gu, '$1$2\u00a0');
    // dates: «19 ноября 2026», «декабрь 2023»
    s = s.replace(/(январ[ьяе]|феврал[ьяе]|март[ае]?|апрел[ьяе]|ма[йяе]|июн[ьяе]|июл[ьяе]|август[ае]?|сентябр[ьяе]|октябр[ьяе]|ноябр[ьяе]|декабр[ьяе]|янв\.|фев\.|мар\.|апр\.|авг\.|сент?\.|окт\.|нояб?\.|дек\.)\s+(?=\d{4})/giu, '$1\u00a0');
    s = s.replace(/(Яндекс) (Музык)/gu, '$1\u00a0$2').replace(/(Apple) (Podcasts)/gu, '$1\u00a0$2').replace(/(YouTube) (Studio)/gu, '$1\u00a0$2');
    s = s.replace(/\s+—/g, '\u00a0—');
  } else {
    s = s.replace(/(?<=^|[\s(\u00a0])(a|an|the|of|in|on|to|by|for|and|or|at|vs|as|is|my|our|I|we)[ \t\n]+/gi, '$1\u00a0');
    s = s.replace(/(\d)\s+(?=[\p{L}%])/gu, '$1\u00a0');
    s = s.replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December)\s+(?=\d)/g, '$1\u00a0');
    s = s.replace(/(\d{1,2}),\s+(?=\d{4})/g, '$1,\u00a0');
    s = s.replace(/(\d\u00a0)(h|min|s)\s+(?=\d)/g, '$1$2\u00a0');
    s = s.replace(/(Yandex) (Music)/g, '$1\u00a0$2').replace(/(Apple) (Podcasts)/g, '$1\u00a0$2').replace(/(YouTube) (Studio)/g, '$1\u00a0$2');
    s = s.replace(/\s+—/g, '\u00a0—');
  }
  s = s.replace(/(?<![\d,.])(\d{1,3}) (?=\d{3}(?!\d))/g, '$1\u00a0'); // «28 484», «7 768»: digit groups never split
  s = s.replace(/(\d[\d,.]*)–(\d[\d,.]*)/g, `${NW_OPEN}$1–$2${NW_CLOSE}`);
  s = s.replace(/(^|[\s(«"“])([\p{L}\d]{1,12}-[\p{L}\d]+(?:-[\p{L}\d]+)*)/gu, (m, pre, w) => `${pre}${NW_OPEN}${w}${NW_CLOSE}`);
  return s;
};
/** Final HTML pass: compound markers become nowrap spans in text and vanish inside tags. */
const finish = (html) => html
  .replace(/<[^>]*>/g, (tag) => tag.replace(/[\uE000\uE001]/g, ''))
  .replace(/\uE000/g, '<span class="nw">').replace(/\uE001/g, '</span>');
const plain = (s) => String(s ?? '').replace(/[\uE000\uE001]/g, '');
const L = (o, lang) => (isPair(o) ? typo(o[lang] ?? o.ru ?? '', lang) : (o ?? ''));
const get = (obj, p) => p.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
const assetExists = (rel) => fs.existsSync(path.join(DOCS, rel));
const NB = '\u00a0';

/** Plural form: "a|b|c" (RU: 1 / 2-4 / 5+) or "one|many" (EN). */
function plural(label, n, lang) {
  const f = label.split('|');
  if (f.length === 1) return label;
  if (lang === 'ru' && f.length === 3) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return f[0];
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return f[1];
    return f[2];
  }
  return n === 1 ? f[0] : f[f.length - 1];
}

/** "4,9 млн" -> {num:"4,9", unit:"млн"}; "+65 %" -> {num:"+65 %", unit:""} */
function splitValue(v) {
  const m = String(v).match(/^(.*?\d[\d\s\u00a0.,–%-]*?)[\s\u00a0]*([A-Za-zА-Яа-яЁё.]+)?$/u);
  if (!m || !/\d/.test(v)) return { num: v, unit: '', text: true };
  return { num: m[1].trim(), unit: (m[2] || '').trim(), text: false };
}
const valueHTML = (v, cls = '') => {
  const s = splitValue(v);
  if (s.text) return `<span class="val val--text ${cls}">${esc(v)}</span>`;
  return `<span class="val ${cls}"><span class="val__n" data-count>${esc(s.num)}</span>${s.unit ? `<span class="val__u">${esc(s.unit)}</span>` : ''}</span>`;
};

/** Read width/height of a JPEG (for the optional portrait). */
function jpegSize(file) {
  const b = fs.readFileSync(file);
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const marker = b[i + 1];
    const len = b.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return { w: 800, h: 1000 };
}

/** Width/height of the hero portrait: WebP (VP8X / VP8L / VP8), PNG or JPEG. */
function imageSize(file) {
  const b = fs.readFileSync(file);
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const kind = b.toString('ascii', 12, 16);
    if (kind === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
    if (kind === 'VP8L') { const n = b.readUInt32LE(21); return { w: 1 + (n & 0x3fff), h: 1 + ((n >> 14) & 0x3fff) }; }
    return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  }
  if (b.readUInt32BE(0) === 0x89504e47) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  return jpegSize(file);
}

/** Split "ГЛАВНОЕ. Подзаголовок" (RU) or "Main: subtitle" (EN) for display. */
function splitTitle(t) {
  const m = t.match(/^(.+?)(?:\.\s+|:\s+)(.+)$/u);
  if (!m) return { main: t, sub: '' };
  return { main: m[1], sub: m[2] };
}

const durationLabel = (d, lang) => {
  // "1:03:44" -> "1:03:44"; keep as timecode
  return d.replace(/^0:/, '');
};

/* ---------------- episode / media lookups ---------------- */
const episodes = copy.case.episodes.items;
const epById = new Map(episodes.map((e) => [e.id, e]));
// Shorts are no longer shown on the page; the list stays because the (frozen) CV links its Shorts by id.
const shorts = copy.case.shorts.items;

function thumbPicture(id, alt, P, sizes = '(max-width: 760px) 92vw, 33vw', eager = false) {
  const b = `assets/thumbs/${id}`;
  const load = eager ? 'eager' : 'lazy';
  if (assetExists(`${b}-960.jpg`)) {
    const has480 = assetExists(`${b}-480.jpg`);
    const set = (ext) => (has480 ? `${P}${b}-480.${ext} 480w, ${P}${b}-960.${ext} 960w` : `${P}${b}-960.${ext} 960w`);
    const webp = assetExists(`${b}-960.webp`) ? `<source type="image/webp" srcset="${set('webp')}" sizes="${sizes}">` : '';
    return `<picture>${webp}<img src="${P}${b}-960.jpg" srcset="${set('jpg')}" sizes="${sizes}" width="960" height="540" alt="${esc(alt)}" loading="${load}" decoding="async"></picture>`;
  }
  warnings.push(`No local thumbnail for ${id}: using YouTube's image. Put ${b}-960.jpg/.webp in docs/ to self-host it.`);
  return `<img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" width="480" height="360" alt="${esc(alt)}" loading="${load}" decoding="async" class="is-yt">`;
}

function variantsOf(id) {
  const a = mediaById.get(id);
  return a ? a.variants : [];
}
function pictureFromVariants(vars, alt, P, { cls = '', sizes = '', lazy = true, attrs = '' } = {}) {
  const imgs = vars.filter((v) => v.type === 'image');
  const webp = imgs.filter((v) => v.format === 'webp');
  const avif = imgs.filter((v) => v.format === 'avif');
  const jpg = imgs.filter((v) => v.format === 'jpg' || v.format === 'jpeg' || v.format === 'png');
  const fallback = jpg[0] || imgs[0];
  const srcset = (list) => list.map((v) => `${P}${v.url} ${v.width}w`).join(', ');
  const sz = sizes ? ` sizes="${sizes}"` : '';
  return `<picture${cls ? ` class="${cls}"` : ''}>${avif.length ? `<source type="image/avif" srcset="${srcset(avif)}"${sz}>` : ''}${webp.length ? `<source type="image/webp" srcset="${srcset(webp)}"${sz}>` : ''}<img src="${P}${fallback.url}"${jpg.length > 1 ? ` srcset="${srcset(jpg)}"${sz}` : ''} width="${fallback.width}" height="${fallback.height}" alt="${esc(alt)}"${lazy ? ' loading="lazy"' : ''} decoding="async"${attrs}></picture>`;
}

/** Simple picture for a docs/assets base path with .webp + .jpg next to each other. */
function simplePicture(base, alt, P, w, h, { lazy = true, cls = '' } = {}) {
  const webp = assetExists(`${base}.webp`) ? `<source type="image/webp" srcset="${P}${base}.webp">` : '';
  return `<picture${cls ? ` class="${cls}"` : ''}>${webp}<img src="${P}${base}.jpg" width="${w}" height="${h}" alt="${esc(alt)}"${lazy ? ' loading="lazy"' : ''} decoding="async"></picture>`;
}

function evidenceInfo(assetPath) {
  const name = assetPath.split('/').pop();
  const a = mediaById.get(`evidence-${name}`);
  if (a) {
    const jpg = a.variants.find((v) => v.format === 'jpg');
    return { w: jpg.width, h: jpg.height, alt: a.alt };
  }
  // asset added later without a media.json entry: read jpg size
  const f = path.join(DOCS, 'assets', `${assetPath}.jpg`);
  if (fs.existsSync(f)) { const s = jpegSize(f); return { w: s.w, h: s.h, alt: null }; }
  warnings.push(`Missing evidence image docs/assets/${assetPath}.jpg`);
  return null;
}

/* ---------------- partials ---------------- */
const icon = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7.2v9.6l7.6-4.8z" fill="currentColor"/></svg>',
  down: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.5v7M2.8 5.6 6 8.8l3.2-3.2M2 10.8h8" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
  arrow: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 10 10 2M4 2h6v6" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
  ext: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 9 9 3M4.5 3H9v4.5" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
};

function makeParts(lang, V) {
  const t = (o) => esc(L(o, lang));
  const P = V.P;
  const ytWatch = (id) => `https://www.youtube.com/watch?v=${id}`;
  const q = (s) => (lang === 'ru' ? `«${s}»` : `“${s}”`);
  const epName = (e) => splitTitle(L(e.title, lang));

  const film = (id, { big = false, eager = false } = {}) => {
    const e = epById.get(id);
    const name = e ? plain(epName(e).main) : id;
    const alt = (() => {
      const a = mediaById.get(`thumb-${id}`);
      return a && a.alt ? L(a.alt, lang) : `${lang === 'ru' ? 'Обложка выпуска' : 'Thumbnail for'} ${q(name)}`;
    })();
    const loop = assetExists(`assets/loops/ep-${id}.mp4`) ? ` data-loop="${P}assets/loops/ep-${id}.mp4"` : '';
    const sizes = big ? '(max-width: 900px) 92vw, 58vw' : '(max-width: 640px) 92vw, (max-width: 1100px) 46vw, 30vw';
    const title = e ? plain(L(e.title, lang)) : name;
    return `<a class="film${big ? ' film--big' : ''}" href="${ytWatch(id)}" target="_blank" rel="noopener" data-yt="${id}" data-title="${esc(title)}"${loop} aria-label="${esc(L(copy.cta.watch_episode, lang))}: ${esc(title)}${e ? ` (${e.duration})` : ''}">
      <span class="film__frame">${thumbPicture(id, alt, P, sizes, eager)}<span class="play" aria-hidden="true">${icon.play}</span></span>
    </a>`;
  };

  const src = (s) => (s ? `<p class="src"><span>${t(copy.ui.source)}:</span> ${t(s)}</p>` : '');
  const figList = (list, cls = '') => `<ul class="figs${cls ? ` ${cls}` : ''}">${list.map((f) => `<li class="rv">${valueHTML(L(f.value, lang), 'figs__v')}<span class="figs__l">${t(f.label)}</span></li>`).join('')}</ul>`;

  /* one evidence screenshot as a lightbox link; `group` keeps prev/next inside one set (scripts, dashboards…) */
  const lbLink = (key, cls, group) => {
    const b = copy.evidence[key];
    if (!b) { warnings.push(`Unknown evidence key: ${key}`); return null; }
    const info = evidenceInfo(b.asset);
    if (!info) return null;
    const alt = info.alt ? L(info.alt, lang) : L(b.title, lang);
    const base = `assets/${b.asset}`;
    return { b, info, alt, base, open: `<a class="${cls}" href="${P}${base}.jpg" data-lb="${group}" data-w="${info.w}" data-h="${info.h}" data-webp="${assetExists(base + '.webp') ? P + base + '.webp' : ''}" data-alt="${esc(plain(alt))}" data-title="${t(b.title)}" data-caption="${t(b.caption)}">` };
  };
  const shotCard = (key, group, cls = 'shot') => {
    const x = lbLink(key, `${cls}__link`, group);
    if (!x) return '';
    return `<li class="${cls}">${x.open}<span class="${cls}__frame">${simplePicture(x.base, plain(x.alt), P, x.info.w, x.info.h)}</span><span class="${cls}__title">${t(x.b.title)}</span><span class="${cls}__cap">${t(x.b.caption)}</span></a></li>`;
  };

  const parts = {
    nav: () => ['skills', 'process', 'case', 'moments', 'stats', 'contact']
      .map((id) => `<a href="#${id}"${id === 'stats' ? ' data-open-stats' : ''}>${t(copy.nav[id])}</a>`).join(''),
    heroImage: () => {
      const d = variantsOf('hero'), m = variantsOf('hero-mobile');
      const srcset = (list, f) => list.filter((v) => v.format === f).map((v) => `${P}${v.url}`).join(', ');
      const jpg = d.find((v) => v.format === 'jpg');
      return `<picture>
        <source media="(max-width: 700px)" type="image/avif" srcset="${srcset(m, 'avif')}">
        <source media="(max-width: 700px)" type="image/webp" srcset="${srcset(m, 'webp')}">
        <source media="(max-width: 700px)" srcset="${srcset(m, 'jpg')}">
        <source type="image/avif" srcset="${srcset(d, 'avif')}">
        <source type="image/webp" srcset="${srcset(d, 'webp')}">
        <img src="${P}${jpg.url}" width="${jpg.width}" height="${jpg.height}" alt="" fetchpriority="high" decoding="async">
      </picture>`;
    },
    /* the portrait: one replaceable file. portrait.webp / .png is a cut-out with transparency (see README);
       a plain portrait.jpg still works and gets the old feathered-oval mask instead */
    heroPhoto: () => (V.portrait
      ? `<figure class="hero__photo${V.portrait.cutout ? '' : ' hero__photo--rect'}"><img src="${P}assets/${V.portrait.file}" width="${V.portrait.w}" height="${V.portrait.h}" alt="${t(copy.hero.photo_alt)}" decoding="async" fetchpriority="high"></figure>`
      : ''),
    /* a compact pink plaque with the same contacts as the contact block */
    heroContacts: () => {
      const c = copy.contact;
      return [
        [c.telegram_href, L(c.telegram_label, lang), `Telegram ${c.telegram}`, true],
        [c.instagram_href, L(c.instagram_label, lang), `Instagram ${c.instagram}`, true],
        [c.email_href, c.email, null, false],
        [c.phone_href, c.phone.replace(/ /g, NB), null, false],
      ].map(([href, text, label, ext]) => `<li><a href="${esc(href)}"${ext ? ' target="_blank" rel="noopener"' : ''}${label ? ` aria-label="${esc(label)}"` : ''}>${esc(text)}</a></li>`).join('');
    },
    heroName: () => {
      const n = L(copy.hero.name, lang).split(/[  ]/);
      return `<span class="line"><span>${esc(n[0])}</span></span> <span class="line"><span>${esc(n.slice(1).join(' '))}</span></span>`;
    },
    /* RU: the English title above the Russian one; EN: the English title only */
    heroRoles: () => copy.hero.roles.map((r) => (lang === 'ru'
      ? `<li><span class="role__en" lang="en">${esc(r.en)}</span><span class="role__ru">${t(r)}</span></li>`
      : `<li><span class="role__ru">${t(r)}</span></li>`)).join(''),
    heroNumbers: () => copy.hero.numbers.map((n) => `<div class="hnum rv">
        <dt class="hnum__l">${t(n.label)}</dt>
        <dd class="hnum__v">${valueHTML(L(n.value, lang))}</dd>
        <dd class="hnum__q">${t(n.qualifier)}</dd>
      </div>`).join(''),

    /* ---------- skills ---------- */
    /* each group is a native disclosure: works without JS, keyboard-operable; main.js opens a desktop row together */
    skills: () => copy.skills.groups.map((g) => `<details class="sk rv"><summary class="sk__sum"><h3 class="sk__t">${t(g.title)}</h3><span class="sk__n" aria-hidden="true">${g.items.length}</span><span class="sk__i" aria-hidden="true"></span></summary><ul class="sk__list">${g.items.map((i) => `<li>${t(i)}</li>`).join('')}</ul></details>`).join(''),
    kit: () => copy.skills.kit.map((k) => `<div class="kit__row"><dt>${t(k.title)}</dt><dd>${t(k.items)}${k.note ? ` <small>· ${t(k.note)}</small>` : ''}</dd></div>`).join(''),

    /* ---------- process: a track of clips with a playhead, readable cards underneath ---------- */
    processSteps: () => copy.process.steps.map((s) => `<li class="clip"><span class="clip__n">${esc(s.n)}</span><span class="clip__t">${t(s.title)}</span></li>`).join(''),
    processCards: () => copy.process.steps.map((s) => {
      const proof = s.proof ? `<details class="proof"><summary>${t(s.proof.label)}${s.proof.items.length > 1 ? ` <span class="proof__n">${s.proof.items.length}</span>` : ''}</summary><ul class="proof__list">${s.proof.items.map((k) => shotCard(k, `stage-${s.n}`, 'pf')).join('')}</ul></details>` : '';
      return `<li class="stage rv">
        <span class="stage__n">${esc(s.n)}</span>
        <h3 class="stage__t">${t(s.title)}</h3>
        ${s.text ? `<p class="stage__p">${t(s.text)}</p>` : ''}
        ${s.bullets ? `<ul class="stage__ul">${s.bullets.map((b) => `<li>${t(b)}</li>`).join('')}</ul>` : ''}
        <p class="stage__tools"><span class="sr">${t(copy.process.tools_label)}: </span>${L(s.tools, lang).split(/,\s*/).map((x) => `<span>${esc(x)}</span>`).join('')}</p>
        ${proof}
      </li>`;
    }).join(''),
    stageCount: () => { const n = copy.process.steps.length; return `${String(n).padStart(2, '0')} / ${String(n).padStart(2, '0')}`; },

    /* ---------- case: three proofs ---------- */
    caseLogo: () => simplePicture('assets/brand/witching-hour', L(copy.case.logo_alt, lang), P, 320, 320, { cls: 'case__logo' }),
    filmProofs: () => copy.case.film_proofs.map((s) => {
      const e = epById.get(s.media);
      const ttl = epName(e);
      return `<article class="proofcard proofcard--film" id="story-${s.id}">
        <figure class="proofcard__media rv">${film(s.media)}
          <figcaption><span class="proofcard__name">${esc(ttl.main)}</span><span class="proofcard__meta">${esc(L(e.date_label, lang))} · ${esc(durationLabel(e.duration))} · ${esc(L(e.views_label, lang))} ${esc(L(copy.case.episodes.views_label, lang))} ${t(copy.ui.views_as_of)}</span></figcaption>
        </figure>
        <p class="kicker rv">${t(s.kicker)}</p>
        <h3 class="proofcard__t rv">${t(s.title)}</h3>
        <p class="proofcard__p rv">${t(s.text)}</p>
        ${src(s.source)}
      </article>`;
    }).join(''),

    moments: () => {
      const items = copy.moments.items.filter((m) => mediaById.has(`moment-${m.id}`));
      if (!items.length) return '';
      const info = items.map((m) => {
        const a = mediaById.get(`moment-${m.id}`);
        const mp4 = a.variants.find((v) => v.type === 'video');
        const pw = a.variants.find((v) => v.format === 'webp');
        const pj = a.variants.find((v) => v.format === 'jpg');
        const ep = epById.get(m.episode);
        const epTitle = ep ? epName(ep).main : (a.source && a.source.title) || '';
        const sec = Math.round(a.duration_sec || mp4.duration || 0);
        // the poster is the cover of the episode the clip was cut from (YouTube thumbnail, stored in assets/thumbs/)
        const cover = ['1280.webp', '960.webp', '960.jpg'].map((x) => `assets/thumbs/${m.episode}-${x}`).find(assetExists);
        if (!cover) warnings.push(`No episode cover for clip ${m.id}: put assets/thumbs/${m.episode}-1280.webp in docs/.`);
        const poster = cover ? { url: cover } : (pw || pj);
        const thumbBase = `assets/thumbs/${m.episode}-480`;
        const thumb = assetExists(`${thumbBase}.jpg`) ? simplePicture(thumbBase, '', P, 480, 270) : '';
        return { m, a, mp4, poster, epTitle, sec, thumb };
      });
      const first = info[0];
      const from = (x) => `${L(copy.ui.from_episode, lang)} ${q(x.epTitle)}`;
      const dur = (s) => `0:${String(s).padStart(2, '0')}`;
      return `<div class="moments">
        <figure class="moments__stage rv">
          <div class="moments__screen">
            <button class="moments__play" type="button" data-moment-play hidden><span class="moments__btn" aria-hidden="true">${icon.play}</span><span class="sr">${t(copy.cta.play)}</span></button>
            <video id="moment-video" controls preload="none" playsinline width="${first.mp4.width}" height="${first.mp4.height}" poster="${P}${first.poster.url}" aria-describedby="moment-cap">
              <source src="${P}${first.mp4.url}" type="video/mp4">
            </video>
          </div>
          <figcaption id="moment-cap"><span class="sr" data-moment-title>${t(first.m.title)}. </span><span class="moments__from" data-moment-from>${esc(from(first))} · ${dur(first.sec)}</span></figcaption>
        </figure>
        <ol class="moments__list">${info.map((x, i) => `<li><a class="moment${i === 0 ? ' is-active' : ''}" href="${P}${x.mp4.url}" data-src="${P}${x.mp4.url}" data-poster="${P}${x.poster.url}" data-title="${t(x.m.title)}" data-from="${esc(from(x))} · ${dur(x.sec)}"${i === 0 ? ' aria-current="true"' : ''}>
            <span class="moment__thumb" aria-hidden="true">${x.thumb}<span class="moment__play">${icon.play}</span></span>
            <span class="moment__t"><span>${t(x.m.title)}</span><small>${esc(q(x.epTitle))}</small></span>
            <span class="moment__d">${dur(x.sec)}</span>
          </a></li>`).join('')}</ol>
      </div>`;
    },

    /* ---------- statistics (inside one closed <details>) ---------- */
    keyNumbers: () => {
      const rows = [];
      copy.stats.platforms.forEach((g) => g.stats.filter((s) => s.key).forEach((s) => rows.push({ g, s })));
      return `<table class="keys">
        <thead><tr><th scope="col">${t(copy.ui.col_value)}</th><th scope="col">${t(copy.ui.col_what)}</th><th scope="col">${t(copy.ui.col_source)}</th></tr></thead>
        <tbody>${rows.map(({ g, s }) => `<tr><td class="keys__v">${valueHTML(L(s.value, lang))}</td><td class="keys__w"><span class="keys__p">${t(g.name)}</span>${t(s.label)}</td><td class="keys__s">${t(s.source || g.source)}</td></tr>`).join('')}</tbody>
      </table>`;
    },
    platforms: () => copy.stats.platforms.map((g) => `<section class="ledger" aria-labelledby="pl-${g.id}">
        <header class="ledger__head"><h4 id="pl-${g.id}">${t(g.name)}</h4><p class="ledger__src">${t(g.source)}</p></header>
        <dl class="ledger__rows">${g.stats.map((s) => `<div class="ledger__row"><dt>${t(s.label)}</dt><dd>${valueHTML(L(s.value, lang))}</dd></div>`).join('')}</dl>
      </section>`).join(''),
    growth: () => {
      const g = copy.stats.growth;
      return `${figList(g.figures, 'figs--3')}<p class="figs__note">${t(g.note)}</p><p class="caveat"><b>${t(copy.ui.caveat)}.</b> ${t(g.caveat)}</p>${src(g.source)}`;
    },
    audience: () => {
      const a = copy.stats.audience;
      const pts = (list) => list.map((p) => `<div><dt>${valueHTML(L(p.value, lang))}</dt><dd>${t(p.label)}</dd></div>`).join('');
      return `<div class="aud__core">
          <p class="aud__big">${t(a.core.value)}</p>
          <p class="aud__lbl">${t(a.core.label)}</p>
          <dl class="aud__pts aud__pts--demo">${pts(a.demo)}</dl>
          ${src(a.demo_source)}
        </div>
        <div class="aud__side">
          <dl class="aud__pts">${pts(a.points)}</dl>
          ${src(a.source)}
        </div>`;
    },
    community: () => {
      const c = copy.stats.community;
      return `<div class="comm__text"><p>${t(c.text)}</p>${src(c.source)}</div>${figList(c.figures, 'figs--2')}`;
    },
    files: () => `<ul class="shots">${copy.stats.files.items.map((k) => shotCard(k, 'stats')).join('')}</ul>`,
    episodesList: () => `<ol class="eplist">${episodes.map((e) => {
      const ttl = epName(e);
      return `<li><a href="${ytWatch(e.id)}" target="_blank" rel="noopener" data-yt="${e.id}" data-title="${esc(plain(L(e.title, lang)))}">
          <span class="eplist__name">${esc(ttl.main)}</span>
          <span class="eplist__meta">${esc(L(e.date_label, lang))} · ${esc(durationLabel(e.duration))} · <b>${esc(L(e.views_label, lang))}</b> ${t(copy.case.episodes.views_label)}</span>
          <span class="eplist__note">${t(e.note)}</span>
        </a></li>`;
    }).join('')}</ol>`,

    voices: () => {
      const v = copy.voices;
      return v.items.map((x) => `<figure class="voice"><blockquote lang="${lang}"><p>${esc(typo(x[lang], lang))}</p></blockquote><figcaption>${t(v.attribution[x.who] || v.attribution.n)} · ${q(L(x.episode_title, lang))}</figcaption></figure>`).join('');
    },
    contactList: () => {
      const c = copy.contact;
      return `<li class="rv"><span>${t(c.telegram_label)}</span><a href="${esc(c.telegram_href)}" target="_blank" rel="noopener">${esc(c.telegram)}</a></li>
        <li class="rv"><span>${t(c.instagram_label)}</span><a href="${esc(c.instagram_href)}" target="_blank" rel="noopener">${esc(c.instagram)}</a></li>
        <li class="rv"><span>${t(c.email_label)}</span><a href="${esc(c.email_href)}">${esc(c.email)}</a></li>
        <li class="rv"><span>${t(c.phone_label)}</span><a href="${esc(c.phone_href)}">${esc(c.phone).replace(/ /g, NB)}</a></li>`;
    },
    projectLinks: () => copy.contact.project_links.map((l) => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener">${t(l.label)}${icon.ext}</a></li>`).join(''),
    iconDown: () => icon.down,
    iconPlay: () => icon.play,
    /* ---------- CV ---------- */
    cvBullets: () => copy.cv.experience[0].bullets.map((b) => `<li>${t(b)}</li>`).join(''),
    // number and label in one line of text, so PDF text extraction keeps them together
    cvKey: () => copy.cv.key_numbers.map((k) => `<li><b>${esc(L(k.value, lang))}</b> <span>${t(k.label)}</span></li>`).join(''),
    cvSkillsLine: () => copy.cv.skills.map((s) => t(s)).join(' · '),
    cvWork: () => copy.cv.selected_work.map((w) => {
      const isShort = shorts.some((s) => s.id === w.id);
      const url = isShort ? `https://www.youtube.com/shorts/${w.id}` : ytWatch(w.id);
      return `<tr><td><a href="${url}">${t(w.title)}</a></td><td>${esc(L(w.views_label, lang))}</td></tr>`;
    }).join(''),
    cvSkills: () => copy.cv.skills.map((s) => `<li>${t(s)}</li>`).join(''),
    cvLinks: () => (BASE ? `<li><span>${t(copy.cv.labels.portfolio)}:</span> <a href="${BASE}${lang === 'en' ? 'en/' : ''}">${esc(BASE.replace(/^https?:\/\//, '').replace(/\/$/, ''))}${lang === 'en' ? '/en' : ''}</a></li>` : '') +
      copy.cv.links.map((l) => `<li><span>${t(l.label)}:</span> <a href="${esc(l.url)}">${esc(l.display)}</a></li>`).join(''),
    cvContacts: () => {
      const c = copy.cv.contacts;
      return `${BASE ? `<li class="cv__site"><a href="${BASE}${lang === 'en' ? 'en/' : ''}">${esc(BASE.replace(/^https?:\/\//, '').replace(/\/$/, ''))}${lang === 'en' ? '/en' : ''}</a></li>` : ''}
        <li><a href="tel:${c.phone.replace(/[^+\d]/g, '')}">${esc(c.phone).replace(/ /g, NB)}</a></li>
        <li><a href="${esc(c.telegram_url)}">Telegram ${esc(c.telegram)}</a></li>
        <li><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></li>`;
    },
    cvPhoto: () => (V.photo ? `<img class="cv__photo" src="${V.P}assets/photo.jpg" width="${V.photo.w}" height="${V.photo.h}" alt="${t(copy.cv.name)}">` : ''),
    cvExp: () => {
      const x = copy.cv.experience[0];
      return `<div class="cv__job"><h3>${t(x.project)}</h3><p class="cv__role"><b>${t(x.role)}</b><span>${t(x.period)}</span></p></div>`;
    },
    cvWorkNote: () => t(copy.cv.labels.selected_work_note),
    cvLocation: () => {
      const loc = copy.cv.location ? L(copy.cv.location, lang) : '';
      return loc ? `<p class="cv__loc">${esc(loc)}</p>` : '';
    },
  };
  return parts;
}

/* ---------------- head ---------------- */
function head(lang, V, { title, description, cv = false }) {
  const altLang = lang === 'ru' ? 'en' : 'ru';
  const abs = (rel) => (BASE ? BASE + rel : null);
  const selfRel = cv ? (lang === 'ru' ? 'cv/' : 'en/cv/') : (lang === 'ru' ? '' : 'en/');
  const altRel = cv ? (lang === 'ru' ? 'en/cv/' : 'cv/') : (lang === 'ru' ? 'en/' : '');
  const href = (rel, relFromHere) => abs(rel) ?? relFromHere;
  const ogImg = lang === 'ru' ? 'assets/brand/og.jpg' : 'assets/brand/og-en.jpg';
  const fonts = 'https://fonts.googleapis.com/css2?family=Cormorant:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Golos+Text:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap';
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="theme-color" content="#110c0a">
<meta name="color-scheme" content="${cv ? 'light' : 'dark'}">
${BASE ? `<link rel="canonical" href="${BASE}${selfRel}">\n` : ''}<link rel="alternate" hreflang="${lang}" href="${href(selfRel, V.selfHref)}">
<link rel="alternate" hreflang="${altLang}" href="${href(altRel, V.altHref)}">
<link rel="alternate" hreflang="x-default" href="${href(cv ? 'cv/' : '', lang === 'ru' ? V.selfHref : V.altHref)}">
<meta property="og:type" content="website">
<meta property="og:locale" content="${lang === 'ru' ? 'ru_RU' : 'en_US'}">
<meta property="og:locale:alternate" content="${lang === 'ru' ? 'en_US' : 'ru_RU'}">
<meta property="og:title" content="${esc(L(copy.meta.og_title, lang))}">
<meta property="og:description" content="${esc(L(copy.meta.og_description, lang))}">
<meta property="og:image" content="${abs(ogImg) ?? V.P + ogImg}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(L(copy.meta.og_image_alt, lang))}">
${BASE ? `<meta property="og:url" content="${BASE}${selfRel}">\n` : ''}<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(L(copy.meta.og_title, lang))}">
<meta name="twitter:description" content="${esc(L(copy.meta.og_description, lang))}">
<meta name="twitter:image" content="${abs(ogImg) ?? V.P + ogImg}">
<link rel="icon" href="${V.P}assets/brand/favicon.svg" type="image/svg+xml">
<link rel="icon" href="${V.P}assets/brand/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="${V.P}assets/brand/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${fonts}">`;
}

/* ---------------- render ---------------- */
function render(tpl, lang, V, parts) {
  return tpl.replace(/\{\{\s*(t|v|part):([\w.\-]+)\s*\}\}/g, (m, kind, key) => {
    if (kind === 't') {
      const val = get(copy, key);
      if (val === undefined) { warnings.push(`Missing text: ${key}`); return ''; }
      return esc(L(val, lang));
    }
    if (kind === 'v') {
      if (!(key in V)) { warnings.push(`Missing variable: ${key}`); return ''; }
      return V[key];
    }
    if (!parts[key]) { warnings.push(`Missing block: ${key}`); return ''; }
    return parts[key]();
  });
}

function write(rel, html) {
  const f = path.join(DOCS, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, finish(html));
}

if (!fs.existsSync(path.join(DOCS, 'assets/thumbs')) || !fs.existsSync(path.join(DOCS, 'assets/evidence'))) {
  console.error('docs/assets is missing or incomplete. It holds the source images and videos of the site and must not be deleted: restore it (e.g. from git) and run the build again.');
  process.exit(1);
}
// photo.jpg: the optional CV / videographer-site portrait (unchanged behaviour).
// portrait.webp (cut-out with alpha; .png or a plain .jpg also work): the producer home page hero portrait (see README).
const photoFile = path.join(DOCS, 'assets/photo.jpg');
const photo = fs.existsSync(photoFile) ? jpegSize(photoFile) : null;
const portraitName = ['portrait.webp', 'portrait.png', 'portrait.jpg'].find((n) => fs.existsSync(path.join(DOCS, 'assets', n)));
const portrait = portraitName ? { file: portraitName, cutout: !portraitName.endsWith('.jpg'), ...imageSize(path.join(DOCS, 'assets', portraitName)) } : null;

const tplHome = rd('src/index.html');
const tplCv = rd('src/cv.html');
const PDF = { ru: 'Alisa-Makarenko-CV-RU.pdf', en: 'Alisa-Makarenko-CV-EN.pdf' };

for (const lang of ['ru', 'en']) {
  // ---- home
  const P = lang === 'ru' ? '' : '../';
  const V = {
    lang, P, photo, portrait,
    selfHref: './',
    altHref: lang === 'ru' ? 'en/' : '../',
    altLang: lang === 'ru' ? 'en' : 'ru',
    altLangLabel: lang === 'ru' ? 'EN' : 'RU',
    cvPdf: `${P}cv/${PDF[lang]}`,
    cvPage: lang === 'ru' ? 'cv/' : 'cv/',
    hasPhoto: portrait ? 'has-photo' : 'no-photo',
    year: '2026',
  };
  const parts = makeParts(lang, V);
  V.head = head(lang, V, { title: L(copy.meta.title, lang), description: L(copy.meta.description, lang) });
  write(lang === 'ru' ? 'index.html' : 'en/index.html', render(tplHome, lang, V, parts));

  // ---- CV
  const PC = lang === 'ru' ? '../' : '../../';
  const VC = {
    lang, P: PC, photo,
    selfHref: './',
    altHref: lang === 'ru' ? '../en/cv/' : '../../cv/',
    altLang: lang === 'ru' ? 'en' : 'ru',
    altLangLabel: lang === 'ru' ? 'EN' : 'RU',
    homeHref: lang === 'ru' ? '../' : '../',
    cvPdf: lang === 'ru' ? PDF.ru : `../../cv/${PDF.en}`,
    hasPhoto: photo ? 'has-photo' : 'no-photo',
  };
  const partsC = makeParts(lang, VC);
  VC.head = head(lang, VC, { title: L(copy.cv.doc_title, lang), description: L(copy.cv.summary, lang), cv: true });
  write(lang === 'ru' ? 'cv/index.html' : 'en/cv/index.html', render(tplCv, lang, VC, partsC));
}

// ---- static files
fs.mkdirSync(path.join(DOCS, 'css'), { recursive: true });
fs.mkdirSync(path.join(DOCS, 'js'), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'src/styles.css'), path.join(DOCS, 'css/styles.css'));
fs.copyFileSync(path.join(ROOT, 'src/cv.css'), path.join(DOCS, 'css/cv.css'));
fs.copyFileSync(path.join(ROOT, 'src/main.js'), path.join(DOCS, 'js/main.js'));
fs.writeFileSync(path.join(DOCS, '.nojekyll'), '');

for (const p of Object.values(PDF)) {
  if (!fs.existsSync(path.join(DOCS, 'cv', p))) warnings.push(`docs/cv/${p} is missing: run "npm run pdf" (node scripts/pdf.mjs) to create it.`);
}
if (!BASE) warnings.push('content/site.json base_url is EMPTY: the CV has no portfolio link, and og:image / hreflang / canonical stay relative (link previews show no image). Fill it in once the site address is known, then run node build.mjs && node scripts/pdf.mjs.');
console.log(`Built docs/index.html, docs/en/index.html, docs/cv/index.html, docs/en/cv/index.html${portrait ? ' (with hero portrait)' : ''}`);
// ---- site 2: videographer portfolio (docs/video/)
const videoPages = buildVideo({ ROOT, DOCS, BASE, esc, typo, plain, finish, isPair, warnings });
console.log(`Built ${videoPages.join(', ')}`);
for (const w of [...new Set(warnings)]) console.warn('  ! ' + w);
