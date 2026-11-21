/* Alisa Makarenko — videographer. Progressive enhancement only: without this file every poster, text and link works,
   and each card links straight to its mp4 (the browser plays it with native controls).
   Video budget: nothing but posters until needed. The hero loop starts after the page has loaded; card loops start only
   on hover (mouse) or after a card has stayed in view for a moment (touch); at most 3 loops play at once and a loop that
   leaves the screen on a touch device is released; large cards get the sharper -lg loop. Full clips: see "full clips" below.
   prefers-reduced-motion or Save-Data: posters only, the hero offers a play button. */
(() => {
  const root = document.documentElement;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const saveData = !!(navigator.connection && navigator.connection.saveData);
  const autoVideo = !reduce && !saveData;
  if (!reduce && 'IntersectionObserver' in window) root.classList.add('motion');
  const safePlay = (v) => { const p = v.play(); return p && p.catch ? p.catch(() => {}) : Promise.resolve(); };

  document.querySelectorAll('[data-setlang]').forEach((a) => a.addEventListener('click', () => {
    try { localStorage.setItem('am-lang', a.dataset.setlang); } catch (e) { /* storage blocked */ }
  }));

  /* ---------- header ---------- */
  const bar = document.querySelector('.bar');
  const onScroll = () => bar && bar.classList.toggle('is-solid', window.scrollY > 24);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  const menu = document.querySelector('.menu');
  if (menu) {
    menu.addEventListener('click', (e) => { if (e.target.closest('a')) menu.removeAttribute('open'); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu.open) { menu.removeAttribute('open'); menu.querySelector('summary').focus(); } });
    document.addEventListener('click', (e) => { if (menu.open && !menu.contains(e.target)) menu.removeAttribute('open'); });
  }

  /* ---------- reveal ---------- */
  if (root.classList.contains('motion')) {
    const items = [...document.querySelectorAll('.rv')];
    const vh = window.innerHeight;
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (!en.isIntersecting) return;
      const el = en.target;
      const sibs = [...el.parentElement.children].filter((c) => c.classList.contains('rv-wait') && !c.classList.contains('in'));
      el.style.transitionDelay = Math.min(Math.max(sibs.indexOf(el), 0), 4) * 90 + 'ms';
      el.classList.add('in');
      io.unobserve(el);
    }), { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });
    items.forEach((el) => { if (el.getBoundingClientRect().top > vh) { el.classList.add('rv-wait'); io.observe(el); } });
    window.addEventListener('beforeprint', () => items.forEach((el) => el.classList.add('in')));
  }

  /* ---------- hero: poster paints first, the loop is attached after load ---------- */
  const hero = document.querySelector('[data-hero]');
  const heroCtl = { pause() {}, resume() {} };
  if (hero) {
    const v = hero.querySelector('.hero__video');
    const btn = hero.querySelector('[data-hero-toggle]');
    let wanted = autoVideo, visible = true;
    const tall = () => window.matchMedia('(orientation: portrait)').matches;
    const attach = () => {
      const src = tall() ? v.dataset.tall : v.dataset.wide;
      if (v.dataset.current === src) return;
      v.dataset.current = src;
      v.preload = 'metadata';
      v.src = src;
    };
    const label = () => { if (btn) btn.setAttribute('aria-label', hero.classList.contains('is-playing') ? btn.dataset.pauseLabel : btn.dataset.playLabel); };
    const play = () => { attach(); safePlay(v); };
    v.addEventListener('playing', () => { hero.classList.add('is-playing'); label(); });
    v.addEventListener('pause', () => { hero.classList.remove('is-playing'); label(); });
    if (btn) {
      btn.addEventListener('click', () => {
        wanted = !hero.classList.contains('is-playing');
        if (wanted) play(); else v.pause();
      });
    }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((es) => es.forEach((e) => {
        visible = e.isIntersecting;
        if (!visible) v.pause(); else if (wanted && v.src) safePlay(v);
      }), { threshold: 0.05 }).observe(hero);
    }
    window.matchMedia('(orientation: portrait)').addEventListener('change', () => { if (v.src) { const was = !v.paused; attach(); if (was) safePlay(v); } });
    // the player pauses the background loop while it is open and resumes it on close (unless the visitor paused it)
    heroCtl.pause = () => { heroCtl.was = !v.paused; v.pause(); };
    heroCtl.resume = () => { if (heroCtl.was && wanted && visible) safePlay(v); heroCtl.was = false; };
    const go = () => { if (wanted && visible) play(); };
    if (document.readyState === 'complete') setTimeout(go, 200); else window.addEventListener('load', () => setTimeout(go, 200), { once: true });
  }

  /* ---------- card loops ---------- */
  const cards = [...document.querySelectorAll('[data-piece]')];
  const MAX = 3;
  const playing = [];
  const stopLoop = (a, release) => {
    const li = a.closest('.pc');
    li.classList.remove('is-looping');
    if (a._v) {
      a._v.pause();
      // touch: a loop that scrolled away gives its memory and connection back; it is re-created if the card returns
      if (release) { a._v.removeAttribute('src'); a._v.load(); a._v.remove(); a._v = null; }
    }
    const k = playing.indexOf(a); if (k > -1) playing.splice(k, 1);
  };
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const startLoop = (a) => {
    const li = a.closest('.pc');
    if (!a._v) {
      const v = document.createElement('video');
      v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'metadata';
      v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('aria-hidden', 'true'); v.tabIndex = -1;
      const frame = a.querySelector('.piece__frame');
      const big = a.dataset.loopLg && frame.getBoundingClientRect().width * dpr > 560;
      v.src = big ? a.dataset.loopLg : a.dataset.loop;
      frame.appendChild(v);
      a._v = v;
      v.addEventListener('playing', () => { if (playing.includes(a)) li.classList.add('is-looping'); });
    }
    const k = playing.indexOf(a); if (k > -1) playing.splice(k, 1);
    playing.push(a);
    while (playing.length > MAX) stopLoop(playing[0], !canHover);
    safePlay(a._v);
  };
  if (autoVideo && cards.length) {
    if (canHover) {
      cards.forEach((a) => {
        let t = 0;
        const on = () => { clearTimeout(t); t = setTimeout(() => startLoop(a), 140); };
        const off = () => { clearTimeout(t); stopLoop(a); };
        a.addEventListener('mouseenter', on); a.addEventListener('mouseleave', off);
        a.addEventListener('focus', on); a.addEventListener('blur', off);
      });
    } else if ('IntersectionObserver' in window) {
      // a loop starts only after the card has stayed 70 % in view for half a second, so a fast fling downloads nothing
      const io2 = new IntersectionObserver((es) => es.forEach((e) => {
        const a = e.target;
        clearTimeout(a._t);
        if (e.intersectionRatio >= 0.7) a._t = setTimeout(() => startLoop(a), 550);
        else stopLoop(a, !e.isIntersecting);
      }), { threshold: [0, 0.7] });
      cards.forEach((a) => io2.observe(a));
    }
  }

  /* ---------- dialogs: focus trap + restore ---------- */
  const focusables = (box) => [...box.querySelectorAll('button, a[href], video[controls], [tabindex]:not([tabindex="-1"])')].filter((el) => !el.hidden && !el.closest('[hidden]') && el.getClientRects().length > 0);
  const openDialog = (dlg, onClose) => {
    const opener = document.activeElement;
    const trap = (e) => {
      if (e.key !== 'Tab') return;
      const f = focusables(dlg);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    const click = (e) => { if (e.target === dlg || e.target.closest('[data-close]')) dlg.close(); };
    dlg.addEventListener('keydown', trap);
    dlg.addEventListener('click', click);
    dlg.addEventListener('close', () => {
      dlg.removeEventListener('keydown', trap); dlg.removeEventListener('click', click);
      document.body.style.overflow = '';
      if (onClose) onClose();
      if (opener && opener.focus) opener.focus({ preventScroll: true });
    }, { once: true });
    document.body.style.overflow = 'hidden';
    dlg.showModal();
    const c = dlg.querySelector('[data-close]');
    if (c) c.focus();
  };

  /* ---------- full clips: a light copy by default, warmed up before the click ----------
     Each clip has a light "-sd" copy (720p, about 1.5 Mbit/s). The full-size file is used only on a large screen with a
     measurably fast connection. Clips start loading before anyone asks: the showreel right after the page has loaded,
     a card's clip when the card comes near the screen, and at once on hover / touch. The player then reuses the very
     same <video> element, so whatever has been buffered plays immediately. */
  const fastNet = () => {
    const c = navigator.connection;
    if (c && (c.saveData || (c.effectiveType && c.effectiveType !== '4g') || (c.downlink && c.downlink < 5))) return false;
    let bytes = 0, ms = 0;
    performance.getEntriesByType('resource').forEach((e) => {
      if (e.transferSize > 80000 && e.responseStart > 0 && e.responseEnd > e.responseStart) { bytes += e.transferSize; ms += e.responseEnd - e.responseStart; }
    });
    return ms > 0 && bytes / ms > 600; // faster than ~5 Mbit/s over what the page has already downloaded
  };
  let fast = null; // decided once, so a warmed-up clip is the one the player opens
  const isFast = () => (fast === null ? (fast = fastNet()) : fast);
  const pick = (a) => {
    const portrait = a.hasAttribute('data-reel') && window.matchMedia('(orientation: portrait)').matches;
    const d = a.dataset;
    const hd = portrait ? d.srcTall : d.src, sd = portrait ? d.srcTallSd : d.srcSd;
    const bigScreen = Math.min(window.innerWidth, 1180) * Math.min(window.devicePixelRatio || 1, 2) > 1100;
    return {
      portrait,
      src: sd && !(bigScreen && isFast()) ? sd : hd,
      w: +(portrait ? d.wTall : d.w), h: +(portrait ? d.hTall : d.h),
      poster: portrait ? d.posterTall : d.poster,
    };
  };
  const pool = new Map(); // src -> <video>, kept between openings so the buffer survives
  const POOL_MAX = canHover ? 24 : 8;
  let current = null;
  const bufferedEnd = (v) => {
    const b = v.buffered, t = v.currentTime;
    for (let k = 0; k < b.length; k++) if (b.start(k) <= t + 0.25 && b.end(k) >= t) return b.end(k);
    return 0;
  };
  const getVideo = (src) => {
    let v = pool.get(src);
    if (v) { pool.delete(src); pool.set(src, v); return v; }
    v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto';
    v.setAttribute('playsinline', ''); v.setAttribute('muted', '');
    v.src = src;
    pool.set(src, v);
    for (const [k, old] of pool) {
      if (pool.size <= POOL_MAX) break;
      if (old === current || old === v) continue;
      old.removeAttribute('src'); old.load(); pool.delete(k);
    }
    return v;
  };
  // warm-up queue: two clips at a time; a clip is "warm" once about 6 s are buffered
  const queue = []; let active = 0;
  const pump = () => {
    while (active < 2 && queue.length) {
      const a = queue.shift();
      const v = getVideo(pick(a).src);
      if (v._warm) continue;
      v._warm = true; active++;
      let done = false;
      const fin = () => { if (done) return; done = true; active--; clearTimeout(tm); v.removeEventListener('progress', chk); v.removeEventListener('canplaythrough', fin); v.removeEventListener('error', fin); pump(); };
      const chk = () => { if (v.duration && bufferedEnd(v) >= Math.min(6, v.duration - 0.2)) fin(); };
      const tm = setTimeout(fin, 12000);
      v.addEventListener('progress', chk); v.addEventListener('canplaythrough', fin); v.addEventListener('error', fin);
      chk();
    }
  };
  const warm = (a, now) => {
    if (saveData) return;
    if (now) { const v = getVideo(pick(a).src); v._warm = true; return; }
    if (!queue.includes(a)) queue.push(a);
    pump();
  };
  const pieces = [...document.querySelectorAll('[data-piece], [data-reel]')];
  if (!saveData && pieces.length) {
    pieces.forEach((a) => {
      const now = () => warm(a, true);
      a.addEventListener('pointerenter', now, { passive: true });
      a.addEventListener('touchstart', now, { passive: true });
      a.addEventListener('focus', now);
    });
    const start = () => {
      const reel = document.querySelector('[data-reel]');
      if (reel) warm(reel);
      if ('IntersectionObserver' in window) {
        const io3 = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { io3.unobserve(e.target); warm(e.target); } }), { rootMargin: '700px 0px' });
        cards.forEach((a) => io3.observe(a));
      }
    };
    if (document.readyState === 'complete') setTimeout(start, 1200); else window.addEventListener('load', () => setTimeout(start, 1200), { once: true });
  }

  /* ---------- player: shows what has loaded, starts as soon as the first seconds are there ---------- */
  const pl = document.getElementById('player');
  if (pl && typeof pl.showModal === 'function') {
    const screen = pl.querySelector('[data-screen]');
    const kEl = pl.querySelector('[data-kicker]'), tEl = pl.querySelector('[data-title]'), cEl = pl.querySelector('[data-caption]');
    const nav = pl.querySelector('[data-nav]'), count = pl.querySelector('[data-count]');
    const loadEl = pl.querySelector('[data-load]'), loadTx = pl.querySelector('[data-load-text]');
    const bufEl = pl.querySelector('[data-buf]'), posEl = pl.querySelector('[data-pos]');
    let list = [], i = 0;
    const kicker = (a) => { const ch = a.closest('.ch'); return ch ? ch.dataset.kicker || '' : ''; };
    const paint = (v) => {
      if (v !== current) return;
      const d = v.duration || 0;
      const buf = d ? Math.min(1, bufferedEnd(v) / d) : 0;
      bufEl.style.width = buf * 100 + '%';
      posEl.style.width = (d ? Math.min(1, v.currentTime / d) : 0) * 100 + '%';
      // the label stays until playback can really move on: not enough data yet, or the player is waiting for more
      const stuck = !v.error && (v.readyState < 3 || v._waiting) && !(v.paused && v.readyState >= 3);
      loadEl.hidden = !stuck;
      if (stuck) loadTx.textContent = loadEl.dataset.text + (buf >= 0.01 && buf < 1 ? ' ' + Math.round(buf * 100) + ' %' : '');
    };
    const wire = (v) => {
      if (v._wired) return; v._wired = true;
      ['progress', 'timeupdate', 'loadedmetadata', 'canplay', 'seeking', 'seeked', 'error', 'pause'].forEach((n) => v.addEventListener(n, () => paint(v)));
      v.addEventListener('waiting', () => { v._waiting = true; paint(v); });
      v.addEventListener('playing', () => { v._waiting = false; paint(v); });
    };
    const park = () => {
      const v = current; current = null;
      if (v) { v.pause(); v.controls = false; v.remove(); }
      loadEl.hidden = true; bufEl.style.width = posEl.style.width = '0';
    };
    const load = (a) => {
      park();
      const o = pick(a);
      pl.classList.toggle('is-vertical', o.h > o.w);
      pl.classList.toggle('is-scope', o.w / o.h > 2);
      const v = getVideo(o.src);
      v._warm = true; v._waiting = false;
      wire(v);
      v.controls = true; v.loop = false; v.width = o.w; v.height = o.h;
      if (o.poster) v.poster = o.poster;
      v.setAttribute('aria-label', a.dataset.title || '');
      if (v.readyState > 0 && v.currentTime > 0) { try { v.currentTime = 0; } catch (e) { /* not seekable yet */ } }
      current = v;
      screen.replaceChildren(v);
      safePlay(v);
      paint(v);
      kEl.textContent = a.hasAttribute('data-reel') ? '' : kicker(a);
      kEl.hidden = !kEl.textContent;
      tEl.textContent = a.dataset.title || '';
      cEl.textContent = [a.dataset.caption, o.portrait && a.dataset.durTall ? a.dataset.durTall : a.dataset.dur].filter(Boolean).join(' · ');
      nav.hidden = list.length < 2;
      count.textContent = `${i + 1} / ${list.length}`;
      // the neighbours are the likeliest next clicks
      if (list.length > 1) { warm(list[(i + 1) % list.length]); warm(list[(i - 1 + list.length) % list.length]); }
    };
    const go = (d) => { if (list.length < 2) return; i = (i + d + list.length) % list.length; load(list[i]); };
    pl.querySelector('[data-prev]').addEventListener('click', () => go(-1));
    pl.querySelector('[data-next]').addEventListener('click', () => go(1));
    pl.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'VIDEO') return; // the native player uses arrows to seek
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    });
    document.addEventListener('click', (e) => {
      const a = e.target.closest('[data-piece], [data-reel]');
      if (!a || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      if (a.hasAttribute('data-reel')) { list = [a]; i = 0; }
      else { list = cards.filter((c) => c.dataset.group === a.dataset.group); i = Math.max(0, list.indexOf(a)); }
      playing.slice().forEach((x) => stopLoop(x));
      heroCtl.pause();
      load(list[i]);
      openDialog(pl, () => { park(); heroCtl.resume(); });
    });
  }

  /* ---------- lightbox for stills ---------- */
  const lb = document.getElementById('lightbox');
  const shots = [...document.querySelectorAll('[data-lb]')];
  if (lb && shots.length && typeof lb.showModal === 'function') {
    const box = lb.querySelector('[data-lb-img]'), cap = lb.querySelector('[data-lb-cap]'), n = lb.querySelector('[data-lb-count]');
    let i = 0;
    const show = (k) => {
      i = (k + shots.length) % shots.length;
      const a = shots[i];
      const pic = document.createElement('picture');
      if (/\.webp$/.test(a.dataset.full)) { const s = document.createElement('source'); s.type = 'image/webp'; s.srcset = a.dataset.full; pic.appendChild(s); }
      const img = document.createElement('img');
      img.src = a.dataset.fullJpg; img.alt = a.dataset.alt || ''; img.width = +a.dataset.w; img.height = +a.dataset.h;
      pic.appendChild(img);
      box.replaceChildren(pic);
      cap.textContent = a.dataset.alt || '';
      n.textContent = `${i + 1} / ${shots.length}`;
    };
    const key = (e) => { if (e.key === 'ArrowRight') { e.preventDefault(); show(i + 1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); show(i - 1); } };
    lb.querySelector('[data-prev]').addEventListener('click', () => show(i - 1));
    lb.querySelector('[data-next]').addEventListener('click', () => show(i + 1));
    shots.forEach((a, k) => a.addEventListener('click', (e) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      show(k);
      lb.addEventListener('keydown', key);
      openDialog(lb, () => { lb.removeEventListener('keydown', key); box.replaceChildren(); });
    }));
  }
})();
