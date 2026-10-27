(() => {
  'use strict';

  /* Mobile nav toggle + desktop compact-header un-collapse.
     The same button/icon serves two different menus depending on
     context: the mobile .mobile-nav overlay (≤860px, or the toggle
     clicked while nav-compact is NOT set), and — once scrolled past the
     compact threshold on desktop — a manual "un-collapse" of the full
     nav (see the "Compact header on scroll" block below). The second
     case gets its own class, body.nav-compact-expanded, layered on top
     of nav-compact rather than replacing it: it reuses the exact same
     burger→X icon morph already defined for [aria-expanded="true"]
     (originally built for the mobile overlay), gives the nav row a
     solid black backdrop while open (see .nav-compact-expanded .site-header
     in CSS — page content keeps scrolling underneath the sticky header,
     so the reappeared nav text needs an opaque background to stay
     legible against whatever's behind it), and — per explicit
     direction — closes itself the moment the user scrolls at all
     (closeCompactExpanded(), called from the scroll handler below),
     not just once they cross back over the threshold. */
  /* Single source of truth for "are we on the phone layout" — must stay in
     step with the @media (max-width:860px) breakpoint in style.css. Used by
     the scroll effects below to stand down at that width: both of them write
     INLINE styles (--item-x on the Prozess steps, transform on the
     Creativity photos), which no stylesheet rule can override, so the mobile
     layout can only take effect if the JS itself stops writing them. */
  const isMobileLayout = () => window.matchMedia('(max-width:860px)').matches;

  const navToggle = document.getElementById('navToggle');
  const mobileNav = document.getElementById('mobileNav');
  const mobileBarToggle = document.getElementById('mobileBarToggle');
  const isDesktopNavCompact = () =>
    document.body.classList.contains('nav-compact') && window.matchMedia('(min-width:861px)').matches;
  const closeCompactExpanded = () => {
    if (!document.body.classList.contains('nav-compact-expanded')) return;
    document.body.classList.remove('nav-compact-expanded');
    if (navToggle) {
      navToggle.setAttribute('aria-expanded', 'false');
      navToggle.setAttribute('aria-label', 'Menü öffnen');
    }
  };
  /* Page scroll lock for the open menu. body{overflow:hidden} is not enough
     on its own — iOS Safari happily keeps scrolling the page behind a fixed
     overlay — so the page is taken out of the scroll flow entirely
     (body.scroll-locked is position:fixed in style.css) and held at the
     offset it was on via an inline top, which is then handed back on
     unlock. Without restoring that offset, closing the menu would dump the
     reader back at the top of the page. */
  let scrollLockY = 0;
  const setScrollLock = (locked) => {
    const body = document.body;
    if (locked === body.classList.contains('scroll-locked')) return;
    if (locked) {
      scrollLockY = window.scrollY;
      body.style.top = `-${scrollLockY}px`;
      body.classList.add('scroll-locked');
    } else {
      body.classList.remove('scroll-locked');
      body.style.top = '';
      // Two things to get right on the way back:
      // 1. while body was position:fixed the document had no scrollable
      //    height left (measured: 844px vs 5662px), so read a layout
      //    property first to flush the reflow — otherwise the restore below
      //    is clamped to the collapsed height and lands short.
      // 2. html{scroll-behavior:smooth} is set for the anchor links, which
      //    would turn this restore into a visible scroll animation back to
      //    where the reader already was. 'instant' opts this one call out.
      void body.offsetHeight;
      window.scrollTo({ top: scrollLockY, left: 0, behavior: 'instant' });
    }
  };

  /* One switch for the mobile menu, used by all three entry points (header
     burger, bottom-bar burger, and a link inside the panel). Keeping the
     class, both toggles' aria state and the scroll lock in a single place
     is what stops them drifting apart — e.g. the panel closing via a link
     while the page stays locked. */
  const setNavOpen = (isOpen) => {
    document.body.classList.toggle('nav-open', isOpen);
    [navToggle, mobileBarToggle].forEach((btn) => {
      if (!btn) return;
      btn.setAttribute('aria-expanded', String(isOpen));
      btn.setAttribute('aria-label', isOpen ? 'Menü schließen' : 'Menü öffnen');
    });
    setScrollLock(isOpen);
  };

  if (navToggle && mobileNav) {
    navToggle.addEventListener('click', () => {
      // Desktop compact header un-collapse — see the comment above.
      if (isDesktopNavCompact() || document.body.classList.contains('nav-compact-expanded')) {
        const isExpanded = document.body.classList.toggle('nav-compact-expanded');
        navToggle.setAttribute('aria-expanded', String(isExpanded));
        navToggle.setAttribute('aria-label', isExpanded ? 'Menü schließen' : 'Menü öffnen');
        return;
      }
      setNavOpen(!document.body.classList.contains('nav-open'));
    });
    mobileNav.querySelectorAll('a').forEach((link) => {
      // Unlock before the browser acts on the #anchor: while body is
      // position:fixed there is nothing to scroll, so the jump would land
      // nowhere and then be undone by the lock's own scroll restore.
      link.addEventListener('click', () => setNavOpen(false));
    });
  }
  /* Services dropdown (desktop hover) + its touch counterpart in the mobile
     panel. See the ".nav-dropdown" block in style.css for why the panel is
     positioned rather than nested, and why this is scripted instead of a
     pure :hover chain. */
  {
    const navServices = document.getElementById('navServices');
    const navDropdown = document.getElementById('navDropdown');
    const siteHeader = document.querySelector('.site-header');
    const navServicesLink = navServices ? navServices.querySelector('a') : null;

    if (navServices && navDropdown && siteHeader && navServicesLink) {
      // The trigger sits in a centred nav whose width depends on the loaded
      // font, so the offset is measured rather than hard-coded — and
      // remeasured before every open, on resize, and once the webfont swaps in.
      const positionDropdown = () => {
        const headerLeft = siteHeader.getBoundingClientRect().left;
        const itemLeft = navServices.getBoundingClientRect().left;
        siteHeader.style.setProperty('--nav-dropdown-x', `${Math.round(itemLeft - headerLeft)}px`);
      };

      let closeTimer = null;
      const setDropdownOpen = (isOpen) => {
        clearTimeout(closeTimer);
        if (isOpen) positionDropdown();
        document.body.classList.toggle('nav-dropdown-open', isOpen);
        navServices.classList.toggle('is-open', isOpen);
        navServicesLink.setAttribute('aria-expanded', String(isOpen));
      };
      // Closing is delayed: the pointer has to cross the header's own bottom
      // padding to reach the panel, and without this grace period the panel
      // would close out from under it halfway across.
      const closeSoon = () => {
        clearTimeout(closeTimer);
        closeTimer = setTimeout(() => setDropdownOpen(false), 180);
      };

      [navServices, navDropdown].forEach((el) => {
        el.addEventListener('mouseenter', () => setDropdownOpen(true));
        el.addEventListener('mouseleave', closeSoon);
      });
      // Keyboard: opens as soon as focus reaches the trigger, closes once
      // focus has left both the trigger and the panel entirely.
      navServices.addEventListener('focusin', () => setDropdownOpen(true));
      document.addEventListener('focusin', (e) => {
        if (!navServices.contains(e.target) && !navDropdown.contains(e.target)) {
          setDropdownOpen(false);
        }
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.body.classList.contains('nav-dropdown-open')) {
          setDropdownOpen(false);
          navServicesLink.focus();
        }
      });
      // Scrolling closes it, same as the manually expanded compact nav does.
      window.addEventListener('scroll', () => {
        if (document.body.classList.contains('nav-dropdown-open')) setDropdownOpen(false);
      }, { passive: true });
      navDropdown.querySelectorAll('a').forEach((link) => {
        link.addEventListener('click', () => setDropdownOpen(false));
      });

      window.addEventListener('resize', positionDropdown);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(positionDropdown);
      positionDropdown();
    }

    // Mobile accordion — same sub-items, tapped open instead of hovered.
    const mobileSubToggle = document.getElementById('mobileSubToggle');
    const mobileNavGroup = mobileSubToggle ? mobileSubToggle.closest('.mobile-nav-group') : null;
    if (mobileSubToggle && mobileNavGroup) {
      mobileSubToggle.addEventListener('click', () => {
        const isOpen = mobileNavGroup.classList.toggle('is-open');
        mobileSubToggle.setAttribute('aria-expanded', String(isOpen));
      });
    }
  }

  /* Mobile bottom bar's own burger (Figma node 466:3626) — same #mobileNav
     overlay, same body.nav-open switch as the header toggle above; kept as
     a second listener (rather than re-dispatching a click on navToggle) so
     it works even though navToggle is display:none at this breakpoint. */
  if (mobileBarToggle && mobileNav) {
    mobileBarToggle.addEventListener('click', () => {
      setNavOpen(!document.body.classList.contains('nav-open'));
    });
  }

  /* Compact header on scroll (desktop) — see the CSS comment above
     ".nav-toggle" in style.css for the Figma prototype this is based on
     (node 248:496 / component 334:2271) and why it's scroll-triggered
     here instead of click-triggered like the prototype. Threshold is a
     full viewport (window.innerHeight), recomputed on resize since it's
     not a fixed pixel value; same rAF-throttle pattern as the Prozess
     scroll handler below.
     Only toggles nav-compact on an actual threshold crossing (tracked
     via isPastThreshold) rather than unconditionally setting it on
     every scroll tick — needed so nav-compact-expanded (see above) can
     coexist with nav-compact without a scroll tick immediately
     stomping on it. nav-compact-expanded itself is closed unconditionally
     on every scroll tick, regardless of threshold crossing, per explicit
     direction that scrolling further should always close the manually
     reopened nav. */
  (() => {
    let ticking = false;
    const COMPACT_THRESHOLD = 0.4; // was 1 (full viewport) — triggers sooner per explicit direction
    let isPastThreshold = window.scrollY > window.innerHeight * COMPACT_THRESHOLD;
    document.body.classList.toggle('nav-compact', isPastThreshold);
    const updateNavCompact = () => {
      ticking = false;
      closeCompactExpanded();
      const pastNow = window.scrollY > window.innerHeight * COMPACT_THRESHOLD;
      if (pastNow !== isPastThreshold) {
        isPastThreshold = pastNow;
        document.body.classList.toggle('nav-compact', pastNow);
      }
    };
    const requestUpdate = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(updateNavCompact);
    };
    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate);
  })();

  /* Social rail: dock above the footer.
     .social-rail is position:fixed + vertically centered (top:50%,
     translateY(-50%)) via CSS so it tracks scroll like a normal fixed
     sidebar. Once the footer scrolls up close enough that the
     centered rail would start sliding over it, this switches it to
     .is-docked (position:absolute, see CSS) with an inline `top` pinned
     GAP_PX above the footer's document-relative top edge. From then on
     the rail is back in normal document flow at that fixed point, so it
     scrolls away with the rest of the page instead of covering the
     footer — scrolling back up undoes it once there's room again.
     Same rAF-throttled scroll/resize pattern as the other handlers here. */
  (() => {
    const socialRail = document.querySelector('.social-rail');
    const footer = document.querySelector('.site-footer');
    if (!socialRail || !footer) return;
    const GAP_PX = 32; // breathing room kept between the rail and the footer's top edge
    let ticking = false;
    const updateSocialRail = () => {
      ticking = false;
      const railHeight = socialRail.getBoundingClientRect().height;
      const centeredBottom = window.innerHeight / 2 + railHeight / 2; // rail's bottom edge while fixed+centered
      const footerTop = footer.getBoundingClientRect().top;
      if (footerTop <= centeredBottom + GAP_PX) {
        const footerDocTop = footerTop + window.scrollY;
        socialRail.style.top = `${footerDocTop - GAP_PX - railHeight}px`;
        socialRail.classList.add('is-docked');
      } else {
        socialRail.classList.remove('is-docked');
        socialRail.style.top = '';
      }
    };
    const requestUpdate = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(updateSocialRail);
    };
    updateSocialRail();
    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate);
  })();

  /* Debug column grid (testing only) — hidden by default, press "g" to show
     it. Ignored while typing, so the key still works in the contact form and
     the search field. */
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'g' && e.key !== 'G') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const el = document.activeElement;
    if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
    document.body.classList.toggle('show-grid');
  });

  /* Cases carousel — an endless loop, transform-only.
     Confirmed (via live measurement, not just static analysis) root cause
     of the recurring "jump": reading an item's offsetLeft synchronously,
     right after toggling a *transitioning* class on another item, returns
     Chrome's PRE-toggle layout — the width transition hasn't been staged
     yet within the same script turn, so the read is stale by exactly one
     item's large/small width delta. Every normal next/prev slide was
     therefore landing ~53px off from where the (statically correct)
     title sits — consistently off, so no visible seam between ordinary
     slides — until the periodic transition-free re-center (see below)
     recomputed the position correctly and the strip visibly snapped back
     into place. That's the "jump": not a buffer problem, a stale
     measurement problem.
     Fix: never re-measure the new active item's position *after* toggling
     its class. Capture its pre-toggle offsetLeft (reliable, nothing is
     transitioning yet) and the current large/small width delta *before*
     changing any classes, then compute the post-toggle target
     analytically — only the outgoing active item's width change can
     affect the incoming one's offsetLeft, and only if it precedes it in
     DOM order (i.e. only for "next"; "prev" needs no adjustment at all).
     Separately, an instant re-center (transitions off) is unaffected by
     this quirk — with no transition pending there's nothing to stage, so
     a plain post-toggle offsetLeft read is accurate there.
     Everything else about the design stays: DOM order never changes, 5
     laps (20 items) of generous buffer, re-centered onto the equivalent
     middle-lap slot after every slide so there's never a boundary to run
     out of.
     The active item's left edge is anchored to the start of column 4 of
     the 12-column grid (not column 1) — see activeColOffsetPx below — and
     the title in style.css is positioned at the same offset, so they
     still line up by construction. */
  const casesTrack = document.getElementById('casesTrack');
  const caseTitle = document.getElementById('caseActiveTitle');

  // Items come from js/cases-data.js (prepared by js/cases.js as
  // window.NOLL_HOME_CASES); the list below is only the fallback.
  const CASES = window.NOLL_HOME_CASES && window.NOLL_HOME_CASES.length ? window.NOLL_HOME_CASES : [
    { title: 'Projekt 02', tags: 'Web<br>Branding<br>Marketing', img: 'images/mockup_case.jpg' },
    { title: 'URSA Chemie', tags: 'Industrie<br>Website<br>Content', img: 'images/cases/ursa-hero.jpg', href: 'case-ursa-chemie.html', alt: 'Website der URSA Chemie' },
    { title: 'Westerwald Bank', tags: 'Immobilien<br>Website<br>SEO', img: 'images/cases/wwb-hero.jpg', href: 'case-westerwald-bank.html', alt: 'Website der Immobiliengesellschaft der Westerwald Bank' },
    { title: 'Marx & Jansen', tags: 'Steuerberatung<br>Website<br>Online-Portal', img: 'images/cases/mj-hero.jpg', href: 'case-marx-jansen.html', alt: 'Website von Marx & Jansen' }
  ];
  const LAPS = 5; // generous buffer: 2 full laps of slack on each side of the middle lap, always

  if (casesTrack) {
    const laid = [];
    for (let lap = 0; lap < LAPS; lap++) {
      CASES.forEach((c) => {
        const el = document.createElement('article');
        el.className = 'case-item';
        el.dataset.title = c.title;
        // Real cases link through to their case page; placeholders stay inert.
        // Only the middle lap's copy is exposed to screen readers / tab order,
        // the buffer laps are visual repeats.
        const img = `<img src="${c.img}" alt="${lap === Math.floor(LAPS / 2) ? (c.alt || '') : ''}" decoding="async">`;
        const media = c.href
          ? `<a class="case-media" href="${c.href}"${lap === Math.floor(LAPS / 2) ? '' : ' tabindex="-1" aria-hidden="true"'}>${img}</a>`
          : `<div class="case-media">${img}</div>`;
        el.innerHTML = media + `<p class="case-tags">${c.tags}</p>`;
        casesTrack.appendChild(el);
        // .case-media (height) and .case-tags (opacity) each declare their
        // own transition in CSS, independent of .case-item's (width). All
        // three need to be suppressed together for an instant jump to
        // actually be instant — cache the refs once here instead of
        // re-querying on every jump.
        el._transitioned = [el, el.querySelector('.case-media'), el.querySelector('.case-tags')];
        laid.push(el);
      });
    }

    const N = CASES.length;
    const HOME = N * Math.floor(LAPS / 2); // first index of the middle lap
    const SAFETY_MS = 600; // slightly more than the .5s CSS transition, in case transitionend doesn't fire
    let activePos = HOME; // first item of the middle lap = first case in js/cases-data.js
    let animating = false; // guards against overlapping slides from rapid clicks

    // Active slide is anchored to the start of column 4 of the 12-column
    // grid, not column 1: 3 columns+gutters in (216px + 40px each @3840
    // reference = 256px), i.e. 768/3840 = 20vw. Matches
    // .case-active-title's `left` in style.css — keep both in sync if the
    // grid ever changes. Computed fresh on every call instead of cached
    // once, so it stays correct across viewport resizes.
    const ACTIVE_COL_OFFSET_VW = 20;
    // On the phone layout there is no 12-column grid to anchor to and a 20vw
    // indent would leave almost no room for the active card, so it starts at
    // the content edge instead. Must stay in step with --active-col-offset
    // in the responsive block of style.css, which moves .case-active-title
    // by the same amount.
    const activeColOffsetVw = () => (isMobileLayout() ? 0 : ACTIVE_COL_OFFSET_VW);
    const activeColOffsetPx = () => (window.innerWidth * activeColOffsetVw()) / 100;

    const setTitleAndTransform = (pos, targetOffsetLeft) => {
      if (caseTitle) caseTitle.textContent = laid[pos].dataset.title || '';
      casesTrack.style.transform = `translateX(${activeColOffsetPx() - targetOffsetLeft}px)`;
    };

    // Single-step, animated move (next/prev, always exactly ±1). Measures
    // everything it needs from the *current, settled* layout before
    // touching any classes, then computes the new active item's final
    // position with plain arithmetic instead of re-measuring afterwards
    // (see the comment above the carousel for why that re-measurement is
    // unreliable while a transition is starting).
    const slideTo = (newPos) => {
      const oldEl = laid[activePos];
      const newEl = laid[newPos];
      const deltaWidth = oldEl.getBoundingClientRect().width - newEl.getBoundingClientRect().width; // large - small
      const newOffsetLeftPre = newEl.offsetLeft;
      const targetOffsetLeft = newPos > activePos ? newOffsetLeftPre - deltaWidth : newOffsetLeftPre;

      activePos = newPos;
      laid.forEach((el, i) => el.classList.toggle('is-large', i === activePos));
      setTitleAndTransform(activePos, targetOffsetLeft);
    };

    // Instant jump with transitions suppressed (initial paint, and the
    // re-center below). No transition is pending here, so a plain
    // post-toggle offsetLeft read is accurate — it's only unreliable
    // while something is mid-transition.
    //
    // Bug this fixes: only .case-item's own transition (width) was being
    // suppressed here — its nested .case-media (height) and .case-tags
    // (opacity) each declare their *own* transition in CSS and kept
    // running unsuppressed. So a re-center landing on a item that had
    // never been active before (its media still at "small" height) would
    // snap the width instantly (correct) but then visibly grow the
    // height over the next ~0.5s (wrong) — the box growing, right after
    // it had just "shrunk" to the previous item's size. That's the
    // grow → shrink → grow the recording showed.
    const jumpTo = (newPos) => {
      activePos = newPos;
      casesTrack.style.transition = 'none';
      laid.forEach((el) => { el._transitioned.forEach((t) => { if (t) t.style.transition = 'none'; }); });
      laid.forEach((el, i) => el.classList.toggle('is-large', i === activePos));
      setTitleAndTransform(activePos, laid[activePos].offsetLeft);
      casesTrack.getBoundingClientRect(); // force reflow so it applies before paint
      requestAnimationFrame(() => {
        casesTrack.style.transition = '';
        laid.forEach((el) => { el._transitioned.forEach((t) => { if (t) t.style.transition = ''; }); });
      });
    };

    // Snap back to the equivalent slot in the middle lap. Since every
    // copy of a case is identical and only one item is ever .is-large, an
    // equivalent slot always looks pixel-for-pixel the same, so this is
    // invisible as long as there's enough DOM buffer around it — which
    // there always is now (see LAPS above).
    const recenter = (onDone) => {
      const rel = ((activePos - HOME) % N + N) % N;
      const target = HOME + rel;
      if (target === activePos) { if (onDone) onDone(); return; }
      jumpTo(target);
      if (onDone) requestAnimationFrame(onDone);
    };

    jumpTo(activePos);

    document.querySelectorAll('.slider-btn[data-slide]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (animating) return;
        animating = true;

        slideTo(activePos + (btn.dataset.slide === 'next' ? 1 : -1));

        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          casesTrack.removeEventListener('transitionend', onEnd);
          recenter(() => { animating = false; });
        };
        const onEnd = (e) => {
          if (e.target === casesTrack && e.propertyName === 'transform') finish();
        };
        casesTrack.addEventListener('transitionend', onEnd);
        setTimeout(finish, SAFETY_MS);
      });
    });
  }

  /* Leistungen slider — plain native-scroll track, no endless loop: every
     card is the same size (unlike Cases' grow-on-active card), and at
     desktop widths the 4 cards' combined width already equals the full
     content grid, so there's nothing to loop through. Prev/next just
     scroll the track by one card+gap; mainly earns its keep on narrower
     viewports where the cards don't all fit. */
  {
    const leistungenTrack = document.getElementById('leistungenTrack');
    if (leistungenTrack) {
      const scrollByCard = (dir) => {
        const card = leistungenTrack.querySelector('.leistung-card');
        const gap = parseFloat(getComputedStyle(leistungenTrack).columnGap || getComputedStyle(leistungenTrack).gap) || 0;
        const step = card ? card.getBoundingClientRect().width + gap : leistungenTrack.clientWidth;
        leistungenTrack.scrollBy({ left: dir * step, behavior: 'smooth' });
      };
      document.querySelectorAll('[data-leistung-slide]').forEach((btn) => {
        btn.addEventListener('click', () => scrollByCard(btn.dataset.leistungSlide === 'next' ? 1 : -1));
      });
    }
  }

  /* Leistungen CTA hover swap — same cross-slide/rotate pattern as the
     Creativity CTA measurement below, just generalized across every card
     (each "Mehr erfahren" button needs its own measured widths, set as
     custom properties on that specific .leistung-cta rather than
     globally). */
  {
    const leistungCtas = document.querySelectorAll('.leistung-cta');
    if (leistungCtas.length) {
      const measureLeistungCtas = () => {
        leistungCtas.forEach((cta) => {
          const label = cta.querySelector('.leistung-cta-label');
          const icon = cta.querySelector('.leistung-cta-icon');
          if (!label || !icon) return;
          cta.style.setProperty('--leistung-cta-label-w', `${label.offsetWidth}px`);
          cta.style.setProperty('--leistung-cta-icon-w', `${icon.offsetWidth}px`);
        });
      };
      measureLeistungCtas();
      window.addEventListener('resize', measureLeistungCtas);
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(measureLeistungCtas);
      }
    }
  }

  /* Leistung Detail page CTA hover swap — same cross-slide/rotate pattern
     as the Leistungen CTAs above, generalized across .leistung-detail-cta
     (this page has two instances: hero + contact band). Only present on
     the standalone Leistung Detail pages, so this is a no-op elsewhere. */
  {
    const detailCtas = document.querySelectorAll('.leistung-detail-cta');
    if (detailCtas.length) {
      const measureDetailCtas = () => {
        detailCtas.forEach((cta) => {
          const label = cta.querySelector('.leistung-detail-cta-label');
          const icon = cta.querySelector('.leistung-detail-cta-icon');
          if (!label || !icon) return;
          cta.style.setProperty('--ldcta-label-w', `${label.offsetWidth}px`);
          cta.style.setProperty('--ldcta-icon-w', `${icon.offsetWidth}px`);
        });
      };
      measureDetailCtas();
      window.addEventListener('resize', measureDetailCtas);
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(measureDetailCtas);
      }
    }
  }

  /* Feature accordion on the Leistung Detail pages (Figma component 785:4372).
     Rows toggle independently — opening one does not close the others, so
     nothing collapses under the reader while they are looking at it. The
     height itself is animated in CSS (grid-template-rows 0fr -> 1fr), so this
     only has to flip a class and keep aria-expanded honest. */
  {
    document.querySelectorAll('.leistung-detail-feature-row').forEach((row) => {
      const item = row.closest('.leistung-detail-feature');
      if (!item) return;
      row.addEventListener('click', () => {
        const isOpen = item.classList.toggle('is-open');
        row.setAttribute('aria-expanded', String(isOpen));
      });
    });
  }

  /* Drip morph — the Websites & Online-Shops icon.
     images/leistungen/websites-shops.svg and ..._hover.svg are the same drawing
     except for one path: the drip across the screen, which runs further down in
     the hover state. Both `d` strings use the identical sequence of commands and
     differ only in six numbers, so morphing between them is a plain numeric
     interpolation — no path-matching library needed, and the shape stays exactly
     the artwork at both ends.
     Done in script rather than with a CSS transition on `d`: that property is
     not animatable in every browser (Firefox has no support at all), so a
     CSS-only version silently does nothing there. Writing the attribute frame by
     frame works everywhere. Each drip finds its own trigger — the card on the
     homepage, the illustration on a detail page. */
  {
    const drips = document.querySelectorAll('.ws-drip');
    const DURATION = 550;
    // splits "M202,21.4v8.4..." into its numbers and the separators between them
    const NUM = /-?\d*\.?\d+/g;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion:reduce)');

    drips.forEach((drip) => {
      const fromD = drip.getAttribute('d');
      const toD = drip.getAttribute('data-hover-d');
      const trigger = drip.closest('.leistung-card, .leistung-detail-illustration');
      if (!fromD || !toD || !trigger) return;

      const from = fromD.match(NUM).map(Number);
      const to = toD.match(NUM).map(Number);
      const skeleton = fromD.split(NUM);
      // Bail out rather than draw nonsense if the two shapes ever stop lining
      // up (e.g. one of the two SVGs gets re-exported differently).
      if (from.length !== to.length || fromD.split(NUM).join('') !== toD.split(NUM).join('')) return;

      const render = (t) => {
        let d = '';
        for (let i = 0; i < from.length; i++) {
          d += skeleton[i] + Math.round((from[i] + (to[i] - from[i]) * t) * 100) / 100;
        }
        drip.setAttribute('d', d + skeleton[skeleton.length - 1]);
      };

      let raf = null;
      let progress = 0;
      const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

      const animateTo = (target) => {
        if (reduceMotion.matches) { progress = target; render(progress); return; }
        cancelAnimationFrame(raf);
        const start = progress;
        const startedAt = performance.now();
        // Scale the duration by how far there is left to go, so reversing
        // mid-morph comes back at the same speed instead of easing over the
        // full time from wherever it happened to be.
        const span = Math.abs(target - start);
        if (!span) return;
        const step = (now) => {
          const t = Math.min(1, (now - startedAt) / (DURATION * span));
          progress = start + (target - start) * easeInOut(t);
          render(progress);
          if (t < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
      };

      trigger.addEventListener('mouseenter', () => animateTo(1));
      trigger.addEventListener('mouseleave', () => animateTo(0));
      trigger.addEventListener('focusin', () => animateTo(1));
      trigger.addEventListener('focusout', () => animateTo(0));
    });
  }

  /* Prozess — scroll-following curve + vignette visibility, merged into
     one scroll handler.
     Curve: the circle (.process-circle) is sticky-pinned vertically
     centered in the viewport via CSS; this figures out, for every
     .process-item, where the circle's own edge sits at that item's
     current on-screen height, and slides the item out to sit a constant
     gap past it — so items near the viewport's vertical center (closest
     to the circle's widest point) sit furthest right, and items further
     above/below slide left along the curve as the page scrolls,
     "rotating" past the fixed circle.
     RADIUS_VW / CIRCLE_LEFT_VW / GAP_VW must stay equal to
     --process-radius / --process-circle-left / --process-gap in style.css.
     Radius/left-offset are tuned smaller than the Figma prototype's exact
     circle so the swing actually reads as motion within one real scroll
     pass — see the long comment above .process in style.css for why —
     same circle, described twice, since CSS custom properties can't be
     read back into JS without a live DOM query, and querying on every
     scroll tick isn't worth it for three constants.
     Vignette: .process-fade only shows once the section is actually the
     thing on screen, not the moment it first peeks up from below (it's
     sticky+100vh like .process-circle-wrap, so before scroll reaches
     .process's own top edge it just sits at its normal, unstuck flow
     position, which can already be inside the viewport). Gated on
     whether the circle is currently actually STUCK (rect.top <= 0).
     PERFORMANCE FIX: this used to be two separate scroll listeners, and
     the curve one read+wrote per item in the same forEach — rect =
     item.getBoundingClientRect() (read) immediately followed by
     item.style.setProperty(...) (write), repeated 5 times. Interleaving
     reads and writes like that forces a synchronous layout recalculation
     on every single iteration (each write invalidates layout, so the
     next read has to redo it) — 5+ forced reflows every scroll tick,
     which is what made scrolling feel choppy. Fixed by splitting into a
     read phase (every getBoundingClientRect() call, including the
     vignette's) followed by a write phase (every style/class change) —
     one reflow total per tick, no matter how many elements are read.
     Draw-on/off: the circle's outline (.process-circle-path, an SVG
     <circle>) draws itself in as you scroll into the section and draws
     back out before you leave it, via stroke-dasharray/dashoffset — see
     the CSS comment on .process-circle-path for the geometry
     (CIRCLE_CIRCUMFERENCE below must match the dasharray value there).
     progress is measured across the whole pinned scroll distance of the
     section (0 right as the circle first sticks to the viewport top, 1
     right as the section is about to release to whatever comes next),
     then mapped through a triangular drawAmount (0→1 over the first
     half, 1→0 over the second half) at the point it's actually used —
     see below. */
  const processItems = document.querySelectorAll('.process-item');
  const processSection = document.querySelector('.process');
  const processCircleWrap = document.querySelector('.process-circle-wrap');
  const processCirclePath = document.querySelector('.process-circle-path');
  const processFade = document.querySelector('.process-fade');
  if (processItems.length || (processCircleWrap && processFade) || processCirclePath) {
    const RADIUS_VW = 32;
    const CIRCLE_LEFT_VW = -32;
    const GAP_VW = 7.708;
    const CIRCLE_CIRCUMFERENCE = 313.85; // must match the dasharray in style.css (.process-circle-path)
    let ticking = false;

    const updateProcess = () => {
      ticking = false;

      // --- read phase ---
      const wrapTop = processCircleWrap ? processCircleWrap.getBoundingClientRect().top : null;
      const sectionRect = processSection ? processSection.getBoundingClientRect() : null;
      const itemCenters = Array.from(processItems, (item) => {
        const rect = item.getBoundingClientRect();
        return rect.top + rect.height / 2;
      });

      // --- write phase ---
      if (processCircleWrap && processFade) {
        processFade.classList.toggle('is-visible', wrapTop <= 0);
      }
      if (processCirclePath && sectionRect) {
        const scrollableHeight = sectionRect.height - window.innerHeight;
        const progress = scrollableHeight > 0
          ? Math.min(1, Math.max(0, -sectionRect.top / scrollableHeight))
          : 0;
        // Was a straight 0→1 ramp across the whole section (fully drawn by
        // the midpoint, then staying fully drawn — since the second half
        // just kept drawing the invisible off-screen left semicircle,
        // which had no visual effect). Per explicit direction, the circle
        // should also animate back OUT before the section ends rather
        // than just vanishing abruptly once it unpins. Triangular mapping
        // instead: draws in over the first half of the section's scroll
        // (0→0.5 progress → drawAmount 0→1) and draws back out over the
        // second half (0.5→1 progress → drawAmount 1→0), so it's fully
        // undrawn again right as the section releases.
        const drawAmount = progress <= 0.5 ? progress * 2 : (1 - progress) * 2;
        processCirclePath.style.setProperty('--process-draw', String(CIRCLE_CIRCUMFERENCE * (1 - drawAmount)));
      }
      if (processItems.length && !isMobileLayout()) {
        const radiusPx = (RADIUS_VW / 100) * window.innerWidth;
        const circleCenterXPx = ((CIRCLE_LEFT_VW + RADIUS_VW) / 100) * window.innerWidth;
        const gapPx = (GAP_VW / 100) * window.innerWidth;
        const viewportCenterY = window.innerHeight / 2;
        processItems.forEach((item, i) => {
          const dy = itemCenters[i] - viewportCenterY;
          const reach = Math.abs(dy) < radiusPx ? Math.sqrt(radiusPx * radiusPx - dy * dy) : 0;
          item.style.setProperty('--item-x', `${circleCenterXPx + reach + gapPx}px`);
        });
      }
    };

    const requestUpdate = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(updateProcess);
    };

    updateProcess();
    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate);
  }

  // Creativity section: subtle parallax drift on the 3 overlapping photos
  // as the section scrolls through the viewport. Each image gets its own
  // amplitude/direction so they drift at slightly different rates, giving
  // a sense of depth. Read/write phases kept separate (one rect read, then
  // one write pass) to avoid layout thrashing, same pattern as above.
  {
    const creativitySection = document.querySelector('.creativity');
    const creativityImgs = document.querySelectorAll('.creativity-img');
    if (creativitySection && creativityImgs.length) {
      const AMPLITUDES_VW = [4, -7, 9]; // img1 (slow/back), img2 (opposite), img3 (fast/front) — stronger per explicit direction
      let cTicking = false;
      const updateParallax = () => {
        cTicking = false;
        // Mobile lays the collage out as a plain grid (see the responsive
        // block in style.css) — a leftover inline translateY would push the
        // photos out of their cells, so clear it and stand down.
        if (isMobileLayout()) {
          creativityImgs.forEach((img) => { img.style.transform = ''; });
          return;
        }
        // --- read phase ---
        const rect = creativitySection.getBoundingClientRect();
        // --- write phase ---
        const vh = window.innerHeight;
        const center = rect.top + rect.height / 2;
        const span = vh / 2 + rect.height / 2;
        const progress = span > 0 ? Math.max(-1, Math.min(1, (vh / 2 - center) / span)) : 0;
        creativityImgs.forEach((img, i) => {
          const amp = AMPLITUDES_VW[i] || 0;
          img.style.transform = `translateY(${(progress * amp).toFixed(3)}vw)`;
        });
      };
      const requestParallax = () => {
        if (cTicking) return;
        cTicking = true;
        requestAnimationFrame(updateParallax);
      };
      updateParallax();
      window.addEventListener('scroll', requestParallax, { passive: true });
      window.addEventListener('resize', requestParallax);
    }
  }

  // Creativity CTA hover swap: label/icon cross-slide via transform (see
  // CSS) needs to know each element's actual rendered width, since the
  // label's width depends on its text. Measure once on load, on resize,
  // and again once webfonts finish loading (text can reflow narrower/
  // wider once the real typeface swaps in for the fallback).
  {
    const cta = document.querySelector('.creativity-cta');
    const ctaLabel = cta ? cta.querySelector('.creativity-cta-label') : null;
    const ctaIcon = cta ? cta.querySelector('.creativity-cta-icon') : null;
    if (cta && ctaLabel && ctaIcon) {
      const measureCta = () => {
        cta.style.setProperty('--cta-label-w', `${ctaLabel.offsetWidth}px`);
        cta.style.setProperty('--cta-icon-w', `${ctaIcon.offsetWidth}px`);
      };
      measureCta();
      window.addEventListener('resize', measureCta);
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(measureCta);
      }
    }
  }

  // Insights CTA hover swap — same cross-slide/rotate measurement as the
  // Creativity CTA above, now the site's standard for every pill+icon
  // button.
  {
    const insightsCta = document.querySelector('.insights-cta');
    const insightsCtaLabel = insightsCta ? insightsCta.querySelector('.insights-cta-label') : null;
    const insightsCtaIcon = insightsCta ? insightsCta.querySelector('.insights-cta-icon') : null;
    if (insightsCta && insightsCtaLabel && insightsCtaIcon) {
      const measureInsightsCta = () => {
        insightsCta.style.setProperty('--insights-cta-label-w', `${insightsCtaLabel.offsetWidth}px`);
        insightsCta.style.setProperty('--insights-cta-icon-w', `${insightsCtaIcon.offsetWidth}px`);
      };
      measureInsightsCta();
      window.addEventListener('resize', measureInsightsCta);
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(measureInsightsCta);
      }
    }
  }

  // Über uns — facts row. A horizontal accordion: exactly one card is open,
  // clicking a closed one moves the open state to it. Clicking the open one
  // is a no-op rather than a close, because the row has no "all closed"
  // layout in the design (the widths have to add up to the full track).
  {
    const factsRow = document.getElementById('ueberFacts');
    if (factsRow) {
      const facts = Array.from(factsRow.querySelectorAll('.ueber-fact'));
      facts.forEach((fact) => {
        fact.addEventListener('click', () => {
          // The row starts with nothing open, so "all closed" is a real state
          // and clicking the open card closes it again.
          const opening = !fact.classList.contains('is-open');
          facts.forEach((other) => {
            const open = opening && other === fact;
            other.classList.toggle('is-open', open);
            other.setAttribute('aria-expanded', open ? 'true' : 'false');
          });
        });
      });
    }
  }

  // Über uns — team columns. Two effects on one scroll handler:
  //   * parallax: the two columns drift in opposite directions as the section
  //     passes, so they slide against each other rather than moving as one
  //     block. Same progress maths as the Creativity collage above.
  //   * reveal: each portrait fades up once as it comes into view.
  // Both stand down on mobile (single column, see the responsive block in
  // style.css) and under prefers-reduced-motion.
  {
    const teamSection = document.getElementById('ueberTeam');
    if (teamSection) {
      const cols = Array.from(teamSection.querySelectorAll('[data-parallax]'));

      // Fresh order on every visit: the portraits are shuffled and dealt
      // back out alternately, so both columns stay filled evenly and nobody
      // holds a permanent top slot. Dealing starts with the right column —
      // it sits half a step higher than the left one, so it holds the first
      // slot in the zigzag. With an odd head count the extra portrait then
      // lands on the right too and the zigzag still ends right/left/right
      // instead of two in a row on the left. Done before anything else in
      // this block, since the drift amplitudes below are assigned by position.
      if (cols.length) {
        const shuffled = Array.from(teamSection.querySelectorAll('.ueber-person'));
        for (let i = shuffled.length - 1; i > 0; i -= 1) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        const dealOrder = cols.slice().sort((a, b) =>
          (b.dataset.parallax === 'right') - (a.dataset.parallax === 'right'));
        shuffled.forEach((person, i) => {
          dealOrder[i % dealOrder.length].appendChild(person);
        });
      }

      const people = Array.from(teamSection.querySelectorAll('.ueber-person'));
      const reduce = window.matchMedia('(prefers-reduced-motion:reduce)');
      // vw, applied +/- so the columns travel a full 2x this against each other,
      // plus a smaller per-circle drift on top of it.
      const AMPLITUDE_VW = 3.6;
      const PERSON_DRIFT_VW = 1.4;

      if (reduce.matches) {
        people.forEach((p) => p.classList.add('is-in'));
      } else if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add('is-in');
            io.unobserve(entry.target);
          });
        }, { rootMargin: '0px 0px -12% 0px', threshold: 0.15 });
        people.forEach((p) => io.observe(p));
      } else {
        people.forEach((p) => p.classList.add('is-in'));
      }

      // The scroll position feeds a target; what actually gets written is a
      // value that eases towards it every frame. That takes the 1:1 stickiness
      // out of the parallax — the circles keep drifting for a moment after the
      // wheel stops instead of locking to the scrollbar.
      const EASE = 0.075;
      let target = 0;
      let current = 0;
      let rafId = 0;

      const readTarget = () => {
        const rect = teamSection.getBoundingClientRect();
        const vh = window.innerHeight;
        const center = rect.top + rect.height / 2;
        const span = vh / 2 + rect.height / 2;
        target = span > 0 ? Math.max(-1, Math.min(1, (vh / 2 - center) / span)) : 0;
      };

      const write = () => {
        cols.forEach((col) => {
          const dir = col.dataset.parallax === 'right' ? -1 : 1;
          col.style.transform = `translateY(${(current * AMPLITUDE_VW * dir).toFixed(3)}vw)`;
        });
        // Within a column the circles drift against each other too, so the
        // whole grid keeps shifting rather than moving as two solid blocks.
        people.forEach((person) => {
          const amp = parseFloat(person.dataset.drift || '0');
          person.style.transform = `translateY(${(current * amp).toFixed(3)}vw)`;
        });
      };

      const clear = () => {
        cols.forEach((col) => { col.style.transform = ''; });
        people.forEach((person) => { person.style.transform = ''; });
      };

      // Alternating amplitudes per position in the column; the sign flips with
      // the column so neighbours across the gutter never travel together.
      cols.forEach((col) => {
        const dir = col.dataset.parallax === 'right' ? -1 : 1;
        Array.from(col.querySelectorAll('.ueber-person')).forEach((person, i) => {
          person.dataset.drift = ((i % 2 === 0 ? 1 : -1) * dir * PERSON_DRIFT_VW).toFixed(3);
        });
      });

      const tick = () => {
        current += (target - current) * EASE;
        write();
        if (Math.abs(target - current) > 0.0004) {
          rafId = requestAnimationFrame(tick);
        } else {
          current = target;
          write();
          rafId = 0;
        }
      };

      const requestTeamParallax = () => {
        if (isMobileLayout() || reduce.matches) {
          if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
          clear();
          return;
        }
        readTarget();
        if (!rafId) rafId = requestAnimationFrame(tick);
      };

      if (!isMobileLayout() && !reduce.matches) {
        readTarget();
        current = target;
        write();
      }
      window.addEventListener('scroll', requestTeamParallax, { passive: true });
      window.addEventListener('resize', requestTeamParallax);
    }
  }


  // --header-h: the sticky header's rendered height, published on :root so CSS
  // can reach it. The Über-uns stage uses it to pull itself up under the
  // header (full-bleed photo from the very top of the window) and to keep its
  // own content clear of the nav again. Re-measured on resize and once the
  // webfonts land, since the nav row's height follows its type.
  {
    const header = document.querySelector('.site-header');
    if (header) {
      const measureHeader = () => {
        document.documentElement.style.setProperty(
          '--header-h', `${Math.round(header.getBoundingClientRect().height)}px`);
      };
      measureHeader();
      window.addEventListener('resize', measureHeader);
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(measureHeader);
      }
    }
  }


  // Über uns — the two text/image blocks. Each picture drifts inside its own
  // frame while that block passes the viewport: the frame stays put, the
  // oversized image travels through it. Progress is read per image from its
  // own frame rather than from one shared section, since the two blocks are
  // far apart on the page. Same eased follow as the team columns, so the
  // movement carries on for a moment after the wheel stops.
  {
    const kombiImgs = Array.from(document.querySelectorAll('.ueber-kombi-img img'));
    if (kombiImgs.length) {
      const reduceKombi = window.matchMedia('(prefers-reduced-motion:reduce)');
      // percent of the image's own height; the frame leaves 15% of its height
      // spare at each end, which is 11.5% of the 130%-tall image.
      const TRAVEL = 11.5;
      const EASE = 0.08;
      // Alternating sign, so the two pictures travel against each other: as
      // one rides up through its frame the other rides down. The blocks
      // already mirror each other left/right, and this gives the pair the
      // same counter-motion the team columns have.
      const state = kombiImgs.map((_, i) => ({ target: 0, current: 0, dir: i % 2 === 0 ? 1 : -1 }));
      let kRaf = 0;

      const readKombi = () => {
        const vh = window.innerHeight;
        kombiImgs.forEach((img, i) => {
          const rect = img.parentElement.getBoundingClientRect();
          const center = rect.top + rect.height / 2;
          const span = vh / 2 + rect.height / 2;
          state[i].target = span > 0
            ? Math.max(-1, Math.min(1, (vh / 2 - center) / span))
            : 0;
        });
      };

      const kombiTick = () => {
        let moving = false;
        kombiImgs.forEach((img, i) => {
          const st = state[i];
          st.current += (st.target - st.current) * EASE;
          if (Math.abs(st.target - st.current) > 0.0004) moving = true;
          else st.current = st.target;
          img.style.transform = `translateY(${(st.current * TRAVEL * st.dir).toFixed(3)}%)`;
        });
        kRaf = moving ? requestAnimationFrame(kombiTick) : 0;
      };

      const requestKombi = () => {
        if (reduceKombi.matches) {
          if (kRaf) { cancelAnimationFrame(kRaf); kRaf = 0; }
          kombiImgs.forEach((img) => { img.style.transform = ''; });
          return;
        }
        readKombi();
        if (!kRaf) kRaf = requestAnimationFrame(kombiTick);
      };

      if (!reduceKombi.matches) {
        readKombi();
        state.forEach((st) => { st.current = st.target; });
        kombiImgs.forEach((img, i) => {
          img.style.transform = `translateY(${(state[i].current * TRAVEL * state[i].dir).toFixed(3)}%)`;
        });
      }
      window.addEventListener('scroll', requestKombi, { passive: true });
      window.addEventListener('resize', requestKombi);
    }
  }


  // Page transition, departure half. Any click on an internal link is held
  // back: the white panel sweeps in to cover the page, the direction is handed
  // to the next page through sessionStorage, and only then does the navigation
  // run — so the panel carries straight on across the page change instead of
  // restarting. The arrival half is the inline snippet in each <head>.
  {
    const reduceWipe = window.matchMedia('(prefers-reduced-motion:reduce)');
    const COVER_MS = 620; // keep in step with the cover animation in style.css

    // Right-to-left when the link leads back to the homepage, left-to-right for
    // anything deeper in.
    const isHome = (url) => {
      const path = url.pathname.replace(/\/+$/, '');
      return path === '' || /\/index\.html$/.test(path);
    };

    const sameDocument = (url) =>
      url.pathname === window.location.pathname && url.search === window.location.search;

    document.addEventListener('click', (event) => {
      if (reduceWipe.matches) return;
      if (event.defaultPrevented) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const link = event.target.closest('a[href]');
      if (!link) return;
      if (link.target && link.target !== '_self') return;
      if (link.hasAttribute('download')) return;

      const href = link.getAttribute('href');
      // in-page anchors, mailto:, tel:, and anything off-site keep their normal
      // behaviour — there is no page change to cover
      if (!href || href.startsWith('#')) return;

      let url;
      try { url = new URL(href, window.location.href); } catch (e) { return; }
      if (url.origin !== window.location.origin) return;
      if (!/\.html?$/.test(url.pathname) && !url.pathname.endsWith('/')) return;
      if (sameDocument(url)) return;

      event.preventDefault();
      const dir = isHome(url) ? 'rtl' : 'ltr';
      try { sessionStorage.setItem('nollWipe', dir); } catch (e) {}
      // Drop the arrival classes first: a reveal that has finished still holds
      // the panel in its end state, and two animation rules on the same
      // pseudo-element would otherwise be decided by stylesheet order.
      document.documentElement.classList.remove(
        'wipe-hold', 'wipe-reveal-ltr', 'wipe-reveal-rtl');
      document.documentElement.classList.add(`wipe-cover-${dir}`);
      setTimeout(() => { window.location.href = url.href; }, COVER_MS);
    });

    // Coming back via the browser's cache, the panel would still be sitting on
    // the classes it was left with — clear them so the page is not covered.
    window.addEventListener('pageshow', (event) => {
      if (!event.persisted) return;
      document.documentElement.classList.remove(
        'wipe-hold', 'wipe-cover-ltr', 'wipe-cover-rtl', 'wipe-reveal-ltr', 'wipe-reveal-rtl');
    });
  }


  // Cases overview — the category filter. Each project carries its categories
  // in data-case-tags, each chip the one it selects in data-case-filter;
  // "alle" matches everything. Rows are hidden with the `hidden` attribute
  // rather than a class, so they leave the flow; .is-alt re-forms the
  // left/right alternation on whatever is still showing. Animated: out,
  // FLIP for the rows that stay, staggered in (css: .is-leaving/.is-entering).
  {
    const filterBar = document.getElementById('casesFilter');
    const grid = document.getElementById('casesGrid');
    if (filterBar && grid) {
      const chips = Array.from(filterBar.querySelectorAll('[data-case-filter]'));
      const rows = Array.from(grid.querySelectorAll('[data-case-tags]'));

      const reduced = window.matchMedia('(prefers-reduced-motion:reduce)');
      const matches = (row, value) => value === 'alle' || (row.dataset.caseTags || '').split(/\s+/).includes(value);
      // every second *visible* row mirrors (css: .case-row.is-alt)
      const alternate = () => {
        let i = 0;
        rows.forEach((row) => { if (!row.hidden) row.classList.toggle('is-alt', i++ % 2 === 1); });
      };
      grid.classList.add('is-js');
      alternate();

      let current = 'alle', timers = [];
      const later = (fn, ms) => timers.push(setTimeout(fn, ms));
      const setChips = (value) => chips.forEach((chip) => {
        const on = chip.dataset.caseFilter === value;
        chip.classList.toggle('is-active', on);
        chip.setAttribute('aria-pressed', on ? 'true' : 'false');
      });

      const apply = (value) => {
        if (value === current) return;
        current = value;
        setChips(value);
        // a click mid-animation: settle everything first
        timers.forEach(clearTimeout); timers = [];
        rows.forEach((r) => { r.classList.remove('is-leaving', 'is-entering', 'is-flip'); r.style.transform = ''; r.style.transitionDelay = ''; });

        if (reduced.matches){
          rows.forEach((r) => { r.hidden = !matches(r, value); });
          alternate();
          return;
        }

        // 1. rows that drop out fade and sink away
        const leaving = rows.filter((r) => !r.hidden && !matches(r, value));
        leaving.forEach((r) => r.classList.add('is-leaving'));

        later(() => {
          // 2. remember where the remaining rows are and which side they face
          const before = new Map();
          rows.forEach((r) => { if (!r.hidden && !leaving.includes(r)) before.set(r, { top: r.getBoundingClientRect().top, alt: r.classList.contains('is-alt') }); });

          // 3. swap the set
          leaving.forEach((r) => { r.hidden = true; r.classList.remove('is-leaving'); });
          const entering = [];
          rows.forEach((r) => {
            if (matches(r, value) && r.hidden){ r.hidden = false; entering.push(r); }
          });
          alternate();

          // 4. rows that stayed: glide from the old spot (FLIP); a row that now
          //    faces the other way comes in fresh instead
          before.forEach((b, r) => {
            if (r.classList.contains('is-alt') !== b.alt){ entering.push(r); return; }
            const dy = b.top - r.getBoundingClientRect().top;
            if (Math.abs(dy) < 1) return;
            r.classList.add('is-flip');
            r.style.transform = `translateY(${dy}px)`;
          });
          entering.sort((x, y) => rows.indexOf(x) - rows.indexOf(y));
          entering.forEach((r) => r.classList.add('is-entering'));
          void grid.offsetHeight;   // commit the start positions

          requestAnimationFrame(() => {
            before.forEach((b, r) => { if (r.classList.contains('is-flip')){ r.classList.remove('is-flip'); r.style.transform = ''; } });
            // 5. new rows rise in one after another
            entering.forEach((r, i) => {
              r.style.transitionDelay = (i * .09) + 's';
              r.classList.remove('is-entering');
              later(() => { r.style.transitionDelay = ''; }, 800 + i * 90);
            });
          });
        }, leaving.length ? 320 : 0);
      };

      chips.forEach((chip) => {
        chip.setAttribute('aria-pressed', chip.classList.contains('is-active') ? 'true' : 'false');
        chip.addEventListener('click', () => apply(chip.dataset.caseFilter));
      });
    }
  }

})();
