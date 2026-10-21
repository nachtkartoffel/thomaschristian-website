/* Case detail — laptop scroll stage, real-time 3D.
   The laptop (models/laptop.glb: MacBook Pro 16" M3, Space Black — see
   models/README.md for source and licence) is rendered live with three.js:
     - studio lighting for the reflections: a dark room with a big softbox
       overhead, strip lights left/right and a rim light behind (built from
       emissive panels, no HDR file)
     - ambient occlusion (GTAO) for the shading in seams and between keys
     - (no floor / reflection / shadow – removed on request; floorPlane() is unused)
     - formerly: a glossy black floor: a faded mirror image of the laptop plus a soft
       contact shadow
   The screen content is NOT a texture: it is the HTML in .mb-screen, laid
   over the display with a CSS matrix3d onto the display's four projected
   corners — sharp, selectable and swappable for a screenshot.

   One progress value p (0..1) across the tall .case-mb section drives it all.
   Chapters (keep in sync with the data-mb-from/to captions in the markup):
     0    – .20  lid opens, laptop seen from above and slightly to the side
     .20  – .38  the camera swings square onto the display and moves in
     .20  – .36  … only part of the way (ZOOM_MAX), keyboard stays in view
     .38  – .78  the site on the screen scrolls top to bottom
     .80  – 1    the lid closes, camera holds the frontal view
   Plain script (no modules, no fetch), so the page works from a server AND
   straight from disk. Needs, loaded before it:
     js/vendor/three.bundle.js   three.js as window.NollThree
     models/laptop.glb.js        the model as base64 (window.NOLL_LAPTOP_GLB)
   The model-specific bits (node names, hinge, angles) live in MODEL below, so
   another laptop model only needs a new MODEL block.
   Without WebGL the section keeps .is-flat: the screen alone, still scrolling.
   If the section has data-spline-scene, js/case-spline.js runs instead. */
(function(){
const THREE = window.NollThree;
const section = document.getElementById('caseMacbook');
// a Spline scene takes over the stage when one is set (js/case-spline.js)
if (!section || section.dataset.splineScene) return;

// the laptop's part of the stage (right of the benefits); falls back to the whole stage
const stage = section.querySelector('.case-mb-view') || section.querySelector('.case-mb-sticky');
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

// ---- model --------------------------------------------------------------------
// Apple's AR export ships with obfuscated node names; these two are the lid
// group and the display panel. The lid is modelled open (~20° past upright),
// the hinge runs along x at y≈0, z≈-0.125 (model space, metres, front = +z).
const MODEL = {
  lid: 'ctmNimOYaZdxEUt',
  display: 'eVdSUYIqmtLvNwc',
  hinge: [0, 0, -.125],          // hinge axis position (model space)
  shiftZ: .125,                  // move the model so the hinge sits at z = 0
  closed: rad(110.2),            // lid on the deck
  open: rad(0),                  // as modelled
  notch: true,                   // draw the camera notch over the HTML screen
};
const S = 1.16;                  // size relative to the camera path's reference laptop

// ---- tuning -----------------------------------------------------------------
const HINGE_CLOSED = MODEL.closed;
const HINGE_OPEN = MODEL.open;
const FOV = 28;                   // vertical, degrees
const SCREEN_W_PX = 1440;         // layout width of the HTML screen

let renderer, composer, scene, camera, ready = false;
let pivots = [], displayFrame = null, floorY = 0;
const corners = [];               // display corners in displayFrame space (tl, tr, bl, br)
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
  section.classList.toggle('is-zoomed', p > .3 && p < .8);   // display big: the live site is usable then (css)
  captions.forEach((c) => {
    const from = parseFloat(c.dataset.mbFrom), to = parseFloat(c.dataset.mbTo);
    c.classList.toggle('is-active', p >= from && p < to);
  });
}
function renderFlat(p){
  const scroll = ease(seg(p, .38, .78));
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
  const target = V(0, lerp(.012, .072, open) * S, lerp(.11, .085, open) * S);
  // the half-open lid reaches highest: give the frame a little more room then
  const d = fit(lerp(.42, .37, open) * S, (lerp(.27, .30, open) + .09 * Math.sin(Math.PI * open)) * S, .74, .70);
  const az = back ? lerp(0, 12, back) : lerp(-24, 0, open);
  return { pos: orbit(target, d, lerp(44, 15, open), az), target };
}
function displayWorld(){
  displayFrame.updateWorldMatrix(true, false);
  const m = displayFrame.matrixWorld;
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
  // Timeline: the lid opens, the camera comes round to the front and moves
  // in part of the way (display large, keyboard still in view), the site
  // scrolls on the screen, then the lid closes while the camera holds that
  // frontal view — after that the page simply scrolls on.
  const ZOOM_MAX = .5;                  // how far towards "display fills the view" the camera goes
  const open = ease(seg(p, 0, .2));
  const zoom = ease(seg(p, .2, .36)) * ZOOM_MAX;
  const scroll = ease(seg(p, .38, .78));
  const close = ease(seg(p, .8, 1));
  const lidOpen = open * (1 - close);   // the lid opens at the start and closes again at the end

  // camera: framed on the open laptop (so it stays put while the lid closes)
  pivots.forEach((pv) => { pv.rotation.x = lerp(HINGE_CLOSED, HINGE_OPEN, open); });
  scene.updateMatrixWorld(true);
  const A = overview(open, 0), B = zoomPose();
  camera.position.lerpVectors(A.pos, B.pos, zoom);
  const target = A.target.clone().lerp(B.target, zoom);
  // while the lid closes the camera keeps its angle (no turning) and only
  // slides down and back, so the closed laptop ends up whole in the frame
  const look = target.clone().sub(camera.position);
  if (close > 0){
    const down = V(0, .016 * S, .108 * S).sub(target).multiplyScalar(close);
    camera.position.add(down).addScaledVector(look, -.35 * close);
  }
  camera.lookAt(camera.position.clone().add(look));
  camera.updateMatrixWorld();

  // lid: where it actually is
  const hinge = lerp(HINGE_CLOSED, HINGE_OPEN, lidOpen);
  pivots.forEach((pv) => { pv.rotation.x = hinge; });
  scene.updateMatrixWorld(true);
  composer.render();

  // lay the HTML screen onto the display
  const { pts, cen, n } = displayWorld();
  const facing = n.dot(tmp.copy(camera.position).sub(cen).normalize());
  const on = seg(lidOpen, .3, .65) * seg(facing, .08, .35);   // on while rising, off while closing   // the screen comes on while the lid is still rising
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
  const right = V(1, 0, 0).transformDirection(displayFrame.matrixWorld);
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
  panel(1.3, .12, 10.0, [0, .55, -.85], t);    // rim, behind
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
  fade.addColorStop(0, 'rgba(0,0,0,.14)');
  fade.addColorStop(.4, 'rgba(0,0,0,.07)');
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = fade; g.fillRect(0, 0, N, N);
  g.globalCompositeOperation = 'source-over';
  const size = 1.6, px = N / size;           // plane is 1.6 m square, centred under the base
  const w = .354 * px, h = .248 * px;
  const rr = (x, y, ww, hh, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + ww, y, x + ww, y + hh, r); g.arcTo(x + ww, y + hh, x, y + hh, r); g.arcTo(x, y + hh, x, y, r); g.arcTo(x, y, x + ww, y, r); g.closePath(); };
  // soft contact shadow: a wide, light penumbra and a gentle core
  [[90, .45], [40, .5], [16, .45]].forEach(([blur, a]) => {
    g.save(); g.shadowColor = `rgba(0,0,0,${a})`; g.shadowBlur = blur; g.fillStyle = `rgba(0,0,0,${a})`;
    rr(N / 2 - w / 2, N / 2 - h / 2, w, h, 14); g.fill(); g.restore();
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, floorY + .0002, .124);
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
renderer.toneMappingExposure = 1.2;

scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(studio(), 0.015).texture;
// a key and a fill for the non-metal parts (keys, rubber, glass edges)
const key = new THREE.DirectionalLight(0xfff8f0, 1.3); key.position.set(-.9, 1.2, .6); scene.add(key);
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
const loader = new THREE.GLTFLoader();
if (THREE.MeshoptDecoder) loader.setMeshoptDecoder(THREE.MeshoptDecoder);   // the model is meshopt-compressed
loader.parse(bin, '', (gltf) => {
  const model = gltf.scene;
  const root = new THREE.Group();
  root.add(model);
  // Space Black on a black page: lift the reflections so edges and surfaces read
  model.traverse((o) => { if (o.isMesh && o.material) o.material.envMapIntensity = 2.4; });
  root.position.z = MODEL.shiftZ;
  root.updateMatrixWorld(true);

  const lid = model.getObjectByName(MODEL.lid);
  const displayMesh = model.getObjectByName(MODEL.display);
  if (!lid || !displayMesh) return;         // unexpected model: stay flat

  // hinge: a pivot on the hinge axis that the lid group hangs from
  const pivot = new THREE.Object3D();
  pivot.name = 'lid_pivot';
  pivot.position.set(MODEL.hinge[0], MODEL.hinge[1], MODEL.hinge[2]);
  root.add(pivot);
  root.updateMatrixWorld(true);
  pivot.attach(lid);

  // the display: its own panel mesh, a flat (tilted) rectangle. Find its
  // plane in hinge space and put a frame there: x right, y up the lid,
  // z out of the glass. The HTML screen is mapped onto that frame.
  const pts = [];
  const pos = displayMesh.geometry.attributes.position;
  displayMesh.updateWorldMatrix(true, false);
  for (let i = 0; i < pos.count; i++){
    const v = V(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(displayMesh.matrixWorld);
    pts.push(pivot.worldToLocal(v));
  }
  const box = new THREE.Box3().setFromPoints(pts);
  const up = V(0, box.max.y - box.min.y, -(box.max.z - box.min.z)).normalize();   // lid leans back
  const xAxis = V(1, 0, 0), nrm = V().crossVectors(xAxis, up).normalize();        // points out of the glass
  let uMin = Infinity, uMax = -Infinity, nMax = -Infinity;
  pts.forEach((p) => { const u = p.dot(up); uMin = Math.min(uMin, u); uMax = Math.max(uMax, u); nMax = Math.max(nMax, p.dot(nrm)); });
  const xMid = (box.min.x + box.max.x) / 2;
  dispW = box.max.x - box.min.x; dispH = uMax - uMin;
  displayFrame = new THREE.Object3D();
  displayFrame.matrixAutoUpdate = true;
  displayFrame.position.copy(xAxis.clone().multiplyScalar(xMid)).addScaledVector(up, (uMin + uMax) / 2).addScaledVector(nrm, nMax + .0002);
  displayFrame.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, up, nrm));
  pivot.add(displayFrame);
  corners.push(V(-dispW / 2, dispH / 2, 0), V(dispW / 2, dispH / 2, 0), V(-dispW / 2, -dispH / 2, 0), V(dispW / 2, -dispH / 2, 0));

  // screen off: the panel becomes black glass (the HTML screen sits on top)
  const dm = displayMesh.material;
  dm.emissive && dm.emissive.setScalar(0); dm.emissiveMap = null;
  dm.map = null; dm.color && dm.color.setScalar(0); dm.metalness = 0; dm.roughness = .06;
  dm.needsUpdate = true;

  const bbox = new THREE.Box3().setFromObject(root);
  floorY = bbox.min.y;

  if (MODEL.notch && !screenEl.querySelector('.mb-notch')){
    const notch = document.createElement('span');
    notch.className = 'mb-notch'; notch.setAttribute('aria-hidden', 'true');
    screenEl.appendChild(notch);
  }

  // no floor, no reflection, no shadow: the laptop stands on the black page
  // (floorPlane() below is kept but no longer used)
  pivots = [pivot];

  scene.add(root);
  ready = true;
  section.classList.remove('is-flat');
  section.classList.add('is-3d');
  resize();
}, () => { /* model failed: stay flat */ });
})();
