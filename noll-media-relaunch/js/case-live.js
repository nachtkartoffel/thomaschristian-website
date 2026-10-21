/* Case detail — live client site on the laptop screen.
   The real site (data-live-url on .case-live, here ursa-chemie.de) is loaded
   into the screen as an iframe as soon as the page loads; the captured
   screenshots (.mb-site-shot) show until it has loaded, and stay if it can't.
   It can be used directly (scroll, click, menus) whenever the display is big
   on the stage (.is-zoomed, set by js/case-laptop.js); before and after that
   it ignores the mouse, so the page scroll never gets caught in it.
   Notes: an external site can't be scrolled from outside, so it doesn't follow
   the page scroll; loading it sends the visitor's IP to that server and shows
   its own cookie banner inside the screen. */
(function(){
  const box = document.querySelector('.case-live');
  const section = document.getElementById('caseMacbook');
  if (!box || !section) return;
  const site = section.querySelector('.mb-site');
  const url = box.dataset.liveUrl;
  if (!url) return;
  const frame = document.createElement('iframe');
  frame.className = 'mb-site-live';
  frame.title = 'Live-Website: ' + url;
  frame.setAttribute('referrerpolicy', 'no-referrer');
  frame.addEventListener('load', () => {
    section.classList.add('is-live');
    window.dispatchEvent(new Event('resize'));   // the laptop script re-measures the screen
  });
  frame.src = url;
  site.appendChild(frame);
})();
