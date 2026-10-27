/* Case detail — iPad scroll stage with Apple Pencil, real-time 3D.
   Tablet counterpart of js/case-phone.js / js/case-laptop.js, same stage
   markup (#caseMacbook, .case-mb-view, .case-mb-canvas, .mb-screen, .mb-site):
     - the iPad (models/ipad.glb: "iPad Pro 4th generation 2020 + Apple Pencil"
       from Sketchfab — see models/README.md) is shown in landscape, rendered
       with three.js in the same dark studio light as the other devices
     - the screen content is NOT a texture: it is the HTML in .mb-screen,
       mapped onto the display's four projected corners with a CSS matrix3d
     - the Pencil sits magnetically on the top edge, comes off, and scrolls
       the site with a few upward swipes (tip on the glass, a touch ring on
       the screen), then snaps back on
   One progress value p (0..1) across the tall .case-mb section drives it all:
     0    – .18  the iPad rises from lying tilted back to upright, facing you
     .18  – .32  the camera moves in part of the way (ZOOM_MAX)
     .30  – .40  the Pencil leaves the top edge and hovers over the screen
     .40  – .80  SWIPES swipes; each one scrolls the site a step further
     .80  – .88  the Pencil goes back onto the edge
     .88  – 1    exit: turns away to the side, tips back, drifts off
   Needs, loaded before it:
     js/vendor/three.bundle.js   three.js as window.NollThree
     models/ipad.glb.js          the model as base64 (window.NOLL_IPAD_GLB)
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
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const lerp = (a, b, t) => a + (b - a) * t;
const rad = (d) => d * Math.PI / 180;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---- model --------------------------------------------------------------------
// The Sketchfab export stands upright in portrait with the display facing -z
// and the Pencil standing along the left edge, tip down. Turned 180° about y
// (display to +z) and 90° about z it lies in landscape with the Pencil on the
// top edge. Everything else is measured.
const MODEL = {
  screenMaterial: 'screen',
  glassMaterial: 'screen_glass',
  pencilMaterial: 'Apple_Pencil',
  width: .2806,                  // metres, long side of the 12.9" iPad Pro
};

// ---- tuning -----------------------------------------------------------------
const FOV = 26;
const SCREEN_W_PX = 1440;         // layout width of the HTML screen (desktop CSS px)
const ZOOM_MAX = .62;
const SWIPES = 4;
const T = { rise:[0, .18], zoom:[.18, .32], off:[.30, .40], swipe:[.40, .80], back:[.80, .88], away:[.88, 1] };

let renderer, composer, scene, camera, ipad, pivot, ready = false;
// The HTML screen lies on top of the WebGL canvas, so while the Pencil is over
// the display it is drawn a second time on its own transparent canvas above the
// screen (topRenderer / topScene, a copy of the Pencil that follows the pivot).
let topRenderer = null, topScene = null, topCanvas = null, penMain = null, penTop = null, penProxy = null;
let displayFrame = null;
const corners = [];
let dispW = .262, dispH = .194, dispC = null, screenH = 1067, scrollMax = 0, vw = 0, vh = 0;
// Pencil: rest pose (on the edge) and the writing pose, in iPad space
let restPos = null, restDir = null, penLen = .166, qWrite = null, qWriteUp = null;
const qRest = new THREE.Quaternion();
let touchEl = null;

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
  section.classList.toggle('is-zoomed', p > .3 && p < .84);
}

// ---- swipes ---------------------------------------------------------------------
// Where the Pencil is during the swipe phase. u runs 0..1 per swipe:
//   0  – .15  down onto the glass at the low point
//   .15 – .70  on the glass, dragged up (the site follows, with some momentum)
//   .70 – .85  lifts off at the high point
//   .85 – 1    floats back down to the low point for the next one
const SW = { x: .2, lo: -.3, hi: .2, hover: .014 };
function swipeState(p){
  const s = seg(p, T.swipe[0], T.swipe[1]) * SWIPES;
  const i = Math.min(SWIPES - 1, Math.floor(s));
  const u = s - i;
  const last = i === SWIPES - 1;
  let y, lift, contact;
  if (u < .15){ const t = ease(u / .15); y = SW.lo; lift = 1 - t; contact = seg(u, .1, .15); }
  else if (u < .70){ const t = ease((u - .15) / .55); y = lerp(SW.lo, SW.hi, t); lift = 0; contact = 1; }
  else if (u < .85){ const t = ease((u - .70) / .15); y = SW.hi; lift = t; contact = 1 - seg(u, .70, .75); }
  else { const t = last ? 0 : ease((u - .85) / .15); y = lerp(SW.hi, SW.lo, t); lift = 1; contact = 0; }
  if (s >= SWIPES){ y = SW.hi; lift = 1; contact = 0; }
  // the drag phase moves the page; it keeps gliding a little past the lift
  const chunk = s >= SWIPES ? 1 : easeOut(seg(u, .15, .9));
  const scroll = clamp((Math.min(i, SWIPES - 1) + chunk) / SWIPES, 0, 1);
  return { y, lift, contact, scroll, drag: u > .15 && u < .7 ? 1 : 0 };
}
function siteScroll(p){
  if (p <= T.swipe[0]) return 0;
  if (p >= T.swipe[1]) return 1;
  return swipeState(p).scroll;
}
function renderFlat(p){
  const scroll = ease(seg(p, T.swipe[0], T.swipe[1]));
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

// ---- Pencil -----------------------------------------------------------------------
// screen point (fractions of the display, 0 = centre, +y up) → iPad space
const onGlass = (fx, fy, lift) => V(dispC.x + fx * dispW, dispC.y + fy * dispH, dispC.z + .0004 + lift);
const tmpQ = new THREE.Quaternion();
function penPose(p, sw){
  const off = ease(seg(p, T.off[0], T.off[1]));
  const back = ease(seg(p, T.back[0], T.back[1]));
  // between leaving and returning: follow the swipes
  const s = sw || swipeState(p);
  const write = onGlass(SW.x, s.y, s.lift * SW.hover);
  // the hand tips the Pencil a bit more upright while dragging
  tmpQ.copy(qWrite).slerp(qWriteUp, s.drag ? .5 * Math.sin(Math.PI * seg((s.y - SW.lo) / (SW.hi - SW.lo), 0, 1)) : 0);
  if (back > 0){
    // from the last hover point back onto the edge, arcing out towards the viewer
    const a = write, b = restPos;
    pivot.position.lerpVectors(a, b, back);
    pivot.position.z += Math.sin(Math.PI * back) * .05;
    pivot.quaternion.copy(tmpQ).slerp(qRest, back);
    return 0;
  }
  if (off < 1){
    const a = restPos, b = onGlass(SW.x, SW.lo, SW.hover);
    pivot.position.lerpVectors(a, b, off);
    pivot.position.z += Math.sin(Math.PI * off) * .05;
    pivot.quaternion.copy(qRest).slerp(qWrite, off);
    return 0;
  }
  pivot.position.copy(write);
  pivot.quaternion.copy(tmpQ);
  return s.contact;
}
let penOnTop = false;
function renderPencilLayer(onTop){
  penOnTop = !!(onTop && topRenderer);
  if (penMain) penMain.visible = !penOnTop;
  if (penTop) penTop.visible = penOnTop;
}
function renderTop(){
  if (!topRenderer) return;
  if (penOnTop){
    penProxy.matrix.copy(pivot.matrixWorld);
    penProxy.matrixWorldNeedsUpdate = true;
  }
  topRenderer.render(topScene, camera);
}
function placeTouch(contact){
  if (!touchEl) return;
  const tip = pivot.position;
  const x = ((tip.x - (dispC.x - dispW / 2)) / dispW) * SCREEN_W_PX;
  const y = (((dispC.y + dispH / 2) - tip.y) / dispH) * screenH;
  touchEl.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) scale(${(.6 + .4 * contact).toFixed(3)})`;
  touchEl.style.opacity = contact.toFixed(3);
}

// ---- frame ------------------------------------------------------------------------
const tmp = V(0, 0, 0);
let last = -1;
// data-still='{"rx":-8,"ry":-24,"rz":4,"x":0,"y":0,"d":.6,"scroll":0,"pen":"write","py":.1}'
// on the section freezes one pose (used to render key visuals); degrees, metres
const still = section.dataset.still ? JSON.parse(section.dataset.still) : null;
function render3D(p, force){
  if (!force && Math.abs(p - last) < 0.00005) return;
  last = p;
  if (still) return renderStill();
  const rise = ease(seg(p, T.rise[0], T.rise[1]));
  const zoom = ease(seg(p, T.zoom[0], T.zoom[1])) * ZOOM_MAX;
  const away = ease(seg(p, T.away[0], T.away[1]));
  ipad.rotation.set(
    lerp(rad(-58), 0, rise) - rad(20) * away,
    lerp(rad(-28), 0, rise) + rad(112) * away,
    lerp(rad(8), 0, rise) + rad(12) * away,
    'YXZ');
  ipad.position.set(
    lerp(.02, 0, rise) + .08 * away,
    lerp(-.06, 0, rise) + .03 * away,
    lerp(-.04, 0, rise) - .1 * away);
  const contact = penPose(p);
  ipad.updateMatrixWorld(true);

  // camera: square on the upright iPad; framed on the whole thing, then in
  const over = fit(MODEL.width * 1.18, MODEL.width * .95, 1, 1);
  const close = fit(dispW, dispH, .9, .86);
  const d = lerp(over, close, zoom) + .05 * away;
  camera.position.set(0, lerp(.05, .006, rise) + .004 * away, d);
  camera.lookAt(0, lerp(-.01, 0, rise), 0);
  camera.updateMatrixWorld();
  renderPencilLayer(p > T.off[0] && p < T.back[1]);
  composer.render();
  renderTop();

  // lay the HTML screen onto the display
  const { pts, cen, n } = displayWorld();
  const facing = n.dot(tmp.copy(camera.position).sub(cen).normalize());
  const on = seg(rise, 0, .25) * seg(facing, .05, .3);
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
  site.style.transform = `translate3d(0,${(-siteScroll(p) * scrollMax).toFixed(1)}px,0)`;
  placeTouch(contact);
  const right = V(1, 0, 0).transformDirection(displayFrame.matrixWorld);
  const side = right.dot(tmp.copy(camera.position).sub(cen).normalize());
  screenEl.style.setProperty('--mb-glare', (.3 + .7 * (1 - zoom / ZOOM_MAX)).toFixed(3));
  screenEl.style.setProperty('--mb-glare-x', (50 - side * 160).toFixed(1) + '%');
  chrome(p);
}

function renderStill(){
  ipad.rotation.set(rad(still.rx || 0), rad(still.ry || 0), rad(still.rz || 0), 'YXZ');
  ipad.position.set(still.x || 0, still.y || 0, 0);
  if (still.pen === 'write'){
    pivot.position.copy(onGlass(still.px != null ? still.px : SW.x, still.py || 0, still.lift || 0));
    pivot.quaternion.copy(qWrite);
  } else { pivot.position.copy(restPos); pivot.quaternion.copy(qRest); }
  ipad.updateMatrixWorld(true);
  camera.position.set(still.cx || 0, still.cy || 0, still.d || .6);
  camera.lookAt(still.cx || 0, still.ty || 0, 0);
  camera.updateMatrixWorld();
  renderPencilLayer(still.pen === 'write');
  composer.render();
  renderTop();
  const { pts } = displayWorld();
  const q = [0, 1, 2, 3].map((i) => { const s = pts[i].clone().project(camera); return [(s.x + 1) / 2 * vw, (1 - s.y) / 2 * vh]; });
  screenEl.style.transform = homography(SCREEN_W_PX, screenH, q);
  screenEl.style.opacity = 1; screenEl.style.visibility = 'visible';
  screenEl.style.setProperty('--mb-glare', '.8'); screenEl.style.setProperty('--mb-glare-x', (still.glare || 40) + '%');
  site.style.transform = `translate3d(0,${(-(still.scroll || 0)).toFixed(1)}px,0)`;
  placeTouch(still.pen === 'write' && !still.lift ? 1 : 0);
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
    if (topRenderer){ topRenderer.setPixelRatio(dpr); topRenderer.setSize(vw, vh, false); }
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

// ---- studio (reflections only), same panels as the other devices -------------------
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

// the narrow end of the Pencil along its long axis (the tip), in iPad space
function pencilAxis(mesh){
  const pos = mesh.geometry.attributes.position;
  const m = mesh.matrixWorld;
  const pts = [];
  for (let i = 0; i < pos.count; i += 3) pts.push(V(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(m));
  const box = new THREE.Box3().setFromPoints(pts);
  const size = box.getSize(V(0, 0, 0));
  const ax = size.x >= size.y && size.x >= size.z ? 'x' : (size.y >= size.z ? 'y' : 'z');
  const others = ['x', 'y', 'z'].filter((a) => a !== ax);
  const spread = (lo, hi) => {
    const s = pts.filter((q) => q[ax] >= lo && q[ax] <= hi);
    return Math.max(...s.map((q) => q[others[0]])) - Math.min(...s.map((q) => q[others[0]]));
  };
  const L = size[ax], e = L * .02;
  const tipAtMin = spread(box.min[ax], box.min[ax] + e) < spread(box.max[ax] - e, box.max[ax]);
  const c = box.getCenter(V(0, 0, 0));
  const tip = c.clone(); tip[ax] = tipAtMin ? box.min[ax] : box.max[ax];
  const dir = V(0, 0, 0); dir[ax] = tipAtMin ? 1 : -1;     // tip → back end
  return { tip, dir, len: L };
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

const glb = window.NOLL_IPAD_GLB;
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
  let screenMesh = null, pencilMesh = null;
  model.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const name = o.material.name;
    if (name === MODEL.screenMaterial) screenMesh = o;
    if (name === MODEL.pencilMaterial) pencilMesh = o;
    o.material.envMapIntensity = 2.2;
    // the export's aluminium is fully rough: give it a satin finish
    if (name === 'case'){ o.material.roughness = .38; o.material.color.setScalar(.82); }
    // the cover glass is a mirror in the export: the HTML screen sits on top anyway
    if (name === MODEL.glassMaterial){ o.visible = false; }
  });
  if (!screenMesh) return;                    // unexpected model: stay flat

  // normalise: display facing +z, landscape (Pencil edge on top), centred, real size
  const inner = new THREE.Group(); inner.add(model); inner.rotation.y = Math.PI;
  const holder = new THREE.Group(); holder.add(inner); holder.rotation.z = Math.PI / 2;
  // size and centre from the body only — the Pencil sits on top of the top edge
  const body = () => {
    holder.updateMatrixWorld(true);
    const b = new THREE.Box3();
    holder.traverse((o) => { if (o.isMesh && o !== pencilMesh) b.expandByObject(o, true); });
    return b;
  };
  let box = body();
  holder.scale.setScalar(MODEL.width / (box.max.x - box.min.x));
  box = body();
  holder.position.sub(box.getCenter(V(0, 0, 0)));
  ipad = new THREE.Group();
  ipad.add(holder);
  ipad.updateMatrixWorld(true);

  // the display rectangle in iPad space
  const sb = new THREE.Box3().setFromObject(screenMesh, true);
  dispW = sb.max.x - sb.min.x; dispH = sb.max.y - sb.min.y;
  dispC = V((sb.min.x + sb.max.x) / 2, (sb.min.y + sb.max.y) / 2, sb.max.z + .0002);
  displayFrame = new THREE.Object3D();
  displayFrame.position.copy(dispC);
  ipad.add(displayFrame);
  corners.push(V(-dispW / 2, dispH / 2, 0), V(dispW / 2, dispH / 2, 0), V(-dispW / 2, -dispH / 2, 0), V(dispW / 2, -dispH / 2, 0));

  // the Pencil hangs off a pivot at its tip, so posing it is "where is the tip, which way does it point"
  pivot = new THREE.Group();
  ipad.add(pivot);
  if (pencilMesh){
    const ax = pencilAxis(pencilMesh);
    restPos = ax.tip; restDir = ax.dir; penLen = ax.len;
    pivot.position.copy(restPos);
    ipad.updateMatrixWorld(true);
    pivot.attach(pencilMesh);
    // writing: held in a right hand, back end out to the lower right and towards you
    qWrite = new THREE.Quaternion().setFromUnitVectors(restDir, V(.42, -.5, .76).normalize());
    qWriteUp = new THREE.Quaternion().setFromUnitVectors(restDir, V(.36, -.34, .87).normalize());
  } else {
    restPos = V(0, 0, 0); restDir = V(1, 0, 0);
    qWrite = new THREE.Quaternion(); qWriteUp = new THREE.Quaternion();
  }

  // the Pencil's top layer (see topRenderer above)
  penMain = pencilMesh;
  if (pencilMesh){
    try {
      topCanvas = document.createElement('canvas');
      topCanvas.className = 'case-mb-canvas case-mb-canvas--top';
      topCanvas.setAttribute('aria-hidden', 'true');
      stage.appendChild(topCanvas);
      topRenderer = new THREE.WebGLRenderer({ canvas: topCanvas, antialias: true, alpha: true, premultipliedAlpha: true });
      topRenderer.setClearColor(0x000000, 0);
      topRenderer.outputColorSpace = THREE.SRGBColorSpace;
      topRenderer.toneMapping = renderer.toneMapping;
      topRenderer.toneMappingExposure = renderer.toneMappingExposure;
      topScene = new THREE.Scene();
      const pm2 = new THREE.PMREMGenerator(topRenderer);
      topScene.environment = pm2.fromScene(studio(), 0.015).texture;
      topScene.add(key.clone(), fill.clone());
      penProxy = new THREE.Group(); penProxy.matrixAutoUpdate = false;
      penTop = pencilMesh.clone();                // shares geometry and material
      penTop.visible = false;
      penProxy.add(penTop);
      topScene.add(penProxy);
    } catch (e) { topRenderer = null; if (topCanvas) topCanvas.remove(); }
  }

  // screen off: black glass (the HTML screen sits on top)
  const dm = screenMesh.material;
  dm.map = null; dm.emissiveMap = null; dm.emissive && dm.emissive.setScalar(0);
  dm.color && dm.color.setScalar(0); dm.metalness = 0; dm.roughness = .06; dm.needsUpdate = true;

  if (!screenEl.querySelector('.mb-touch')){
    touchEl = document.createElement('span');
    touchEl.className = 'mb-touch'; touchEl.setAttribute('aria-hidden', 'true');
    screenEl.appendChild(touchEl);
  } else touchEl = screenEl.querySelector('.mb-touch');

  scene.add(ipad);
  ready = true;
  section.classList.remove('is-flat');
  section.classList.add('is-3d');
  resize();
}, () => { /* model failed: stay flat */ });
})();
