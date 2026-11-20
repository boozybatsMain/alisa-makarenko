#!/usr/bin/env node
/*
 * Static site build for Alisa Makarenko's portfolio. No dependencies.
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

  const figures = (s) => {
    if (!s.figures || !s.figures.length) return '';
    return `<div class="figs-wrap"><ul class="figs figs--${s.figures.length}">${s.figures.map((f) => `<li class="rv">${valueHTML(L(f.value, lang), 'figs__v')}<span class="figs__l">${t(f.label)}</span></li>`).join('')}</ul>${s.figures_note ? `<p class="figs__note">${t(s.figures_note)}</p>` : ''}</div>`;
  };

  const shortsRail = () => {
    const viewsWord = L(copy.case.episodes.views_label, lang);
    return `<ul class="shorts" aria-label="${t(copy.case.shorts.title)}">${shorts.map((s) => {
      const cover = variantsOf(`short-cover-${s.id}`);
      const poster = variantsOf(`short-poster-${s.id}`);
      const usePoster = s.use_poster && poster.length;
      const vars = usePoster ? poster : (cover.length ? cover : poster);
      const meta = usePoster ? mediaById.get(`short-poster-${s.id}`) : (mediaById.get(`short-cover-${s.id}`) || mediaById.get(`short-poster-${s.id}`));
      const alt = (meta || {}).alt;
      const title = plain(L(s.title, lang));
      const pic = vars.length
        ? pictureFromVariants(vars, alt ? L(alt, lang) : title, P, { sizes: '(max-width: 640px) 46vw, 16vw' })
        : `<img src="https://i.ytimg.com/vi/${s.id}/oar2.jpg" width="405" height="720" alt="${esc(title)}" loading="lazy">`;
      const loop = assetExists(`assets/loops/short-${s.id}.mp4`) ? ` data-loop="${P}assets/loops/short-${s.id}.mp4"` : '';
      return `<li class="rv"><a class="short" href="https://www.youtube.com/shorts/${s.id}" target="_blank" rel="noopener" data-yt="${s.id}" data-vertical data-title="${esc(title)}"${loop} aria-label="${esc(L(copy.cta.watch_short, lang))}: ${esc(title)} (${esc(L(s.views_label, lang))} ${esc(viewsWord)})">
        <span class="short__frame">${pic}<span class="short__views"><b>${esc(L(s.views_label, lang))}</b><small>${esc(viewsWord)}</small></span></span>
        <span class="short__title">${t(s.title)}</span><span class="short__dur">${esc(s.duration)}</span>
      </a></li>`;
    }).join('')}</ul><p class="src src--rail">${t(copy.case.shorts.note)}</p>`;
  };

  const lbLink = (b, cls) => {
    const info = evidenceInfo(b.asset);
    if (!info) return '';
    const alt = info.alt ? L(info.alt, lang) : L(b.title, lang);
    const base = `assets/${b.asset}`;
    return `<a class="${cls}" href="${P}${base}.jpg" data-lb data-w="${info.w}" data-h="${info.h}" data-webp="${assetExists(base + '.webp') ? P + base + '.webp' : ''}" data-alt="${esc(plain(alt))}" data-title="${t(b.title)}" data-caption="${t(b.caption)}">`;
  };

  const parts = {
    nav: () => {
      const items = [['case', 'case'], ['process', 'process'], ['behind', 'behind'], ['videography', 'videography'], ['skills', 'skills'], ['about', 'about'], ['contact', 'contact']];
      return items.map(([id, k]) => `<a href="#${id}">${t(copy.nav[k])}</a>`).join('');
    },
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
    heroName: () => {
      const n = L(copy.hero.name, lang).split(/[ \u00a0]/);
      return `<span class="line"><span>${esc(n[0])}</span></span> <span class="line"><span>${esc(n.slice(1).join(' '))}</span></span>`;
    },
    heroNumbers: () => copy.hero.numbers.map((n) => `<div class="hnum rv">
        <dt class="hnum__l">${t(n.label)}</dt>
        <dd class="hnum__v">${valueHTML(L(n.value, lang))}</dd>
        <dd class="hnum__q">${t(n.qualifier)}</dd>
      </div>`).join(''),
    metaTable: () => copy.case.meta_table.map((r) => `<div><dt>${t(r.label)}</dt><dd>${t(r.value)}</dd></div>`).join(''),
    credits: () => copy.case.credits.items.map((c) => `<div><dt>${t(c.role)}</dt><dd>${t(c.who)}</dd></div>`).join(''),
    stories: () => copy.case.stories.map((s) => {
      const hasMedia = s.media && epById.has(s.media);
      const kind = s.id === 'shorts' ? 'shorts' : hasMedia ? 'film' : 'text';
      const flip = kind === 'film' && copy.case.stories.filter((x) => x.media).indexOf(s) % 2 === 1;
      const e = hasMedia ? epById.get(s.media) : null;
      const figsBelow = kind === 'film' && s.figures && s.figures.length > 1;
      const text = `<div class="story__text">
          <p class="kicker rv">${t(s.kicker)}</p>
          <h3 class="story__title rv">${t(s.title)}</h3>
          <p class="story__body rv">${t(s.body)}</p>
          ${figsBelow ? '' : figures(s)}
          ${s.result ? `<p class="story__result rv">${t(s.result)}</p>` : ''}
          ${s.caveat && !figsBelow ? `<p class="caveat rv"><b>${t(copy.ui.caveat)}.</b> ${t(s.caveat)}</p>` : ''}
          ${figsBelow ? '' : `<p class="src rv"><span>${t(copy.ui.source)}:</span> ${t(s.source)}</p>`}
        </div>`;
      if (kind === 'film') {
        const ttl = epName(e);
        const hosts = s.id === 'comeback' ? L(copy.ui.hosts_caption, lang) : '';
        const below = figsBelow ? `<div class="story__below">${figures(s)}${s.caveat ? `<p class="caveat rv"><b>${t(copy.ui.caveat)}.</b> ${t(s.caveat)}</p>` : ''}<p class="src rv"><span>${t(copy.ui.source)}:</span> ${t(s.source)}</p></div>` : '';
        return `<article class="story story--film${flip ? ' story--flip' : ''}" id="story-${s.id}">
          ${text}
          <figure class="story__media rv">${film(s.media, { big: true })}
            <figcaption><span class="story__name">${esc(ttl.main)}</span>${ttl.sub ? ` <span class="story__sub">${esc(ttl.sub)}</span>` : ''}<span class="story__meta">${esc(L(e.date_label, lang))} · ${esc(durationLabel(e.duration))} · ${esc(L(e.views_label, lang))} ${esc(L(copy.case.episodes.views_label, lang))} ${t(copy.ui.views_as_of)}</span>${hosts ? `<span class="story__hosts">${esc(hosts)}</span>` : ''}</figcaption>
          </figure>
          ${below}
        </article>`;
      }
      if (kind === 'shorts') return `<article class="story story--shorts" id="story-${s.id}">${text}${shortsRail()}</article>`;
      return `<article class="story story--text" id="story-${s.id}">${text}</article>`;
    }).join('\n'),
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
        return { m, a, mp4, poster: pw || pj, epTitle, sec };
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
            <span class="moment__play" aria-hidden="true">${icon.play}</span>
            <span class="moment__t"><span>${t(x.m.title)}</span><small>${esc(q(x.epTitle))}</small></span>
            <span class="moment__d">${dur(x.sec)}</span>
          </a></li>`).join('')}</ol>
      </div>`;
    },
    episodes: () => {
      const featured = new Set(copy.case.stories.map((s) => s.media).filter(Boolean));
      const list = episodes.filter((e) => !featured.has(e.id) && e.show !== false);
      return `<ul class="eps">${list.map((e) => {
        const ttl = epName(e);
        return `<li class="ep rv">${film(e.id)}
          <div class="ep__body">
            <p class="ep__meta"><span>${esc(L(e.date_label, lang))} · ${esc(durationLabel(e.duration))}</span><span class="ep__views"><b>${esc(L(e.views_label, lang))}</b> ${t(copy.case.episodes.views_label)}</span></p>
            <h3 class="ep__title"><span class="ep__name">${esc(ttl.main)}</span>${ttl.sub ? `<span class="ep__sub">${esc(ttl.sub)}</span>` : ''}</h3>
            <p class="ep__note">${t(e.note)}</p>
          </div>
        </li>`;
      }).join('')}</ul>`;
    },
    /* key figures as a sourced table; the complete ledger sits behind a disclosure */
    keyNumbers: () => {
      const rows = [];
      copy.case.platforms.forEach((g) => g.stats.filter((s) => s.key).forEach((s) => rows.push({ g, s })));
      return `<table class="keys">
        <thead><tr><th scope="col">${t(copy.ui.col_value)}</th><th scope="col">${t(copy.ui.col_what)}</th><th scope="col">${t(copy.ui.col_source)}</th></tr></thead>
        <tbody>${rows.map(({ g, s }) => `<tr class="rv"><td class="keys__v">${valueHTML(L(s.value, lang))}</td><td class="keys__w"><span class="keys__p">${t(g.name)}</span>${t(s.label)}</td><td class="keys__s">${t(s.source || g.source)}</td></tr>`).join('')}</tbody>
      </table>`;
    },
    platforms: () => copy.case.platforms.map((g) => `<section class="ledger" aria-labelledby="pl-${g.id}">
        <header class="ledger__head"><h4 id="pl-${g.id}">${t(g.name)}</h4><p class="ledger__src">${t(g.source)}</p></header>
        <dl class="ledger__rows">${g.stats.map((s) => `<div class="ledger__row"><dt>${t(s.label)}</dt><dd>${valueHTML(L(s.value, lang))}</dd></div>`).join('')}</dl>
      </section>`).join(''),
    audience: () => {
      const a = copy.case.audience;
      const pts = (list) => list.map((p) => `<div class="rv"><dt>${valueHTML(L(p.value, lang))}</dt><dd>${t(p.label)}</dd></div>`).join('');
      return `<div class="aud__core">
          <p class="aud__big rv">${t(a.core.value)}</p>
          <p class="aud__lbl rv">${t(a.core.label)}</p>
          ${a.demo && a.demo.length ? `<dl class="aud__pts aud__pts--demo">${pts(a.demo)}</dl>` : ''}
          ${a.demo_source ? `<p class="src rv"><span>${t(copy.ui.source)}:</span> ${t(a.demo_source)}</p>` : ''}
        </div>
        <div class="aud__side">
          <dl class="aud__pts">${pts(a.points)}</dl>
          <p class="src rv"><span>${t(copy.ui.source)}:</span> ${t(a.source)}</p>
        </div>`;
    },
    voices: () => {
      const v = copy.voices;
      return v.items.map((x) => `<figure class="voice rv"><blockquote lang="${lang}"><p>${esc(typo(x[lang], lang))}</p></blockquote><figcaption>${t(v.attribution)}</figcaption></figure>`).join('');
    },
    /* the track: one clip per stage, width by weight */
    processSteps: () => copy.process.steps.map((s) => {
      const w = Math.max(9, Math.min(16, Math.round((L(s.text, 'ru').length + L(s.tools, 'ru').length) / 11)));
      return `<li class="clip" style="--w:${w}"><span class="clip__n">${esc(s.n)}</span><span class="clip__t">${t(s.title)}</span></li>`;
    }).join(''),
    /* the stages as readable cards under the track (and the whole list on small screens) */
    processCards: () => copy.process.steps.map((s) => `<li class="stage rv">
        <span class="stage__n">${esc(s.n)}</span>
        <h3 class="stage__t">${t(s.title)}</h3>
        <p class="stage__p">${t(s.text)}</p>
        <p class="stage__tools"><span class="sr">${t(copy.process.tools_label)}: </span>${L(s.tools, lang).split(/,\s*/).map((x) => `<span>${esc(x)}</span>`).join('')}</p>
      </li>`).join(''),
    ruler: () => '',
    stageCount: () => { const n = copy.process.steps.length; return `${String(n).padStart(2, '0')} / ${String(n).padStart(2, '0')}`; },
    behind: () => copy.behind.items.filter((b) => b.asset && b.featured).map((b) => {
      const info = evidenceInfo(b.asset);
      if (!info) return '';
      const alt = info.alt ? L(info.alt, lang) : L(b.title, lang);
      return `<li class="bts__item rv">${lbLink(b, 'bts__link')}
          <span class="bts__frame">${simplePicture(`assets/${b.asset}`, plain(alt), P, info.w, info.h)}</span>
          <span class="bts__title">${t(b.title)}</span>
          <span class="bts__cap">${t(b.caption)}</span>
        </a></li>`;
    }).join(''),
    behindMore: () => {
      const rest = copy.behind.items.filter((b) => b.asset && !b.featured && evidenceInfo(b.asset));
      if (!rest.length) return '';
      return `<details class="more rv"><summary>${t(copy.ui.all_files)} <span class="more__n">${rest.length}</span></summary>
        <ul class="more__list">${rest.map((b) => `<li>${lbLink(b, 'more__link')}<span class="more__t">${t(b.title)}</span><span class="more__c">${t(b.caption)}</span></a></li>`).join('')}</ul>
      </details>`;
    },
    videography: () => media.assets.filter((a) => a.group === 'videography' && a.show !== false)
      .map((a) => `<li>${pictureFromVariants(a.variants, L(a.alt, lang), P, {})}</li>`).join(''),
    /* her own clips (content/copy.json videography.clips): muted loops at real size, shown only when files exist */
    vgClips: () => {
      const clips = (copy.videography.clips || []).filter((c) => c.file && assetExists(c.file));
      (copy.videography.clips || []).filter((c) => c.file && !assetExists(c.file)).forEach((c) => warnings.push(`Videography clip not found: docs/${c.file}`));
      if (!clips.length) return '';
      return `<ul class="vg__clips">${clips.map((c) => `<li class="rv"><figure><div class="vg__clip"><video src="${P}${c.file}"${c.poster && assetExists(c.poster) ? ` poster="${P}${c.poster}"` : ''} muted loop playsinline preload="none" data-autoloop aria-label="${t(c.title)}"></video></div>${c.title ? `<figcaption>${t(c.title)}</figcaption>` : ''}</figure></li>`).join('')}</ul>`;
    },
    vgProfile: () => {
      const pr = copy.videography.profile;
      if (!pr || !pr.url) return '';
      return ` · <a href="${esc(pr.url)}" target="_blank" rel="noopener">${t(pr.label)} <span aria-hidden="true">↗</span></a>`;
    },
    heroRole: () => L(copy.hero.role, lang).split(' · ').map((x) => `<span class="nw">${esc(x)}</span>`).join(' · '),
    deliverables: () => copy.videography.deliverables.map((d) => `<li>${t(d)}</li>`).join(''),
    skills: () => copy.skills.groups.map((g) => `<div class="roll__row rv"><dt>${t(g.title)}</dt><dd><ul class="chips">${g.items.map((i) => `<li>${t(i)}</li>`).join('')}</ul></dd></div>`).join(''),
    software: () => copy.skills.tools.items.map((x) => `<div><dt>${esc(x.name)}</dt><dd>${t(x.use)}</dd></div>`).join(''),
    gear: () => copy.skills.gear.items.map((x) => `<li>${t(x)}</li>`).join(''),
    ai: () => copy.skills.ai.items.map((x) => `<div><dt>${esc(x.name)}</dt><dd>${t(x.use)}</dd></div>`).join(''),
    aboutPhoto: () => {
      if (!V.photo) return '';
      return `<figure class="about__photo rv"><img src="${P}assets/photo.jpg" width="${V.photo.w}" height="${V.photo.h}" alt="${t(copy.hero.name)}" loading="lazy" decoding="async"></figure>`;
    },
    contactList: () => {
      const c = copy.contact;
      return `<li class="rv"><span>${t(c.telegram_label)}</span><a href="${esc(c.telegram_href)}" target="_blank" rel="noopener">${esc(c.telegram)}</a></li>
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
const photoFile = path.join(DOCS, 'assets/photo.jpg');
const photo = fs.existsSync(photoFile) ? jpegSize(photoFile) : null;

const tplHome = rd('src/index.html');
const tplCv = rd('src/cv.html');
const PDF = { ru: 'Alisa-Makarenko-CV-RU.pdf', en: 'Alisa-Makarenko-CV-EN.pdf' };

for (const lang of ['ru', 'en']) {
  // ---- home
  const P = lang === 'ru' ? '' : '../';
  const V = {
    lang, P, photo,
    selfHref: './',
    altHref: lang === 'ru' ? 'en/' : '../',
    altLang: lang === 'ru' ? 'en' : 'ru',
    altLangLabel: lang === 'ru' ? 'EN' : 'RU',
    cvPdf: `${P}cv/${PDF[lang]}`,
    cvPage: lang === 'ru' ? 'cv/' : 'cv/',
    hasPhoto: photo ? 'has-photo' : 'no-photo',
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
console.log(`Built docs/index.html, docs/en/index.html, docs/cv/index.html, docs/en/cv/index.html${photo ? ' (with portrait)' : ''}`);
for (const w of [...new Set(warnings)]) console.warn('  ! ' + w);
