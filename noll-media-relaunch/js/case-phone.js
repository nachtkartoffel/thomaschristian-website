/* Case detail — smartphone scroll stage, real-time 3D.
   Phone counterpart of js/case-laptop.js, same stage markup (#caseMacbook,
   .case-mb-view, .case-mb-canvas, .mb-screen, .mb-site) and the same rules:
     - the phone (models/phone.glb: iPhone 16 Pro Max by MajdyModels on
       Sketchfab, CC BY 4.0 — see models/README.md) is rendered with three.js
       in the same dark studio light as the laptop
     - the screen content is NOT a texture: it is the HTML in .mb-screen,
       mapped onto the display's four projected corners with a CSS matrix3d
   One progress value p (0..1) across the tall .case-mb section drives it all:
     0    – .20  the phone rises from lying tilted back to upright, facing you
     .20  – .36  the camera moves in part of the way (ZOOM_MAX)
     .38  – .78  the site on the screen scrolls top to bottom
     .80  – 1    big exit: turns ~120° to show its back, tips back, drifts off
   Needs, loaded before it:
     js/vendor/three.bundle.js   three.js as window.NollThree
     models/phone.glb.js         the model as base64 (window.NOLL_PHONE_GLB)
   Without WebGL the section keeps .is-flat: the screen alone, still scrolling. */
(function(){
const THREE = window.NollThree;
const section = document.getElementById('caseMacbook');
if (!section) return;

const stage = section.querySelector('.case-mb-view') || section.querySelector('.case-mb-sticky');
const canvas = section.querySelector('.case-mb-canvas');
const screenEl = section.querySelector('.mb-screen');
const site = section.querySelector('.mb-site');
const reduced = window.matchMedia('(prefers-reduced-motion:reduce)');

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const seg = (p, a, b) => clamp((p - a) / (b - a), 0, 1);
const ease = (t) => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const lerp = (a, b, t) => a + (b - a) * t;
const rad = (d) => d * Math.PI / 180;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---- model --------------------------------------------------------------------
// The Sketchfab export stands upright with the display facing -x; the screen
// is the mesh with the material "screen.001". Everything else is measured.
const MODEL = {
  screenMaterial: 'screen.001',
  turn: rad(90),                 // rotate about y so the display faces +z
  height: .163,                  // metres, iPhone 16 Pro Max
};

// ---- tuning -----------------------------------------------------------------
const FOV = 26;
const SCREEN_W_PX = 390;          // layout width of the HTML screen (mobile CSS px)
const ZOOM_MAX = .3;

let renderer, composer, scene, camera, phone, ready = false;
let displayFrame = null;
const corners = [];
let dispW = .0756, dispH = .162, screenH = 844, scrollMax = 0, vw = 0, vh = 0;

function sizeScreen(){
  screenH = Math.round(SCREEN_W_PX * dispH / dispW);
  screenEl.style.width = SCREEN_W_PX + 'px';
  screenEl.style.height = screenH + 'px';
  scrollMax = Math.max(0, site.offsetHeight - screenEl.offsetHeight);
}
function progress(){
  if (reduced.matches) return .3;
  const r = section.getBoundingClientRect();
  const dist = section.offsetHeight - window.innerHeight;
  return dist > 0 ? clamp(-r.top / dist, 0, 1) : 0;
}
function chrome(p){
  section.style.setProperty('--mb-p', p.toFixed(4));
  section.classList.toggle('is-zoomed', p > .3 && p < .8);
}
function renderFlat(p){
  const scroll = ease(seg(p, .38, .78));
  site.style.transform = `translate3d(0,${(-scroll * scrollMax).toFixed(1)}px,0)`;
  chrome(p);
}

// ---- camera -------------------------------------------------------------------
function fit(w, h, sw, sh){
  const t = Math.tan(rad(FOV / 2));
  return Math.max((h / sh) / 2 / t, (w / sw) / 2 / (t * camera.aspect));
}
function displayWorld(){
  displayFrame.updateWorldMatrix(true, false);
  const m = displayFrame.matrixWorld;
  const pts = corners.map((c) => c.clone().applyMatrix4(m));
  const cen = pts.reduce((a, b) => a.add(b), V(0, 0, 0)).multiplyScalar(.25);
  const n = V(0, 0, 1).transformDirection(m);
  return { pts, cen, n };
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
const tmp = V(0, 0, 0);
let last = -1;
// data-still='{"rx":-8,"ry":-24,"rz":4,"x":0,"y":0,"d":.42,"scroll":0}' on the section
// freezes one pose (used to render key visuals); degrees, metres
const still = section.dataset.still ? JSON.parse(section.dataset.still) : null;
function render3D(p, force){
  if (!force && Math.abs(p - last) < 0.00005) return;
  last = p;
  if (still) return renderStill();
  const rise = ease(seg(p, 0, .2));
  const zoom = ease(seg(p, .2, .36)) * ZOOM_MAX;
  const scroll = ease(seg(p, .38, .78));
  const away = ease(seg(p, .8, 1));     // starts only after the site has finished scrolling (.78)
  // phone pose: lying tilted back and turned → upright and square, holding still while
  // the site scrolls → a big turn away to the side, tipping back
  // and drifting off up and to the right
  phone.rotation.set(
    lerp(rad(-62), 0, rise) - rad(22) * away,
    lerp(rad(-30), 0, rise) + rad(118) * away,
    lerp(rad(10), 0, rise) + rad(16) * away,
    'YXZ');
  phone.position.set(
    lerp(.012, 0, rise) + .045 * away,
    lerp(-.035, 0, rise) + .02 * away,
    lerp(-.02, 0, rise) - .06 * away);
  phone.updateMatrixWorld(true);

  // camera: square on the upright phone; framed on the whole phone, then in
  const over = fit(MODEL.height * .52, MODEL.height * 1.42, 1, 1);
  const close = fit(dispW, dispH, .97, .94);
  const d = lerp(over, close, zoom) + .02 * away;
  camera.position.set(0, lerp(.03, .004, rise) + .002 * away, d);
  camera.lookAt(0, lerp(-.006, 0, rise), 0);
  camera.updateMatrixWorld();
  composer.render();

  // lay the HTML screen onto the display
  const { pts, cen, n } = displayWorld();
  const facing = n.dot(tmp.copy(camera.position).sub(cen).normalize());
  const on = seg(rise, 0, .25) * seg(facing, .05, .3);   // screen content shows early, while the phone is still rising
  if (on > .001){
    const q = [0, 1, 2, 3].map((i) => {
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

function renderStill(){
  phone.rotation.set(rad(still.rx || 0), rad(still.ry || 0), rad(still.rz || 0), 'YXZ');
  phone.position.set(still.x || 0, still.y || 0, 0);
  phone.updateMatrixWorld(true);
  camera.position.set(still.cx || 0, still.cy || 0, still.d || .4);
  camera.lookAt(still.cx || 0, still.ty || 0, 0);
  camera.updateMatrixWorld();
  composer.render();
  const { pts } = displayWorld();
  const q = [0, 1, 2, 3].map((i) => { const s = pts[i].clone().project(camera); return [(s.x + 1) / 2 * vw, (1 - s.y) / 2 * vh]; });
  screenEl.style.transform = homography(SCREEN_W_PX, screenH, q);
  screenEl.style.opacity = 1; screenEl.style.visibility = 'visible';
  screenEl.style.setProperty('--mb-glare', '.8'); screenEl.style.setProperty('--mb-glare-x', (still.glare || 40) + '%');
  site.style.transform = `translate3d(0,${(-(still.scroll || 0)).toFixed(1)}px,0)`;
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

// ---- studio (reflections only), same panels as the laptop, scaled to the phone ----
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
  const t = [0, 0, 0];
  panel(1.2, .9, 3.0, [.1, 1.1, .5], t);      // softbox overhead
  panel(.14, 1.3, 8.0, [-.8, .2, .5], t);     // strip left (key) — lights the frame edge
  panel(.10, 1.1, 3.0, [.85, .1, .3], t);     // strip right (fill)
  panel(1.3, .12, 9.0, [0, .5, -.85], t);     // rim, behind
  panel(1.2, .25, .5, [0, -.3, 1.2], t);      // low front bounce
  return env;
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

const glb = window.NOLL_PHONE_GLB;
if (!THREE || !glb) return;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
} catch (e) { return; }
renderer.setClearColor(0x000000, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping || THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(studio(), 0.015).texture;
const key = new THREE.DirectionalLight(0xfff8f0, 1.2); key.position.set(-.9, 1.2, .8); scene.add(key);
const fill = new THREE.DirectionalLight(0xf0f4ff, .25); fill.position.set(.9, .4, .6); scene.add(fill);

camera = new THREE.PerspectiveCamera(FOV, 1, .005, 10);

const rt = new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType });
composer = new THREE.EffectComposer(renderer, rt);
composer.addPass(new THREE.RenderPass(scene, camera));
composer.addPass(new THREE.OutputPass());

const bin = Uint8Array.from(atob(glb), (ch) => ch.charCodeAt(0)).buffer;
const loader = new THREE.GLTFLoader();
if (THREE.MeshoptDecoder) loader.setMeshoptDecoder(THREE.MeshoptDecoder);
loader.parse(bin, '', (gltf) => {
  const model = gltf.scene;
  let screenMesh = null;
  model.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    if (o.material.name === MODEL.screenMaterial) screenMesh = o;
    o.material.envMapIntensity = 2.2;
    // the glass sheet over the display: the HTML screen sits on top anyway
    if (o.material.transmission) { o.material.transmission = 0; o.material.transparent = true; o.material.opacity = .08; }
  });
  if (!screenMesh) return;                    // unexpected model: stay flat

  // normalise: display facing +z, phone centred on the origin, real size
  const holder = new THREE.Group();
  holder.add(model);
  holder.rotation.y = MODEL.turn;
  holder.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(holder);
  const k = MODEL.height / (box.max.y - box.min.y);
  holder.scale.setScalar(k);
  holder.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(holder);
  const c = box.getCenter(V(0, 0, 0));
  holder.position.sub(c);
  phone = new THREE.Group();
  phone.add(holder);
  phone.updateMatrixWorld(true);

  // the display rectangle in phone space
  const sb = new THREE.Box3().setFromObject(screenMesh);
  dispW = sb.max.x - sb.min.x; dispH = sb.max.y - sb.min.y;
  displayFrame = new THREE.Object3D();
  displayFrame.position.set((sb.min.x + sb.max.x) / 2, (sb.min.y + sb.max.y) / 2, sb.max.z + .0002);
  phone.add(displayFrame);
  corners.push(V(-dispW / 2, dispH / 2, 0), V(dispW / 2, dispH / 2, 0), V(-dispW / 2, -dispH / 2, 0), V(dispW / 2, -dispH / 2, 0));

  // screen off: black glass (the HTML screen sits on top)
  const dm = screenMesh.material;
  dm.map = null; dm.emissiveMap = null; dm.emissive && dm.emissive.setScalar(0);
  dm.color && dm.color.setScalar(0); dm.metalness = 0; dm.roughness = .06; dm.needsUpdate = true;

  if (!screenEl.querySelector('.mb-island')){
    const island = document.createElement('span');
    island.className = 'mb-island'; island.setAttribute('aria-hidden', 'true');
    screenEl.appendChild(island);
  }

  scene.add(phone);
  ready = true;
  section.classList.remove('is-flat');
  section.classList.add('is-3d');
  resize();
}, () => { /* model failed: stay flat */ });
})();
