/* Stage: Sprühlack mit gedrückter Maustaste auf der ganzen Seite + eigener Cursor.
   (Abgeleitet aus js/bust.js – die Chrom-Büste ist durch das Logo ersetzt, js/logo.js.)
   Der Lack wird in Dokument-Koordinaten gesammelt und scrollt mit der Seite.
   Das Logo spart den Lack aus: Hinter dem Kreis wird gar nicht erst gesprüht (bis genau an die Kante, egal wo das Logo gerade sitzt).
   Das Logo liegt deckend über der Lack-Ebene.: Er wird beim Sprühen ausgespart und beim Zeichnen zusätzlich maskiert. */
(function () {
  "use strict";
  var stage = document.getElementById("stage");
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /* ---------- Logo-Kreis (Viewport-Koordinaten) ----------
     Werte aus assets/index.svg: viewBox 1065.5 breit, Kreis-Mitte 532.8/532.8, Radius 523.3 + halber Stroke 9.5 */
  var VB_W = 1065.5, C_X = 532.8, C_Y = 532.8, C_R = 523.3 + 9.5;
  var circle = { x: -1e6, y: -1e6, r: 0 };
  function updCircle() {
    var svg = document.querySelector("[data-logo] svg");
    if (!svg) { circle.r = 0; return; }
    var b = svg.getBoundingClientRect(), s = b.width / VB_W;
    var r = C_R * s;
    circle.x = b.left + C_X * s; circle.y = b.top + C_Y * s; circle.r = r;   /* exakt die Außenkante des Kreis-Strokes – kein Freiraum */
  }
  function inCircle(x, y, pad) { var dx = x - circle.x, dy = y - circle.y, r = circle.r + (pad || 0); return dx * dx + dy * dy < r * r; }

  /* ---------- Renderer (nur für den Lack mit Korn) ---------- */
  var canvas = document.getElementById("c");
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.autoClear = false;

  /* Hintergrund-Lack: Ebene über das ganze Dokument mit halber Auflösung (accCanvas).
     Davon wird nur der sichtbare Ausschnitt (viewCanvas) als Textur mit Korn-Schwelle gezeichnet. */
  var AS = 0.5;
  var accCanvas = document.createElement("canvas"), actx = accCanvas.getContext("2d");
  var viewCanvas = document.createElement("canvas"), vctx = viewCanvas.getContext("2d");
  var bgTex = new THREE.CanvasTexture(viewCanvas); bgTex.minFilter = THREE.LinearFilter; bgTex.generateMipmaps = false;
  var bgScene = new THREE.Scene(), bgCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  var bgMat = new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false,
    uniforms: { tPaint: { value: bgTex }, uPR: { value: 1 }, uView: { value: new THREE.Vector2() }, uVH: { value: 1 } },
    vertexShader: "varying vec2 vUv;\nvoid main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }\n",
    fragmentShader:
      "precision highp float;\nvarying vec2 vUv;\nuniform sampler2D tPaint;\nuniform float uPR;\nuniform vec2 uView;\nuniform float uVH;\n" +
      "float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\n" +
      "void main(){\n  float a = texture2D(tPaint, vUv).a;\n  if (a < 0.004) discard;\n  vec2 px = vec2(gl_FragCoord.x / uPR + uView.x, uVH - gl_FragCoord.y / uPR + uView.y);  /* Korn haftet am Dokument */\n" +
      "  float n = h(floor(px / 1.5)) * 0.62 + h(floor(px / 8.0) + 7.0) * 0.38;\n" +
      "  float cov = smoothstep(0.16, 0.52, a + (n - 0.5) * 0.5);\n  gl_FragColor = vec4(vec3(0.035), cov);\n}\n"
  });
  var bgQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMat); bgQuad.frustumCulled = false; bgScene.add(bgQuad);

  function sizePaint() {
    var de = document.documentElement;
    var w = Math.max(2, Math.round(Math.max(de.scrollWidth, VW) * AS)), h = Math.max(2, Math.round(Math.max(de.scrollHeight, VH) * AS));
    h = Math.max(h, accCanvas.height); h = Math.ceil(h / 256) * 256;          /* nur wachsen, in Schritten */
    if (accCanvas.width !== w || accCanvas.height !== h) {
      var tmp = null;
      if (accCanvas.width > 2 && accCanvas.height > 2) { tmp = document.createElement("canvas"); tmp.width = accCanvas.width; tmp.height = accCanvas.height; tmp.getContext("2d").drawImage(accCanvas, 0, 0); }
      accCanvas.width = w; accCanvas.height = h;
      if (tmp) actx.drawImage(tmp, 0, 0);
    }
    var vw = Math.max(2, Math.round(VW * AS)), vh = Math.max(2, Math.round(VH * AS));
    if (viewCanvas.width !== vw || viewCanvas.height !== vh) { viewCanvas.width = vw; viewCanvas.height = vh; bgTex.dispose(); }
    bgMat.uniforms.uPR.value = renderer.getPixelRatio(); bgMat.uniforms.uVH.value = VH;
    viewDirty = true;
  }
  var viewDirty = true, lastSX = -1, lastSY = -1;
  function refreshView() {
    var sx = window.scrollX, sy = window.scrollY;
    if (!viewDirty && sx === lastSX && sy === lastSY) return;
    lastSX = sx; lastSY = sy; viewDirty = false;
    vctx.clearRect(0, 0, viewCanvas.width, viewCanvas.height);
    var srcW = Math.min(viewCanvas.width, accCanvas.width - sx * AS), srcH = Math.min(viewCanvas.height, accCanvas.height - sy * AS);
    if (srcW > 0 && srcH > 0) vctx.drawImage(accCanvas, sx * AS, sy * AS, srcW, srcH, 0, 0, srcW, srcH);
    bgTex.needsUpdate = true; bgMat.uniforms.uView.value.set(sx, sy);
  }

  /* ---------- Sprühlack nach „Wall painter“ von pimskie ----------
     Pro Bild ein weicher Radialverlauf an der (verzögert folgenden) Zeigerposition.
     Je schneller der Zeiger, desto größer, blasser und weicher der Tupfer (feiner Nebel),
     dazu Streutröpfchen im Ring um den Pinsel und Farbnasen bei langsamem Sprühen. */
  var PS = 192;
  var tmpCanvas = document.createElement("canvas"); tmpCanvas.width = tmpCanvas.height = PS; var tctx = tmpCanvas.getContext("2d");
  var INK = "10,10,10";
  var spraying = false, brushR = 15, bgDirty = false;
  var from = { x: 0, y: 0 }, tgt = { x: 0, y: 0 }, bgDrips = [], stepAcc = 0;

  function paintStep() {
    var dist = Math.hypot(mouse.x - from.x, mouse.y - from.y);
    var speed = clamp(dist / (VW * 0.15), 0, 1);
    tgt.x += (mouse.x - tgt.x) / 2; tgt.y += (mouse.y - tgt.y) / 2;           /* Pinsel läuft dem Zeiger leicht hinterher */
    var size = brushR, radius = size + size * 4 * speed, alpha = 1 - speed * 0.95, inner = 0.5 * (1 - 0.8 * speed);
    var half = Math.min(Math.max(radius, size * 2.4) + 6, 380);
    var offX = window.scrollX, offY = window.scrollY;                          /* Viewport -> Dokument */
    var cx = tgt.x, cy = tgt.y, wx = Math.round(cx - half), wy = Math.round(cy - half), ws = Math.round(2 * half), k = PS / ws;

    /* 1) Tupfer – ohne den Logo-Kreis */
    tctx.globalCompositeOperation = "source-over"; tctx.clearRect(0, 0, PS, PS);
    var gx = (cx - wx) * k, gy = (cy - wy) * k, gr = radius * k;
    var g = tctx.createRadialGradient(gx, gy, gr * inner, gx, gy, gr);
    g.addColorStop(0, "rgba(" + INK + "," + alpha.toFixed(3) + ")"); g.addColorStop(1, "rgba(" + INK + ",0)");
    tctx.fillStyle = g; tctx.fillRect(0, 0, PS, PS);
    if (circle.r > 0) {
      tctx.globalCompositeOperation = "destination-out";
      tctx.beginPath(); tctx.arc((circle.x - wx) * k, (circle.y - wy) * k, circle.r * k, 0, Math.PI * 2); tctx.fill();
    }
    actx.drawImage(tmpCanvas, (wx + offX) * AS, (wy + offY) * AS, ws * AS, ws * AS);
    bgDirty = true;

    /* 2) Streutröpfchen im Ring um den Pinsel */
    if (Math.random() > 0.25) {
      var ang = Math.PI * 2 * Math.random(), len = size * (1.5 + Math.random() * 0.75), dr = 1 + Math.random(), da = 0.5 + Math.random() * 0.5;
      var dx = cx + Math.cos(ang) * len, dy = cy + Math.sin(ang) * len;
      if (!inCircle(dx, dy, dr)) {
        actx.save(); actx.setTransform(AS, 0, 0, AS, 0, 0);
        actx.fillStyle = "rgba(" + INK + "," + da.toFixed(2) + ")"; actx.beginPath(); actx.arc(dx + offX, dy + offY, dr, 0, Math.PI * 2); actx.fill(); actx.restore(); bgDirty = true;
      }
    }

    /* 3) Farbnasen: nur bei langsamem Sprühen, nicht im Kreis */
    if (Math.random() > 0.94 && speed < 0.06 && !inCircle(cx, cy, 4))
      bgDrips.push({ x: cx + offX, y: cy + offY, s: 2 + 3 * Math.random(), v: 0.25 + 0.75 * Math.random(), dead: false });
    from.x = tgt.x; from.y = tgt.y;
  }

  function updateDrips() {
    if (!bgDrips.length) return;
    var sx = window.scrollX, sy = window.scrollY;
    actx.save(); actx.setTransform(AS, 0, 0, AS, 0, 0); actx.strokeStyle = "rgb(" + INK + ")"; actx.lineCap = "round";
    for (var i = 0; i < bgDrips.length; i++) {
      var d = bgDrips[i];
      if (inCircle(d.x - sx, d.y + d.v - sy, d.s)) { d.dead = true; continue; }   /* Nase läuft nicht in den Kreis */
      actx.lineWidth = d.s; actx.beginPath(); actx.moveTo(d.x, d.y); d.y += d.v; actx.lineTo(d.x, d.y); actx.stroke();
      d.v *= 0.99; if (d.v < 0.1) d.dead = true;
    }
    actx.restore(); bgDirty = true;
    bgDrips = bgDrips.filter(function (x) { return !x.dead; });
  }
  function sprayTick() {
    if (spraying) paintStep();
    updateDrips();
    if (bgDirty) { viewDirty = true; bgDirty = false; }
  }
  function clearPaint() {
    actx.clearRect(0, 0, accCanvas.width, accCanvas.height); viewDirty = true;
    bgDrips = [];
  }

  /* Sprühgeräusch: gefiltertes Rauschen wie im Pen, Tonhöhe nach Pinselgröße, Stereo nach Zeigerposition */
  var snd = null, soundOn = true;
  function SpraySound() {
    var AC = window.AudioContext || window.webkitAudioContext; this.ctx = new AC();
    this.volume = this.ctx.createGain(); this.volume.gain.value = 0;
    this.band = this.ctx.createBiquadFilter(); this.band.type = "bandpass"; this.band.frequency.value = 2500;
    this.panner = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    if (this.panner) { this.volume.connect(this.panner); this.panner.connect(this.ctx.destination); } else this.volume.connect(this.ctx.destination);
    var sr = this.ctx.sampleRate, n = sr, b = this.ctx.createBuffer(1, n, sr), d = b.getChannelData(0), b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (var i = 0; i < n; i++) {
      var wn = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + wn * 0.0555179; b1 = 0.99332 * b1 + wn * 0.0750759; b2 = 0.969 * b2 + wn * 0.153852;
      b3 = 0.8665 * b3 + wn * 0.3104856; b4 = 0.55 * b4 + wn * 0.5329522; b5 = -0.7616 * b5 - wn * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + wn * 0.5362) * 0.11; b6 = wn * 0.115926;
    }
    this.buffer = b;
  }
  SpraySound.prototype.play = function () {
    if (this.ctx.state === "suspended") this.ctx.resume();
    this.source = this.ctx.createBufferSource(); this.source.buffer = this.buffer; this.source.loop = true;
    this.source.connect(this.band); this.band.connect(this.volume); this.source.start();
    var t = this.ctx.currentTime; this.volume.gain.cancelScheduledValues(t); this.volume.gain.setValueAtTime(0, t); this.volume.gain.linearRampToValueAtTime(0.1, t + 0.25);
  };
  SpraySound.prototype.stop = function () {
    var t = this.ctx.currentTime, s = this.source; this.volume.gain.cancelScheduledValues(t); this.volume.gain.linearRampToValueAtTime(0, t + 0.25);
    if (s) setTimeout(function () { try { s.stop(); s.disconnect(); } catch (e) {} }, 400);
  };
  SpraySound.prototype.pan = function (a) { if (this.panner) this.panner.pan.linearRampToValueAtTime(a, this.ctx.currentTime + 0.25); };
  SpraySound.prototype.tune = function (ratio) { this.band.frequency.setValueAtTime(2500 - 1300 * ratio, this.ctx.currentTime); };

  /* ---------- Zeiger (Viewport-Koordinaten, gilt für die ganze Seite) ---------- */
  var body = document.body;
  var mouse = { x: innerWidth / 2, y: innerHeight * 0.4, active: false };
  var ring = document.getElementById("ring"), pt = document.getElementById("pt"), rx = mouse.x, ry = mouse.y;
  /* CTA-Rahmen: über Elementen mit data-cursor-frame formt sich der Cursor-Kreis zu einer Umrandung des CTA */
  var rw = 30, rh = 30, rr = 15, frameEl = null;
  document.addEventListener("pointerover", function (e) { var el = e.target.closest && e.target.closest("[data-cursor-frame]"); frameEl = el || null; body.classList.toggle("on-cta", !!el); });
  document.addEventListener("pointerout", function (e) { if (frameEl && !(e.relatedTarget && frameEl.contains(e.relatedTarget))) { frameEl = null; body.classList.remove("on-cta"); } });
  window.addEventListener("pointermove", function (e) {
    if (e.pointerType === "touch") return;
    mouse.x = e.clientX; mouse.y = e.clientY; mouse.active = true; body.classList.add("seen");
    if (spraying && snd) snd.pan(clamp((mouse.x - VW / 2) / (VW / 2), -1, 1) * 0.75);
  }, { passive: true });
  document.addEventListener("mouseleave", function () { mouse.active = false; body.classList.remove("seen"); stopSpray(); });

  /* Sprühen mit gedrückter Maustaste überall auf der Seite (nicht auf Links/Buttons, nicht im offenen Menü; Touch scrollt) */
  function startSpray(e) {
    if (e.pointerType === "touch") return;
    if (body.classList.contains("menu-open")) return;
    if (e.target.closest && e.target.closest("a, button, input, textarea, select, .menu, .consent")) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();                                   /* keine Textauswahl beim Sprühen */
    spraying = true; mouse.x = e.clientX; mouse.y = e.clientY; mouse.active = true;
    from.x = tgt.x = mouse.x; from.y = tgt.y = mouse.y;
    body.classList.add("seen", "spraying");
    if (soundOn) { try { if (!snd) snd = new SpraySound(); snd.tune((brushR - 10) / 65); snd.pan(clamp((mouse.x - VW / 2) / (VW / 2), -1, 1) * 0.75); snd.play(); } catch (err) { snd = null; } }
  }
  function stopSpray() { if (!spraying) return; spraying = false; body.classList.remove("spraying"); if (snd) snd.stop(); }
  window.addEventListener("pointerdown", startSpray);
  window.addEventListener("pointerup", stopSpray);
  window.addEventListener("pointercancel", stopSpray);
  window.addEventListener("blur", stopSpray);
  window.thomasStage = { clear: clearPaint };
  /* Lack per Doppelklick entfernen */
  window.addEventListener("dblclick", function (e) { if (!(e.target.closest && e.target.closest("a, button, .menu, .consent"))) clearPaint(); });

  /* ---------- Größe ---------- */
  var VW = innerWidth, VH = innerHeight;
  function fit() {
    VW = Math.max(1, innerWidth); VH = Math.max(1, innerHeight);
    renderer.setSize(VW, VH, false);
    sizePaint();
  }
  window.addEventListener("resize", fit); fit();
  if (window.ResizeObserver) new ResizeObserver(function () { sizePaint(); }).observe(document.body);   /* Seitenhöhe ändert sich */

  /* ---------- Schleife ---------- */
  var last = performance.now();
  function tick(now) {
    requestAnimationFrame(tick);
    var dt = Math.min((now - last) / 1000, 0.05); last = now;
    updCircle();

    var tcx = mouse.x, tcy = mouse.y, tw = 2 * brushR, th = 2 * brushR, tr = brushR;
    if (frameEl && !spraying) {
      var fb = frameEl.getBoundingClientRect(), pad = Math.max(8, fb.height * 0.22), padX = Math.max(14, fb.height * 0.45);
      tcx = fb.left + fb.width / 2 + (mouse.x - (fb.left + fb.width / 2)) * 0.08;    /* leicht magnetisch */
      tcy = fb.top + fb.height / 2 + (mouse.y - (fb.top + fb.height / 2)) * 0.12;
      tw = fb.width + 2 * padX; th = fb.height + 2 * pad; tr = 0;
    }
    var kp = 1 - Math.exp(-dt * 14), ks = 1 - Math.exp(-dt * 12);
    rx += (tcx - rx) * kp; ry += (tcy - ry) * kp;
    rw += (tw - rw) * ks; rh += (th - rh) * ks; rr += (tr - rr) * ks;
    ring.style.width = rw.toFixed(1) + "px"; ring.style.height = rh.toFixed(1) + "px";
    ring.style.borderRadius = Math.min(rr, rw / 2, rh / 2).toFixed(1) + "px";
    ring.style.transform = "translate(" + (rx - rw / 2).toFixed(1) + "px," + (ry - rh / 2).toFixed(1) + "px)";
    pt.style.transform = "translate(" + mouse.x.toFixed(1) + "px," + mouse.y.toFixed(1) + "px)";
    stepAcc += dt * 1000; var guardN = 0;
    while (stepAcc >= 16.67 && guardN++ < 2) { stepAcc -= 16.67; sprayTick(); }
    if (stepAcc > 50) stepAcc = 0;
    refreshView();
    renderer.clear(); renderer.render(bgScene, bgCam);
  }
  stage.classList.add("ready"); body.classList.add("ready");
  requestAnimationFrame(tick);
})();
