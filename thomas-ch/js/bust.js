/* Chrom-Büste auf der Stage: Kopf folgt dem Mauszeiger. Sprühlack mit gedrückter Maustaste auf der ganzen Seite.
   Das WebGL-Canvas liegt fixiert über dem Viewport; die Büste wird per View-Offset an die Position der Stage gerendert,
   der Hintergrund-Lack wird in Dokument-Koordinaten gesammelt und scrollt mit der Seite. */
(function () {
  "use strict";
  var GLB_B64 = window.BUST_GLB_B64;
  var stage = document.getElementById("stage");
  var sr = stage.getBoundingClientRect(), bustVisible = true;
  function updRect() { sr = stage.getBoundingClientRect(); bustVisible = sr.bottom > 0 && sr.top < VH && sr.right > 0 && sr.left < VW; }
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var statusEl = document.getElementById("status");
  function b64ToBuffer(s) { var b = atob(s), n = b.length, u = new Uint8Array(n); for (var i = 0; i < n; i++) u[i] = b.charCodeAt(i); return u.buffer; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /* ---------- Renderer, Szene ---------- */
  var canvas = document.getElementById("c");
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.autoClear = false;     /* Hintergrund-Lack und Büste werden nacheinander gezeichnet */
  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(24, 1, 0.1, 50);
  var camTarget = new THREE.Vector3(0, -0.32, 0.1)  /* Büste sitzt wie im Layout oberhalb der Wortmarke */, camDist = 7;

  /* Chrom-Studio wie bei Statuen: heller Himmel, scharfer Horizont, fast schwarzer Boden,
     dazu harte Lichtstreifen. Gezeichnet als Equirect-Bild und über PMREM als Umgebung genutzt. */
  function makeEnvironment() {
    var c = document.createElement("canvas"); c.width = 2048; c.height = 1024;
    var g = c.getContext("2d"), i, x;
    var sky = g.createLinearGradient(0, 0, 0, 512);
    sky.addColorStop(0, "#e6e6e6"); sky.addColorStop(0.5, "#b9b9b9"); sky.addColorStop(0.92, "#8a8a8a"); sky.addColorStop(1, "#6c6c6c");
    g.fillStyle = sky; g.fillRect(0, 0, 2048, 512);
    var flr = g.createLinearGradient(0, 512, 0, 1024);
    flr.addColorStop(0, "#3c3c3c"); flr.addColorStop(0.12, "#121212"); flr.addColorStop(0.75, "#161616"); flr.addColorStop(1, "#5a5a5a");
    g.fillStyle = flr; g.fillRect(0, 512, 2048, 512);
    /* dunkle Blenden, damit nicht alles gleichmäßig hell spiegelt */
    g.fillStyle = "#161616"; [[110, 120, 120, 330], [560, 60, 80, 260], [930, 190, 150, 300], [1380, 100, 110, 340], [1760, 150, 170, 300]].forEach(function (r) { g.fillRect(r[0], r[1], r[2], r[3]); });
    /* harte Lichtstreifen, die über den Horizont reichen */
    g.fillStyle = "#ffffff";
    [[260, 30, 50, 640], [420, 200, 26, 360], [700, 20, 110, 600], [1010, 10, 30, 660], [1190, 90, 150, 380], [1500, 40, 46, 620], [1650, 240, 34, 340], [1930, 60, 80, 560]].forEach(function (r) { g.fillRect(r[0], r[1], r[2], r[3]); });
    g.fillStyle = "#efefef"; g.fillRect(780, 330, 240, 44); g.fillRect(1560, 380, 280, 36); g.fillRect(40, 400, 200, 30);
    g.fillStyle = "#9a9a9a"; g.fillRect(0, 556, 2048, 5);
    var tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding;
    var pm = new THREE.PMREMGenerator(renderer);
    var out = pm.fromEquirectangular(tex).texture; pm.dispose(); tex.dispose(); return out;
  }
  scene.environment = makeEnvironment();
  var key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(-4, 5, 5); scene.add(key);

  /* ---------- Verformung im Vertex-Shader ----------
     Ein einziges Mesh ohne Skelett: Kopf und Oberkörper werden über Gewichte nach Position gedreht. */
  var U = { uYaw: { value: 0 }, uPitch: { value: 0 }, uRoll: { value: 0 }, uBody: { value: 0 } };
  var GLSL_COMMON =
    "uniform float uYaw; uniform float uPitch; uniform float uRoll; uniform float uBody;\n" +
    "vec3 rotX(vec3 v, float b){ float c = cos(b), s = sin(b); return vec3(v.x, c*v.y - s*v.z, s*v.y + c*v.z); }\n" +
    "vec3 rotY(vec3 v, float a){ float c = cos(a), s = sin(a); return vec3(c*v.x + s*v.z, v.y, -s*v.x + c*v.z); }\n" +
    "vec3 rotZ(vec3 v, float a){ float c = cos(a), s = sin(a); return vec3(c*v.x - s*v.y, s*v.x + c*v.y, v.z); }\n" +
    "vec3 deform(vec3 v, vec3 ref, float pt){\n" +
    /* Hals als Ellipse: Die Haut dreht sich über die ganze Halslänge mit (Rampe von den Kragenspitzen bis zum Kinn).
       Alles außerhalb des Halses bleibt unter dem Kiefer stehen: Hemdkragen, Jackenkragen, Schultern. */
    "  float eN = length(vec2((ref.x + 0.06) / 0.15, (ref.z - 0.06) / 0.20));\n" +
    "  float inNeck = 1.0 - smoothstep(0.85, 1.15, eN);\n" +
    "  float wr = smoothstep(-0.26, -0.02, ref.y);\n" +
    "  float lat = abs(ref.x + 0.06);\n" +
    "  float yb = -0.04 + 0.11 * smoothstep(0.05, 0.25, lat) + 0.24 * (1.0 - smoothstep(-0.28, 0.0, ref.z));\n" +
    "  float wo = smoothstep(-0.025, 0.0, ref.y - yb);\n" +
    "  float wh = max(wo, inNeck * wr);\n" +
    "  vec3 hip = vec3(-0.06, -0.9, 0.0) * pt;\n" +
    "  v = hip + rotY(v - hip, uBody * smoothstep(-0.9, -0.1, ref.y));\n" +
    "  vec3 neck = vec3(-0.06, 0.15, -0.03) * pt;\n" +
    "  v = neck + rotZ(rotX(rotY(v - neck, uYaw * wh), uPitch * wh), uRoll * wh);\n" +
    "  return v;\n" +
    "}\n";
  /* Lackmaske: Deckung kommt pro Vertex aus dem Mesh, das Korn aus Rauschen im Objektraum.
     So sitzt der Lack fest auf der Oberfläche und wandert beim Kopfdrehen mit. */
  var GLSL_PAINT =
    "float paintMask(){\n" +
    "  float h1 = fract(sin(dot(floor(vObj * 240.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);\n" +
    "  float h2 = fract(sin(dot(floor(vObj * 95.0), vec3(39.346, 11.135, 83.155))) * 24634.6345);\n" +
    "  float n = h1 * 0.6 + h2 * 0.4;\n" +
    "  return smoothstep(0.12, 0.34, vPaint + (n - 0.5) * 0.40) * step(0.02, vPaint);\n" +
    "}\n";
  function patch(mat, bump) {
    mat.onBeforeCompile = function (sh) {
      sh.uniforms.uYaw = U.uYaw; sh.uniforms.uPitch = U.uPitch; sh.uniforms.uRoll = U.uRoll; sh.uniforms.uBody = U.uBody;
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\n" + GLSL_COMMON)
        .replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\nobjectNormal = normalize(deform(objectNormal, position, 0.0));\n")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed = deform(transformed, position, 1.0);\n" +
          "vec3 pb = position; vBump = normalMatrix * vec3(sin(pb.x * 31.0 + 2.0 * sin(pb.y * 23.0)), sin(pb.y * 29.0 + 2.0 * sin(pb.z * 27.0)), sin(pb.z * 33.0 + 2.0 * sin(pb.x * 25.0)));\n" +
          "float ty = position.y; float tl = abs(position.x + 0.06);\n" +
          "float lf = smoothstep(-0.06, 0.0, ty) * (1.0 - smoothstep(0.34, 0.46, ty)) * (1.0 - smoothstep(0.30, 0.40, tl)) * smoothstep(-0.05, 0.2, position.z);\n" +
          "float cw = 1.0 - smoothstep(-0.40, -0.05, ty);\n" +
          "float fw = smoothstep(-0.06, 0.0, ty) * (1.0 - smoothstep(0.72, 0.86, ty)) * (1.0 - smoothstep(0.30, 0.40, tl)) * smoothstep(-0.05, 0.2, position.z);\n" +
          "vTone = vec2(1.0 - 0.20 * cw + 0.22 * lf - 0.10 * fw, 0.03 * lf);\n" +
          "vPaint = paint; vObj = position;\n");
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vBump;\nvarying vec2 vTone;\nattribute float paint;\nvarying float vPaint;\nvarying vec3 vObj;\n");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vBump;\nvarying vec2 vTone;\nvarying float vPaint;\nvarying vec3 vObj;\nfloat gPm;\n" + GLSL_PAINT)
        .replace("#include <color_fragment>", "#include <color_fragment>\ngPm = paintMask();\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.006), gPm);\n")
        .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.13, gPm);\n")
        .replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.0, gPm);\n")
        .replace("#include <tonemapping_fragment>", "gl_FragColor.rgb = gl_FragColor.rgb * vTone.x + vec3(vTone.y);\n" +
          "gl_FragColor.rgb *= (1.0 - 0.62 * gPm);\n" +
          "float rimV = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.6);\n" +
          "gl_FragColor.rgb += vec3(1.1) * rimV * gPm;\n#include <tonemapping_fragment>")
        .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\nnormal = normalize(normal + vBump * " + bump.toFixed(3) + " * (1.0 - 0.7 * gPm));\n");
    };
    mat.needsUpdate = true;
  }

  var chromeMat, clayMat, bust;
  function onLoaded(gltf) {
    gltf.scene.traverse(function (o) { if (o.isMesh && !bust) bust = o; });
    bust.geometry.computeVertexNormals();                 /* glatte Normalen, wichtig für Chrom */
    initPaint(bust.geometry);
    bust.frustumCulled = false;
    chromeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1.0, roughness: 0.17, envMapIntensity: 1.55 });
    clayMat = new THREE.MeshStandardMaterial({ color: 0xc9c8c4, metalness: 0.0, roughness: 0.5 });
    patch(chromeMat, 0.05); patch(clayMat, 0.0);
    bust.material = chromeMat;
    scene.add(bust);
    stage.classList.add("ready"); document.body.classList.add("ready");
    requestAnimationFrame(tick);
  }
  function onError(e) { console.error(e); statusEl.textContent = "Das Modell konnte nicht geladen werden."; }
  try { new THREE.GLTFLoader().parse(b64ToBuffer(GLB_B64), "", onLoaded, onError); } catch (e) { onError(e); }


  /* ---------- Sprühlack nach „Wall painter“ von pimskie ----------
     Pro Bild ein weicher Radialverlauf an der (verzögert folgenden) Zeigerposition.
     Je schneller der Zeiger, desto größer, blasser und weicher der Tupfer (feiner Nebel),
     dazu Streutröpfchen im Ring um den Pinsel und Farbnasen bei langsamem Sprühen.
     Der Lack landet auf der Büste (am Mesh haftend) oder dahinter auf dem Hintergrund. */
  var BMIN = [-0.96, -0.935, -0.59], BSIZE = [1.92, 1.87, 1.17];
  var GC = 0.05, GNX = 40, GNY = 39, GNZ = 25;
  var paintArr = null, paintAttr = null, grid = null, vpos = null;
  function cellIdx(x, y, z) {
    var ix = clamp(Math.floor((x - BMIN[0]) / GC), 0, GNX - 1), iy = clamp(Math.floor((y - BMIN[1]) / GC), 0, GNY - 1), iz = clamp(Math.floor((z - BMIN[2]) / GC), 0, GNZ - 1);
    return (iz * GNY + iy) * GNX + ix;
  }
  function initPaint(g) {
    var pa = g.attributes.position, n = pa.count, i;
    vpos = new Float32Array(n * 3);
    for (i = 0; i < n; i++) { vpos[i * 3] = pa.getX(i); vpos[i * 3 + 1] = pa.getY(i); vpos[i * 3 + 2] = pa.getZ(i); }
    paintArr = new Float32Array(n);
    paintAttr = new THREE.BufferAttribute(paintArr, 1); paintAttr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("paint", paintAttr);
    grid = new Array(GNX * GNY * GNZ);
    for (i = 0; i < n; i++) { var c = cellIdx(vpos[i * 3], vpos[i * 3 + 1], vpos[i * 3 + 2]); (grid[c] || (grid[c] = [])).push(i); }
  }
  function splat(x, y, z, r, amt) {
    var r2 = r * r;
    var x0 = Math.max(0, Math.floor((x - r - BMIN[0]) / GC)), x1 = Math.min(GNX - 1, Math.floor((x + r - BMIN[0]) / GC));
    var y0 = Math.max(0, Math.floor((y - r - BMIN[1]) / GC)), y1 = Math.min(GNY - 1, Math.floor((y + r - BMIN[1]) / GC));
    var z0 = Math.max(0, Math.floor((z - r - BMIN[2]) / GC)), z1 = Math.min(GNZ - 1, Math.floor((z + r - BMIN[2]) / GC));
    for (var iz = z0; iz <= z1; iz++) for (var iy = y0; iy <= y1; iy++) for (var ix = x0; ix <= x1; ix++) {
      var list = grid[(iz * GNY + iy) * GNX + ix]; if (!list) continue;
      for (var k = 0; k < list.length; k++) {
        var vi = list[k], dx = vpos[vi * 3] - x, dy = vpos[vi * 3 + 1] - y, dz = vpos[vi * 3 + 2] - z, d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < r2) { var v = paintArr[vi] + amt * (1 - d2 / r2); paintArr[vi] = v > 1 ? 1 : v; }
      }
    }
  }
  function nearestVertex(x, y, z, maxD) {
    var best = -1, bd = maxD * maxD, ix0 = clamp(Math.floor((x - maxD - BMIN[0]) / GC), 0, GNX - 1), ix1 = clamp(Math.floor((x + maxD - BMIN[0]) / GC), 0, GNX - 1);
    var iy0 = clamp(Math.floor((y - maxD - BMIN[1]) / GC), 0, GNY - 1), iy1 = clamp(Math.floor((y + maxD - BMIN[1]) / GC), 0, GNY - 1);
    var iz0 = clamp(Math.floor((z - maxD - BMIN[2]) / GC), 0, GNZ - 1), iz1 = clamp(Math.floor((z + maxD - BMIN[2]) / GC), 0, GNZ - 1);
    for (var iz = iz0; iz <= iz1; iz++) for (var iy = iy0; iy <= iy1; iy++) for (var ix = ix0; ix <= ix1; ix++) {
      var list = grid[(iz * GNY + iy) * GNX + ix]; if (!list) continue;
      for (var k = 0; k < list.length; k++) {
        var vi = list[k], dx = vpos[vi * 3] - x, dy = vpos[vi * 3 + 1] - y, dz = vpos[vi * 3 + 2] - z, d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < bd) { bd = d2; best = vi; }
      }
    }
    return best;
  }

  /* Picking: Objektraum-Position (8 Bit pro Achse) der sichtbaren Fläche im Fenster um den Pinsel */
  var PS = 192;
  var pickRT = new THREE.WebGLRenderTarget(PS, PS, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, format: THREE.RGBAFormat, type: THREE.UnsignedByteType, depthBuffer: true });
  var pickBuf = new Uint8Array(PS * PS * 4);
  var pickMat = new THREE.ShaderMaterial({
    uniforms: { uYaw: U.uYaw, uPitch: U.uPitch, uRoll: U.uRoll, uBody: U.uBody },
    vertexShader: GLSL_COMMON + "varying vec3 vP;\nvoid main(){\n  vP = (position - vec3(-0.96, -0.935, -0.59)) / vec3(1.92, 1.87, 1.17);\n  vec3 t = deform(position, position, 1.0);\n  gl_Position = projectionMatrix * modelViewMatrix * vec4(t, 1.0);\n}\n",
    fragmentShader: "precision highp float;\nvarying vec3 vP;\nvoid main(){ gl_FragColor = vec4(vP, 1.0); }\n"
  });

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
    h = Math.max(h, accCanvas.height); h = Math.ceil(h / 256) * 256;          /* nur wachsen, in Schritten: Seitenhöhe ändert sich beim Scrollen */
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
  var tmpCanvas = document.createElement("canvas"); tmpCanvas.width = tmpCanvas.height = PS; var tctx = tmpCanvas.getContext("2d");
  var maskCanvas = document.createElement("canvas"); maskCanvas.width = maskCanvas.height = PS; var mctx = maskCanvas.getContext("2d");
  var maskImg = mctx.createImageData(PS, PS);

  var INK = "10,10,10";
  var spraying = false, brushR = 15, bgDirty = false, modelDirty = false;
  var from = { x: 0, y: 0 }, tgt = { x: 0, y: 0 }, bgDrips = [], modelDrips = [], stepAcc = 0;

  function unitsPerPx() { return 2 * camDist * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / H; }

  function paintStep() {
    if (!bust || !paintArr) return;
    var dist = Math.hypot(mouse.x - from.x, mouse.y - from.y);
    var speed = clamp(dist / (W * 0.15), 0, 1);
    tgt.x += (mouse.x - tgt.x) / 2; tgt.y += (mouse.y - tgt.y) / 2;           /* Pinsel läuft dem Zeiger leicht hinterher */
    var size = brushR, radius = size + size * 4 * speed, alpha = 1 - speed * 0.95, inner = 0.5 * (1 - 0.8 * speed);
    var half = Math.min(Math.max(radius, size * 2.4) + 6, 380);
    updRect();
    var offX = sr.left + window.scrollX, offY = sr.top + window.scrollY;           /* Stage-lokal -> Dokument */
    var cx = tgt.x - sr.left, cy = tgt.y - sr.top, wx = Math.round(cx - half), wy = Math.round(cy - half), ws = Math.round(2 * half);

    /* Welche Pixel im Fenster zeigen die Büste? (Position im Objektraum) – nur wenn das Fenster die Stage berührt */
    if (bustVisible && wx < W && wy < H && wx + ws > 0 && wy + ws > 0) {
      camera.setViewOffset(W, H, wx, wy, ws, ws);
      scene.overrideMaterial = pickMat;
      renderer.setRenderTarget(pickRT); renderer.clear(); renderer.render(scene, camera); renderer.setRenderTarget(null);
      scene.overrideMaterial = null;
      renderer.readRenderTargetPixels(pickRT, 0, 0, PS, PS, pickBuf);
    } else pickBuf.fill(0);
    var k = PS / ws;
    function look(sx, sy) {
      var u = Math.floor((sx - wx) * k), v = PS - 1 - Math.floor((sy - wy) * k);
      if (u < 0 || v < 0 || u >= PS || v >= PS) return -1;
      var o = (v * PS + u) * 4; return pickBuf[o + 3] > 128 ? o : -1;
    }
    function obj(o, i) { return BMIN[i] + pickBuf[o + i] / 255 * BSIZE[i]; }

    /* 1) Tupfer auf dem Hintergrund: überall, außer wo die Büste davor steht */
    var md = maskImg.data, row, col;
    for (row = 0; row < PS; row++) for (col = 0; col < PS; col++) md[(row * PS + col) * 4 + 3] = pickBuf[((PS - 1 - row) * PS + col) * 4 + 3] > 128 ? 255 : 0;
    mctx.putImageData(maskImg, 0, 0);
    tctx.globalCompositeOperation = "source-over"; tctx.clearRect(0, 0, PS, PS);
    var gx = (cx - wx) * k, gy = (cy - wy) * k, gr = radius * k;
    var g = tctx.createRadialGradient(gx, gy, gr * inner, gx, gy, gr);
    g.addColorStop(0, "rgba(" + INK + "," + alpha.toFixed(3) + ")"); g.addColorStop(1, "rgba(" + INK + ",0)");
    tctx.fillStyle = g; tctx.fillRect(0, 0, PS, PS);
    tctx.globalCompositeOperation = "destination-out"; tctx.drawImage(maskCanvas, 0, 0);
    actx.drawImage(tmpCanvas, (wx + offX) * AS, (wy + offY) * AS, ws * AS, ws * AS);
    bgDirty = true;

    /* 2) Tupfer auf der Büste: Raster im Tupferkreis, jede getroffene Stelle gibt Lack ans Mesh */
    var upp = unitsPerPx(), step = Math.max(3, radius / 11), rObj = clamp(step * upp * 0.85, 0.012, 0.05), dose = 0.2 + 0.6 * speed;
    for (var sy = -radius; sy <= radius; sy += step) for (var sx = -radius; sx <= radius; sx += step) {
      var jx = sx + (Math.random() - 0.5) * step, jy = sy + (Math.random() - 0.5) * step, d = Math.hypot(jx, jy) / radius;
      if (d >= 1) continue;
      var o = look(cx + jx, cy + jy); if (o < 0) continue;
      var w = d <= inner ? 1 : (1 - d) / (1 - inner);
      splat(obj(o, 0), obj(o, 1), obj(o, 2), rObj, alpha * w * dose); modelDirty = true;
    }

    /* 3) Streutröpfchen im Ring um den Pinsel */
    if (Math.random() > 0.25) {
      var ang = Math.PI * 2 * Math.random(), len = size * (1.5 + Math.random() * 0.75), dr = 1 + Math.random(), da = 0.5 + Math.random() * 0.5;
      var dx = cx + Math.cos(ang) * len, dy = cy + Math.sin(ang) * len, od = look(dx, dy);
      if (od >= 0) { splat(obj(od, 0), obj(od, 1), obj(od, 2), 0.013, 0.8 * da); modelDirty = true; }
      else {
        actx.save(); actx.setTransform(AS, 0, 0, AS, 0, 0);
        actx.fillStyle = "rgba(" + INK + "," + da.toFixed(2) + ")"; actx.beginPath(); actx.arc(dx + offX, dy + offY, dr, 0, Math.PI * 2); actx.fill(); actx.restore(); bgDirty = true;
      }
    }

    /* 4) Farbnasen: nur bei langsamem Sprühen */
    if (Math.random() > 0.94 && speed < 0.06) {
      var oc = look(cx, cy);
      if (oc >= 0) modelDrips.push({ x: obj(oc, 0), y: obj(oc, 1), fy: obj(oc, 1), z: obj(oc, 2), v: 0.25 + 0.75 * Math.random(), r: Math.max(0.011, (1 + 1.5 * Math.random()) * upp), dead: false });
      else bgDrips.push({ x: cx + offX, y: cy + offY, s: 2 + 3 * Math.random(), v: 0.25 + 0.75 * Math.random(), dead: false });
    }
    from.x = tgt.x; from.y = tgt.y;
  }

  function updateDrips() {
    var i, d, upp = unitsPerPx();
    if (bgDrips.length) {
      actx.save(); actx.setTransform(AS, 0, 0, AS, 0, 0); actx.strokeStyle = "rgb(" + INK + ")"; actx.lineCap = "round";
      for (i = 0; i < bgDrips.length; i++) {
        d = bgDrips[i]; actx.lineWidth = d.s; actx.beginPath(); actx.moveTo(d.x, d.y); d.y += d.v; actx.lineTo(d.x, d.y); actx.stroke();
        d.v *= 0.99; if (d.v < 0.1) d.dead = true;
      }
      actx.restore(); bgDirty = true;
      bgDrips = bgDrips.filter(function (x) { return !x.dead; });
    }
    if (modelDrips.length) {
      for (i = 0; i < modelDrips.length; i++) {
        d = modelDrips[i]; d.fy -= d.v * upp; d.v *= 0.99;
        var vi = nearestVertex(d.x, d.fy, d.z, 0.045);
        if (vi < 0) { d.dead = true; continue; }
        d.x = vpos[vi * 3]; d.z = vpos[vi * 3 + 2];
        splat(d.x, vpos[vi * 3 + 1], d.z, d.r, 0.6); modelDirty = true;
        if (d.v < 0.1) d.dead = true;
      }
      modelDrips = modelDrips.filter(function (x) { return !x.dead; });
    }
  }
  function sprayTick() {
    if (spraying) paintStep();
    updateDrips();
    if (bgDirty) { viewDirty = true; bgDirty = false; }
    if (modelDirty && paintAttr) { paintAttr.needsUpdate = true; modelDirty = false; }
  }
  function clearPaint() {
    if (paintArr) { paintArr.fill(0); paintAttr.needsUpdate = true; }
    actx.clearRect(0, 0, accCanvas.width, accCanvas.height); viewDirty = true;
    bgDrips = []; modelDrips = [];
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
  var follow = true, followGain = 1, body = document.body;
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

  /* ---------- Bildausschnitt ---------- */
  var W = 1, H = 1, VW = innerWidth, VH = innerHeight;     /* W/H: Stage, VW/VH: Viewport */
  function fit() {
    W = Math.max(1, stage.clientWidth); H = Math.max(1, stage.clientHeight);
    VW = Math.max(1, innerWidth); VH = Math.max(1, innerHeight);
    renderer.setSize(VW, VH, false); camera.aspect = W / H;
    var vf = THREE.MathUtils.degToRad(camera.fov), hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
    camDist = Math.max((3.0 / 2) / Math.tan(vf / 2), (2.75 / 2) / Math.tan(hf / 2));
    camera.updateProjectionMatrix();
    sizePaint();
  }
  window.addEventListener("resize", fit); fit();
  if (window.ResizeObserver) new ResizeObserver(function () { sizePaint(); }).observe(document.body);   /* Seitenhöhe ändert sich */

  /* ---------- Schleife ---------- */
  var st = { yaw: 0, pitch: 0, roll: 0, vy: 0, vp: 0, vr: 0, body: 0 }, T = 0, last = performance.now(), headNDC = new THREE.Vector3(), camX = 0, camY = 0;
  function spring(x, v, target, dt) { var a = (target - x) * 100 - v * 14; v += a * dt; return [x + v * dt, v]; }
  function tick(now) {
    requestAnimationFrame(tick);
    updRect();
    var dt = Math.min((now - last) / 1000, 0.05); last = now; T += dt;

    var tx = mouse.x - sr.left, ty = mouse.y - sr.top;      /* Zeiger relativ zur Stage */
    if (!mouse.active && !reduceMotion) { tx = W * (0.5 + 0.26 * Math.sin(T * 0.45)); ty = H * (0.36 + 0.08 * Math.sin(T * 0.7 + 1)); }
    var mx = (tx / W - 0.5) * 2, my = (ty / H - 0.5) * 2;
    camX += (mx * 0.18 - camX) * (1 - Math.exp(-dt * 3)); camY += (-my * 0.06 - camY) * (1 - Math.exp(-dt * 3));
    camera.position.set(camTarget.x + camX, camTarget.y + camY, camTarget.z + camDist);
    camera.lookAt(camTarget); camera.updateMatrixWorld(); camera.matrixWorldInverse.copy(camera.matrixWorld).invert();

    camera.clearViewOffset();
    headNDC.set(-0.06, 0.45, 0.15).project(camera);
    var hx = (headNDC.x * 0.5 + 0.5) * W, hy = (0.5 - headNDC.y * 0.5) * H;
    var dx = (tx - hx) / (H * 0.5), dy = (hy - ty) / (H * 0.5);
    if (!isFinite(dx)) dx = 0; if (!isFinite(dy)) dy = 0;
    followGain += ((follow ? 1 : 0) - followGain) * (1 - Math.exp(-dt * 6));
    var yawT = clamp(dx, -1.2, 1.2) * 0.5 * followGain;
    var pitchT = -clamp(clamp(dy, -1, 1) * 0.35, -0.15, 0.22) * followGain;       /* positiv = Kopf nach unten */
    var rollT = -clamp(dx, -1, 1) * 0.07 * followGain;                            /* Neigung zur Zeigerseite */
    var bodyT = clamp(dx, -1.2, 1.2) * 0.045 * followGain;
    if (reduceMotion) { st.yaw = yawT; st.pitch = pitchT; st.roll = rollT; st.body = bodyT; }
    else {
      var a = spring(st.yaw, st.vy, yawT, dt); st.yaw = a[0]; st.vy = a[1];
      a = spring(st.pitch, st.vp, pitchT, dt); st.pitch = a[0]; st.vp = a[1];
      a = spring(st.roll, st.vr, rollT, dt); st.roll = a[0]; st.vr = a[1];
      st.body += (bodyT - st.body) * (1 - Math.exp(-dt * 2.6));
    }
    U.uYaw.value = st.yaw; U.uPitch.value = st.pitch; U.uRoll.value = st.roll;
    U.uBody.value = st.body;

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
    if (bustVisible) {
      updRect(); camera.setViewOffset(W, H, -sr.left, -sr.top, VW, VH);   /* Büste an der Position der Stage */
      renderer.clearDepth(); renderer.render(scene, camera);
    }
  }
})();
