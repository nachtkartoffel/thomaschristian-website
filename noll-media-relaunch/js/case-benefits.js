/* Case detail — benefit pills next to the laptop (Figma "noll-media",
   Frame 304). A click opens the pill into a frosted card; one open at a time,
   a second click closes it again. Styles: css "case benefits".

   Opening runs in three steps so the card never jumps in height:
     1. the pill widens to the card width (one line high)
     2. the card grows to the final height of its text, measured at that width
     3. the text types itself in — its full block is reserved invisibly
        underneath (.cb-ghost), so typing can't change the height either
   Closing runs the other way round. */
(function(){
  const list = document.getElementById('caseBenefits');
  if (!list) return;
  const reduced = window.matchMedia('(prefers-reduced-motion:reduce)');
  const items = Array.from(list.querySelectorAll('.case-benefit'));
  const WIDEN_MS = 550, GROW_MS = 450, CHAR_MS = 14;

  // prepare the copy: invisible full text keeps the space, typed text sits on top
  items.forEach((item) => {
    const copy = item.querySelector('.case-benefit-copy');
    const text = copy.textContent.trim();
    copy.textContent = '';
    const wrap = document.createElement('span'); wrap.className = 'cb-wrap';
    const ghost = document.createElement('span'); ghost.className = 'cb-ghost'; ghost.textContent = text;
    const typed = document.createElement('span'); typed.className = 'cb-typed'; typed.setAttribute('aria-hidden', 'true');
    const sr = document.createElement('span'); sr.className = 'visually-hidden'; sr.textContent = text;
    wrap.append(ghost, typed); copy.append(wrap, sr);
    item._text = text; item._typed = typed; item._timers = [];
  });

  function clear(item){ item._timers.forEach(clearTimeout); item._timers = []; }
  function later(item, fn, ms){ item._timers.push(setTimeout(fn, ms)); }

  function type(item){
    const t = item._text, el = item._typed;
    if (reduced.matches){ el.textContent = t; return; }
    item.classList.add('is-typing');
    let i = 0;
    const step = () => {
      i = Math.min(t.length, i + 1 + (t[i] === ' ' ? 1 : 0));
      el.textContent = t.slice(0, i);
      if (i < t.length) later(item, step, CHAR_MS); else item.classList.remove('is-typing');
    };
    step();
  }

  function open(item){
    clear(item);
    item._typed.textContent = '';
    item.querySelector('.case-benefit-head').setAttribute('aria-expanded', 'true');
    item.classList.add('is-open');                                   // 1. widen (CSS)
    if (reduced.matches){ item.classList.add('is-tall'); type(item); return; }
    later(item, () => item.classList.add('is-tall'), WIDEN_MS);      // 2. grow (CSS)
    later(item, () => type(item), WIDEN_MS + GROW_MS);               // 3. type
  }
  function close(item){
    clear(item);
    item.classList.remove('is-typing');
    item._typed.textContent = '';
    item.querySelector('.case-benefit-head').setAttribute('aria-expanded', 'false');
    item.classList.remove('is-tall');                                // shrink first …
    if (reduced.matches){ item.classList.remove('is-open'); return; }
    later(item, () => item.classList.remove('is-open'), GROW_MS);    // … then narrow
  }

  items.forEach((item) => {
    item.querySelector('.case-benefit-head').addEventListener('click', () => {
      const isOpen = item.classList.contains('is-open');
      items.forEach((other) => { if (other !== item && other.classList.contains('is-open')) close(other); });
      if (isOpen) close(item); else open(item);
    });
  });
})();
