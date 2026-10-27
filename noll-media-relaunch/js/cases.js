/* Cases — renders every case reference on the site from js/cases-data.js
   (window.NOLL_CASES), so a case is entered once and shows up everywhere:
     · cases.html      #casesGrid[data-cases="overview"]   all cases, the filter
                       in js/main.js then works on the rows built here
     · case-*.html     [data-cases="related"]              "Weitere Projekte":
                       the next cases after the current one (data-cases-current),
                       filled up with placeholders while there are too few
     · leistungen-*.html  [data-cases="related"][data-cases-filter="seo"]
                       the same tiles, cases of that category first
     · index.html      the Cases slider reads the list itself (js/main.js,
                       window.NOLL_HOME_CASES, prepared here)
   Runs synchronously and must be loaded after cases-data.js and BEFORE
   js/main.js, which measures and animates what this builds. */
(function(){
  const all = Array.isArray(window.NOLL_CASES) ? window.NOLL_CASES : [];
  if (!all.length) return;

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const live = all.filter((c) => c.page);
  const placeholders = all.filter((c) => !c.page);
  const PLACEHOLDER_COPY = 'Platzhaltertext: Hier stehen zwei bis drei Sätze zur Ausgangslage, zu unserem Ansatz und zum Ergebnis dieses Projekts.';
  const arrow = '<img src="images/btn_pfeil.svg" alt="">';

  // ---- homepage slider: real cases first, topped up to at least 4 ------------------
  // (the endless track needs a few items to look full)
  const MIN_SLIDER = 4;
  const slider = live.concat(placeholders.slice(0, Math.max(0, MIN_SLIDER - live.length)));
  window.NOLL_HOME_CASES = slider.map((c) => ({
    title: c.title,
    tags: (c.tags || []).map(esc).join('<br>'),
    img: c.image || 'images/mockup_case.jpg',
    href: c.page || null,
    alt: c.alt || ''
  }));

  // ---- cases overview -----------------------------------------------------------------
  const grid = document.querySelector('[data-cases="overview"]');
  if (grid){
    grid.innerHTML = all.map((c) => {
      const href = c.page || '#';
      const ph = !c.page;
      return `<article class="case-row" data-case-tags="${esc((c.filter || []).join(' '))}">
        <div class="case-row-text">
          <p class="case-row-client">${esc(c.client)}</p>
          <h2 class="case-row-title"><a href="${esc(href)}">${esc(c.title)}</a></h2>
          <p class="case-row-copy"${ph || !c.intro ? ' data-placeholder' : ''}>${esc(c.intro || PLACEHOLDER_COPY)}</p>
          <a class="leistung-detail-cta case-row-cta" href="${esc(href)}">
            <span class="leistung-detail-cta-label">Zum Projekt</span>
            <span class="leistung-detail-cta-icon">${arrow}</span>
          </a>
        </div>
        <a class="case-row-media" href="${esc(href)}" tabindex="-1" aria-hidden="true"${ph ? ' data-placeholder-media' : ''}>
          <img src="${esc(c.image || 'images/mockup_case.jpg')}" alt="${esc(c.alt)}" loading="lazy" decoding="async">
        </a>
      </article>`;
    }).join('\n');
  }

  // ---- "Weitere Projekte" on the case pages ----------------------------------------------
  document.querySelectorAll('[data-cases="related"]').forEach((box) => {
    const current = box.dataset.casesCurrent || '';
    const count = parseInt(box.dataset.casesCount || '3', 10);
    // the cases after the current one, wrapping around, so every page
    // points somewhere different and the set rotates through the list
    const i = live.findIndex((c) => c.slug === current);
    let others = i < 0 ? live.slice() : live.slice(i + 1).concat(live.slice(0, i));
    // on a service page (data-cases-filter="seo" …): matching cases first
    const filter = box.dataset.casesFilter || '';
    const hit = (c) => (c.filter || []).includes(filter);
    if (filter) others = others.filter(hit).concat(others.filter((c) => !hit(c)));
    const pool = filter ? placeholders.filter(hit).concat(placeholders.filter((c) => !hit(c))) : placeholders;
    const pick = others.slice(0, count).concat(pool).slice(0, count);
    box.innerHTML = pick.map((c) => {
      const href = c.page || 'cases.html';
      const media = c.page && c.image
        ? `<a class="leistung-detail-case-media has-image" href="${esc(href)}" tabindex="-1" aria-hidden="true"><img src="${esc(c.image)}" alt="" loading="lazy" decoding="async"></a>`
        : '<div class="leistung-detail-case-media" data-placeholder-media aria-hidden="true"></div>';
      return `<article class="leistung-detail-case">
          ${media}
          <div class="leistung-detail-case-body">
            <div class="leistung-detail-case-text">
              <p class="leistung-detail-case-subtitle">${esc(c.client)}</p>
              <p class="leistung-detail-case-title"><a href="${esc(href)}">${esc(c.title)}</a></p>
            </div>
            <img class="leistung-detail-case-icon" src="images/btn_pfeil.svg" alt="">
          </div>
        </article>`;
    }).join('\n');
  });
})();
