/* Alisa Makarenko — portfolio. Progressive enhancement only: every block works and is visible without this file. */
(() => {
  const root = document.documentElement;
  const lang = root.lang === 'en' ? 'en' : 'ru';
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (!reduce && 'IntersectionObserver' in window) root.classList.add('motion');

  /* ---------- language: remember the choice ---------- */
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

  /* ---------- count-up ---------- */
  const parseNum = (txt) => {
    const m = txt.match(/^(\D*?)([\d\s .,]*\d)(.*)$/);
    if (!m) return null;
    let raw = m[2].replace(/[\s ]/g, '');
    let dec = 0;
    if (lang === 'ru') { const p = raw.split(','); dec = p[1] ? p[1].length : 0; raw = raw.replace(',', '.'); }
    else { raw = raw.replace(/,(?=\d{3}\b)/g, ''); const p = raw.split('.'); dec = p[1] ? p[1].length : 0; }
    const v = parseFloat(raw);
    if (!isFinite(v)) return null;
    return { pre: m[1], v, dec, post: m[3], grouped: /[\s ,]\d{3}/.test(m[2]) };
  };
  const fmt = (n, d, grouped) => {
    const s = n.toFixed(d);
    let [i, f] = s.split('.');
    if (grouped) i = i.replace(/\B(?=(\d{3})+(?!\d))/g, lang === 'ru' ? ' ' : ',');
    return f ? i + (lang === 'ru' ? ',' : '.') + f : i;
  };
  const countUp = (el) => {
    if (reduce || el.dataset.done) return;
    el.dataset.done = '1';
    const final = el.textContent;
    const p = parseNum(final);
    if (!p || p.v === 0) return;
    const dur = 1500, t0 = performance.now();
    el.style.minWidth = el.getBoundingClientRect().width + 'px';
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = p.pre + fmt(p.v * e, p.dec, p.grouped) + p.post;
      if (k < 1) requestAnimationFrame(step); else { el.textContent = final; el.style.minWidth = ''; }
    };
    requestAnimationFrame(step);
  };

  /* ---------- reveal: only content below the fold waits; nothing above it is ever hidden ---------- */
  if (root.classList.contains('motion')) {
    const items = [...document.querySelectorAll('.rv')];
    const vh = window.innerHeight;
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (!en.isIntersecting) return;
      const el = en.target;
      const sibs = [...el.parentElement.children].filter((c) => c.classList.contains('rv-wait') && !c.classList.contains('in'));
      el.style.transitionDelay = Math.min(Math.max(sibs.indexOf(el), 0), 5) * 80 + 'ms';
      el.classList.add('in');
      el.querySelectorAll('[data-count]').forEach(countUp);
      io.unobserve(el);
    }), { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });
    items.forEach((el) => {
      if (el.getBoundingClientRect().top > vh) { el.classList.add('rv-wait'); io.observe(el); }
      else el.querySelectorAll('[data-count]').forEach(countUp);
    });
    // safety net for anything the observer misses (e.g. print, very fast jumps)
    window.addEventListener('beforeprint', () => items.forEach((el) => el.classList.add('in')));
  }

  /* ---------- process timeline: playhead runs once when it scrolls into view ---------- */
  const tl = document.querySelector('[data-tl]');
  if (tl) {
    const clips = [...tl.querySelectorAll('.clip')];
    const cards = [...document.querySelectorAll('.stage')];
    const tc = tl.querySelector('.tl__tc');
    const weights = clips.map((c) => parseFloat(c.style.getPropertyValue('--w')) || 1);
    const total = weights.reduce((a, b) => a + b, 0);
    const pad = (n) => String(n).padStart(2, '0');
    // the chip shows the stage under the playhead ("04 / 08"), not a clock: the cycle has no real duration
    const set = (p) => {
      tl.style.setProperty('--p', p.toFixed(4));
      tl.dataset.p = p > 0.93 ? 'end' : (p < 0.05 ? 'start' : '');
      let acc = 0, stage = 0;
      clips.forEach((c, i) => {
        const on = p * total > acc + 0.01;
        acc += weights[i];
        const current = on && p < 1 && p * total <= acc;
        if (on) stage = i + 1;
        c.classList.toggle('is-live', on);
        if (cards[i]) cards[i].classList.toggle('is-now', current);
      });
      if (tc) tc.textContent = `${pad(Math.max(stage, 1))} / ${pad(clips.length)}`;
    };
    const wide = window.matchMedia('(min-width: 1100px)');
    if (reduce || !('IntersectionObserver' in window) || !wide.matches) set(1);
    else {
      set(0);
      const play = () => {
        const dur = 8000, t0 = performance.now();
        const step = (t) => { const k = Math.min(1, (t - t0) / dur); set(k < 1 ? 0.5 - Math.cos(Math.PI * k) / 2 : 1); if (k < 1) requestAnimationFrame(step); };
        requestAnimationFrame(step);
      };
      const io2 = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { play(); io2.disconnect(); } }), { threshold: 0.45 });
      io2.observe(tl);
    }
    window.__tl = set; // used by the screenshot script to freeze a frame mid-play
  }

  /* ---------- hover preview loops (desktop pointer only, created on demand) ---------- */
  if (canHover && !reduce) {
    document.querySelectorAll('[data-loop]').forEach((a) => {
      const frame = a.querySelector('.film__frame, .short__frame');
      if (!frame) return;
      let v = null, timer = 0;
      const start = () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          if (!v) {
            v = document.createElement('video');
            v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto';
            v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('aria-hidden', 'true');
            v.src = a.dataset.loop;
            frame.appendChild(v);
          }
          const pr = v.play();
          if (pr && pr.then) pr.then(() => a.classList.add('is-looping')).catch(() => {});
        }, 120);
      };
      const stop = () => { clearTimeout(timer); a.classList.remove('is-looping'); if (v) setTimeout(() => { if (!a.classList.contains('is-looping')) v.pause(); }, 600); };
      a.addEventListener('mouseenter', start);
      a.addEventListener('mouseleave', stop);
    });
  }

  /* ---------- dialogs: focus trap + restore ---------- */
  const focusables = (box) => [...box.querySelectorAll('button, a[href], iframe, video[controls], [tabindex]:not([tabindex="-1"])')].filter((el) => !el.hidden && el.getClientRects().length > 0);
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
    const backdrop = (e) => { if (e.target === dlg || e.target.classList.contains('lightbox__box')) dlg.close(); };
    const closeBtn = (e) => { if (e.target.closest('[data-close]')) dlg.close(); };
    const done = () => {
      dlg.removeEventListener('keydown', trap); dlg.removeEventListener('click', backdrop); dlg.removeEventListener('click', closeBtn);
      document.body.style.overflow = '';
      if (onClose) onClose();
      if (opener && opener.focus) opener.focus({ preventScroll: true });
    };
    dlg.addEventListener('keydown', trap);
    dlg.addEventListener('click', backdrop);
    dlg.addEventListener('click', closeBtn);
    dlg.addEventListener('close', done, { once: true });
    document.body.style.overflow = 'hidden';
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    const c = dlg.querySelector('[data-close]');
    if (c) c.focus();
  };

  /* ---------- YouTube modal (iframe only exists while open) ---------- */
  const vm = document.getElementById('video-modal');
  if (vm && typeof vm.showModal === 'function') {
    const screen = vm.querySelector('[data-screen]');
    const titleEl = vm.querySelector('[data-modal-title]');
    const ytLink = vm.querySelector('[data-modal-yt]');
    const loading = vm.querySelector('[data-modal-loading]');
    // focus sentinel after the iframe: Tab out of the player comes back to the close button
    const sentinel = document.createElement('span');
    sentinel.tabIndex = 0;
    sentinel.className = 'sr';
    sentinel.addEventListener('focus', () => { const c = vm.querySelector('[data-close]'); if (c) c.focus(); });
    vm.querySelector('.modal__box').appendChild(sentinel);
    document.addEventListener('click', (e) => {
      const a = e.target.closest('[data-yt]');
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      const id = a.dataset.yt;
      const vertical = a.hasAttribute('data-vertical');
      const label = a.dataset.title || (a.getAttribute('aria-label') || '').replace(/^[^:]+:\s*/, '');
      vm.classList.toggle('is-vertical', vertical);
      const f = document.createElement('iframe');
      f.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0&modestbranding=1&playsinline=1`;
      f.title = label || 'YouTube';
      f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      f.allowFullscreen = true;
      f.referrerPolicy = 'strict-origin-when-cross-origin';
      const thumb = a.querySelector('img');
      screen.style.backgroundImage = thumb ? `url("${thumb.currentSrc || thumb.src}")` : '';
      // the thumbnail stays visible behind a "loading" line until the player has loaded
      f.style.opacity = '0';
      f.addEventListener('load', () => { f.style.opacity = '1'; if (loading) loading.hidden = true; }, { once: true });
      if (loading) loading.hidden = false;
      screen.replaceChildren(...(loading ? [loading] : []), f);
      titleEl.textContent = label;
      if (ytLink) ytLink.href = a.href;
      openDialog(vm, () => screen.replaceChildren());
    });
  }

  /* ---------- lightbox for behind-the-scenes screenshots ---------- */
  const lb = document.getElementById('lightbox');
  const shots = [...document.querySelectorAll('[data-lb]')];
  if (lb && shots.length && typeof lb.showModal === 'function') {
    const box = lb.querySelector('[data-lb-img]');
    const tEl = lb.querySelector('[data-lb-title]'), cEl = lb.querySelector('[data-lb-cap]'), nEl = lb.querySelector('[data-lb-count]');
    let i = 0;
    const show = (k) => {
      i = (k + shots.length) % shots.length;
      const a = shots[i];
      const pic = document.createElement('picture');
      if (a.dataset.webp) { const s = document.createElement('source'); s.type = 'image/webp'; s.srcset = a.dataset.webp; pic.appendChild(s); }
      const img = document.createElement('img');
      img.src = a.getAttribute('href'); img.alt = a.dataset.alt || ''; img.width = +a.dataset.w; img.height = +a.dataset.h;
      pic.appendChild(img);
      box.replaceChildren(pic);
      tEl.textContent = a.dataset.title || '';
      cEl.textContent = a.dataset.caption || '';
      nEl.textContent = `${i + 1} / ${shots.length}`;
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

  /* ---------- best moments player ---------- */
  const mv = document.getElementById('moment-video');
  if (mv) {
    const links = [...document.querySelectorAll('.moment')];
    const tEl = document.querySelector('[data-moment-title]'), fEl = document.querySelector('[data-moment-from]');
    const big = document.querySelector('[data-moment-play]');
    // native controls appear only once playback starts; before that the poster carries one calm play button
    if (big) {
      mv.controls = false;
      big.hidden = false;
      const start = () => { big.hidden = true; mv.controls = true; const p = mv.play(); if (p && p.catch) p.catch(() => {}); mv.focus({ preventScroll: true }); };
      big.addEventListener('click', start);
      mv.addEventListener('play', () => { big.hidden = true; mv.controls = true; });
    }
    links.forEach((a) => a.addEventListener('click', (e) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey) return;
      e.preventDefault();
      links.forEach((l) => { l.classList.toggle('is-active', l === a); if (l === a) l.setAttribute('aria-current', 'true'); else l.removeAttribute('aria-current'); });
      mv.pause();
      mv.poster = a.dataset.poster;
      mv.src = a.dataset.src;
      if (tEl) tEl.textContent = a.dataset.title + '. ';
      fEl.textContent = a.dataset.from;
      mv.load();
      if (big) big.hidden = true;
      mv.controls = true;
      const p = mv.play(); if (p && p.catch) p.catch(() => {});
    }));
  }

  /* ---------- her own clips: poster first; a muted loop on hover (desktop), while in view (touch) or on press ---------- */
  const vgcs = [...document.querySelectorAll('.vgc[data-loop]')];
  const saveData = !!(navigator.connection && navigator.connection.saveData);
  if (vgcs.length) {
    const playing = [];
    const start = (f) => {
      const btn = f.querySelector('.vgc__frame');
      if (!f._v) {
        const v = document.createElement('video');
        v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto';
        v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('aria-hidden', 'true');
        v.src = f.dataset.loop;
        btn.appendChild(v);
        f._v = v;
      }
      const p = f._v.play();
      if (p && p.then) p.then(() => { f.classList.add('is-looping'); btn.setAttribute('aria-pressed', 'true'); }).catch(() => {});
      const k = playing.indexOf(f); if (k > -1) playing.splice(k, 1);
      playing.push(f);
      while (playing.length > 2) stop(playing.shift());
    };
    const stop = (f) => {
      f.classList.remove('is-looping');
      f.querySelector('.vgc__frame').setAttribute('aria-pressed', 'false');
      if (f._v) f._v.pause();
      const k = playing.indexOf(f); if (k > -1) playing.splice(k, 1);
    };
    vgcs.forEach((f) => {
      const btn = f.querySelector('.vgc__frame');
      btn.addEventListener('click', () => (f.classList.contains('is-looping') ? stop(f) : start(f)));
      if (canHover && !reduce && !saveData) {
        let timer = 0;
        f.addEventListener('mouseenter', () => { clearTimeout(timer); timer = setTimeout(() => start(f), 120); });
        f.addEventListener('mouseleave', () => { clearTimeout(timer); stop(f); });
      }
    });
    if (!canHover && !reduce && !saveData && 'IntersectionObserver' in window) {
      const io3 = new IntersectionObserver((es) => es.forEach((e) => (e.intersectionRatio >= 0.6 ? start(e.target) : stop(e.target))), { threshold: [0, 0.6] });
      vgcs.forEach((f) => io3.observe(f));
    }
  }
})();
