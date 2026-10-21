/* Case detail — screenshot slider under the laptop (Figma "noll-media",
   Frame 324 + controls Frame 283). The active slide lines up with the left
   edge of the content grid, its neighbours bleed off both sides. Arrows, dots,
   drag/swipe and the arrow keys move it. Styles: css "case slider". */
(function(){
  document.querySelectorAll('.case-slider').forEach((root) => {
    const track = root.querySelector('.case-slider-track');
    const slides = Array.from(track.children);
    const dotsWrap = root.querySelector('.case-slider-dots');
    const prev = root.querySelector('.case-slider-prev');
    const next = root.querySelector('.case-slider-next');
    let index = Math.min(parseInt(root.dataset.start || '0', 10), slides.length - 1);

    const dots = slides.map((_, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'case-slider-dot';
      b.setAttribute('aria-label', `Bild ${i + 1} von ${slides.length}`);
      b.addEventListener('click', () => go(i));
      dotsWrap.appendChild(b);
      return b;
    });

    function gridLeft(){
      // left edge of the content grid = where .wrap starts
      const w = root.querySelector('.wrap');
      return w ? w.getBoundingClientRect().left - root.getBoundingClientRect().left : 0;
    }
    function go(i){
      index = Math.max(0, Math.min(slides.length - 1, i));
      const x = gridLeft() - slides[index].offsetLeft;
      track.style.transform = `translate3d(${x}px,0,0)`;
      dots.forEach((d, k) => { d.classList.toggle('is-active', k === index); d.setAttribute('aria-current', k === index ? 'true' : 'false'); });
      slides.forEach((s, k) => s.setAttribute('aria-hidden', k === index ? 'false' : 'true'));
      prev.disabled = index === 0;
      next.disabled = index === slides.length - 1;
    }
    prev.addEventListener('click', () => go(index - 1));
    next.addEventListener('click', () => go(index + 1));
    root.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft'){ go(index - 1); e.preventDefault(); }
      if (e.key === 'ArrowRight'){ go(index + 1); e.preventDefault(); }
    });

    // drag / swipe
    let startX = null, startT = 0;
    track.addEventListener('pointerdown', (e) => { startX = e.clientX; startT = Date.now(); track.classList.add('is-dragging'); });
    window.addEventListener('pointerup', (e) => {
      if (startX === null) return;
      const dx = e.clientX - startX; startX = null; track.classList.remove('is-dragging');
      if (Math.abs(dx) > 40 || (Math.abs(dx) > 15 && Date.now() - startT < 250)) go(index + (dx < 0 ? 1 : -1));
    });
    track.addEventListener('dragstart', (e) => e.preventDefault());

    window.addEventListener('resize', () => go(index));
    window.addEventListener('load', () => go(index));
    go(index);
  });
})();
