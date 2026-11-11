/* Scroll-Animationen:
   1) Einblenden: Elemente mit data-reveal bekommen .is-in, sobald sie ins Bild scrollen.
      data-reveal="words" teilt den Text in Wörter, die einzeln von unten aus einer Maske gleiten.
   2) Cases: Das Bild wächst, je näher ein Case der Bildschirmmitte kommt, und schrumpft danach wieder. */
(function () {
  "use strict";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var root = document.documentElement;

  /* ---------- 1) Einblenden ---------- */
  function splitWords(el) {
    var i = 0;
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          var parts = n.textContent.split(/(\s+)/), frag = document.createDocumentFragment();
          parts.forEach(function (p) {
            if (!p) return;
            if (/^\s+$/.test(p)) { frag.appendChild(document.createTextNode(" ")); return; }
            var o = document.createElement("span"), inner = document.createElement("span");
            o.className = "rw"; inner.textContent = p; inner.style.setProperty("--i", i++);
            o.appendChild(inner); frag.appendChild(o);
          });
          node.replaceChild(frag, n);
        } else if (n.nodeType === 1 && n.tagName !== "BR" && n.tagName !== "IMG") walk(n);
      });
    })(el);
  }
  var items = document.querySelectorAll("[data-reveal]");
  if (!reduce && "IntersectionObserver" in window) {
    root.classList.add("js-reveal");
    Array.prototype.forEach.call(items, function (el) { if (el.getAttribute("data-reveal") === "words") splitWords(el); });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); } });
    }, { rootMargin: "0px 0px -12% 0px", threshold: 0.01 });
    Array.prototype.forEach.call(items, function (el) { io.observe(el); });
  }

  /* ---------- 2) Cases wachsen und schrumpfen ---------- */
  var media = Array.prototype.slice.call(document.querySelectorAll(".case__media"));
  var mobile = window.matchMedia("(max-width: 760px)");
  var MIN = 980, MAX = 2314;                     /* Breite in Designpixeln (Frame 3840) */
  var ticking = false;
  function smooth(t) { return t * t * (3 - 2 * t); }
  function update() {
    ticking = false;
    if (mobile.matches) { media.forEach(function (m) { m.style.removeProperty("--w"); }); return; }
    var vh = innerHeight, u = innerWidth / 3840;
    media.forEach(function (m) {
      var c = m.closest(".case"), r = c.getBoundingClientRect();
      var center = r.top + r.height / 2, d = Math.abs(center - vh * 0.5) / (vh * 0.5);   /* nur der Case nahe der Mitte ist groß */
      var t = reduce ? 1 : smooth(1 - Math.min(1, d));
      m.style.setProperty("--w", ((MIN + (MAX - MIN) * t) * u).toFixed(1) + "px");
    });
  }
  function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  update();
})();
