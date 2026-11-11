/* Menü: Spray-Fläche schließt sich vom Rand zur Mitte (Öffnen) und zieht sich wieder zurück (Schließen).
   Sobald der Bildschirm komplett bedeckt ist, wird der Lack auf der Stage entfernt. */
(function () {
  "use strict";
  var menu = document.getElementById("menu"), btn = document.getElementById("menuBtn");
  var cv = document.getElementById("menuSpray"), ctx = cv.getContext("2d");
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var INK = 0xff0a0a0a;                   /* RGBA little-endian: fast schwarz, voll deckend */
  var OPEN_MS = 1050, CLOSE_MS = 850;
  var isOpen = false, p = 0, from = 0, to = 0, t0 = 0, dur = 1, raf = 0, cleaned = false;
  var img = null, buf = null, cw = 0, ch = 0, blot = null, BX = 24, BY = 14, lastFocus = null;

  function size() {
    var s = Math.min(1, 1800 / Math.max(innerWidth, 1));     /* volle Auflösung: feines Korn wie Sprühnebel */
    cw = Math.max(2, Math.round(innerWidth * s)); ch = Math.max(2, Math.round(innerHeight * s));
    cv.width = cw; cv.height = ch; img = ctx.createImageData(cw, ch); buf = new Uint32Array(img.data.buffer);
  }
  function newBlots() {                     /* unruhiger Sprührand: grobes Rauschen, pro Öffnen neu */
    blot = new Float32Array((BX + 1) * (BY + 1));
    for (var i = 0; i < blot.length; i++) blot[i] = Math.random();
  }
  function blotAt(u, v) {
    var x = u * BX, y = v * BY, ix = Math.min(BX - 1, x | 0), iy = Math.min(BY - 1, y | 0), fx = x - ix, fy = y - iy;
    var a = blot[iy * (BX + 1) + ix], b = blot[iy * (BX + 1) + ix + 1], c = blot[(iy + 1) * (BX + 1) + ix], d = blot[(iy + 1) * (BX + 1) + ix + 1];
    return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
  }
  function draw() {
    /* r: Radius des noch freien Kreises (1 = Ecken, -0.25 = alles bedeckt). Start direkt an den Ecken, damit der Lack sofort sichtbar ist. */
    var r = 1.0 - p * 1.25, x, y, i = 0;
    if (r <= -0.24) { buf.fill(INK); ctx.putImageData(img, 0, 0); return; }
    var hw = cw / 2, hh = ch / 2, k = 1 / Math.sqrt(hw * hw + hh * hh);   /* Kreis: gleicher Maßstab in x und y */
    var rowB = new Float32Array(cw);
    for (y = 0; y < ch; y++) {
      var dy = y - hh, v = y / ch;
      if ((y & 3) === 0) for (x = 0; x < cw; x++) rowB[x] = (blotAt(x / cw, v) - 0.5) * 0.07;
      for (x = 0; x < cw; x++, i++) {
        var dx = x - hw, d = Math.sqrt(dx * dx + dy * dy) * k + rowB[x];
        var e = (d - r) / 0.2 + 0.5;                       /* 0..1 innerhalb der Sprühkante */
        if (e <= 0) { buf[i] = 0; continue; }
        if (e >= 1) { buf[i] = INK; continue; }
        buf[i] = Math.random() < e * e * (3 - 2 * e) ? INK : 0;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  function ease(t) { return 1 - (1 - t) * (1 - t); }   /* setzt sofort ein, läuft weich aus */
  function frame(now) {
    var t = Math.min(1, (now - t0) / dur);
    p = from + (to - from) * ease(t);
    draw();
    if (to === 1 && p > 0.88) menu.classList.add("is-content");
    if (to === 1 && t >= 1 && !cleaned) { cleaned = true; if (window.thomasStage) window.thomasStage.clear(); }
    if (t < 1) { raf = requestAnimationFrame(frame); return; }
    raf = 0;
    if (to === 0) { menu.hidden = true; }
  }
  function animate(target, ms) {
    cancelAnimationFrame(raf);
    from = p; to = target; dur = reduceMotion ? 1 : ms * Math.max(0.35, Math.abs(target - p)); t0 = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function open() {
    if (isOpen) return; isOpen = true; cleaned = false;
    lastFocus = document.activeElement;
    menu.hidden = false; size(); newBlots();
    document.body.classList.add("menu-open");
    btn.setAttribute("aria-expanded", "true"); btn.setAttribute("aria-label", "Menü schließen");
    animate(1, OPEN_MS);
    setTimeout(function () { var a = menu.querySelector("a"); if (a) a.focus({ preventScroll: true }); }, reduceMotion ? 0 : OPEN_MS);
  }
  function close() {
    if (!isOpen) return; isOpen = false;
    menu.classList.remove("is-content");
    document.body.classList.remove("menu-open");
    btn.setAttribute("aria-expanded", "false"); btn.setAttribute("aria-label", "Menü öffnen");
    newBlots();
    animate(0, CLOSE_MS);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  btn.addEventListener("click", function () { isOpen ? close() : open(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
  menu.addEventListener("click", function (e) { if (e.target.closest("a")) close(); });
  window.addEventListener("resize", function () { if (!menu.hidden) { size(); draw(); } });
})();
