/*
 * Site 2: Alisa Makarenko, videographer. Called from ../../build.mjs (one command builds both sites).
 *
 * Reads   content/video/copy.json   texts, RU and EN
 *         content/video/media.json  clips, posters, loops, stills, showreels (sizes, alt texts, groups)
 *         src/video/index.html, src/video/cv.html, src/video/styles.css, src/video/cv.css, src/video/main.js
 * Writes  docs/video/index.html        RU
 *         docs/video/en/index.html     EN
 *         docs/video/cv/index.html     RU CV (print page; PDF next to it)
 *         docs/video/en/cv/index.html  EN CV
 *         docs/video/css/*, docs/video/js/main.js
 *
 * Paths: P = from the page to docs/video/ (where media.json urls start), R = from the page to docs/ (site 1, brand icons).
 * The CV reuses site 1's docs/css/cv.css and adds docs/video/css/cv.css on top.
 */
import fs from 'node:fs';
import path from 'node:path';

export function buildVideo({ ROOT, DOCS, BASE, esc, typo, plain, finish, isPair, warnings }) {
  const VROOT = path.join(DOCS, 'video');
  const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
  const copy = JSON.parse(rd('content/video/copy.json'));
  const media = JSON.parse(rd('content/video/media.json'));
  const exists = (rel) => fs.existsSync(path.join(VROOT, rel));
  const L = (o, lang) => (isPair(o) ? typo(o[lang] ?? o.ru ?? '', lang) : (o ?? ''));
  const get = (obj, p) => p.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
  const NB = ' ';
  const VBASE = BASE ? `${BASE}video/` : '';
  const PDF = { ru: 'Alisa-Makarenko-Videographer-CV-RU.pdf', en: 'Alisa-Makarenko-Videographer-CV-EN.pdf' };
  const layout = media.layout || {};

  const pieces = media.pieces.filter((p) => p.show !== false && p.files && p.files.clip && exists(p.files.clip.url));
  media.pieces.filter((p) => p.show !== false && !(p.files && p.files.clip && exists(p.files.clip.url)))
    .forEach((p) => warnings.push(`Video site: clip file for "${p.id}" not found in docs/video/ — skipped.`));
  const stillById = new Map((media.stills || []).map((s) => [s.id, s]));
  const reel = (id) => (media.showreels || []).find((r) => r.id === id);

  const icon = {
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7.2v9.6l7.6-4.8z" fill="currentColor"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 7h2.4v10H8.5zM13.1 7h2.4v10h-2.4z" fill="currentColor"/></svg>',
    down: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.5v7M2.8 5.6 6 8.8l3.2-3.2M2 10.8h8" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
    ext: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 9 9 3M4.5 3H9v4.5" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
  };
  const tc = (s) => { const n = Math.round(s); return `0:${String(n).padStart(2, '0')}`; };

  /* still variants: NAME-480 / NAME-960 (scripts/video_stills_sizes.py) + the full file */
  function stillSet(s, ext) {
    const base = s.files.jpg.url.replace(/\.jpg$/, '');
    const full = s.files[ext === 'webp' ? 'webp' : 'jpg'];
    const list = [];
    for (const w of [480, 960]) if (exists(`${base}-${w}.${ext}`) && w < full.width) list.push([`${base}-${w}.${ext}`, w]);
    list.push([full.url, full.width]);
    return list;
  }
  function stillPicture(s, lang, P, { sizes, cls = '', lazy = true, alt } = {}) {
    const j = s.files.jpg;
    const set = (ext) => stillSet(s, ext).map(([u, w]) => `${P}${u} ${w}w`).join(', ');
    const small = stillSet(s, 'jpg')[0];
    return `<picture${cls ? ` class="${cls}"` : ''}><source type="image/webp" srcset="${set('webp')}" sizes="${sizes}"><img src="${P}${small[0]}" srcset="${set('jpg')}" sizes="${sizes}" width="${j.width}" height="${j.height}" alt="${esc(alt ?? L(s.alt, lang))}"${lazy ? ' loading="lazy"' : ''} decoding="async"></picture>`;
  }
  function posterPicture(p, lang, P, sizes) {
    const f = p.files;
    const list = (ext) => [f.poster_480, f.poster_960, f.poster].filter(Boolean).map((x) => `${P}${x[ext].url} ${x[ext].width}w`).join(', ');
    return `<picture><source type="image/webp" srcset="${list('webp')}" sizes="${sizes}"><img src="${P}${f.poster_480.jpg.url}" srcset="${list('jpg')}" sizes="${sizes}" width="${f.poster.jpg.width}" height="${f.poster.jpg.height}" alt="${esc(L(p.alt, lang))}" loading="lazy" decoding="async"></picture>`;
  }

  /* Chapter layouts. Wide screens (>= 700 px) use a 12-column grid, a different arrangement per chapter:
     film   (Hospitality)  vertical places side by side like a filmstrip, landscapes below at 7 + 5 columns
     mosaic (Lifestyle)    a large lead, a narrow vertical beside it, smaller frames under the lead
     pair   (Brands)       one wide and one tall piece, bottom-aligned
     coda   (Nature)       a cinemascope band with one frame beside it, then a row of three
     Phones (< 700 px) use 2 columns: landscapes full width; verticals in pairs; a lone single-frame vertical runs
     full width at 4:5 ("lead"); a lone stacked vertical (her three-band format, never cropped) runs at 72 % ("lone"). */
  const CH_LAYOUT = { hospitality: 'film', lifestyle: 'mosaic', brands: 'pair', nature: 'coda' };
  const isV = (p) => p.orientation === 'vertical';
  const isScope = (p) => p.files.clip.width / p.files.clip.height > 2;
  function placeCards(list, kind) {
    const H = list.filter((p) => !isV(p)), Vt = list.filter(isV);
    const sm = new Map();
    H.forEach((p) => sm.set(p, kind === 'coda' && !isScope(p) ? 'half' : 'full'));
    if (Vt.length % 2 === 0) Vt.forEach((p) => sm.set(p, 'half'));
    else {
      const lead = Vt.find((p) => !p.stacked) || Vt[0];
      Vt.forEach((p) => sm.set(p, p === lead ? (p.stacked ? 'lone' : 'lead') : 'half'));
    }
    if (kind === 'coda') { // the phone pairs need an even count: a leftover small frame runs full width
      const halves = H.filter((p) => sm.get(p) === 'half');
      if (halves.length % 2) sm.set(halves[halves.length - 1], 'full');
    }
    const out = [];
    const push = (p, g, span) => out.push({ p, g, span, smc: sm.get(p) });
    if (kind === 'film') {
      Vt.forEach((p) => push(p, 'f-v', 4));
      H.forEach((p, i, a) => (a.length - i === 1 && i % 2 === 0 ? push(p, 'f-h8', 8) : push(p, i % 2 ? 'f-h5' : 'f-h7', i % 2 ? 5 : 7)));
    } else if (kind === 'mosaic') {
      if (H[0]) push(H[0], 'm-lead', 8);
      if (Vt[0]) push(Vt[0], 'm-side', 3);
      H.slice(1).forEach((p) => push(p, 'm-small', 4));
      Vt.slice(1).forEach((p) => push(p, 'm-v', 3));
    } else if (kind === 'pair') {
      if (H[0]) push(H[0], 'p-wide', 8);
      if (Vt[0]) push(Vt[0], 'p-tall', 3);
      H.slice(1).forEach((p) => push(p, 'p-more', 6));
      Vt.slice(1).forEach((p) => push(p, 'p-more-v', 3));
    } else {
      // the cinemascope band opens the coda (full width on phones, so the small frames after it pair up)
      H.filter(isScope).forEach((p) => push(p, 'c-scope', 8));
      H.filter((p) => !isScope(p)).forEach((p, i) => push(p, i === 0 && out.length ? 'c-first' : 'c-third', 4));
      Vt.forEach((p) => push(p, 'c-v', 3));
    }
    return out;
  }
  const sizesFor = (span, smc) => {
    const sm = { full: '92vw', lead: '92vw', half: '46vw', lone: '66vw' }[smc] || '92vw';
    return `(max-width: 699px) ${sm}, (min-width: 1440px) ${Math.round((span / 12) * 1320)}px, ${Math.round((span / 12) * 92)}vw`;
  };

  function makeParts(lang, V) {
    const t = (o) => esc(L(o, lang));
    const P = V.P;
    const enAttr = lang === 'ru' ? ' lang="en"' : '';

    const card = ({ p, g, span, smc }) => {
      const f = p.files;
      const v = isV(p);
      const ar = `${f.clip.width}/${f.clip.height}`;
      const title = L(p.title, lang), cap = L(p.caption, lang);
      const dur = tc(p.duration || f.clip.duration);
      const label = `${L(copy.ui.watch, lang)}: ${plain(title)} (${dur}, ${L(copy.ui.silent, lang)})`;
      const lg = f.loop_lg ? ` data-loop-lg="${P}${f.loop_lg.url}"` : '';
      return `<li class="pc pc--${v ? 'v' : 'h'}${p.stacked ? ' pc--stacked' : ''}${isScope(p) ? ' pc--scope' : ''} ${g} sm-${smc} rv">
        <a class="piece" href="${P}${f.clip.url}" data-piece data-group="${esc(p.group)}" data-src="${P}${f.clip.url}" data-loop="${P}${f.loop.url}"${lg} data-poster="${P}${(f.poster_960 || f.poster).webp.url}" data-w="${f.clip.width}" data-h="${f.clip.height}" data-title="${esc(plain(title))}" data-caption="${esc(plain(cap))}" data-dur="${dur}" aria-label="${esc(label)}">
          <span class="piece__frame" style="aspect-ratio:${ar}">${posterPicture(p, lang, P, sizesFor(span, smc))}<span class="piece__play" aria-hidden="true">${icon.play}</span><span class="piece__tc" aria-hidden="true">${dur}</span></span>
          <span class="piece__meta"><span class="piece__t">${esc(title)}</span><span class="piece__c">${esc(cap)}</span></span>
        </a>
      </li>`;
    };

    const chapter = (id, head, info, kicker) => {
      const list = pieces.filter((p) => p.group === id);
      if (!list.length) return '';
      const kind = CH_LAYOUT[id] || 'coda';
      const cards = placeCards(list, kind).map(card).join('');
      return `<section class="ch ch--${kind}" id="ch-${id}" aria-labelledby="ch-${id}-t" data-kicker="${esc(plain(kicker))}">
        <header class="ch__head">${head}</header>
        <ul class="ch__media">${cards}</ul>
        ${info ? `<div class="ch__info rv">${info}</div>` : ''}
      </section>`;
    };

    const reelW = reel('showreel-wide'), reelV = reel('showreel-vertical');
    const parts = {
      nav: () => [['showreel', 'showreel'], ['work', 'directions'], ['approach', 'approach'], ['stills', 'stills'], ['formats', 'formats'], ['about', 'about'], ['contact', 'contact']]
        .map(([h, k]) => `<a href="#${h}">${t(copy.nav[k])}</a>`).join(''),
      heroName: () => {
        const n = L(copy.hero.name, lang).split(/[  ]/);
        return `<span class="line"><span>${esc(n[0])}</span></span> <span class="line line--2"><span>${esc(n.slice(1).join(' '))}</span></span>`;
      },
      heroMedia: () => {
        const w = reel('hero-wide'), v = reel('hero-vertical');
        const wp = w.files.poster, ws = w.files.poster_small, vp = v.files.poster;
        return `<picture class="hero__poster">
          <source media="(orientation: portrait)" type="image/webp" srcset="${P}${vp.webp.url}">
          <source media="(orientation: portrait)" srcset="${P}${vp.jpg.url}">
          <source type="image/webp" srcset="${P}${ws.webp.url} ${ws.webp.width}w, ${P}${wp.webp.url} ${wp.webp.width}w" sizes="100vw">
          <img src="${P}${wp.jpg.url}" srcset="${P}${ws.jpg.url} ${ws.jpg.width}w, ${P}${wp.jpg.url} ${wp.jpg.width}w" sizes="100vw" width="${wp.jpg.width}" height="${wp.jpg.height}" alt="" fetchpriority="high" decoding="async">
        </picture>
        <video class="hero__video" muted loop playsinline preload="none" aria-hidden="true" tabindex="-1" width="${w.files.video.width}" height="${w.files.video.height}" data-wide="${P}${w.files.video.url}" data-tall="${P}${v.files.video.url}"></video>`;
      },
      reelAttrs: () => {
        const w = reelW, v = reelV;
        return `href="${P}${w.files.video.url}" data-reel data-src="${P}${w.files.video.url}" data-src-tall="${P}${v.files.video.url}" data-poster="${P}${w.files.poster_small.webp.url}" data-poster-tall="${P}${v.files.poster_small.webp.url}" data-w="${w.files.video.width}" data-h="${w.files.video.height}" data-w-tall="${v.files.video.width}" data-h-tall="${v.files.video.height}" data-title="${t(copy.ui.showreel_title)}" data-caption="${t(copy.ui.showreel_note)}" data-dur="${tc(w.files.video.duration)}" data-dur-tall="${tc(v.files.video.duration)}"`;
      },
      reelFrame: () => {
        const w = reelW, v = reelV;
        const wp = w.files.poster, ws = w.files.poster_small, vs = v.files.poster_small;
        const dur = tc(w.files.video.duration);
        return `<a class="reel__frame rv" ${parts.reelAttrs()} aria-label="${t(copy.ui.play_reel)} (${dur})">
        <span class="reel__media"><picture>
          <source media="(max-width: 599px)" type="image/webp" srcset="${P}${vs.webp.url}">
          <source media="(max-width: 599px)" srcset="${P}${vs.jpg.url}">
          <source type="image/webp" srcset="${P}${ws.webp.url} ${ws.webp.width}w, ${P}${wp.webp.url} ${wp.webp.width}w" sizes="(max-width: 899px) 92vw, 64vw">
          <img src="${P}${ws.jpg.url}" srcset="${P}${ws.jpg.url} ${ws.jpg.width}w, ${P}${wp.jpg.url} ${wp.jpg.width}w" sizes="(max-width: 899px) 92vw, 64vw" width="${wp.jpg.width}" height="${wp.jpg.height}" alt="" loading="lazy" decoding="async">
        </picture></span>
        <span class="reel__badge" aria-hidden="true"><span class="reel__play">${icon.play}</span><span class="reel__label">${t(copy.ui.play_reel)}</span><span class="reel__tc">${dur}</span></span>
      </a>`;
      },
      approachStill: () => {
        const s = stillById.get(layout.approach_still);
        return s ? `<figure class="ap__still">${stillPicture(s, lang, P, { sizes: '(max-width: 899px) 92vw, 36vw' })}</figure>` : '';
      },
      approach: () => copy.approach.items.map((it) => `<li class="ap__item rv"><h3 class="ap__t">${t(it.title)}</h3><p class="ap__p">${t(it.text)}</p></li>`).join(''),
      chapters: () => {
        const d = copy.directions;
        const items = d.items.map((it) => chapter(it.id, `
          <h3 class="ch__title rv" id="ch-${it.id}-t"${enAttr}>${t(it.title)}</h3>
          <p class="ch__sub rv">${t(it.subtitle)}</p>
          ${it.shown ? `<p class="ch__shown rv"><span class="label">${t(d.shown_label)}</span>${t(it.shown)}</p>` : ''}`,
          `<p class="ch__for"><span class="label">${t(d.for_label)}</span>${t(it.for)}</p>
          <div class="ch__deliver"><span class="label">${t(d.deliver_label)}</span><ul>${it.deliver.map((x) => `<li>${t(x)}</li>`).join('')}</ul></div>`,
          lang === 'ru' ? L(it.subtitle, lang) : L(it.title, lang)));
        const pr = d.personal;
        if (pr) items.push(chapter(pr.id, `
          <h3 class="ch__title ch__title--sm rv" id="ch-${pr.id}-t">${t(pr.title)}</h3>
          <p class="ch__sub rv">${t(pr.text)}</p>`, '', L(pr.title, lang)));
        return items.join('\n');
      },
      stills: () => {
        const rows = layout.gallery_rows || [];
        let k = 0;
        const n = rows.reduce((a, r) => a + r.filter((id) => stillById.has(id)).length, 0);
        // phones show a 2-column contact sheet: the first frame (and the last, when the rest is odd) runs full width
        const wideSm = (i) => i === 0 || ((n - 1) % 2 === 1 && i === n - 1);
        return rows.map((row) => {
          const list = row.map((id) => stillById.get(id)).filter(Boolean);
          const total = list.reduce((a, s) => a + s.files.jpg.width / s.files.jpg.height, 0);
          return `<div class="gal__row">${list.map((s) => {
            const j = s.files.jpg, r = j.width / j.height, i = k++;
            const share = Math.round((r / total) * 100);
            const big = s.files.webp.width >= j.width ? s.files.webp : j;
            return `<a class="gal__item rv${r < 1 ? ' is-tall' : ''}${wideSm(i) ? ' is-wide-sm' : ''}" style="flex:${r.toFixed(4)} 1 0" href="${P}${j.url}" data-lb data-i="${i}" data-full="${P}${big.url}" data-full-jpg="${P}${j.url}" data-w="${j.width}" data-h="${j.height}" data-alt="${esc(plain(L(s.alt, lang)))}">
              ${stillPicture(s, lang, P, { sizes: `(max-width: 699px) ${wideSm(i) ? 92 : 46}vw, ${Math.max(20, share)}vw` })}
            </a>`;
          }).join('')}</div>`;
        }).join('');
      },
      formats: () => copy.formats.items.map((x) => `<li class="fm rv"><h3 class="fm__t">${t(x.title)}</h3><p class="fm__p">${t(x.text)}</p></li>`).join(''),
      steps: () => copy.process.steps.map((s) => `<li class="st rv"><span class="st__n">${esc(s.n)}</span><h4 class="st__t">${t(s.title)}</h4><p class="st__p">${t(s.text)}</p></li>`).join(''),
      aboutPhoto: () => (V.photo ? `<figure class="about__photo rv"><img src="${V.R}assets/photo.jpg" width="${V.photo.w}" height="${V.photo.h}" alt="${t(copy.hero.name)}" loading="lazy" decoding="async"></figure>` : ''),
      instaStrip: () => (layout.instagram_strip || []).map((id) => stillById.get(id)).filter(Boolean)
        .map((s) => `<span class="ig__tile">${stillPicture(s, lang, P, { sizes: '(max-width: 699px) 30vw, 14vw', alt: '' })}</span>`).join(''),
      contactList: () => {
        const c = copy.contact;
        const row = (label, href, val, ext) => `<li class="rv"><span>${t(label)}</span><a href="${esc(href)}"${ext ? ' target="_blank" rel="noopener"' : ''}>${val}</a></li>`;
        return [
          row(c.telegram_label, c.telegram_href, esc(c.telegram), true),
          row(c.instagram_label, c.instagram_href, esc(c.instagram), true),
          row(c.email_label, c.email_href, esc(c.email)),
          row(c.phone_label, c.phone_href, esc(c.phone).replace(/ /g, NB)),
        ].join('');
      },
      iconDown: () => icon.down,
      iconPlay: () => icon.play,
      iconPause: () => icon.pause,
      iconExt: () => icon.ext,

      /* ---------- CV ---------- */
      cvContacts: () => {
        const c = copy.cv.contacts;
        const site = VBASE ? `<li class="cv__site"><a href="${VBASE}${lang === 'en' ? 'en/' : ''}">${esc(VBASE.replace(/^https?:\/\//, '').replace(/\/$/, ''))}${lang === 'en' ? '/en' : ''}</a></li>` : '';
        return `${site}
        <li><a href="tel:${c.phone.replace(/[^+\d]/g, '')}">${esc(c.phone).replace(/ /g, NB)}</a></li>
        <li><a href="${esc(c.telegram_url)}">Telegram ${esc(c.telegram)}</a></li>
        <li><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></li>
        <li><a href="${esc(copy.contact.instagram_href)}">Instagram ${esc(copy.contact.instagram)}</a></li>`;
      },
      cvStrip: () => {
        const list = (layout.cv_strip || []).map((id) => stillById.get(id)).filter(Boolean);
        if (!list.length) return '';
        return `<figure class="cv__strip" aria-label="${t(copy.cv.labels.stills)}">${list.map((s) => {
          const sm = stillSet(s, 'jpg')[0];
          return `<img src="${V.P}${sm[0]}" width="${sm[1]}" height="${Math.round(sm[1] * s.files.jpg.height / s.files.jpg.width)}" alt="${esc(L(s.alt, lang))}">`;
        }).join('')}</figure>`;
      },
      cvDirections: () => copy.cv.directions.map((d) => `<li><b${enAttr}>${t(d.title)}</b> <span>— ${t(d.text)}</span></li>`).join(''),
      cvExp: () => copy.cv.experience.map((x) => `<div class="cv__job">
        <h3>${t(x.project)}</h3>
        <p class="cv__role"><b>${t(x.role)}</b>${L(x.period, lang) ? `<span>${t(x.period)}</span>` : ''}</p>
        <ul class="cv__bullets">${x.bullets.map((b) => `<li>${t(b)}</li>`).join('')}</ul>
      </div>`).join(''),
      cvSkillsLine: () => copy.cv.skills.map((s) => t(s)).join(' · '),
      cvLinks: () => copy.cv.links.map((l) => {
        const url = lang === 'en' && l.url_en ? l.url_en : l.url;
        const disp = lang === 'en' && l.url_en ? `${l.display}/en` : l.display;
        return `<li><span>${t(l.label)}:</span> <a href="${esc(url)}">${esc(disp)}</a></li>`;
      }).join(''),
      cvPhoto: () => (V.photo ? `<img class="cv__photo" src="${V.R}assets/photo.jpg" width="${V.photo.w}" height="${V.photo.h}" alt="${t(copy.cv.name)}">` : ''),
    };
    return parts;
  }

  function head(lang, V, { title, description, cv = false }) {
    const altLang = lang === 'ru' ? 'en' : 'ru';
    const selfRel = cv ? (lang === 'ru' ? 'cv/' : 'en/cv/') : (lang === 'ru' ? '' : 'en/');
    const altRel = cv ? (lang === 'ru' ? 'en/cv/' : 'cv/') : (lang === 'ru' ? 'en/' : '');
    const abs = (rel) => (VBASE ? VBASE + rel : null);
    const og = media.og[lang] || media.og.ru;
    const ogUrl = abs(og.url) ?? V.P + og.url;
    const fonts = 'https://fonts.googleapis.com/css2?family=Cormorant:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Golos+Text:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap';
    return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(plain(description))}">
<meta name="theme-color" content="#110c0a">
<meta name="color-scheme" content="${cv ? 'light' : 'dark'}">
${VBASE ? `<link rel="canonical" href="${VBASE}${selfRel}">\n` : ''}<link rel="alternate" hreflang="${lang}" href="${abs(selfRel) ?? V.selfHref}">
<link rel="alternate" hreflang="${altLang}" href="${abs(altRel) ?? V.altHref}">
<link rel="alternate" hreflang="x-default" href="${abs(cv ? 'cv/' : '') ?? (lang === 'ru' ? V.selfHref : V.altHref)}">
<meta property="og:type" content="website">
<meta property="og:locale" content="${lang === 'ru' ? 'ru_RU' : 'en_US'}">
<meta property="og:locale:alternate" content="${lang === 'ru' ? 'en_US' : 'ru_RU'}">
<meta property="og:title" content="${esc(plain(L(copy.meta.og_title, lang)))}">
<meta property="og:description" content="${esc(plain(L(copy.meta.og_description, lang)))}">
<meta property="og:image" content="${ogUrl}">
<meta property="og:image:width" content="${og.width}">
<meta property="og:image:height" content="${og.height}">
<meta property="og:image:alt" content="${esc(plain(L(copy.meta.og_image_alt, lang)) || og.alt)}">
${VBASE ? `<meta property="og:url" content="${VBASE}${selfRel}">\n` : ''}<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(plain(L(copy.meta.og_title, lang)))}">
<meta name="twitter:description" content="${esc(plain(L(copy.meta.og_description, lang)))}">
<meta name="twitter:image" content="${ogUrl}">
<link rel="icon" href="${V.R}assets/brand/favicon.svg" type="image/svg+xml">
<link rel="icon" href="${V.R}assets/brand/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="${V.R}assets/brand/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${fonts}">`;
  }

  function render(tpl, lang, V, parts) {
    return tpl.replace(/\{\{\s*(t|v|part):([\w.\-]+)\s*\}\}/g, (m, kind, key) => {
      if (kind === 't') {
        const val = get(copy, key);
        if (val === undefined) { warnings.push(`Video site: missing text ${key}`); return ''; }
        return esc(L(val, lang));
      }
      if (kind === 'v') {
        if (!(key in V)) { warnings.push(`Video site: missing variable ${key}`); return ''; }
        return V[key];
      }
      if (!parts[key]) { warnings.push(`Video site: missing block ${key}`); return ''; }
      return parts[key]();
    });
  }
  const write = (rel, html) => {
    const f = path.join(VROOT, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, finish(html));
  };

  const photoFile = path.join(DOCS, 'assets/photo.jpg');
  const photo = fs.existsSync(photoFile) ? (() => {
    const b = fs.readFileSync(photoFile); let i = 2;
    while (i < b.length) { if (b[i] !== 0xff) { i++; continue; } const mk = b[i + 1]; const len = b.readUInt16BE(i + 2); if (mk >= 0xc0 && mk <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(mk)) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) }; i += 2 + len; }
    return { w: 800, h: 1000 };
  })() : null;

  const tplHome = rd('src/video/index.html');
  const tplCv = rd('src/video/cv.html');
  for (const lang of ['ru', 'en']) {
    const en = lang === 'en';
    const P = en ? '../' : '';
    const R = en ? '../../' : '../';
    const V = {
      lang, P, R, photo,
      selfHref: './',
      altHref: en ? '../' : 'en/',
      altLang: en ? 'ru' : 'en',
      altLangLabel: en ? 'RU' : 'EN',
      langLabel: en ? 'EN' : 'RU',
      cvPdf: `${P}cv/${PDF[lang]}`,
      cvPage: en ? 'cv/' : 'cv/',
      site1: en ? `${R}en/` : R,
      hasPhoto: photo ? 'has-photo' : 'no-photo',
      tg: esc(copy.contact.telegram_href),
      ig: esc(copy.contact.instagram_href),
      ruHref: en ? '../' : './',
      enHref: en ? './' : 'en/',
      ruCurrent: en ? '' : ' aria-current="page"',
      enCurrent: en ? ' aria-current="page"' : '',
    };
    const parts = makeParts(lang, V);
    V.head = head(lang, V, { title: L(copy.meta.title, lang), description: L(copy.meta.description, lang) });
    write(en ? 'en/index.html' : 'index.html', render(tplHome, lang, V, parts));

    const PC = en ? '../../' : '../';
    const VC = {
      lang, P: PC, R: en ? '../../../' : '../../', photo,
      selfHref: './',
      altHref: en ? '../../cv/' : '../en/cv/',
      altLang: en ? 'ru' : 'en',
      altLangLabel: en ? 'RU' : 'EN',
      homeHref: '../',
      cvPdf: en ? `../../cv/${PDF.en}` : PDF.ru,
      hasPhoto: photo ? 'has-photo' : 'no-photo',
    };
    const partsC = makeParts(lang, VC);
    VC.head = head(lang, VC, { title: L(copy.cv.doc_title, lang), description: L(copy.cv.summary, lang), cv: true });
    write(en ? 'en/cv/index.html' : 'cv/index.html', render(tplCv, lang, VC, partsC));
  }

  fs.mkdirSync(path.join(VROOT, 'css'), { recursive: true });
  fs.mkdirSync(path.join(VROOT, 'js'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'src/video/styles.css'), path.join(VROOT, 'css/video.css'));
  fs.copyFileSync(path.join(ROOT, 'src/video/cv.css'), path.join(VROOT, 'css/cv.css'));
  fs.copyFileSync(path.join(ROOT, 'src/video/main.js'), path.join(VROOT, 'js/main.js'));
  for (const p of Object.values(PDF)) {
    if (!fs.existsSync(path.join(VROOT, 'cv', p))) warnings.push(`docs/video/cv/${p} is missing: run "node scripts/pdf.mjs" to create it.`);
  }
  return ['docs/video/index.html', 'docs/video/en/index.html', 'docs/video/cv/index.html', 'docs/video/en/cv/index.html'];
}
