/* Google-Bewertungen im Zitat-Modul (#kundenzitate).
   Holt die 5-Sterne-Bewertungen von api/google-reviews.php und zeigt sie
   nacheinander im großen Zitat. Bei Fehlern bleibt das statische Zitat stehen. */
(() => {
  const section = document.querySelector('[data-google-reviews]');
  if (!section) return;

  const quote   = section.querySelector('.testimonial-quote');
  const textEl  = quote.querySelector('p');
  const nameEl  = quote.querySelector('.testimonial-name');
  const roleEl  = quote.querySelector('.testimonial-role');
  const dotsEl  = quote.querySelector('.testimonial-dots');
  const INTERVAL = 9000;
  // Ab so vielen Zeichen nächstkleinerer Schriftgrad (siehe .testimonial-quote.is-long)
  const LONG = 160;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Erst der PHP-Endpunkt (live), sonst die statische JSON-Datei (Hosting ohne PHP)
  const load = (url) => fetch(url, { headers: { Accept: 'application/json' } })
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((d) => (d && d.reviews && d.reviews.length ? d : Promise.reject('leer')));
  const fallback = section.dataset.googleReviewsFallback;
  load(section.dataset.googleReviews)
    .catch(() => (fallback ? load(fallback) : Promise.reject()))
    .catch(() => {
      // Letzter Fallback: eingebetteter Stand (funktioniert auch per file://)
      const d = window.NOLL_GOOGLE_REVIEWS;
      return d && d.reviews && d.reviews.length ? d : Promise.reject();
    })
    .then((data) => {
      const reviews = (data && data.reviews) || [];
      if (!reviews.length) return;
      init(reviews, data);
    })
    .catch(() => { /* statisches Zitat bleibt stehen */ });

  function stars(n) {
    const wrap = document.createElement('span');
    wrap.className = 'testimonial-stars';
    wrap.setAttribute('role', 'img');
    wrap.setAttribute('aria-label', `${n} von 5 Sternen`);
    wrap.textContent = '★'.repeat(n);
    return wrap;
  }

  function render(review) {
    textEl.removeAttribute('data-placeholder');
    nameEl.removeAttribute('data-placeholder');
    roleEl.removeAttribute('data-placeholder');

    // Schließendes Anführungszeichen wie im Design, öffnendes kommt per CSS
    textEl.textContent = review.text.replace(/["“”„]+$/, '') + '”';
    quote.classList.toggle('is-long', review.text.length > LONG);

    nameEl.textContent = '';
    if (review.authorUrl) {
      const a = document.createElement('a');
      a.href = review.authorUrl; a.target = '_blank'; a.rel = 'noopener';
      a.textContent = review.author;
      nameEl.appendChild(a);
    } else {
      nameEl.textContent = review.author;
    }

    roleEl.textContent = '';
    roleEl.appendChild(stars(review.rating));
    const src = document.createElement('a');
    src.href = review.url; src.target = '_blank'; src.rel = 'noopener';
    src.textContent = review.time ? `Google-Bewertung · ${review.time}` : 'Google-Bewertung';
    roleEl.appendChild(src);
  }

  function init(reviews, data) {
    section.classList.add('is-google');

    // Gesamtwertung als Kontext: zeigt, dass es eine Auswahl ist
    if (data.rating && data.ratingCount) {
      const summary = document.createElement('a');
      summary.className = 'testimonial-summary';
      summary.href = data.placeUrl; summary.target = '_blank'; summary.rel = 'noopener';
      const r = Number(data.rating).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
      summary.textContent = `${r} von 5 Sternen · ${data.ratingCount} Bewertungen auf Google`;
      quote.querySelector('.testimonial-attribution').appendChild(summary);
    }

    let index = 0;
    render(reviews[0]);
    if (reviews.length < 2) return;

    // Punkte zum Durchklicken
    const dots = reviews.map((_, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'testimonial-dot';
      b.setAttribute('aria-label', `Bewertung ${i + 1} von ${reviews.length}`);
      b.addEventListener('click', () => { show(i); restart(); });
      dotsEl.appendChild(b);
      return b;
    });
    dotsEl.hidden = false;
    const mark = () => dots.forEach((d, i) => d.setAttribute('aria-current', i === index ? 'true' : 'false'));
    mark();

    function show(i) {
      if (i === index) return;
      index = i;
      if (reduceMotion) { render(reviews[index]); mark(); return; }
      quote.classList.add('is-fading');
      setTimeout(() => {
        render(reviews[index]); mark();
        quote.classList.remove('is-fading');
      }, 400);
    }

    let timer = null;
    const start = () => { if (!reduceMotion) timer = setInterval(() => show((index + 1) % reviews.length), INTERVAL); };
    const stop = () => { clearInterval(timer); timer = null; };
    const restart = () => { stop(); start(); };
    quote.addEventListener('mouseenter', stop);
    quote.addEventListener('mouseleave', start);
    quote.addEventListener('focusin', stop);
    quote.addEventListener('focusout', start);
    start();
  }
})();
