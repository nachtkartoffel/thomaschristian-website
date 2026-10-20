/* Case detail — laptop scroll stage, real-time 3D.
   The laptop (models/laptop.glb) is our own, brand-free model, built in
   Blender (tools/laptop-render/scene.py) and rendered live with three.js:
     - studio lighting for the reflections: a dark room with a big softbox
       overhead, strip lights left/right and a rim light behind (built from
       emissive panels, no HDR file)
     - ambient occlusion (GTAO) for the shading in seams and between keys
     - a glossy black floor: a faded mirror image of the laptop plus a soft
       contact shadow
   The screen content is NOT a texture: it is the HTML in .mb-screen, laid
   over the display with a CSS matrix3d onto the display's four projected
   corners — sharp, selectable and swappable for a screenshot.

   One progress value p (0..1) across the tall .case-mb section drives it all.
   Chapters (keep in sync with the data-mb-from/to captions in the markup):
     0    – .20  lid opens, laptop seen from above and slightly to the side
     .20  – .38  the camera swings square onto the display and moves in
     .38  – .82  the site on the screen scrolls top to bottom
     .82  – 1    pulls back out to the open laptop
   Plain script (no modules, no fetch), so the page works from a server AND
   straight from disk. Needs, loaded before it:
     js/vendor/three.bundle.js   three.js as window.NollThree
     models/laptop.glb.js        the model as base64 (window.NOLL_LAPTOP_GLB)
   Without WebGL the section keeps .is-flat: the screen alone, still scrolling.
   If the section has data-spline-scene, js/case-spline.js runs instead. */
(function(){
const THREE = window.NollThree;
const section = document.getElementById('caseMacbook');
// a Spline scene takes over the stage when one is set (js/case-spline.js)
if (!section || section.dataset.splineScene) return;

const stage = section.querySelector('.case-mb-sticky');
const canvas = section.querySelector('.case-mb-canvas');
const screenEl = section.querySelector('.mb-screen');
const site = section.querySelector('.mb-site');
const captions = Array.from(section.querySelectorAll('.case-mb-caption'));
const reduced = window.matchMedia('(prefers-reduced-motion:reduce)');

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const seg = (p, a, b) => clamp((p - a) / (b - a), 0, 1);
const ease = (t) => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const lerp = (a, b, t) => a + (b - a) * t;
const rad = (d) => d * Math.PI / 180;

// ---- tuning -----------------------------------------------------------------
const HINGE_CLOSED = rad(90.6);   // lid on the deck
const HINGE_OPEN = rad(-17);      // a little past upright
const FOV = 28;                   // vertical, degrees
const SCREEN_W_PX = 1440;         // layout width of the HTML screen

let renderer, composer, scene, camera, ready = false;
let pivots = [], displayMesh = null;
const corners = [];               // display corners, display-local (tl, tr, bl, br)
let dispW = .289, dispH = .182, screenH = 910, scrollMax = 0, vw = 0, vh = 0;

function sizeScreen(){
  screenH = Math.round(SCREEN_W_PX * dispH / dispW);
  screenEl.style.width = SCREEN_W_PX + 'px';
  screenEl.style.height = screenH + 'px';
  scrollMax = Math.max(0, site.offsetHeight - screenEl.offsetHeight);
}

function progress(){
  if (reduced.matches) return .2;
  const r = section.getBoundingClientRect();
  const dist = section.offsetHeight - window.innerHeight;
  return dist > 0 ? clamp(-r.top / dist, 0, 1) : 0;
}
function chrome(p){
  section.style.setProperty('--mb-p', p.toFixed(4));
  // captions get a backing pill once the laptop is big enough to sit behind them
  section.classList.toggle('is-zoomed', p > .24 && p < .9);
  captions.forEach((c) => {
    const from = parseFloat(c.dataset.mbFrom), to = parseFloat(c.dataset.mbTo);
    c.classList.toggle('is-active', p >= from && p < to);
  });
}
function renderFlat(p){
  const scroll = ease(seg(p, .4, .8));
  site.style.transform = `translate3d(0,${(-scroll * scrollMax).toFixed(1)}px,0)`;
  chrome(p);
}

// ---- camera path --------------------------------------------------------------
// Model space: metres, y up, the laptop's front faces +z, hinge at z≈0.
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const tmp = V(0, 0, 0);
function fit(w, h, sw, sh){
  const t = Math.tan(rad(FOV / 2));
  return Math.max((h / sh) / 2 / t, (w / sw) / 2 / (t * camera.aspect));
}
function orbit(target, dist, elev, az){
  const e = rad(elev), a = rad(az);
  return V(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)).multiplyScalar(dist).add(target);
}
function overview(open, back){
  const target = V(0, lerp(.012, .072, open), lerp(.11, .085, open));
  // the half-open lid reaches highest: give the frame a little more room then
  const d = fit(lerp(.42, .37, open), lerp(.27, .30, open) + .09 * Math.sin(Math.PI * open), .74, .70);
  const az = back ? lerp(0, 12, back) : lerp(-24, 0, open);
  return { pos: orbit(target, d, lerp(44, 15, open), az), target };
}
function displayWorld(){
  displayMesh.updateWorldMatrix(true, false);
  const m = displayMesh.matrixWorld;
  const pts = corners.map((c) => c.clone().applyMatrix4(m));
  const cen = pts.reduce((a, b) => a.add(b), V(0, 0, 0)).multiplyScalar(.25);
  const n = V(0, 0, 1).transformDirection(m);
  return { pts, cen, n };
}
function zoomPose(){
  const { cen, n } = displayWorld();
  return { pos: cen.clone().addScaledVector(n, fit(dispW, dispH, .97, .92)), target: cen };
}

// ---- CSS matrix3d mapping (0,0)-(w,h) onto 4 points ----------------------------------
function homography(w, h, q){
  const src = [[0, 0], [w, 0], [0, h], [w, h]];
  const A = [], b = [];
  for (let i = 0; i < 4; i++){
    const [x, y] = src[i], [u, v] = q[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  for (let c = 0; c < 8; c++){
    let piv = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]]; [b[c], b[piv]] = [b[piv], b[c]];
    for (let r = 0; r < 8; r++){
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  const H = b.map((v, i) => v / A[i][i]);
  return `matrix3d(${H[0]},${H[3]},0,${H[6]},${H[1]},${H[4]},0,${H[7]},0,0,1,0,${H[2]},${H[5]},0,1)`;
}

// ---- frame ------------------------------------------------------------------------
let last = -1;
function render3D(p, force){
  if (!force && Math.abs(p - last) < 0.00005) return;
  last = p;
  const open = ease(seg(p, 0, .2));
  const zoomIn = ease(seg(p, .2, .38));
  const scroll = ease(seg(p, .4, .8));
  const zoomOut = ease(seg(p, .82, 1));
  const zoom = zoomIn * (1 - zoomOut);

  const hinge = lerp(HINGE_CLOSED, HINGE_OPEN, open);
  pivots.forEach((pv) => { pv.rotation.x = hinge; });
  scene.updateMatrixWorld(true);

  const A = overview(open, zoomOut), B = zoomPose();
  camera.position.lerpVectors(A.pos, B.pos, zoom);
  const target = A.target.clone().lerp(B.target, zoom);
  camera.lookAt(target);
  camera.updateMatrixWorld();
  composer.render();

  // lay the HTML screen onto the display
  const { pts, cen, n } = displayWorld();
  const facing = n.dot(tmp.copy(camera.position).sub(cen).normalize());
  const on = seg(open, .7, 1) * seg(facing, .3, .7);   // "switches on" near the top of the travel
  if (on > .001){
    const order = [0, 1, 2, 3];
    const q = order.map((i) => {
      const s = pts[i].clone().project(camera);
      return [(s.x + 1) / 2 * vw, (1 - s.y) / 2 * vh];
    });
    screenEl.style.transform = homography(SCREEN_W_PX, screenH, q);
    screenEl.style.opacity = on.toFixed(3);
    screenEl.style.visibility = 'visible';
  } else {
    screenEl.style.visibility = 'hidden';
  }
  site.style.transform = `translate3d(0,${(-scroll * scrollMax).toFixed(1)}px,0)`;
  const right = V(1, 0, 0).transformDirection(displayMesh.matrixWorld);
  const side = right.dot(tmp.copy(camera.position).sub(cen).normalize());
  screenEl.style.setProperty('--mb-glare', (.3 + .7 * (1 - zoom)).toFixed(3));
  screenEl.style.setProperty('--mb-glare-x', (50 - side * 160).toFixed(1) + '%');
  chrome(p);
}

// ---- resize / scroll ------------------------------------------------------------------
function resize(){
  vw = stage.clientWidth; vh = stage.clientHeight;
  sizeScreen();
  if (ready){
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(vw, vh, false);
    composer.setPixelRatio(dpr);
    composer.setSize(vw, vh);
    camera.aspect = vw / vh;
    camera.updateProjectionMatrix();
  }
  update(true);
}
// The scene follows the scroll position with a little inertia, so wheel
// steps and trackpad flicks turn into one continuous camera move.
let cur = -1, running = false, lastT = 0;
function update(force){
  const target = progress();
  if (!ready){ renderFlat(target); return; }
  if (force || cur < 0 || reduced.matches){ cur = target; render3D(cur, true); return; }
  if (!running){ running = true; lastT = performance.now(); requestAnimationFrame(tick); }
}
function tick(t){
  const target = progress();
  const dt = Math.min(64, t - lastT); lastT = t;
  cur += (target - cur) * (1 - Math.exp(-dt / 110));
  if (Math.abs(target - cur) < 0.0002) cur = target;
  render3D(cur, false);
  if (cur !== target) requestAnimationFrame(tick); else running = false;
}

// ---- scene pieces ------------------------------------------------------------------
// The dark studio, used for reflections only (mirrors the Blender lighting).
function studio(){
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x000000);
  const geo = new THREE.PlaneGeometry(1, 1);
  const panel = (w, h, intensity, pos, look) => {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color().setScalar(intensity), side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, m);
    mesh.scale.set(w, h, 1); mesh.position.set(...pos); mesh.lookAt(...look);
    env.add(mesh);
  };
  const t = [0, .05, .08];
  panel(1.4, 1.0, 3.2, [.15, 1.3, .35], t);    // softbox overhead
  panel(.14, 1.3, 9.0, [-.9, .45, .45], t);    // strip left (key)
  panel(.10, 1.1, 2.6, [.95, .35, .25], t);    // strip right (fill)
  panel(1.3, .12, 6.0, [0, .55, -.85], t);     // rim, behind
  panel(1.2, .25, .5, [0, .12, 1.3], t);       // low front bounce
  panel(2.4, 1.2, .35, [0, 1.2, -1.2], t);     // high back panel, for the closed lid
  return env;
}
// Floor: a black plane over the mirrored laptop. Its alpha lets ~22% of the
// reflection through near the laptop and fades it out further away; a soft
// contact shadow is painted into the same texture.
function floorPlane(){
  const N = 1024, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, N, N);
  g.globalCompositeOperation = 'destination-out';
  const fade = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N * .3);
  fade.addColorStop(0, 'rgba(0,0,0,.16)');
  fade.addColorStop(.4, 'rgba(0,0,0,.07)');
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = fade; g.fillRect(0, 0, N, N);
  g.globalCompositeOperation = 'source-over';
  const size = 1.6, px = N / size;           // plane is 1.6 m square, centred under the base
  const w = .304 * px, h = .215 * px;
  const rr = (x, y, ww, hh, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + ww, y, x + ww, y + hh, r); g.arcTo(x + ww, y + hh, x, y + hh, r); g.arcTo(x, y + hh, x, y, r); g.arcTo(x, y, x + ww, y, r); g.closePath(); };
  [[28, .7], [8, 1]].forEach(([blur, a]) => {
    g.save(); g.shadowColor = `rgba(0,0,0,${a})`; g.shadowBlur = blur; g.fillStyle = '#000';
    rr(N / 2 - w / 2, N / 2 - h / 2, w, h, 8); g.fill(); g.restore();
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, .0002, .1075);
  mesh.renderOrder = 1;
  return mesh;
}

// ---- boot ------------------------------------------------------------------------
vw = stage.clientWidth; vh = stage.clientHeight;
sizeScreen();
update(true);
window.addEventListener('scroll', () => update(false), { passive:true });
window.addEventListener('resize', resize);
reduced.addEventListener && reduced.addEventListener('change', () => resize());
site.querySelectorAll('img').forEach((img) => { if (!img.complete) img.addEventListener('load', () => resize()); });
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => resize());

const glb = window.NOLL_LAPTOP_GLB;
if (!THREE || !glb) return;           // scripts missing: stay flat
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
} catch (e) { return; }                // no WebGL: stay flat
renderer.setClearColor(0x000000, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping || THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(studio(), 0.015).texture;
// a key and a fill for the non-metal parts (keys, rubber, glass edges)
const key = new THREE.DirectionalLight(0xfff8f0, .7); key.position.set(-.9, 1.2, .6); scene.add(key);
const fill = new THREE.DirectionalLight(0xf0f4ff, .2); fill.position.set(.9, .5, .4); scene.add(fill);

camera = new THREE.PerspectiveCamera(FOV, 1, .01, 20);

// MSAA'd render target + GTAO + tone mapping / colour output
const rt = new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType });
composer = new THREE.EffectComposer(renderer, rt);
composer.addPass(new THREE.RenderPass(scene, camera));
const ao = new THREE.GTAOPass(scene, camera, 1, 1);
ao.updateGtaoMaterial({ radius: .012, distanceExponent: 1.4, thickness: .6, scale: 1.1, samples: 16 });
ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
ao.blendIntensity = .9;
composer.addPass(ao);
composer.addPass(new THREE.OutputPass());

const bin = Uint8Array.from(atob(glb), (ch) => ch.charCodeAt(0)).buffer;
new THREE.GLTFLoader().parse(bin, '', (gltf) => {
  const root = gltf.scene;
  root.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    m.envMapIntensity = 1;
    if (m.name === 'aluminium'){ m.roughness = .3; }
    if (m.name === 'keys'){ m.roughness = .58; m.color.setScalar(.008); }
    if (m.name === 'display'){ m.color.setScalar(0); m.roughness = .05; }
  });
  displayMesh = root.getObjectByName('display');
  const pivot = root.getObjectByName('lid_pivot');
  if (!displayMesh || !pivot) return;      // unexpected model: stay flat

  // display corners from its quad (flat in local xy, facing +z)
  const g = displayMesh.geometry; g.computeBoundingBox();
  const bb = g.boundingBox, z = bb.max.z;
  corners.push(V(bb.min.x, bb.max.y, z), V(bb.max.x, bb.max.y, z), V(bb.min.x, bb.min.y, z), V(bb.max.x, bb.min.y, z));
  dispW = bb.max.x - bb.min.x; dispH = bb.max.y - bb.min.y;

  // mirror image for the glossy floor, slightly dimmed
  const mirror = root.clone(true);
  mirror.scale.y = -1;
  mirror.traverse((o) => {
    if (o.isMesh){ o.material = o.material.clone(); o.material.envMapIntensity = .7; }
  });
  pivots = [pivot, mirror.getObjectByName('lid_pivot')];

  scene.add(mirror, floorPlane(), root);
  ready = true;
  section.classList.remove('is-flat');
  section.classList.add('is-3d');
  resize();
}, () => { /* model failed: stay flat */ });
})();
