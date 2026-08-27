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
  const navToggle = document.getElementById('navToggle');
  const mobileNav = document.getElementById('mobileNav');
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
  if (navToggle && mobileNav) {
    navToggle.addEventListener('click', () => {
      // Desktop compact header un-collapse — see the comment above.
      if (isDesktopNavCompact() || document.body.classList.contains('nav-compact-expanded')) {
        const isExpanded = document.body.classList.toggle('nav-compact-expanded');
        navToggle.setAttribute('aria-expanded', String(isExpanded));
        navToggle.setAttribute('aria-label', isExpanded ? 'Menü schließen' : 'Menü öffnen');
        return;
      }
      const isOpen = document.body.classList.toggle('nav-open');
      navToggle.setAttribute('aria-expanded', String(isOpen));
      navToggle.setAttribute('aria-label', isOpen ? 'Menü schließen' : 'Menü öffnen');
    });
    mobileNav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        document.body.classList.remove('nav-open');
        navToggle.setAttribute('aria-expanded', 'false');
      });
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

  /* Debug column grid (testing only) — press "g" to toggle.
     Reverted to default-visible per explicit direction (was briefly
     switched to default-hidden, see CSS comment). */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'g' || e.key === 'G') {
      document.body.classList.toggle('hide-grid');
    }
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

  const CASES = [
    { title: 'Projekt 02', tags: 'Web<br>Branding<br>Marketing', img: 'images/mockup_case.jpg' },
    { title: 'URSA Chemie', tags: 'Web<br>Branding<br>Marketing', img: 'images/mockup_case.jpg' },
    { title: 'Projekt 02', tags: 'Web<br>Branding<br>Marketing', img: 'images/mockup_case.jpg' },
    { title: 'Projekt 03', tags: 'Web<br>Branding<br>Marketing', img: 'images/mockup_case.jpg' }
  ];
  const LAPS = 5; // generous buffer: 2 full laps of slack on each side of the middle lap, always

  if (casesTrack) {
    const laid = [];
    for (let lap = 0; lap < LAPS; lap++) {
      CASES.forEach((c) => {
        const el = document.createElement('article');
        el.className = 'case-item';
        el.dataset.title = c.title;
        el.innerHTML =
          `<div class="case-media"><img src="${c.img}" alt=""></div>` +
          `<p class="case-tags">${c.tags}</p>`;
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
    let activePos = HOME + 1; // 2nd item of the middle lap = URSA Chemie
    let animating = false; // guards against overlapping slides from rapid clicks

    // Active slide is anchored to the start of column 4 of the 12-column
    // grid, not column 1: 3 columns+gutters in (216px + 40px each @3840
    // reference = 256px), i.e. 768/3840 = 20vw. Matches
    // .case-active-title's `left` in style.css — keep both in sync if the
    // grid ever changes. Computed fresh on every call instead of cached
    // once, so it stays correct across viewport resizes.
    const ACTIVE_COL_OFFSET_VW = 20;
    const activeColOffsetPx = () => (window.innerWidth * ACTIVE_COL_OFFSET_VW) / 100;

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
      if (processItems.length) {
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
})();
