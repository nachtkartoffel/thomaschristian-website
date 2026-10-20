/* Social Wall (#insights auf der Startseite)
   ------------------------------------------------------------------------
   Sammelt Beiträge von Instagram, LinkedIn und YouTube in einem Isotope-
   Masonry-Grid.

   Datenquelle: zuerst api/social-wall.php (live, serverseitig gecacht –
   Instagram Graph API + YouTube-RSS + LinkedIn aus data/social-wall.json).
   Ist der Endpunkt nicht erreichbar (lokal per file://, kein PHP, Fehler),
   wird der statische Stand aus js/social-wall-data.js genutzt.

   Kachel-Typen
   - image   : Thumbnail mit weißer Kontur. Klick dreht die Karte um →
               weiße Rückseite mit schwarzem Text + Link zum Beitrag.
   - video   : Instagram-Reel. Läuft stumm in Schleife, sobald es im Bild
               ist (ohne Videodatei: Cover-Bild). Dreht ebenfalls um.
   - youtube : YouTube-Embed (youtube-nocookie), stumm, Autoplay, Schleife,
               erst geladen, wenn die Kachel in den Viewport kommt.
   ------------------------------------------------------------------------ */
(() => {
  const section = document.querySelector('[data-social-wall]');
  if (!section) return;

  const grid      = section.querySelector('.social-wall-grid');
  const filterBar = section.querySelector('.social-wall-filters');
  const moreBtn   = section.querySelector('.social-wall-more');
  const moreWrap  = section.querySelector('.social-wall-more-wrap');
  const endpoint  = section.dataset.socialWall;

  const PAGE_FIRST = 12;   // Kacheln beim ersten Laden
  const PAGE_STEP  = 8;    // pro Klick auf "Mehr anzeigen"
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const NETWORK_LABEL = { instagram: 'Instagram', linkedin: 'LinkedIn', youtube: 'YouTube' };
  const LINK_LABEL    = { instagram: 'Auf Instagram ansehen', linkedin: 'Auf LinkedIn ansehen', youtube: 'Auf YouTube ansehen' };

  const ICONS = {
    instagram: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 7.2a4.8 4.8 0 1 0 0 9.6 4.8 4.8 0 0 0 0-9.6Zm0 7.9a3.1 3.1 0 1 1 0-6.2 3.1 3.1 0 0 1 0 6.2Zm5-8.1a1.1 1.1 0 1 1-2.2 0 1.1 1.1 0 0 1 2.2 0ZM12 2.2c-2.7 0-3 0-4 .1-1 0-1.8.2-2.4.5-.7.3-1.2.6-1.8 1.2S2.9 5.1 2.7 5.7c-.3.6-.4 1.4-.5 2.4 0 1-.1 1.4-.1 4s0 3 .1 4c0 1 .2 1.8.5 2.4.3.7.6 1.2 1.2 1.8s1.1.9 1.8 1.2c.6.3 1.4.4 2.4.5h8c1 0 1.8-.2 2.4-.5.7-.3 1.2-.6 1.8-1.2s.9-1.1 1.2-1.8c.3-.6.4-1.4.5-2.4v-8c0-1-.2-1.8-.5-2.4-.3-.7-.6-1.2-1.2-1.8s-1.1-.9-1.8-1.2c-.6-.3-1.4-.4-2.4-.5h-4Zm0 1.8h3.9c1 0 1.5.2 1.8.3.5.2.8.4 1.1.7.4.4.6.7.7 1.2.1.3.3.8.3 1.8v7.8c0 1-.2 1.5-.3 1.8-.2.5-.4.8-.7 1.1-.4.4-.7.6-1.2.7-.3.1-.8.3-1.8.3H8.2c-1 0-1.5-.2-1.8-.3-.5-.2-.8-.4-1.1-.7a3 3 0 0 1-.7-1.2c-.1-.3-.3-.8-.3-1.8V8.1c0-1 .2-1.5.3-1.8.2-.5.4-.8.7-1.1.4-.4.7-.6 1.2-.7.3-.1.8-.3 1.8-.3H12Z"/></svg>',
    linkedin:  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20.4 20.5h-3.6v-5.6c0-1.3 0-3-1.8-3s-2.1 1.4-2.1 2.9v5.7H9.3V9h3.4v1.6c.5-.9 1.6-1.8 3.4-1.8 3.6 0 4.3 2.4 4.3 5.5v6.2ZM5.3 7.4a2.1 2.1 0 1 1 0-4.2 2.1 2.1 0 0 1 0 4.2ZM7.1 20.5H3.5V9h3.6v11.5Z"/></svg>',
    youtube:   '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12 31 31 0 0 0 1 16.8a3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1c.4-1.6.5-3.2.5-4.8s-.1-3.2-.5-4.8ZM9.7 15V9l5.8 3-5.8 3Z"/></svg>',
    play:      '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 5.5v13l10.5-6.5L8 5.5Z"/></svg>',
  };

  let iso = null;
  let activeFilter = '*';
  let limit = PAGE_FIRST;
  let cards = [];          // { el, item }
  let relayoutTimer = 0;

  /* ---------- Daten laden ---------- */
  const fromStatic = () => (window.NOLL_SOCIAL_WALL && window.NOLL_SOCIAL_WALL.items) || [];

  const load = () => {
    if (!endpoint || location.protocol === 'file:') return Promise.resolve(fromStatic());
    const ctrl = 'AbortController' in window ? new AbortController() : null;
    const t = setTimeout(() => ctrl && ctrl.abort(), 4000);
    return fetch(endpoint, { headers: { Accept: 'application/json' }, signal: ctrl ? ctrl.signal : undefined })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => {
        const items = (data && data.items) || [];
        return items.length ? items : fromStatic();
      })
      .catch(() => fromStatic())
      .finally(() => clearTimeout(t));
  };

  /* ---------- Helfer ---------- */
  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };

  const formatDate = (iso) => {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  // Hashtag-Block am Ende abtrennen – er wird kleiner unter dem Text gezeigt.
  const splitText = (text) => {
    const clean = String(text || '').trim();
    const m = clean.match(/((?:\s*#[\p{L}\p{N}_]+)+)\s*$/u);
    if (!m) return { body: clean, tags: '' };
    return { body: clean.slice(0, m.index).trim(), tags: m[1].trim().replace(/\s+/g, ' ') };
  };

  const ratioValue = (r) => {
    if (!r) return 1;
    const [w, h] = String(r).split('/').map(Number);
    return w && h ? w / h : 1;
  };

  const youtubeSrc = (id) =>
    `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&mute=1&loop=1&playlist=${encodeURIComponent(id)}` +
    '&controls=0&playsinline=1&rel=0&modestbranding=1&iv_load_policy=3&disablekb=1';

  /* ---------- Kachel bauen ---------- */
  function buildCard(item) {
    const isVideo = item.type === 'video' || item.type === 'youtube';
    const card = el('article', `sw-item sw-${item.network} sw-type-${item.type}`);
    card.dataset.network = item.network;
    card.dataset.date = item.date || '';
    if (ratioValue(item.ratio) > 1.3) card.classList.add('sw-wide');

    const inner = el('div', 'sw-card');
    inner.tabIndex = 0;
    inner.setAttribute('role', 'button');
    inner.setAttribute('aria-pressed', 'false');
    const label = item.title || splitText(item.text).body.split('\n')[0] || `${NETWORK_LABEL[item.network]}-Beitrag`;
    inner.setAttribute('aria-label', `${NETWORK_LABEL[item.network]}: ${label.slice(0, 120)} – Karte umdrehen`);

    /* Vorderseite */
    const front = el('div', 'sw-face sw-front');
    const media = el('div', 'sw-media');
    media.style.aspectRatio = String(item.ratio || '1/1').replace('/', ' / ');

    if (item.image) {
      const img = el('img');
      // src wird erst gesetzt, wenn die Kachel in die Nähe des Viewports kommt
      // (natives loading=lazy greift bei Isotopes absoluter Positionierung unzuverlässig)
      img.dataset.src = item.image; img.alt = ''; img.decoding = 'async';
      img.addEventListener('load', queueRelayout);
      img.addEventListener('error', () => media.classList.add('is-missing'));
      media.appendChild(img);
    } else {
      media.classList.add('is-missing');
    }

    if (item.type === 'video' && item.video) {
      const v = el('video');
      v.muted = true; v.defaultMuted = true; v.loop = true; v.playsInline = true;
      v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
      v.preload = 'none';
      if (item.image) v.poster = item.image;
      v.dataset.src = item.video;
      v.addEventListener('loadeddata', () => media.classList.add('is-playing'));
      media.appendChild(v);
    }
    if (item.type === 'youtube' && item.youtubeId) {
      media.dataset.youtube = item.youtubeId;
    }

    if (isVideo) media.appendChild(el('span', 'sw-play', ICONS.play));
    const badge = el('span', 'sw-badge', ICONS[item.network] || '');
    badge.setAttribute('aria-hidden', 'true');
    media.appendChild(badge);

    // Kein Bild (z. B. LinkedIn-Textpost): Text direkt auf der Vorderseite
    if (!item.image && item.type !== 'youtube') {
      const t = el('p', 'sw-media-text');
      t.textContent = label;
      media.appendChild(t);
    }
    front.appendChild(media);

    /* Rückseite */
    const back = el('div', 'sw-face sw-back');
    back.setAttribute('aria-hidden', 'true');
    const meta = el('div', 'sw-back-meta');
    meta.appendChild(el('span', 'sw-back-network', `${ICONS[item.network] || ''}<span>${NETWORK_LABEL[item.network] || ''}</span>`));
    const time = el('time', 'sw-back-date');
    time.dateTime = item.date || '';
    time.textContent = formatDate(item.date);
    meta.appendChild(time);
    back.appendChild(meta);

    const body = el('div', 'sw-back-body');
    if (item.title) {
      const h = el('h3', 'sw-back-title');
      h.textContent = item.title;
      body.appendChild(h);
    }
    const { body: text, tags } = splitText(item.text);
    if (text) {
      text.split(/\n{2,}/).forEach((para) => {
        const p = el('p');
        p.textContent = para.replace(/\n/g, ' ').trim();
        body.appendChild(p);
      });
    } else if (!item.title) {
      const p = el('p');
      p.textContent = 'Ein Beitrag von noll media.';
      body.appendChild(p);
    }
    if (tags) body.appendChild(Object.assign(el('p', 'sw-back-tags'), { textContent: tags }));
    back.appendChild(body);

    const link = el('a', 'leistung-cta sw-back-link',
      `<span class="leistung-cta-label">${LINK_LABEL[item.network] || 'Beitrag ansehen'}</span>` +
      '<span class="leistung-cta-icon"><img src="images/btn_pfeil.svg" alt=""></span>');
    link.href = item.url; link.target = '_blank'; link.rel = 'noopener';
    link.tabIndex = -1;
    link.addEventListener('click', (e) => e.stopPropagation());
    back.appendChild(link);

    inner.append(front, back);
    card.appendChild(inner);

    const toggle = () => {
      const flipped = !card.classList.contains('is-flipped');
      card.classList.toggle('is-flipped', flipped);
      inner.setAttribute('aria-pressed', String(flipped));
      back.setAttribute('aria-hidden', String(!flipped));
      front.setAttribute('aria-hidden', String(flipped));
      link.tabIndex = flipped ? 0 : -1;
      const v = media.querySelector('video');
      if (v) { flipped ? v.pause() : playIfVisible(card); }
    };
    inner.addEventListener('click', toggle);
    inner.addEventListener('keydown', (e) => {
      if (e.target !== inner) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });

    return card;
  }

  /* ---------- Video-Handling (nur abspielen, was sichtbar ist) ---------- */
  const visible = new WeakSet();
  const playIfVisible = (card) => {
    const v = card.querySelector('video');
    if (!v || !visible.has(card) || card.classList.contains('is-flipped') || card.classList.contains('sw-filtered-out')) return;
    if (!v.src && v.dataset.src) v.src = v.dataset.src;
    const p = v.play();
    if (p && p.catch) p.catch(() => {});
  };

  const io = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
    entries.forEach(({ target, isIntersecting }) => {
      if (isIntersecting) {
        visible.add(target);
        target.querySelectorAll('img[data-src]').forEach((img) => { img.src = img.dataset.src; img.removeAttribute('data-src'); });
        if (reduceMotion) return; // keine Autoplay-Bewegung bei reduzierter Bewegung
        playIfVisible(target);
        const yt = target.querySelector('.sw-media[data-youtube]');
        // YouTube braucht einen Referrer (sonst Fehler 153) – unter file:// bleibt das Vorschaubild stehen
        if (yt && !yt.querySelector('iframe') && location.protocol !== 'file:') {
          const f = el('iframe');
          f.src = youtubeSrc(yt.dataset.youtube);
          f.title = 'YouTube-Video';
          f.allow = 'autoplay; encrypted-media; picture-in-picture';
          f.referrerPolicy = 'strict-origin-when-cross-origin';
          f.loading = 'lazy';
          f.tabIndex = -1;
          f.setAttribute('aria-hidden', 'true');
          f.addEventListener('load', () => setTimeout(() => yt.classList.add('is-playing'), 600));
          yt.insertBefore(f, yt.querySelector('.sw-play'));
        }
      } else {
        visible.delete(target);
        const v = target.querySelector('video');
        if (v && !v.paused) v.pause();
      }
    });
  }, { rootMargin: '400px 0px' }) : null;

  /* ---------- Isotope ---------- */
  function queueRelayout() {
    clearTimeout(relayoutTimer);
    relayoutTimer = setTimeout(() => iso && iso.layout(), 60);
  }

  function allowedSet() {
    const match = cards.filter(({ item }) => activeFilter === '*' || item.network === activeFilter);
    moreWrap.hidden = match.length <= limit;
    measureCtas();
    return new Set(match.slice(0, limit).map((c) => c.el));
  }

  function arrange() {
    const allowed = allowedSet();
    cards.forEach(({ el: c }) => c.classList.toggle('sw-filtered-out', !allowed.has(c)));
    if (iso) {
      iso.arrange({ filter: (itemElem) => allowed.has(itemElem) });
    }
    cards.forEach(({ el: c }) => {
      if (allowed.has(c)) playIfVisible(c);
      else { const v = c.querySelector('video'); if (v) v.pause(); }
    });
  }

  // Cross-Slide-Hover der sekundären CTAs braucht die gemessenen Breiten
  // (wie js/main.js für .leistung-cta) – hier für die erst später sichtbaren
  // bzw. per JS erzeugten Buttons.
  function measureCtas() {
    requestAnimationFrame(() => {
      section.querySelectorAll('.leistung-cta').forEach((cta) => {
        const label = cta.querySelector('.leistung-cta-label');
        const icon = cta.querySelector('.leistung-cta-icon');
        if (!label || !icon || !label.offsetWidth) return;
        cta.style.setProperty('--leistung-cta-label-w', `${label.offsetWidth}px`);
        cta.style.setProperty('--leistung-cta-icon-w', `${icon.offsetWidth}px`);
      });
    });
  }

  function init(items) {
    items = items
      .filter((it) => it && it.url && NETWORK_LABEL[it.network])
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    if (!items.length) return;

    // Filter-Buttons für leere Kanäle ausblenden
    const counts = items.reduce((m, it) => ((m[it.network] = (m[it.network] || 0) + 1), m), {});
    filterBar.querySelectorAll('[data-filter]').forEach((b) => {
      const f = b.dataset.filter;
      if (f !== '*' && !counts[f]) b.hidden = true;
    });

    const frag = document.createDocumentFragment();
    cards = items.map((item) => {
      const c = buildCard(item);
      frag.appendChild(c);
      return { el: c, item };
    });
    grid.appendChild(frag);
    section.classList.add('is-ready');

    if (window.Isotope) {
      iso = new window.Isotope(grid, {
        itemSelector: '.sw-item',
        percentPosition: true,
        masonry: { columnWidth: '.sw-sizer', gutter: '.sw-gutter' },
        transitionDuration: reduceMotion ? 0 : '0.5s',
        hiddenStyle: { opacity: 0, transform: 'scale(0.96)' },
        visibleStyle: { opacity: 1, transform: 'scale(1)' },
        stagger: reduceMotion ? 0 : 25,
      });
    } else {
      grid.classList.add('no-isotope');
    }
    arrange();
    if (io) cards.forEach(({ el: c }) => io.observe(c));
    else grid.querySelectorAll('img[data-src]').forEach((img) => { img.src = img.dataset.src; });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(queueRelayout);
    window.addEventListener('resize', () => { queueRelayout(); measureCtas(); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measureCtas);
  }

  filterBar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-filter]');
    if (!b) return;
    activeFilter = b.dataset.filter;
    limit = PAGE_FIRST;
    filterBar.querySelectorAll('[data-filter]').forEach((x) => {
      const on = x === b;
      x.classList.toggle('is-active', on);
      x.setAttribute('aria-pressed', String(on));
    });
    arrange();
  });

  moreBtn.addEventListener('click', () => {
    limit += PAGE_STEP;
    arrange();
  });

  // Erst starten, wenn Isotope (defer) geladen ist – DOMContentLoaded reicht,
  // weil alle drei Skripte deferred in Reihenfolge ausgeführt werden.
  const start = () => load().then(init);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
