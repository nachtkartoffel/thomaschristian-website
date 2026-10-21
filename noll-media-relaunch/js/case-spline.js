/* Case detail — laptop stage driven by a Spline scene.
   The 3D scene (laptop, light, materials, screen content) is designed in
   Spline (spline.design); this script only loads it and scrubs it with the
   scroll position. Setup and naming conventions: see SPLINE-SETUP.md.

   Activated by data-spline-scene on #caseMacbook:
     <section class="case-mb" id="caseMacbook"
       data-spline-scene="https://prod.spline.design/XXXX/scene.splinecode">
   Without that attribute this script does nothing and js/case-laptop.js
   (the built-in three.js laptop) runs instead.

   Timeline. Each step moves the listed objects from their previous state into
   the named Spline state while the scroll progress p runs from..to. An object
   only needs the states it is listed under. Override per page with a JSON
   data-spline-timeline attribute in the same shape. */
(function(){
  const section = document.getElementById('caseMacbook');
  if (!section || !section.dataset.splineScene) return;

  const RUNTIME = 'https://unpkg.com/@splinetool/runtime@1.10.39/build/runtime.js';
  const DEFAULT_TIMELINE = [
    { state: 'Open',   from: 0,   to: .2,  objects: ['Lid', 'Camera'] },   // lid opens
    { state: 'Zoom',   from: .2,  to: .38, objects: ['Camera'] },          // push in on the display
    { state: 'Scroll', from: .4,  to: .8,  objects: ['Website'] },         // the site image scrolls up
    { state: 'Out',    from: .82, to: 1,   objects: ['Camera'] },          // pull back out
  ];
  const STEP_MS = 1000;   // each step is one 1s transition, scrubbed with seek()

  const stage = section.querySelector('.case-mb-view') || section.querySelector('.case-mb-sticky');
  const captions = Array.from(section.querySelectorAll('.case-mb-caption'));
  const reduced = window.matchMedia('(prefers-reduced-motion:reduce)');
  let timeline = DEFAULT_TIMELINE;
  try { if (section.dataset.splineTimeline) timeline = JSON.parse(section.dataset.splineTimeline); }
  catch (e) { console.warn('[case-spline] data-spline-timeline is not valid JSON, using the default'); }

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const seg = (p, a, b) => clamp((p - a) / (b - a), 0, 1);
  const ease = (t) => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  // own canvas, above the built-in one (which stays idle)
  section.classList.add('is-spline');
  section.classList.remove('is-flat');
  const canvas = document.createElement('canvas');
  canvas.className = 'case-mb-spline';
  stage.insertBefore(canvas, stage.firstChild);

  function progress(){
    if (reduced.matches) return .2;
    const r = section.getBoundingClientRect();
    const dist = section.offsetHeight - window.innerHeight;
    return dist > 0 ? clamp(-r.top / dist, 0, 1) : 0;
  }
  function chrome(p){
    section.style.setProperty('--mb-p', p.toFixed(4));
    section.classList.toggle('is-zoomed', p > .24 && p < .9);
    captions.forEach((c) => {
      const from = parseFloat(c.dataset.mbFrom), to = parseFloat(c.dataset.mbTo);
      c.classList.toggle('is-active', p >= from && p < to);
    });
  }

  // one paused transition chain per object, built from the steps it appears in
  let tracks = [];
  function build(spline){
    const byObject = new Map();
    timeline.forEach((step) => (step.objects || []).forEach((name) => {
      if (!byObject.has(name)) byObject.set(name, []);
      byObject.get(name).push(step);
    }));
    byObject.forEach((steps, name) => {
      const obj = spline.findObjectByName(name);
      if (!obj){ console.warn(`[case-spline] no object named "${name}" in the scene`); return; }
      try {
        let chain = null;
        steps.forEach((step) => {
          const params = { to: step.state, duration: STEP_MS, delay: 0 };
          chain = chain ? chain.transition(params) : obj.transition(Object.assign({ autoPlay: false }, params));
        });
        tracks.push({ name, steps, chain });
      } catch (e) {
        console.warn(`[case-spline] could not set up "${name}" — does it have the states ${steps.map((s) => s.state).join(', ')}?`, e);
      }
    });
  }
  function apply(p){
    chrome(p);
    tracks.forEach((t) => {
      let ms = 0;
      for (const step of t.steps){
        const local = ease(seg(p, step.from, step.to));
        ms += local * STEP_MS;
        if (local < 1) break;
      }
      t.chain.seek(ms);
    });
  }

  // follow the scroll with a little inertia
  let cur = -1, running = false, lastT = 0;
  function update(){
    const target = progress();
    if (cur < 0 || reduced.matches){ cur = target; apply(cur); return; }
    if (!running){ running = true; lastT = performance.now(); requestAnimationFrame(tick); }
  }
  function tick(t){
    const target = progress();
    const dt = Math.min(64, t - lastT); lastT = t;
    cur += (target - cur) * (1 - Math.exp(-dt / 110));
    if (Math.abs(target - cur) < 0.0002) cur = target;
    apply(cur);
    if (cur !== target) requestAnimationFrame(tick); else running = false;
  }

  import(RUNTIME).then(({ Application }) => {
    const spline = new Application(canvas);
    return spline.load(section.dataset.splineScene).then(() => {
      spline.setBackgroundColor('#000000');
      build(spline);
      section.classList.add('is-spline-ready');
      update();
      window.addEventListener('scroll', update, { passive: true });
      window.addEventListener('resize', update);
    });
  }).catch((e) => {
    // scene or runtime unavailable (offline, wrong URL): fall back to the flat screen
    console.warn('[case-spline] could not load the Spline scene', e);
    canvas.remove();
    section.classList.remove('is-spline');
    section.classList.add('is-flat');
  });
})();
