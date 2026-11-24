/* Local LLM Picker: Learn page.
   Interactive explainer for beginners. Uses window.Engine and window.DATA when present
   and keeps working when data arrays are empty. No libraries, no network requests.
   Element ids it relies on: #view-learn (from the app) and #lrn (from learn.html). */
(function () {
  'use strict';
  const view = document.getElementById('view-learn');
  const root = document.getElementById('lrn');
  if (!view || !root) return;

  /* ---------- Data and helpers ---------- */
  const E = window.Engine || null;
  const D = window.DATA || {};
  const arr = x => (Array.isArray(x) ? x : []);
  const LLM = arr(D.llm).filter(Boolean);
  const CHAT = LLM.filter(m => m.kind !== 'embedding' && m.params_total_b > 0);
  const EMBED = LLM.filter(m => m.kind === 'embedding');
  const MEDIA = arr(D.media).filter(Boolean);
  const RT = arr(D.runtimes).filter(Boolean);

  const $ = (s, r) => (r || root).querySelector(s);
  const $$ = (s, r) => Array.from((r || root).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const byId = id => CHAT.find(m => m.id === id) || null;
  const nf = n => Math.round(n).toLocaleString('en-GB');
  const motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const reduced = () => !!(motionQuery && motionQuery.matches);

  // Quantisation levels: from the engine when available, otherwise the same values.
  const Q_FALLBACK = {
    q2: { id: 'q2', label: '2-bit', file: 'Q2_K', bits: 2.7, short: 'Large quality loss. Only worth it for very big models when nothing else fits.' },
    q3: { id: 'q3', label: '3-bit', file: 'Q3_K_M', bits: 3.9, short: 'Visible quality loss. A fallback when 4-bit does not fit.' },
    q4: { id: 'q4', label: '4-bit', file: 'Q4_K_M', bits: 4.85, short: 'The usual default. Small quality loss, about a third of the original size.' },
    q5: { id: 'q5', label: '5-bit', file: 'Q5_K_M', bits: 5.7, short: 'Very close to the original for most uses.' },
    q6: { id: 'q6', label: '6-bit', file: 'Q6_K', bits: 6.6, short: 'Hard to tell apart from the original in daily use.' },
    q8: { id: 'q8', label: '8-bit', file: 'Q8_0', bits: 8.5, short: 'Practically the original, at about half its size.' },
    f16: { id: 'f16', label: '16-bit', file: 'BF16', bits: 16, short: 'The original precision. Used for training and for servers with plenty of memory.' }
  };
  const Q = id => (E && E.QUANT_BY_ID && E.QUANT_BY_ID[id]) || Q_FALLBACK[id];
  const gb = x => (x >= 1000 ? (Math.round(x / 100) / 10) + ' TB' : E ? E.fmtGB(x) : (Math.round(x * 10) / 10) + ' GB');
  const tpsTxt = x => (E ? E.fmtTps(x) : String(Math.round(x * 10) / 10));
  const pTxt = b => (E ? E.fmtParams(b) : (Math.round(b * 10) / 10) + 'B');
  const ctxTxt = n => (E ? E.fmtCtx(n) : n >= 1e6 ? n / 1e6 + 'M' : Math.round(n / 1024) + 'k');
  const weightsGB = (m, qid) => {
    const q = Q(qid); const bits = m.native_bits ? Math.min(q.bits, m.native_bits) : q.bits;
    return (m.params_resident_b || m.params_total_b) * bits / 8;
  };
  function secs(s) {
    if (s == null || !isFinite(s)) return '–';
    if (s < 1) return 'under a second';
    if (s < 90) { const r = Math.round(s); return 'about ' + r + (r === 1 ? ' second' : ' seconds'); }
    return 'about ' + (Math.round(s / 6) / 10) + ' minutes';
  }
  function paintRange(el) { el.style.setProperty('--pct', ((el.value - el.min) / ((el.max - el.min) || 1) * 100) + '%'); }
  function onRange(el, fn) {
    if (!el) return;
    el.addEventListener('input', () => { paintRange(el); fn(+el.value); });
    paintRange(el);
  }
  function segGroup(box, attr, fn) {
    if (!box) return;
    box.addEventListener('click', e => {
      const b = e.target.closest('button[' + attr + ']');
      if (!b || !box.contains(b)) return;
      setSeg(box, attr, b.getAttribute(attr));
      fn(b.getAttribute(attr), b);
    });
  }
  function setSeg(box, attr, val) {
    $$('button[' + attr + ']', box).forEach(x => x.setAttribute('aria-pressed', String(x.getAttribute(attr) === String(val))));
  }
  const badge = (id, label) => `<span class="status ${({ great: 'is-ok', ok: 'is-warn', slow: 'is-warn', no: 'is-bad' })[id] || 'is-info'}">${esc(label)}</span>`;

  /* Hardware presets for the demos. Spec-sheet figures, rounded; they are approximate. */
  const HW = {
    laptop: { name: 'Laptop without a graphics card', class: 'cpu', memory_gb: 32, bandwidth_gbs: 90, usable_memory_fraction: 0.8, fp16_tflops_dense: 1.5 },
    gpu: { name: 'Gaming PC with a 24 GB graphics card', class: 'gpu-consumer', memory_gb: 24, bandwidth_gbs: 1008, usable_memory_fraction: 1, fp16_tflops_dense: 165 },
    mac: { name: 'Mac with a Max chip and 128 GB', class: 'unified-memory', memory_gb: 128, bandwidth_gbs: 546, usable_memory_fraction: 0.75, fp16_tflops_dense: 17 },
    server: { name: 'Server graphics card with 80 GB', class: 'gpu-datacenter', memory_gb: 80, bandwidth_gbs: 3350, usable_memory_fraction: 1, fp16_tflops_dense: 989 }
  };
  function estimate(model, qid, hwKey, opts, count) {
    if (!E) return null;
    try {
      const machine = E.buildMachine(HW[hwKey], { count: count || 1, ramGB: 32 });
      const r = E.estimateText(model, Q(qid), machine, { ctx: opts.ctx || 8192, users: opts.users || 1, kvBits: opts.kvBits || 16 });
      r.machine = machine;
      return r;
    } catch (e) { return null; }
  }

  /* ---------- Animation ticker: runs only while a scene is on screen ---------- */
  const scenes = [];
  let raf = 0, lastT = 0;
  const visIO = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    entries.forEach(en => { scenes.forEach(s => { if (s.el === en.target) s.on = en.isIntersecting; }); });
    kick();
  }, { rootMargin: '60px 0px' }) : null;
  function scene(el, tick, still) {
    const s = { el, tick, still, on: !visIO, t: 0 };
    scenes.push(s);
    if (visIO) visIO.observe(el);
    return s;
  }
  const running = () => !view.hidden && !document.hidden && !reduced() && scenes.some(s => s.on);
  function kick() { if (!raf && running()) { lastT = 0; raf = requestAnimationFrame(loop); } }
  function loop(now) {
    raf = 0;
    // Cap the step so a long pause (tab switch) does not jump, but keep real time on slow devices.
    const dt = lastT ? Math.min(0.5, (now - lastT) / 1000) : 0;
    lastT = now;
    scenes.forEach(s => { if (s.on) { s.t += dt; s.tick(s.t, dt); } });
    if (running()) raf = requestAnimationFrame(loop);
  }
  document.addEventListener('visibilitychange', kick);
  if (motionQuery) {
    const onMotion = () => { scenes.forEach(s => s.still && s.still()); kick(); };
    if (motionQuery.addEventListener) motionQuery.addEventListener('change', onMotion);
    else if (motionQuery.addListener) motionQuery.addListener(onMotion);
  }

  /* ---------- Scroll-driven steps ---------- */
  function scrolly(box, apply) {
    const steps = $$('.lrn-step', box);
    if (!steps.length) return;
    const set = st => { steps.forEach(s => s.classList.toggle('is-on', s === st)); apply(st.dataset); };
    steps[0].classList.add('is-on');
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => { if (en.isIntersecting) set(en.target); });
    }, { rootMargin: '-45% 0px -45% 0px' });
    steps.forEach(s => io.observe(s));
  }

  /* =====================================================================
     ROUTING, CHAPTER INDEX
     ===================================================================== */
  const chapters = $$('.lrn-ch');
  const indexBox = $('#lrn-index-in');
  const topbarH = () => { const t = document.querySelector('.app-header'); return t ? t.offsetHeight : 64; };
  const indexH = () => { const n = $('#lrn-index'); return n ? n.offsetHeight : 0; };
  function chapterFromHash(h) { const m = /^#\/learn\/([\w-]+)/.exec(h || ''); return m ? m[1] : null; }
  function goTo(id, smooth) {
    const el = document.getElementById('lrn-' + id);
    if (!el || view.hidden) return;
    const off = id === 'top' ? topbarH() : topbarH() + indexH() - 1;
    const y = Math.max(0, el.getBoundingClientRect().top + window.pageYOffset - off);
    window.scrollTo({ top: y, behavior: smooth && !reduced() ? 'smooth' : 'auto' });
  }
  function handleShow(hash) {
    const id = chapterFromHash(hash);
    if (id) requestAnimationFrame(() => goTo(id, true));
    updateActive();
    kick();
  }
  window.addEventListener('learn:show', e => handleShow(e.detail && e.detail.hash));

  root.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#/learn/"]');
    if (!a || !root.contains(a)) return;
    if (a.getAttribute('href') === location.hash) { e.preventDefault(); goTo(chapterFromHash(location.hash), true); }
  });

  let activeCh = null, scrollQueued = false;
  function updateActive() {
    if (view.hidden || !indexBox) return;
    const y = topbarH() + indexH() + 80;
    let cur = 'top';
    chapters.forEach(s => { if (s.getBoundingClientRect().top <= y) cur = s.dataset.ch; });
    if (cur === activeCh) return;
    activeCh = cur;
    $$('a[data-ch]', indexBox).forEach(a => {
      const on = a.dataset.ch === cur;
      if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
      if (on) {
        const left = a.offsetLeft - indexBox.clientWidth / 2 + a.offsetWidth / 2;
        try { indexBox.scrollTo({ left, behavior: reduced() ? 'auto' : 'smooth' }); } catch (err) { indexBox.scrollLeft = left; }
      }
    });
  }
  window.addEventListener('scroll', () => {
    if (scrollQueued || view.hidden) return;
    scrollQueued = true;
    requestAnimationFrame(() => { scrollQueued = false; updateActive(); });
  }, { passive: true });

  /* =====================================================================
     0 · START: "Where to start" paths
     ===================================================================== */
  const CH = {
    basics: ['01', 'Running a model locally', 'The three parts: model file, engine and interface.'],
    memory: ['02', 'Memory decides what fits', 'Why the memory size of your machine limits the models you can run.'],
    quantisation: ['03', 'Quantisation', 'How smaller model files work and what they cost in quality.'],
    speed: ['04', 'Memory speed sets writing speed', 'What decides how fast text appears, and why thinking models start later.'],
    context: ['05', 'Context and conversation memory', 'Why memory grows with long documents and with every extra user.'],
    moe: ['06', 'Mixture of experts', 'Why some very large models still write quickly.'],
    tools: ['07', 'The tools', 'Which program suits your hardware and number of users.'],
    formats: ['08', 'Model files', 'File formats, file names and safe downloads.'],
    media: ['09', 'Images, video and speech', 'What changes for picture, video and voice models.'],
    team: ['10', 'From one person to a team', 'The parts of a shared service, sizing, security and checklists.'],
    costs: ['11', 'What it costs', 'Paying per token, renting a GPU or buying hardware, and when buying pays off.'],
    licences: ['12', 'Licences', 'What you may do with a model, and limits for large companies.'],
    glossary: ['13', 'Glossary', 'Short definitions of every term.']
  };
  const PATHS = {
    try: {
      intro: 'Four short chapters cover what you need. Afterwards, the first two steps of the tool show what fits your computer, and the Models page lists the models that run on it with the command to start each one.',
      chapters: ['basics', 'memory', 'quantisation', 'tools'], tool: ['#/', 'Check what fits my computer']
    },
    team: {
      intro: 'These chapters explain what changes when several people share one machine and what it costs. Afterwards, use the Calculator with the number of people who will use it at the same time.',
      chapters: ['basics', 'memory', 'context', 'tools', 'team', 'costs', 'licences'], tool: ['#/calculator', 'Open the Calculator']
    },
    ent: {
      intro: 'These chapters cover speed with many users, memory per user, server software, the usual service design, costs and licence conditions for large companies. Afterwards, size the hardware in the Calculator and take the enterprise checklist in chapter 10 to your IT security and legal teams.',
      chapters: ['speed', 'context', 'moe', 'tools', 'team', 'costs', 'licences'], tool: ['#/calculator', 'Open the Calculator']
    }
  };
  (function initPaths() {
    const out = $('#lrn-path-out');
    const box = $('.lrn-paths');
    if (!out || !box) return;
    box.addEventListener('click', e => {
      const b = e.target.closest('[data-path]');
      if (!b) return;
      const p = PATHS[b.dataset.path];
      $$('[data-path]', box).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      const first = p.chapters[0];
      out.innerHTML = `<p class="lrn-p">${esc(p.intro)}</p>
        <ol class="lrn-pathlist">${p.chapters.map(id => `<li><a href="#/learn/${id}"><span class="step-no">${CH[id][0]}</span><span><span class="t">${esc(CH[id][1])}</span><span class="fine">${esc(CH[id][2])}</span></span></a></li>`).join('')}</ol>
        <div class="lrn-actions"><a class="btn btn-sm" href="#/learn/${first}">Start with chapter ${CH[first][0]}</a><a class="btn btn-quiet btn-sm" href="${p.tool[0]}">${esc(p.tool[1])}</a></div>`;
      out.hidden = false;
    });
  })();

  /* =====================================================================
     1 · BASICS: animated flow diagram
     ===================================================================== */
  (function initFlow() {
    const box = $('#lrn-flow');
    if (!box) return;
    const widths = [22, 14, 30, 18, 12, 26, 16, 20, 28, 12, 18, 24];
    let x = 0, line = 0;
    const words = widths.map(w => { if (x + w > 104) { line++; x = 0; } const o = { x: 22 + x, y: 88 + line * 13, w }; x += w + 4; return o; });
    let dots = '';
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) dots += `<circle class="wd" data-r="${r}" cx="${357 + c * 13}" cy="${76 + r * 11.5}" r="2.6"/>`;
    box.innerHTML = `<svg class="lrn-flow-svg" viewBox="0 0 480 210" data-focus="ui" aria-hidden="true" focusable="false">
      <defs><marker id="lrn-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z"/></marker></defs>
      <line class="lane lane-q" x1="146" y1="84" x2="194" y2="84" marker-end="url(#lrn-arr)"/>
      <line class="lane lane-a" x1="194" y1="122" x2="146" y2="122" marker-end="url(#lrn-arr)"/>
      <line class="lane lane-w" x1="336" y1="104" x2="286" y2="104" marker-end="url(#lrn-arr)"/>
      <g class="node n-ui"><rect class="nb" x="10" y="30" width="130" height="140" rx="14"/>
        <circle class="dot3" cx="24" cy="43" r="3"/><circle class="dot3" cx="33" cy="43" r="3"/><circle class="dot3" cx="42" cy="43" r="3"/>
        <rect class="qb" x="66" y="54" width="62" height="20" rx="10"/>
        ${words.map((w, i) => `<rect class="aw" data-i="${i}" x="${w.x}" y="${w.y}" width="${w.w}" height="8" rx="4"/>`).join('')}</g>
      <g class="node n-eng"><rect class="nb" x="200" y="55" width="80" height="90" rx="14"/>
        <rect class="chip" x="222" y="82" width="36" height="36" rx="6"/><rect class="core" x="230" y="90" width="20" height="20" rx="3"/>
        <path class="pins" d="M228,76v6M240,76v6M252,76v6M228,118v6M240,118v6M252,118v6M216,88h6M216,100h6M216,112h6M258,88h6M258,100h6M258,112h6"/></g>
      <g class="node n-mod"><path class="nb" d="M340,30 h98 l32,32 v108 h-130 z"/><path class="fold" d="M438,30 v32 h32"/>${dots}</g>
      <rect class="tok tok-q" x="146" y="79" width="16" height="10" rx="5"/>
      <rect class="tok tok-a" x="146" y="117" width="16" height="10" rx="5"/>
      <circle class="wp" cx="336" cy="100" r="3.2"/><circle class="wp" cx="336" cy="104" r="3.2"/><circle class="wp" cx="336" cy="108" r="3.2"/>
      <text class="lbl" x="75" y="196" text-anchor="middle">Interface</text>
      <text class="lbl" x="240" y="170" text-anchor="middle">Engine</text>
      <text class="lbl" x="405" y="196" text-anchor="middle">Model file</text>
    </svg>`;
    const cap = $('#lrn-flow-cap');
    if (cap) cap.innerHTML = '<span class="legend"><span><i class="lg-q"></i>Question</span><span><i class="lg-a"></i>Answer token</span><span><i class="lg-w"></i>Weights read from the model file</span></span>';
    const svg = $('svg', box);
    const tq = $('.tok-q', svg), ta = $('.tok-a', svg), core = $('.core', svg);
    const wps = $$('.wp', svg), aws = $$('.aw', svg), wds = $$('.wd', svg);
    const N = words.length, T0 = 1, STEP = 0.45, LOOP = 8;
    function draw(time) {
      const t = time % LOOP;
      tq.style.opacity = t < T0 ? 1 : 0;
      tq.setAttribute('x', 146 + clamp(t / T0, 0, 1) * 32);
      const gen = t >= T0 && t < T0 + N * STEP;
      const u = gen ? (t - T0) % STEP : -1;
      wps.forEach((p, k) => {
        const pu = gen ? (u - k * 0.05) / 0.2 : -1;
        p.style.opacity = pu >= 0 && pu <= 1 ? 1 : 0;
        p.setAttribute('cx', 336 - clamp(pu, 0, 1) * 48);
      });
      const v = gen && u >= 0.2 ? (u - 0.2) / 0.25 : -1;
      ta.style.opacity = v >= 0 ? 1 : 0;
      ta.setAttribute('x', 178 - clamp(v, 0, 1) * 32);
      const shown = t < T0 + STEP ? 0 : Math.min(N, Math.floor((t - T0 - STEP) / STEP) + 1);
      aws.forEach((a, i) => { a.style.opacity = i < shown ? 1 : 0; });
      const row = gen && u < 0.25 ? Math.floor(u / 0.25 * 8) : -1;
      wds.forEach(d => d.classList.toggle('hot', +d.dataset.r === row));
      core.style.opacity = gen ? 0.35 + 0.65 * (1 - u / STEP) : 0.2;
    }
    const s = scene(box, t => draw(t), () => draw(3.3));
    draw(3.3);
    s.t = 0;
    const host = box.closest('.lrn-scrolly');
    if (host) scrolly(host, d => { svg.setAttribute('data-focus', d.focus || 'ui'); });
  })();

  /* =====================================================================
     2 · MEMORY: model size × precision against machines
     ===================================================================== */
  (function initMemory() {
    const slider = $('#lrn-mem-p');
    const rowsBox = $('#lrn-mem-rows');
    if (!slider || !rowsBox) return;
    const P_MIN = 1, P_MAX = 1000;   // three decades, so the tick labels sit at true positions
    const p2s = p => Math.round(Math.log(p / P_MIN) / Math.log(P_MAX / P_MIN) * 1000);
    const s2p = s => {
      const p = P_MIN * Math.pow(P_MAX / P_MIN, s / 1000);
      return p < 3 ? Math.round(p * 10) / 10 : p < 30 ? Math.round(p * 2) / 2 : p < 300 ? Math.round(p) : Math.round(p / 10) * 10;
    };
    const MACHINES = [
      { name: 'Laptop, 8 GB', gb: 8, use: 5.5 },
      { name: 'Laptop or PC, 16 GB', gb: 16, use: 12 },
      { name: 'Gaming graphics card, 24 GB', gb: 24, use: 23 },
      { name: 'Workstation card, 48 GB', gb: 48, use: 46 },
      { name: 'Server graphics card, 80 GB', gb: 80, use: 76 },
      { name: 'Mac or mini PC, 128 GB shared', gb: 128, use: 96 },
      { name: 'Server with eight 80 GB cards', gb: 640, use: 608 }
    ];
    const st = { p: 9, q: 'f16' };
    rowsBox.innerHTML = MACHINES.map((m, i) => `<div class="lrn-row" data-i="${i}">
        <span class="lrn-row-n">${esc(m.name)}</span>
        <div class="lrn-track"><i class="res" style="width:${((m.gb - m.use) / m.gb * 100).toFixed(1)}%"></i><i class="fill"></i></div>
        <span class="lrn-row-s"></span></div>`).join('');
    const rows = $$('.lrn-row', rowsBox);
    const bytesTxt = { f16: '2 bytes', q8: 'about 1 byte', q4: 'about 0.6 bytes' };
    const pWords = p => p >= 1000 ? (Math.round(p / 100) / 10) + ' trillion' : (p < 10 ? p : Math.round(p)) + ' billion';
    function render() {
      const q = Q(st.q);
      const size = st.p * q.bits / 8;
      $('#lrn-mem-pv').textContent = (st.p >= 1000 ? (Math.round(st.p / 100) / 10) + 'T' : pTxt(st.p)) + ' parameters';
      slider.setAttribute('aria-valuetext', pWords(st.p) + ' parameters');
      $('#lrn-mem-gb').textContent = gb(size);
      $('#lrn-mem-formula').textContent = `${pWords(st.p)} parameters × ${bytesTxt[st.q]} ≈ ${gb(size)} for the model file`;
      const sim = CHAT.filter(m => Math.abs(m.params_total_b - st.p) / st.p < 0.15).sort((a, b) => Math.abs(a.params_total_b - st.p) - Math.abs(b.params_total_b - st.p)).slice(0, 3);
      let simTxt = '';
      if (sim.length) simTxt = 'Similar size in the model list: ' + sim.map(m => m.name).join(', ') + '.';
      else if (CHAT.length) { const n = CHAT.slice().sort((a, b) => Math.abs(Math.log(a.params_total_b / st.p)) - Math.abs(Math.log(b.params_total_b / st.p)))[0]; simTxt = `Closest in the model list: ${n.name} (${pTxt(n.params_total_b)}).`; }
      $('#lrn-mem-similar').textContent = simTxt;
      MACHINES.forEach((m, i) => {
        const need = size * 1.1 + 1;
        const s = need <= m.use ? ['great', 'Fits'] : size <= m.use ? ['ok', 'Tight'] : ['no', 'Does not fit'];
        const r = rows[i];
        r.className = 'lrn-row s-' + s[0];
        $('.fill', r).style.width = Math.min(100, size / m.gb * 100).toFixed(1) + '%';
        $('.lrn-row-s', r).innerHTML = badge(s[0], s[1]);
        r.title = s[0] === 'no' ? `${gb(size - m.use)} more than the usable ${gb(m.use)}` : s[0] === 'ok' ? `Fits in the usable ${gb(m.use)}, with little room for the conversation` : `Fits in the usable ${gb(m.use)}`;
      });
    }
    function set(p, q, fromSlider) {
      if (p != null) st.p = p;
      if (q) { st.q = q; setSeg($('#lrn-memory'), 'data-memq', q); }
      if (!fromSlider) { slider.value = p2s(st.p); paintRange(slider); }
      render();
    }
    onRange(slider, v => set(s2p(v), null, true));
    segGroup(slider.closest('.lrn-stage'), 'data-memq', q => set(null, q));
    set(9, 'f16');
    const host = slider.closest('.lrn-scrolly');
    if (host) scrolly(host, d => set(+d.p, d.q));
  })();

  /* =====================================================================
     3 · QUANTISATION: rounding a group of weights
     ===================================================================== */
  (function initQuant() {
    const slider = $('#lrn-q-bits');
    const vis = $('#lrn-q-vis');
    if (!slider || !vis) return;
    const BITS = [16, 8, 6, 5, 4, 3, 2];
    const QID = { 16: 'f16', 8: 'q8', 6: 'q6', 5: 'q5', 4: 'q4', 3: 'q3', 2: 'q2' };
    const N = 24, W = 480, H = 250, Y0 = 125, SC = 100, X0 = 16, XW = 448;
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const base = [], phase = [];
    for (let i = 0; i < N; i++) { base.push((rnd() * 2 - 1) * (0.35 + 0.65 * rnd())); phase.push(rnd() * 6.28); }
    const bw = XW / N;
    let html = `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true" focusable="false"><g class="ql-g"></g><line class="qz" x1="${X0}" x2="${X0 + XW}" y1="${Y0}" y2="${Y0}"/>`;
    for (let i = 0; i < N; i++) html += `<rect class="qs" x="${(X0 + i * bw + bw * 0.22).toFixed(1)}" width="${(bw * 0.56).toFixed(1)}"/><rect class="qo" x="${(X0 + i * bw + bw * 0.1).toFixed(1)}" width="${(bw * 0.8).toFixed(1)}"/>`;
    html += `<text class="qt" x="${X0}" y="${H - 6}">24 weights in one group</text><text class="qt qt-r" x="${X0 + XW}" y="16" text-anchor="end"></text></svg>`;
    vis.innerHTML = html;
    const svg = $('svg', vis), lg = $('.ql-g', svg), qs = $$('.qs', svg), qo = $$('.qo', svg), note = $('.qt-r', svg);
    const ref = byId('qwen3.8-27b') || CHAT.filter(m => m.arch !== 'moe').sort((a, b) => Math.abs(a.params_total_b - 27) - Math.abs(b.params_total_b - 27))[0] || { name: 'A 27B model', params_total_b: 27 };
    let bits = 4, lastLevels = -1;
    const barY = v => (v >= 0 ? [Y0 - v * SC, v * SC] : [Y0, -v * SC]);
    function draw(time) {
      const w = base.map((b, i) => b * 0.88 + 0.13 * Math.sin(time * 0.7 + phase[i]));
      const lo = Math.min.apply(null, w), hi = Math.max.apply(null, w);
      const L = Math.pow(2, bits), step = (hi - lo) / (L - 1);
      let errSum = 0, absSum = 0;
      w.forEach((v, i) => {
        const s = bits >= 16 ? v : lo + Math.round((v - lo) / step) * step;
        errSum += Math.abs(v - s); absSum += Math.abs(v);
        const a = barY(v), b = barY(s);
        qo[i].setAttribute('y', a[0].toFixed(1)); qo[i].setAttribute('height', Math.max(0.5, a[1]).toFixed(1));
        qs[i].setAttribute('y', b[0].toFixed(1)); qs[i].setAttribute('height', Math.max(0.5, b[1]).toFixed(1));
      });
      const showLines = L <= 64;
      if (showLines) {
        if (lastLevels !== L) { lg.innerHTML = Array.from({ length: L }, () => `<line class="ql" x1="${X0}" x2="${X0 + XW}"/>`).join(''); lastLevels = L; }
        $$('line', lg).forEach((ln, k) => { const y = (Y0 - (lo + k * step) * SC).toFixed(1); ln.setAttribute('y1', y); ln.setAttribute('y2', y); });
      } else if (lastLevels !== 0) { lg.innerHTML = ''; lastLevels = 0; }
      note.textContent = bits >= 16 ? 'Stored as they are' : showLines ? L + ' steps' : L + ' steps, too close to draw';
      return absSum ? errSum / absSum * 100 : 0;
    }
    const errTxt = e => bits >= 16 ? 'Nothing is rounded.' : `Average rounding error in this group: ${e < 1 ? e.toFixed(1) : Math.round(e)}%.`;
    function render() {
      const q = Q(QID[bits]);
      $('#lrn-q-bv').textContent = bits + '-bit';
      slider.setAttribute('aria-valuetext', bits + '-bit');
      $('#lrn-q-model').textContent = `${ref.name} at this precision`;
      $('#lrn-q-gb').textContent = gb(ref.params_total_b * q.bits / 8);
      $('#lrn-q-note').textContent = q.short + (bits < 16 ? ` In GGUF file names: ${q.file}.` : '');
      $('#lrn-q-err').textContent = errTxt(draw(sc.t));
    }
    let errAcc = 0;
    const sc = scene(vis, (t, dt) => { const e = draw(t); errAcc += dt; if (errAcc > 0.6) { errAcc = 0; $('#lrn-q-err').textContent = errTxt(e); } }, () => render());
    onRange(slider, v => { bits = BITS[v]; render(); });
    render();

    const nat = CHAT.filter(m => m.native_bits);
    const natBox = $('#lrn-q-native');
    if (natBox) {
      if (!nat.length) natBox.hidden = true;
      else {
        const g8 = nat.filter(m => m.native_bits >= 8), g4 = nat.filter(m => m.native_bits >= 4 && m.native_bits < 8), g2 = nat.filter(m => m.native_bits < 4);
        const part = (l, t) => l.length ? `${t}: ${l.map(m => esc(m.name)).join(', ')}.` : '';
        natBox.innerHTML = 'In the model list, these models are released already compressed. ' + [part(g8, 'At 8-bit'), part(g4, 'At about 4-bit'), part(g2, 'At about 2-bit')].filter(Boolean).join(' ');
      }
    }
  })();

  /* =====================================================================
     4 · SPEED: tokens per second, shown as typing
     ===================================================================== */
  (function initSpeed() {
    const devBox = $('#lrn-spd-devs'), modBox = $('#lrn-spd-models');
    if (!devBox || !modBox) return;
    const DEVS = [
      ['laptop', 'Laptop', 'No graphics card, 32 GB system memory, about 90 GB/s.'],
      ['gpu', 'Gaming card', '24 GB graphics card such as an RTX 4090, about 1,000 GB/s, in a PC with 32 GB of RAM.'],
      ['mac', 'Mac, Max chip', '128 GB of shared memory, such as an M4 Max, about 550 GB/s.'],
      ['server', 'Server card', '80 GB server graphics card such as an H100, about 3,350 GB/s.']
    ];
    let models = ['qwen3.5-9b', 'qwen3.8-27b', 'qwen3.6-35b-a3b', 'gpt-oss-120b'].map(byId).filter(Boolean);
    if (models.length < 2) models = [
      { id: 'x9', name: '9B dense', params_total_b: 9, params_active_b: 9, kv_bytes_per_token_fp16: 131072, modalities: [] },
      { id: 'x27', name: '27B dense', params_total_b: 27, params_active_b: 27, kv_bytes_per_token_fp16: 65536, modalities: [] },
      { id: 'x35', name: '35B MoE, 3B active', params_total_b: 35, params_active_b: 3, kv_bytes_per_token_fp16: 20480, modalities: [] },
      { id: 'x120', name: '120B MoE, 5B active', params_total_b: 120, params_active_b: 5, kv_bytes_per_token_fp16: 36864, modalities: [] }
    ];
    devBox.innerHTML = DEVS.map(d => `<button type="button" data-spddev="${d[0]}" aria-pressed="false">${esc(d[1])}</button>`).join('');
    modBox.innerHTML = models.map(m => `<button type="button" data-spdmod="${esc(m.id)}" aria-pressed="false">${esc(m.name)}</button>`).join('');
    const st = { dev: 'mac', mod: models[Math.min(1, models.length - 1)].id };
    setSeg(devBox, 'data-spddev', st.dev); setSeg(modBox, 'data-spdmod', st.mod);
    const TEXT = 'Running a model on your own computer keeps your documents on your own hardware. The speed you see here comes from how quickly the memory can deliver the model\'s weights for each new token. A bigger model or slower memory gives fewer tokens per second, and a smaller model or faster memory gives more. Most people read about four words per second.';
    const WORDS = TEXT.split(' ');
    const textEl = $('#lrn-spd-text'), typeBox = $('#lrn-spd-type');
    let rate = 0, shown = 0, hold = 0;
    function render() {
      const m = models.find(x => x.id === st.mod) || models[0];
      const dev = DEVS.find(d => d[0] === st.dev);
      $('#lrn-spd-devnote').textContent = dev[2] + ' Figures are approximate.';
      const r = estimate(m, 'q4', st.dev, { ctx: 8192, users: 1 });
      const tpsEl = $('#lrn-spd-tps'), math = $('#lrn-spd-math');
      if (!r) { tpsEl.textContent = '–'; math.textContent = 'Estimates are not available.'; rate = 0; return; }
      const hw = HW[st.dev];
      if (r.fit === 'no') {
        tpsEl.textContent = '–';
        $('#lrn-spd-badge').innerHTML = badge('no', 'Does not fit');
        $('#lrn-spd-unit').textContent = 'tokens per second';
        math.textContent = `${m.name} needs about ${gb(r.neededGB)} at 4-bit. This device has about ${gb(r.machine.fastGB + r.machine.offloadGB)} for models.`;
        $('#lrn-spd-ttft').textContent = `${m.name} does not fit on the selected device, so there is no prompt-reading time to show.`;
        $('#lrn-spd-think').textContent = '';
        rate = 0; textEl.textContent = 'This model does not fit on this device.'; typeBox.classList.add('is-off');
        return;
      }
      typeBox.classList.remove('is-off');
      const t = r.tps;
      tpsEl.textContent = tpsTxt(t);
      $('#lrn-spd-badge').innerHTML = badge(r.verdict.id, r.verdict.label);
      $('#lrn-spd-unit').textContent = `tokens per second · about ${tpsTxt(t * 0.75)} words per second`;
      const read = r.mem.weights * clamp(m.params_active_b / m.params_total_b, 0, 1);
      const limit = hw.bandwidth_gbs / read;
      math.innerHTML = `For each token it reads about <b>${gb(read)}</b>${m.params_active_b < m.params_total_b ? ' (only the active experts, see chapter 6)' : ''}. ${nf(hw.bandwidth_gbs)} GB/s ÷ ${gb(read)} ≈ ${nf(limit)} tokens per second at most. The estimate above allows for typical losses.` +
        (r.fit === 'offload' ? ' Part of this model sits in the slower system RAM, which costs speed.' : '');
      const tt = r.speed && r.speed.ttft4k;
      $('#lrn-spd-ttft').textContent = tt ? `On the selected device, reading a 4,000-token document (about 6 pages) takes ${secs(tt)} before the first word of ${m.name} appears.` : '';
      $('#lrn-spd-think').textContent = `At ${tpsTxt(t)} tokens per second, 1,000 thinking tokens mean waiting ${secs(1000 / t)} before the answer starts.`;
      rate = t * 0.75;
      shown = 0; hold = 0;
      if (reduced()) textEl.textContent = TEXT;
    }
    function tick(time, dt) {
      if (!rate) return;
      if (shown >= WORDS.length) { hold += dt; if (hold > 1.6) { shown = 0; hold = 0; } }
      else shown = Math.min(WORDS.length, shown + rate * dt);
      textEl.textContent = WORDS.slice(0, Math.floor(shown)).join(' ');
    }
    scene(typeBox, tick, () => { if (rate) textEl.textContent = TEXT; });
    segGroup(devBox, 'data-spddev', v => { st.dev = v; render(); });
    segGroup(modBox, 'data-spdmod', v => { st.mod = v; render(); });
    render();
    if (reduced()) textEl.textContent = rate ? TEXT : textEl.textContent;
  })();

  /* =====================================================================
     5 · CONTEXT: conversation memory for two models
     ===================================================================== */
  (function initContext() {
    const cS = $('#lrn-ctx-c'), uS = $('#lrn-ctx-u'), bars = $('#lrn-ctx-bars');
    if (!cS || !uS || !bars) return;
    const CTX = [2048, 4096, 8192, 16384, 32768, 65536, 131072, 262144, 524288, 1048576];
    const USERS = [1, 2, 4, 8, 16, 32, 64];
    const mid = CHAT.filter(m => m.kv_bytes_per_token_fp16 > 0 && m.params_total_b >= 20 && m.params_total_b <= 40);
    let A = byId('granite-4.2-30b'), B = byId('nemotron-3.5-lightning-30b-a3b');
    if (!A && mid.length) A = mid.slice().sort((a, b) => b.kv_bytes_per_token_fp16 - a.kv_bytes_per_token_fp16)[0];
    if (!B && mid.length) B = mid.slice().sort((a, b) => a.kv_bytes_per_token_fp16 - b.kv_bytes_per_token_fp16)[0];
    if (!A) A = { id: 'xa', name: 'Older-style 30B model', params_total_b: 30, params_active_b: 30, kv_bytes_per_token_fp16: 262144, context_max: 131072, modalities: [] };
    if (!B || B === A) B = { id: 'xb', name: 'Newer-style 30B model', params_total_b: 30, params_active_b: 3, kv_bytes_per_token_fp16: 6144, context_max: 1048576, modalities: [] };
    const st = { c: 2, u: 0 };
    const kb = m => Math.round(m.kv_bytes_per_token_fp16 / 1024);
    function memOf(m, ctx, users) {
      const c = Math.min(ctx, m.context_max || ctx);
      const w = weightsGB(m, 'q4');
      const kv = m.kv_bytes_per_token_fp16 * c * users / 1e9;
      const vision = (m.modalities || []).includes('image') ? 1 : 0;
      const over = 1 + 0.03 * w + vision;
      return { c, w: w + over, kv, total: w + over + kv, capped: c < ctx };
    }
    function status(total) {
      if (total <= 24 * 0.95) return ['great', 'Fits a 24 GB card'];
      if (total <= 80 * 0.95) return ['ok', 'Needs an 80 GB card'];
      return ['no', 'Needs more than one 80 GB card'];
    }
    function render() {
      const ctx = CTX[st.c], users = USERS[st.u];
      $('#lrn-ctx-cv').textContent = ctxTxt(ctx) + ' tokens';
      cS.setAttribute('aria-valuetext', nf(ctx) + ' tokens');
      $('#lrn-ctx-uv').textContent = users;
      uS.setAttribute('aria-valuetext', users + (users === 1 ? ' person' : ' people'));
      const a = memOf(A, ctx, users), b = memOf(B, ctx, users);
      const max = Math.max(a.total, b.total, 80) * 1.08;
      const pc = x => (x / max * 100).toFixed(2) + '%';
      const marks = `<span class="mk" style="left:${pc(24)}"></span><span class="mk" style="left:${pc(80)}"></span>`;
      const one = (m, r) => {
        const s = status(r.total);
        return `<div class="lrn-cbar">
          <div class="lrn-row-h"><span><b>${esc(m.name)}</b> <span class="fine">stores ${kb(m)} KB per token</span></span>${badge(s[0], s[1])}</div>
          <div class="lrn-scale" aria-hidden="true">${[24, 80].map(v => `<span class="${v / max > 0.86 ? 'r' : v / max < 0.08 ? 'l' : ''}" style="left:${pc(v)}">${v} GB</span>`).join('')}</div>
          <div class="lrn-cb"><i class="w" style="width:${pc(r.w)}"></i><i class="k" style="width:${pc(r.kv)}"></i>${marks}</div>
          <div class="fine">Model ${gb(r.w)} + conversation memory ${gb(r.kv)} = ${gb(r.total)}${r.capped ? ` · stops at ${ctxTxt(r.c)} tokens, its maximum` : ''}</div></div>`;
      };
      bars.innerHTML = `<div class="lrn-cwrap">` + one(A, a) + one(B, b) +
        `</div><div class="legend"><span><i class="l-w"></i>Model file and working space</span><span><i class="l-k"></i>Conversation memory</span></div>`;
      $('#lrn-ctx-sum').textContent = `With ${users === 1 ? 'one person' : users + ' people'} at ${ctxTxt(ctx)} tokens${users > 1 ? ' each' : ''}, the conversation memory is ${gb(a.kv)} for ${A.name} and ${gb(b.kv)} for ${B.name}.`;
    }
    onRange(cS, v => { st.c = v; render(); });
    onRange(uS, v => { st.u = v; render(); });
    render();
  })();

  /* =====================================================================
     6 · MIXTURE OF EXPERTS: lit experts per word
     ===================================================================== */
  (function initMoe() {
    const grid = $('#lrn-moe-grid'), tokBox = $('#lrn-moe-tokens'), modBox = $('#lrn-moe-models');
    if (!grid || !tokBox || !modBox) return;
    function experts(m) {
      const t = ((m.arch_detail && m.arch_detail.kv_note) || '') + ' ' + (m.notes || '');
      const x = /(\d+)\s+(?:routed\s+)?experts?(?:\s+per layer)?,\s*(\d+)\s+(?:routed|active)/i.exec(t);
      const shared = /\+\s*1 shared/i.test(t);
      if (x) return { n: +x[1], k: +x[2], shared };
      const k = 8; return { n: Math.max(16, Math.round(k / Math.max(0.02, m.params_active_b / m.params_total_b))), k, shared: false, guess: true };
    }
    let models = ['gpt-oss-20b', 'qwen3.6-35b-a3b', 'gpt-oss-120b'].map(byId).filter(Boolean);
    if (!models.length) models = CHAT.filter(m => m.arch === 'moe').slice(0, 3);
    if (!models.length) models = [{ id: 'xm', name: 'Example 35B-A3B', arch: 'moe', params_total_b: 35, params_active_b: 3, kv_bytes_per_token_fp16: 20480, modalities: [], arch_detail: { layers: 40, kv_note: '256 experts, 8 routed per token' } }];
    models.forEach(m => { m._ex = experts(m); });
    modBox.innerHTML = models.map(m => `<button type="button" data-moemod="${esc(m.id)}" aria-pressed="false">${esc(m.name)}</button>`).join('');
    const WORDS = ['The', 'invoice', 'for', 'March', 'is', 'due', 'on', 'Friday', '.'];
    tokBox.innerHTML = WORDS.map((w, i) => `<button type="button" class="lrn-tok" data-tok="${i}" tabindex="${i ? -1 : 0}">${esc(w)}</button>`).join('');
    const toks = $$('.lrn-tok', tokBox);
    const st = { m: models[Math.min(1, models.length - 1)].id, tok: 0, idle: 0 };
    let cells = [];
    function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
    function pick(n, k, key) {
      let s = hash(key) || 1; const out = new Set();
      while (out.size < Math.min(k, n)) { s = Math.imul(s ^ (s >>> 15), 2246822507) >>> 0; s = (s ^ (s >>> 13)) >>> 0; out.add(s % n); s = (s + 0x9e3779b9) >>> 0; }
      return out;
    }
    function layoutGrid() {
      const m = models.find(x => x.id === st.m); if (!m) return;
      const n = m._ex.n, w = grid.clientWidth || 600;
      const maxCols = Math.max(8, Math.floor(w / 18));
      let cols = [64, 32, 16, 8].find(c => c <= maxCols && c <= n) || 8;
      grid.style.setProperty('--cols', cols);
    }
    function build() {
      const m = models.find(x => x.id === st.m);
      grid.innerHTML = '<i></i>'.repeat(m._ex.n);
      cells = $$('i', grid);
      layoutGrid();
      const layers = m.arch_detail && m.arch_detail.layers;
      $('#lrn-moe-layer').textContent = `${m._ex.n} experts shown for one layer, ${m._ex.k} chosen per word${m._ex.guess ? ' (illustration)' : ''}.` +
        (layers ? ` The model has ${layers} layers and picks again in each one.` : '') + (m._ex.shared ? ' It also has one shared expert that every word uses.' : '');
      const wAll = weightsGB(m, 'q4'), frac = clamp(m.params_active_b / m.params_total_b, 0, 1);
      $('#lrn-moe-kpis').innerHTML = `<div><div class="label">Must be in memory</div><div class="lrn-big num">${gb(wAll)}</div><div class="fine">${pTxt(m.params_total_b)} parameters at 4-bit</div></div>
        <div><div class="label">Read for each word</div><div class="lrn-big num">${gb(wAll * frac)}</div><div class="fine">about ${pTxt(m.params_active_b)} active parameters</div></div>`;
      const dense = CHAT.filter(x => x.arch !== 'moe').sort((a, b) => Math.abs(Math.log(a.params_total_b / m.params_total_b)) - Math.abs(Math.log(b.params_total_b / m.params_total_b)))[0];
      const r1 = estimate(m, 'q4', 'mac', { ctx: 8192 }), r2 = dense ? estimate(dense, 'q4', 'mac', { ctx: 8192 }) : null;
      const sp = $('#lrn-moe-speed');
      if (r1 && r1.fit !== 'no' && r2 && r2.fit !== 'no') sp.textContent = `On a Mac with a Max chip and 128 GB, ${m.name} writes about ${tpsTxt(r1.tps)} tokens per second. ${dense.name}, a dense model of similar total size, writes about ${tpsTxt(r2.tps)}.`;
      else if (r1 && r1.fit !== 'no') sp.textContent = `On a Mac with a Max chip and 128 GB, ${m.name} writes about ${tpsTxt(r1.tps)} tokens per second.`;
      else sp.textContent = '';
      light();
    }
    function light() {
      const m = models.find(x => x.id === st.m);
      const on = pick(m._ex.n, m._ex.k, m.id + ':' + st.tok);
      cells.forEach((c, i) => c.classList.toggle('on', on.has(i)));
      toks.forEach((t, i) => { const a = i === st.tok; t.classList.toggle('is-on', a); t.setAttribute('aria-pressed', String(a)); t.tabIndex = a ? 0 : -1; });
    }
    function setTok(i, user) { st.tok = clamp(i, 0, WORDS.length - 1); if (user) st.idle = 0; light(); }
    tokBox.addEventListener('pointerover', e => { const b = e.target.closest('.lrn-tok'); if (b) setTok(+b.dataset.tok, true); });
    tokBox.addEventListener('pointerdown', e => { const b = e.target.closest('.lrn-tok'); if (b) { setTok(+b.dataset.tok, true); try { tokBox.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } } });
    tokBox.addEventListener('pointermove', e => {
      if (!e.buttons && e.pointerType === 'mouse') return;
      const el = document.elementFromPoint(e.clientX, e.clientY); const b = el && el.closest && el.closest('.lrn-tok');
      if (b && tokBox.contains(b)) setTok(+b.dataset.tok, true);
    });
    tokBox.addEventListener('click', e => { const b = e.target.closest('.lrn-tok'); if (b) setTok(+b.dataset.tok, true); });
    tokBox.addEventListener('keydown', e => {
      const k = e.key; let i = st.tok;
      if (k === 'ArrowRight' || k === 'ArrowDown') i++; else if (k === 'ArrowLeft' || k === 'ArrowUp') i--; else if (k === 'Home') i = 0; else if (k === 'End') i = WORDS.length - 1; else return;
      e.preventDefault(); setTok(i, true); toks[st.tok].focus();
    });
    segGroup(modBox, 'data-moemod', v => { st.m = v; build(); });
    setSeg(modBox, 'data-moemod', st.m);
    build();
    if ('ResizeObserver' in window) new ResizeObserver(layoutGrid).observe(grid);
    let acc = 0;
    scene(grid, (t, dt) => { st.idle += dt; if (st.idle < 4) return; acc += dt; if (acc > 1.1) { acc = 0; st.tok = (st.tok + 1) % WORDS.length; light(); } });
  })();

  /* =====================================================================
     7 · TOOLS: finder and catalogue from DATA.runtimes
     ===================================================================== */
  const isDead = r => /^(ARCHIVED|RETIRED|MAINTENANCE ONLY)/.test(r.one_liner || '') || /^(archived|retired)/i.test(r.last_checked_state || '');
  const has = (a, v) => arr(a).includes(v);
  function toolGroup(r) {
    if (r.category === 'media' || r.category === 'library') {
      const t = r.one_liner || '';
      if (r.category === 'library' && /\bLLMs?\b/.test(t)) return 'library';
      if (/image|video|diffusion/i.test(t)) return 'media';
      if (/speech|whisper|voice/i.test(t)) return 'speech';
      if (r.category === 'library') return 'library';
      if (has(r.good_for, 'images') || has(r.good_for, 'video')) return 'media';
      if (has(r.good_for, 'speech')) return 'speech';
      return 'library';
    }
    return { 'desktop-app': 'app', engine: 'engine', server: 'server', frontend: 'frontend' }[r.category] || 'library';
  }
  const GROUPS = [
    ['app', 'Desktop apps', 'An engine, a model downloader and a chat window in one install.'],
    ['engine', 'Engines', 'They do the calculation. Most run from the command line and offer an API.'],
    ['server', 'Servers and tools for teams', 'They serve models to several people or programs, or manage several engines.'],
    ['frontend', 'Web interfaces', 'Chat pages with accounts and history that connect to an engine.'],
    ['library', 'Libraries for developers', 'Building blocks for your own software.'],
    ['media', 'Images and video', 'Apps and engines for picture and video models.'],
    ['speech', 'Speech', 'Speech-to-text and text-to-speech.']
  ];
  const kindsOf = r => {
    const g = toolGroup(r); const k = new Set();
    if (['app', 'engine', 'server', 'frontend', 'library'].includes(g)) k.add('text');
    if (has(r.good_for, 'images') || has(r.good_for, 'video')) k.add('image');
    if (has(r.good_for, 'speech')) k.add('speech');
    return k;
  };
  const QUESTIONS = [
    { id: 'hw', q: 'Which computer?', a: [['nvidia', 'PC with an NVIDIA card'], ['amd', 'PC with AMD graphics'], ['mac', 'Mac with Apple silicon'], ['intel', 'PC with Intel graphics or NPU'], ['cpu', 'No graphics card'], ['server', 'Linux server with big GPUs']] },
    { id: 'users', q: 'How many people at the same time?', a: [['one', 'Just me'], ['team', 'A small team'], ['many', 'Many people']] },
    { id: 'use', q: 'How do you want to use it?', a: [['window', 'In a chat window'], ['api', 'From my own programs'], ['both', 'Both']] },
    { id: 'kind', q: 'What kind of model?', a: [['text', 'Text and chat'], ['image', 'Images and video'], ['speech', 'Speech']] }
  ];
  const HW_LABEL = { nvidia: 'NVIDIA cards', amd: 'AMD', mac: 'Macs', intel: 'Intel', cpu: 'a plain processor', server: 'Linux servers' };
  function scoreTool(r, A) {
    if (isDead(r)) return null;
    let s = 0; const why = [];
    const hwL = arr(r.hardware), pl = arr(r.platforms), gf = arr(r.good_for), mut = r.multi_user_throughput;
    const media = A.kind === 'image' || A.kind === 'speech';
    if (A.kind) {
      if (!kindsOf(r).has(A.kind)) return null;
      if (media && toolGroup(r) === (A.kind === 'image' ? 'media' : 'speech')) s += 2;   // made for this job
    } else if (!kindsOf(r).has('text')) s -= 2;
    // tie-breakers from the data: broader hardware and format support, easier set-up, open licence
    s += 0.3 * hwL.length + 0.1 * arr(r.model_formats).length;
    if (r.install_difficulty === 'hard') s -= 1;
    if (/proprietary/i.test(r.license || '')) s -= 0.5;
    if (A.hw === 'mac' && has(r.model_formats, 'MLX')) { s += 1; why.push('Can use MLX on a Mac'); }
    if (A.hw) {
      const ok = {
        nvidia: has(hwL, 'NVIDIA') && (has(pl, 'Windows') || has(pl, 'Linux')),
        amd: has(hwL, 'AMD'),
        mac: has(hwL, 'Apple') && has(pl, 'macOS'),
        intel: has(hwL, 'Intel'),
        cpu: has(hwL, 'CPU'),
        server: has(pl, 'Linux') && (has(hwL, 'NVIDIA') || has(hwL, 'AMD'))
      }[A.hw];
      if (!ok) return null;
      why.push('Runs on ' + HW_LABEL[A.hw]);
      const tag = { mac: 'apple-silicon', amd: 'amd', intel: 'intel', cpu: 'cpu-only', server: 'multi-gpu' }[A.hw];
      if (tag && has(gf, tag)) s += 2;
      if (A.hw === 'server' && mut === 'high') s += 2;
    }
    if (media && A.users !== 'many') {
      // picture and speech tools are mostly single-user; the question matters only for many users
    } else if (A.users === 'one') {
      if (has(gf, 'single-user') || has(gf, 'beginner')) { s += 2; why.push('Suits one person'); }
      if (mut === 'high' && !has(gf, 'single-user') && r.category !== 'frontend') s -= 3;
    } else if (A.users === 'team') {
      if (mut === 'low') s -= 2; else { s += 2; why.push('Serves several people'); }
    } else if (A.users === 'many') {
      if (mut === 'low') return null;
      if (mut === 'high') { s += 3; why.push('Built for many users'); } else s -= 1;
      if (has(gf, 'multi-user-production')) s += 2;
    }
    if (A.use === 'window' && !r.gui) return null;
    if (A.use === 'api' && !r.openai_compatible_api) return null;
    if (A.use === 'both' && !r.gui && !r.openai_compatible_api) return null;
    if (A.use === 'window' || A.use === 'both') {
      if (r.gui) { s += 2; why.push('Has a chat window'); } else s -= 1;
    }
    if (A.use === 'api' || A.use === 'both') {
      if (r.openai_compatible_api) { s += 2; why.push('OpenAI-compatible API'); } else s -= 1;
    }
    if (r.install_difficulty === 'easy' && A.users !== 'many') { s += 1; why.push('Easy to install'); }
    if (r.install_difficulty === 'hard' && A.users !== 'many') s -= 1;
    if (has(gf, 'beginner') && A.users === 'one') s += 1;
    return { r, s, why };
  }
  const DIFF = { easy: 'Easy to install', medium: 'Some setup', hard: 'For experienced admins' };
  const MUT = { low: 'Made for one person', medium: 'A few people at once', high: 'Many people at once' };
  function toolCard(r) {
    const dead = isDead(r);
    const tags = [];
    if (dead) tags.push('<span class="tag-sm">No longer maintained</span>');
    else if (DIFF[r.install_difficulty]) tags.push(`<span class="tag-sm">${DIFF[r.install_difficulty]}</span>`);
    if (r.gui) tags.push('<span class="tag-sm">Has a window</span>');
    tags.push('<span class="pill is-ok lrn-match-tag">Matches your answers</span>');
    const one = String(r.one_liner || '').replace(/^(ARCHIVED|RETIRED|MAINTENANCE ONLY)\.\s*/, '');
    const home = /^https:\/\//.test(r.homepage || '') ? r.homepage : '';
    return `<details class="lrn-tool${dead ? ' is-dead' : ''}" id="lrn-tool-${esc(r.id)}" data-id="${esc(r.id)}">
      <summary><span class="lrn-tool-name">${esc(r.name)}</span><span class="lrn-tool-one">${esc(one)}</span><span class="lrn-tool-tags">${tags.join('')}</span></summary>
      <div class="lrn-tool-body"><dl>
        ${r.strengths ? `<dt>Good at</dt><dd>${esc(r.strengths)}</dd>` : ''}
        ${r.limits ? `<dt>Limits</dt><dd>${esc(r.limits)}</dd>` : ''}
        <dt>Runs on</dt><dd>${esc(arr(r.platforms).join(', '))}${arr(r.hardware).length ? ' · ' + esc(arr(r.hardware).join(', ')) : ''}</dd>
        ${arr(r.model_formats).length ? `<dt>Model files</dt><dd>${esc(r.model_formats.join(', '))}</dd>` : ''}
        <dt>Users</dt><dd>${esc(MUT[r.multi_user_throughput] || '–')}${r.openai_compatible_api ? ' · OpenAI-compatible API' : ''}</dd>
        <dt>Licence</dt><dd>${esc(r.license || '')}${r.commercial_note ? `<br><span class="fine">${esc(r.commercial_note)}</span>` : ''}</dd>
        ${r.last_checked_state ? `<dt>Status</dt><dd class="fine">${esc(r.last_checked_state)}</dd>` : ''}
      </dl>${home ? `<a class="lrn-ext" href="${esc(home)}" target="_blank" rel="noopener noreferrer">Project page<span class="sr"> for ${esc(r.name)} (opens in a new tab)</span></a>` : ''}</div></details>`;
  }
  function openTool(id) {
    const all = $('#lrn-tools-all'), card = document.getElementById('lrn-tool-' + id);
    if (!all || !card) return;
    all.open = true; card.open = true;
    const only = $('#lrn-tools-only');
    if (only && only.checked && !card.classList.contains('is-match')) { only.checked = false; applyOnly(); }
    const y = card.getBoundingClientRect().top + window.pageYOffset - topbarH() - indexH() - 12;
    window.scrollTo({ top: y, behavior: reduced() ? 'auto' : 'smooth' });
    const s = $('summary', card); if (s) s.focus({ preventScroll: true });
  }
  root.addEventListener('click', e => {
    const a = e.target.closest('[data-open-tool]');
    if (!a) return;
    e.preventDefault(); openTool(a.getAttribute('data-open-tool'));
  });
  function applyOnly() {
    const only = $('#lrn-tools-only'); const listBox = $('#lrn-tools-list');
    if (!listBox) return;
    const on = only && only.checked;
    $$('.lrn-tool', listBox).forEach(c => { c.hidden = on && !c.classList.contains('is-match'); });
    $$('.lrn-tgroup', listBox).forEach(g => { g.hidden = on && !$('.lrn-tool.is-match', g); });
  }
  (function initTools() {
    const qBox = $('#lrn-tool-qs'), rec = $('#lrn-tool-rec'), listBox = $('#lrn-tools-list');
    if (!qBox || !rec || !listBox) return;
    const A = {};
    qBox.innerHTML = QUESTIONS.map(q => `<fieldset class="lrn-q"><legend>${esc(q.q)}</legend><div class="chips">${q.a.map(a => `<button type="button" class="chip" data-q="${q.id}" data-a="${a[0]}" aria-pressed="false">${esc(a[1])}</button>`).join('')}</div></fieldset>`).join('');
    if (!RT.length) {
      rec.innerHTML = '<div class="empty"><h3>The tool list is not loaded</h3><p>This copy of the page has no tool data. The explanations above still apply.</p></div>';
      $('#lrn-tools-all').hidden = true;
      return;
    }
    $('#lrn-tools-all-t').textContent = `All ${RT.length} tools, by type`;
    listBox.innerHTML = GROUPS.map(g => {
      const items = RT.filter(r => toolGroup(r) === g[0]);
      if (!items.length) return '';
      items.sort((a, b) => (isDead(a) - isDead(b)) || String(a.name).localeCompare(String(b.name)));
      return `<div class="lrn-tgroup"><h4 class="lrn-h4">${esc(g[1])} <span class="fine">${items.length}</span></h4><p class="fine lrn-mt0">${esc(g[2])}</p>${items.map(toolCard).join('')}</div>`;
    }).join('');
    const onlyW = $('#lrn-tools-only-w'), only = $('#lrn-tools-only');
    if (only) only.addEventListener('change', applyOnly);
    function render() {
      const any = Object.keys(A).length > 0;
      const scored = RT.map(r => scoreTool(r, A)).filter(Boolean);
      const matchIds = new Set(any ? scored.map(x => x.r.id) : []);
      $$('.lrn-tool', listBox).forEach(c => c.classList.toggle('is-match', matchIds.has(c.dataset.id)));
      if (onlyW) onlyW.hidden = !any;
      if (!any && only) only.checked = false;
      applyOnly();
      if (!any) { rec.innerHTML = '<p class="fine lrn-rec-empty">Suggestions appear here once you answer a question.</p>'; return; }
      const ranked = scored.slice().sort((a, b) => b.s - a.s || String(a.r.name).localeCompare(String(b.r.name)));
      const wantUI = (A.users === 'team' || A.users === 'many') && A.use !== 'api' && (!A.kind || A.kind === 'text');
      const runners = ranked.filter(x => x.r.category !== 'frontend');
      const ui = wantUI ? ranked.find(x => x.r.category === 'frontend') : null;
      const top = ui ? runners.slice(0, 2).concat([ui]) : runners.slice(0, 3);
      if (!top.length) { rec.innerHTML = '<div class="empty"><h3>No tool matches all answers</h3><p>Change one of the answers, for example the computer or the number of people.</p></div>'; return; }
      const notes = [];
      if (ui) notes.push('A team usually runs an engine or server with a web interface such as Open WebUI in front of it. Chapter 10 shows the parts.');
      if (A.users === 'many' && A.hw && A.hw !== 'server') notes.push('Serving many people at once works best on Linux servers with large graphics cards.');
      rec.innerHTML = `<div class="label">Start with</div><div class="lrn-rec-list">${top.map((x, i) => `<div class="lrn-rec-card${i ? '' : ' primary'}">
          ${x === ui ? '<div class="label">Web interface in front</div>' : ''}<div class="lrn-path-t">${esc(x.r.name)}</div><p class="small">${esc(String(x.r.one_liner || ''))}</p>
          <p class="fine">${esc(x.why.slice(0, 3).join(' · '))}</p>
          <a href="#/learn/tools" data-open-tool="${esc(x.r.id)}">Details${i ? '' : ' and licence'}<span class="sr"> for ${esc(x.r.name)}</span></a></div>`).join('')}</div>
        ${notes.map(n => `<p class="small lrn-rec-note">${esc(n)}</p>`).join('')}
        <p class="fine">${matchIds.size} of ${RT.length} tools match your answers. They are marked in the full list below.</p>`;
    }
    qBox.addEventListener('click', e => {
      const b = e.target.closest('button[data-q]'); if (!b) return;
      const q = b.dataset.q, a = b.dataset.a;
      if (A[q] === a) delete A[q]; else A[q] = a;
      $$(`button[data-q="${q}"]`, qBox).forEach(x => x.setAttribute('aria-pressed', String(A[q] === x.dataset.a)));
      render();
    });
    render();
  })();

  /* =====================================================================
     8 · FORMATS: file-name decoder
     ===================================================================== */
  (function initFormats() {
    const input = $('#lrn-fn-in'), partsBox = $('#lrn-fn-parts'), out = $('#lrn-fn-explain'), ex = $('#lrn-fn-ex');
    if (!input || !partsBox || !out) return;
    const EXAMPLES = ['Qwen3.8-27B-Q4_K_M.gguf', 'Qwen3.6-35B-A3B-UD-Q4_K_XL.gguf', 'gemma-4-31b-it-qat-q4_0.gguf', 'gpt-oss-120b-mxfp4-00001-of-00003.gguf', 'Qwen3.8-27B-Uncensored-abliterated.Q5_K_S.gguf', 'model-00001-of-00012.safetensors'];
    if (ex) ex.innerHTML = EXAMPLES.map(n => `<button type="button" class="chip" data-fn="${esc(n)}">${esc(n)}</button>`).join('');
    const quantBits = f => { const q = Object.values(Q_FALLBACK).find(x => x.file.toLowerCase() === f.toLowerCase()); return q ? (E && E.QUANT_BY_ID[q.id] ? E.QUANT_BY_ID[q.id].bits : q.bits) : null; };
    const SEP = '(?:^|[-_.\\s])';
    const END = '(?=$|[-_.\\s])';
    const RULES = [
      { re: /\.(gguf|safetensors|bin|pt|pth|pkl|onnx)$/i, label: 'File type', f: m => ({
        gguf: 'GGUF: one file with the weights and the settings to run them. Opens in llama.cpp, Ollama, LM Studio, Jan and similar apps.',
        safetensors: 'Safetensors: the format of original releases. Used by vLLM, SGLang and Hugging Face libraries. It cannot run hidden code when loaded.',
        bin: 'An older format that can contain code which runs when the file is loaded. Prefer GGUF or safetensors.',
        pt: 'A PyTorch file. It can contain code which runs when loaded. Prefer GGUF or safetensors.',
        pth: 'A PyTorch file. It can contain code which runs when loaded. Prefer GGUF or safetensors.',
        pkl: 'A Python “pickle” file. It can contain code which runs when loaded. Avoid it unless you trust the source.',
        onnx: 'ONNX: a format used by ONNX Runtime, OpenVINO and Foundry Local.'
      })[m[1].toLowerCase()] },
      { re: /(\d{5})-of-(\d{5})/i, label: 'Part', f: m => `Part ${+m[1]} of ${+m[2]}. Large models are split into several files. Download all parts into one folder; the engine finds the others when you open the first.` },
      { re: new RegExp(SEP + '((?:I|T)?Q[1-8](?:_K)?(?:_(?:XXS|XS|XL|S|M|L|NL|0|1))?)' + END, 'i'), label: 'Quantisation', f: m => {
        const t = m[1].toUpperCase(); const n = t.replace(/^[IT]?Q/, '')[0]; const parts = [];
        parts.push(`About ${n} bits per weight.`);
        if (/^IQ/.test(t)) parts.push('IQ marks an “i-quant”, a newer method for very small files, usually made with a sample of text that shows which weights matter most.');
        else if (/_K/.test(t)) parts.push('K means the K-quant method: small groups of weights, each with its own scale.');
        else if (/_[01]$/.test(t)) parts.push('_0 and _1 mark the older, simpler method: blocks of 32 weights with one scale each.');
        const suf = (/_(XXS|XS|XL|S|M|L|NL)$/.exec(t) || [])[1];
        if (suf === 'S') parts.push('S is the small mix, with all parts at the same precision.');
        if (suf === 'M') parts.push('M is the medium mix: some sensitive parts are kept at higher precision.');
        if (suf === 'L') parts.push('L is the large mix, with more parts kept at higher precision.');
        if (suf === 'XL') parts.push('XL is an extra-large mix used by some uploaders, with more parts at higher precision.');
        if (suf === 'XXS' || suf === 'XS') parts.push(suf + ' marks an especially small variant.');
        const b = quantBits(t); if (b) parts.push(`Average about ${b} bits per weight including the scales.`);
        return parts.join(' ');
      } },
      { re: new RegExp(SEP + '(BF16|F16|FP16|F32|FP8|MXFP4|NVFP4|INT4|INT8|AWQ|GPTQ|EXL3)' + END, 'i'), label: 'Number format', f: m => ({
        BF16: 'BF16: the original 16-bit precision, 2 bytes per parameter.', F16: '16-bit precision, 2 bytes per parameter.', FP16: '16-bit precision, 2 bytes per parameter.', F32: '32-bit precision, 4 bytes per parameter. Rarely needed.',
        FP8: 'FP8: an 8-bit format newer NVIDIA cards calculate with directly. About 1 byte per parameter.', MXFP4: 'MXFP4: a 4-bit format. gpt-oss is released in it.', NVFP4: 'NVFP4: NVIDIA\'s 4-bit format for its newest graphics cards.',
        INT4: 'INT4: plain 4-bit whole numbers with scales.', INT8: 'INT8: plain 8-bit whole numbers with scales.', AWQ: 'AWQ: a 4-bit method for graphics-card servers such as vLLM.', GPTQ: 'GPTQ: a 4-bit method for graphics-card servers such as vLLM.', EXL3: 'EXL3: the format of the ExLlamaV3 engine for NVIDIA cards.'
      })[m[1].toUpperCase()] },
      { re: new RegExp(SEP + '(UD)' + END), label: 'Uploader mix', f: () => 'UD stands for Unsloth Dynamic: unsloth\'s mix that keeps the most sensitive layers at higher precision.' },
      { re: new RegExp(SEP + '(qat)' + END, 'i'), label: 'Training', f: () => 'QAT: quantisation-aware training. The model was trained to be stored at low precision, so this file loses less quality.' },
      { re: new RegExp(SEP + '(it|instruct|chat)' + END, 'i'), label: 'Tuning', f: () => 'Instruction-tuned: trained to follow requests and hold a conversation. This is the version you want for chat.' },
      { re: new RegExp(SEP + '(base)' + END, 'i'), label: 'Tuning', f: () => 'Base model: before instruction tuning. It continues text and is not meant for chat.' },
      { re: new RegExp(SEP + '(uncensored|abliterated|heretic|obliterated|merged?)' + END, 'i'), label: 'Community variant', f: m => /merge/i.test(m[1]) ? 'A merge of several models made by a community member. The original lab has not tested it.' : 'A community edit with the safety training removed. It is not a release by the original lab and behaves differently.' },
      { re: new RegExp(SEP + 'A(\\d+(?:\\.\\d+)?)B' + END, 'i'), label: 'Active size', f: m => `About ${m[1]} billion parameters are active per token: a mixture-of-experts model (chapter 6).` },
      { re: new RegExp(SEP + 'E(\\d+(?:\\.\\d+)?)B' + END, 'i'), label: 'Effective size', f: m => `Works like a ${m[1]}B model per token; part of the file is a lookup table that can stay out of fast memory.` },
      { re: new RegExp(SEP + '(\\d+(?:\\.\\d+)?)([BM])' + END, 'i'), label: 'Size', f: m => m[2].toUpperCase() === 'B' ? `${m[1]} billion parameters in total. At 4-bit that is roughly ${gb(+m[1] * 4.85 / 8)}.` : `${m[1]} million parameters: a very small model.` },
      { re: /(\d)bit/i, label: 'Precision', f: m => `${m[1]}-bit precision, as written in MLX file names.` }
    ];
    function parse(name) {
      const hits = [];
      RULES.forEach(rule => {
        const m = rule.re.exec(name);
        if (!m) return;
        const txt = rule.re.source.startsWith('(?:^|') ? m[0].replace(/^[-_.\s]/, '') : m[0];
        const start = m.index + (m[0].length - txt.length);
        hits.push({ start, end: start + txt.length, txt, label: rule.label, expl: rule.f(m) });
      });
      hits.sort((a, b) => a.start - b.start);
      const clean = [];
      hits.forEach(h => { if (!clean.length || h.start >= clean[clean.length - 1].end) clean.push(h); });
      return clean;
    }
    function render() {
      const name = input.value.trim();
      if (!name) { partsBox.innerHTML = ''; out.innerHTML = '<dt>Empty</dt><dd>Type or paste a file name, or pick an example above.</dd>'; return; }
      const hits = parse(name);
      let html = '', pos = 0;
      hits.forEach((h, i) => {
        if (h.start > pos) html += `<span class="p">${esc(name.slice(pos, h.start))}</span>`;
        html += `<span class="p hit"><span class="n">${i + 1}</span>${esc(h.txt)}</span>`;
        pos = h.end;
      });
      if (pos < name.length) html += `<span class="p">${esc(name.slice(pos))}</span>`;
      partsBox.innerHTML = html;
      const first = hits.length ? hits[0].start : name.length;
      const fam = name.slice(0, first).replace(/[-_.\s]+$/, '');
      let dl = '';
      if (fam && !/^model$/i.test(fam)) dl += `<dt>${esc(fam)}</dt><dd>The model family and version, as named by the lab.</dd>`;
      hits.forEach((h, i) => { dl += `<dt><span class="n">${i + 1}</span>${esc(h.txt)} <span class="fine">${esc(h.label)}</span></dt><dd>${esc(h.expl)}</dd>`; });
      if (!hits.length) dl += '<dt>No known parts</dt><dd>None of the usual markers were found. Check the model page for the format and precision.</dd>';
      out.innerHTML = dl;
    }
    input.addEventListener('input', render);
    if (ex) ex.addEventListener('click', e => { const b = e.target.closest('[data-fn]'); if (!b) return; input.value = b.dataset.fn; $$('[data-fn]', ex).forEach(x => x.setAttribute('aria-pressed', String(x === b))); render(); });
    input.value = EXAMPLES[0];
    if (ex) { const b = $('[data-fn]', ex); if (b) b.setAttribute('aria-pressed', 'true'); }
    render();

    const repo = $('#lrn-repo');
    if (repo) {
      const m = byId('qwen3.8-27b') || CHAT.find(x => x.hf_repo && x.gguf_repo);
      if (m && m.hf_repo) {
        const link = r => `<a href="https://huggingface.co/${esc(r)}" target="_blank" rel="noopener noreferrer">${esc(r)}</a>`;
        repo.innerHTML = `<div class="label">Example from the model list: ${esc(m.name)}</div><dl><dt>Official</dt><dd>${link(m.hf_repo)}</dd>${m.gguf_repo ? `<dt>GGUF conversion</dt><dd>${link(m.gguf_repo)}</dd>` : ''}</dl>`;
      } else repo.hidden = true;
    }
  })();

  /* =====================================================================
     9 · MEDIA: work for pictures and clips
     ===================================================================== */
  (function initMedia() {
    const resSel = $('#lrn-med-res'), steps = $('#lrn-med-steps'), sec = $('#lrn-med-sec'), vis = $('#lrn-med-vis');
    if (!resSel || !steps || !vis) return;
    const IMG = [[0.26, '512 × 512'], [0.59, '768 × 768'], [1.05, '1024 × 1024'], [2.36, '1536 × 1536'], [4.19, '2048 × 2048']];
    const VID = [[0.41, '480p (832 × 480)'], [0.92, '720p (1280 × 720)'], [2.07, '1080p (1920 × 1080)']];
    const st = { mode: 'image', img: 2, vid: 1, steps: 20, sec: 5 };
    const fillRes = () => {
      const L = st.mode === 'image' ? IMG : VID, cur = st.mode === 'image' ? st.img : st.vid;
      resSel.innerHTML = L.map((r, i) => `<option value="${i}" ${i === cur ? 'selected' : ''}>${r[1]}</option>`).join('');
    };
    let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    let noise = '';
    for (let i = 0; i < 140; i++) noise += `<rect x="${(rnd() * 196).toFixed(1)}" y="${(rnd() * 136).toFixed(1)}" width="4" height="4"/>`;
    vis.innerHTML = `<svg viewBox="0 0 300 230" aria-hidden="true" focusable="false">
      <g class="mv-stack"></g>
      <g class="mv-front"><rect class="mv-f" x="0" y="0" width="200" height="140" rx="6"/>
        <g class="mv-pic"><rect class="mv-sky" x="0" y="0" width="200" height="140" rx="6"/><circle class="mv-sun" cx="150" cy="42" r="18"/><path class="mv-hill" d="M0,140 L0,98 Q60,58 110,96 T200,84 L200,140 Z"/></g>
        <g class="mv-noise">${noise}</g></g>
      <text class="mv-t" x="0" y="222"></text></svg>`;
    const svg = $('svg', vis), stack = $('.mv-stack', svg), front = $('.mv-front', svg), pic = $('.mv-pic', svg), nz = $('.mv-noise', svg), label = $('.mv-t', svg);
    let geo = { s: 1, frames: 1 };
    function work() {
      if (st.mode === 'image') {
        const mp = IMG[st.img][0];
        return { x: Math.pow(mp / 1.05, 1.15) * st.steps / 20, frames: 1, mp };
      }
      const mp = VID[st.vid][0], frames = st.sec * 16 + 1, latent = 1 + 4 * st.sec;
      return { x: Math.pow(mp / 1.05 * latent, 1.3) * st.steps / 20, frames, mp };
    }
    function render() {
      const w = work();
      $('#lrn-med-stv').textContent = st.steps;
      $('#lrn-med-secv').textContent = st.sec + ' s';
      $('#lrn-med-secw').hidden = st.mode !== 'video';
      const x = w.x;
      $('#lrn-med-x').textContent = (x < 10 ? (Math.round(x * 10) / 10) : nf(x)) + '×';
      const size = st.mode === 'image' ? IMG[st.img][1] : VID[st.vid][1];
      $('#lrn-med-what').textContent = (st.mode === 'image'
        ? `One ${size} picture at ${st.steps} steps`
        : `${w.frames} frames at ${size}, ${st.steps} steps. All frames are worked on together, so they all have to fit in memory at once`) + ', compared with one 1024 × 1024 picture at 20 steps.';
      const max = Math.max(x, 1);
      $('#lrn-med-bars').innerHTML = `<div class="lrn-mb"><div class="fine">One 1024 × 1024 picture, 20 steps</div><div class="lrn-mbt"><i class="ref" style="width:${(1 / max * 100).toFixed(2)}%"></i></div></div>
        <div class="lrn-mb"><div class="fine">Your setting</div><div class="lrn-mbt"><i style="width:${(x / max * 100).toFixed(2)}%"></i></div></div>`;
      // picture geometry
      const s = 0.45 + 0.55 * Math.sqrt(w.mp / 4.19);
      geo = { s, frames: w.frames };
      const n = Math.min(10, w.frames - 1);
      let h = '';
      for (let i = n; i >= 1; i--) h += `<rect class="mv-b" x="${(i * 7).toFixed(1)}" y="${(-i * 6).toFixed(1)}" width="200" height="140" rx="6"/>`;
      stack.innerHTML = h;
      const tf = `translate(${(10 + 0).toFixed(1)},${(70 + (1 - s) * 140 * 0.5).toFixed(1)}) scale(${s.toFixed(3)})`;
      stack.setAttribute('transform', tf); front.setAttribute('transform', tf);
      draw(sc ? sc.t : 0);
    }
    function draw(time) {
      const per = 0.11, hold = 1.2, cyc = st.steps * per + hold;
      const t = reduced() ? st.steps * per * 0.6 : time % cyc;
      const k = Math.min(st.steps, Math.floor(t / per) + 1);
      const p = Math.min(1, t / (st.steps * per));
      nz.style.opacity = (1 - p).toFixed(3);
      pic.style.opacity = (0.15 + 0.85 * p).toFixed(3);
      label.textContent = `Step ${k} of ${st.steps} · ${geo.frames === 1 ? '1 picture' : geo.frames + ' frames'}`;
    }
    const sc = scene(vis, t => draw(t), () => draw(0));
    fillRes();
    segGroup(resSel.closest('.lrn-demo'), 'data-medmode', v => { st.mode = v; fillRes(); render(); });
    resSel.addEventListener('change', () => { if (st.mode === 'image') st.img = +resSel.value; else st.vid = +resSel.value; render(); });
    onRange(steps, v => { st.steps = v; render(); });
    onRange(sec, v => { st.sec = v; render(); });
    render();

    // What typically fits where: from DATA.media when present
    const fit = $('#lrn-med-fit');
    if (fit) {
      const KINDS = [['image', 'Pictures'], ['video', 'Video'], ['stt', 'Speech to text'], ['tts', 'Text to speech']];
      const rows = KINDS.map(([k, label]) => {
        const ms = MEDIA.filter(m => m.kind === k || (k === 'image' && m.kind === 'image-edit')).map(m => {
          const v = Object.values(m.weights_gb_by_precision || {}).filter(x => typeof x === 'number' && x > 0);
          if (!v.length) return null;
          return { m, g: Math.min.apply(null, v) + (m.text_encoder_gb || 0) };
        }).filter(Boolean).sort((a, b) => a.g - b.g);
        if (!ms.length) return '';
        const lo = ms[0], hi = ms[ms.length - 1];
        return `<dt>${label}</dt><dd>${ms.length === 1 ? `${esc(lo.m.name)}: about ${gb(lo.g)}` : `from about ${gb(lo.g)} (${esc(lo.m.name)}) to about ${gb(hi.g)} (${esc(hi.m.name)})`}</dd>`;
      }).join('');
      if (rows) fit.innerHTML = `<p class="lrn-p">Model files at their smallest available precision, including the text encoder, for the models in the model list. Add a few gigabytes of working space; video needs more for long or large clips.</p><dl class="lrn-dl">${rows}</dl>`;
      else fit.innerHTML = `<p class="lrn-p">Typical figures, which vary by model and tool. Many image models run on graphics cards with 8 to 16 GB when you use 8-bit or GGUF files; the largest want 24 GB or more. Video models usually need 24 GB or more and take minutes per clip, although tools such as WanGP trade speed for lower memory. Speech models are small, and many run on a processor without a graphics card.</p>`;
    }
    const tb = $('#lrn-med-tools');
    if (tb) {
      const chips = g => RT.filter(r => toolGroup(r) === g && !isDead(r)).map(r => `<a class="chip" href="#/learn/tools" data-open-tool="${esc(r.id)}">${esc(r.name.replace(/\s*\(.*\)$/, ''))}</a>`).join('');
      const a = chips('media'), b = chips('speech');
      tb.innerHTML = (a ? `<div><div class="label">Images and video</div><div class="chips">${a}</div></div>` : '') + (b ? `<div><div class="label">Speech</div><div class="chips">${b}</div></div>` : '');
      if (!a && !b) tb.hidden = true;
    }
  })();

  /* =====================================================================
     10 · TEAM: service diagram, sizing, checklists
     ===================================================================== */
  (function initTeam() {
    const box = $('#lrn-team-svg'), info = $('#lrn-team-info'), ragT = $('#lrn-team-rag');
    if (!box || !info) return;
    const owui = RT.find(r => r.id === 'open-webui');
    const emb = EMBED.map(m => m.name).slice(0, 3);
    const NODES = {
      people: ['People and programs', 'Browser, apps', 'Staff use the chat page in their browser. Programs, such as a code editor plug-in or an internal app, connect through the API.'],
      ui: ['Web interface', 'e.g. Open WebUI', 'A chat page with accounts, history and file upload. Open WebUI is a common choice and connects to any OpenAI-compatible server.' + (owui && owui.commercial_note ? ' Licence note: ' + owui.commercial_note : '')],
      gw: ['Gateway', 'Logins, limits, logs', 'One entry point for every request. It checks who is calling through your company login or API keys, sets limits per person or team, records usage, and can pass some requests to a paid online service. Some web interfaces include part of this.'],
      inf: ['Inference server', 'vLLM, SGLang, llama.cpp', 'Runs the model for many people at once. vLLM or SGLang suit Linux servers with large graphics cards; the llama.cpp server suits smaller set-ups; llama-swap can switch between several models on one machine.'],
      gpu: ['Graphics cards', 'Model + conversations', 'The model and every active conversation\'s memory must fit into graphics memory. Several cards can share one large model, which is called tensor parallel. The sizing estimate below gives a first number.'],
      docs: ['Documents', 'Files, wikis, manuals', 'The files you want the model to answer from. They are split into short passages before indexing.'],
      emb: ['Embedding model', 'Meaning as numbers', 'A small model that turns each passage into a list of numbers that captures its meaning. It usually runs on the same server as the chat model.' + (emb.length ? ' Examples in the model list: ' + emb.join(', ') + '.' : '')],
      vec: ['Vector store', 'Finds passages', 'A database that finds the passages closest in meaning to a question. The interface adds them to the prompt so that the model answers from your documents. This is called retrieval-augmented generation (RAG). A reranker model can sort the passages first.']
    };
    let sel = 'gw', mode = '', geo = null, pulses = [], svg = null;
    function layout(narrow, rag) {
      if (!narrow) {
        const w = 160, h = 76, y = 26, xs = [20, 215, 410, 605, 800];
        const N = { people: [xs[0], y], ui: [xs[1], y], gw: [xs[2], y], inf: [xs[3], y], gpu: [xs[4], y] };
        if (rag) { N.vec = [215, 190]; N.emb = [410, 190]; N.docs = [605, 190]; }
        return { vb: [0, 0, 980, rag ? 284 : 128], w, h, N };
      }
      const w = 170, h = 58, x = rag ? 8 : 70, ys = [8, 90, 172, 254, 336];
      const N = { people: [x, ys[0]], ui: [x, ys[1]], gw: [x, ys[2]], inf: [x, ys[3]], gpu: [x, ys[4]] };
      if (rag) { N.vec = [204, ys[1]]; N.emb = [204, ys[2]]; N.docs = [204, ys[3]]; }
      return { vb: [0, 0, 340, 402], w, h, w2: 128, N };
    }
    function center(id) { const p = geo.N[id]; const w = (geo.w2 && ['vec', 'emb', 'docs'].includes(id)) ? geo.w2 : geo.w; return [p[0] + w / 2, p[1] + geo.h / 2]; }
    function build() {
      const narrow = (box.clientWidth || 700) < 620, rag = !ragT || ragT.checked;
      const key = (narrow ? 'n' : 'w') + (rag ? 'r' : '');
      if (key === mode && svg) return;
      mode = key; geo = layout(narrow, rag);
      if (!rag && ['docs', 'emb', 'vec'].includes(sel)) sel = 'gw';
      const main = ['people', 'ui', 'gw', 'inf', 'gpu'];
      const ragPath = rag ? ['docs', 'emb', 'vec', 'ui'] : [];
      const edge = (a, b) => { const p = center(a), q = center(b); return `<line class="te" x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}"/>`; };
      let h = `<svg viewBox="${geo.vb.join(' ')}" class="lrn-team-s${narrow ? ' narrow' : ''}" focusable="false">`;
      for (let i = 0; i < main.length - 1; i++) h += edge(main[i], main[i + 1]);
      for (let i = 0; i < ragPath.length - 1; i++) h += edge(ragPath[i], ragPath[i + 1]);
      h += '<g class="tp"></g>';
      Object.keys(geo.N).forEach(id => {
        const p = geo.N[id], w = (geo.w2 && ['vec', 'emb', 'docs'].includes(id)) ? geo.w2 : geo.w, n = NODES[id];
        h += `<g class="tn" data-node="${id}" tabindex="0" role="button" aria-pressed="false" aria-label="${esc(n[0])}">
          <rect x="${p[0]}" y="${p[1]}" width="${w}" height="${geo.h}" rx="12"/>
          <text class="tn-t" x="${p[0] + w / 2}" y="${p[1] + geo.h / 2 - 3}" text-anchor="middle">${esc(n[0])}</text>
          <text class="tn-s" x="${p[0] + w / 2}" y="${p[1] + geo.h / 2 + 15}" text-anchor="middle">${esc(n[1])}</text></g>`;
      });
      h += '</svg>';
      box.innerHTML = h;
      svg = $('svg', box);
      const tp = $('.tp', svg);
      pulses = [];
      const route = ids => ids.map(center);
      const add = (pts, cls, n, dur) => { for (let i = 0; i < n; i++) { const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); c.setAttribute('r', narrow ? 4.5 : 5.5); c.setAttribute('class', cls); tp.appendChild(c); pulses.push({ c, pts, off: i / n, dur }); } };
      add(route(main), 'pq', 3, 5);
      add(route(main.slice().reverse()), 'pa', 3, 5);
      if (rag) add(route(ragPath), 'pr', 2, 6);
      $$('.tn', svg).forEach(g => {
        g.addEventListener('click', () => select(g.dataset.node));
        g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(g.dataset.node); } });
      });
      $('#lrn-team-cap').textContent = `Requests travel along the lines from people to the graphics cards and answers come back the same way.${rag ? (narrow ? ' The right-hand column' : ' The lower row') + ' prepares your documents for search.' : ''} Select a part to read what it does.`;
      select(sel, true);
      drawPulses(tSc ? tSc.t : 1.2);
    }
    function select(id, quiet) {
      sel = id;
      $$('.tn', svg).forEach(g => { const on = g.dataset.node === id; g.classList.toggle('on', on); g.setAttribute('aria-pressed', String(on)); });
      const n = NODES[id];
      info.innerHTML = `<div class="label">${esc(n[0])}</div><p class="lrn-p">${esc(n[2])}</p>`;
      if (!quiet) info.setAttribute('aria-live', 'polite');
    }
    function along(pts, u) {
      const seg = [], L = [];
      let tot = 0;
      for (let i = 0; i < pts.length - 1; i++) { const d = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); seg.push(d); tot += d; }
      let d = u * tot;
      for (let i = 0; i < seg.length; i++) { if (d <= seg[i] || i === seg.length - 1) { const f = seg[i] ? d / seg[i] : 0; return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f]; } d -= seg[i]; }
      return pts[0]; // unreachable
    }
    function drawPulses(t) {
      pulses.forEach(p => { const u = ((t / p.dur) + p.off) % 1; const q = along(p.pts, u); p.c.setAttribute('cx', q[0].toFixed(1)); p.c.setAttribute('cy', q[1].toFixed(1)); });
    }
    const tSc = scene(box, t => drawPulses(t), () => drawPulses(1.2));
    if (ragT) ragT.addEventListener('change', () => { mode = ''; build(); });
    build();
    if ('ResizeObserver' in window) new ResizeObserver(() => build()).observe(box);

    /* Sizing */
    const emp = $('#lrn-size-emp'), share = $('#lrn-size-share'), modBox = $('#lrn-size-models');
    if (emp && share && modBox) {
      let models = ['qwen3.8-27b', 'gpt-oss-120b', 'qwen3.5-122b-a10b'].map(byId).filter(Boolean);
      if (!models.length) models = [{ id: 'x27', name: '27B dense model', arch: 'dense', params_total_b: 27, params_active_b: 27, kv_bytes_per_token_fp16: 65536, modalities: [] }];
      modBox.innerHTML = models.map(m => `<button type="button" data-sizemod="${esc(m.id)}" aria-pressed="false">${esc(m.name)}</button>`).join('');
      const st = { emp: 200, share: 5, mod: models[0].id, ctx: 32768 };
      setSeg(modBox, 'data-sizemod', st.mod);
      const s2e = s => { const v = 5 * Math.pow(1000, s / 1000); return v < 100 ? Math.round(v) : v < 1000 ? Math.round(v / 10) * 10 : Math.round(v / 50) * 50; };
      const e2s = e => Math.round(Math.log(e / 5) / Math.log(1000) * 1000);
      emp.value = e2s(st.emp);
      let last = null;
      function render() {
        $('#lrn-size-empv').textContent = nf(st.emp);
        emp.setAttribute('aria-valuetext', nf(st.emp) + ' people');
        $('#lrn-size-sharev').textContent = st.share + '%';
        const m = models.find(x => x.id === st.mod);
        const users = Math.max(1, Math.ceil(st.emp * st.share / 100));
        let r = null, k = 1;
        for (k = 1; k <= 16; k++) { r = estimate(m, 'q8', 'server', { ctx: st.ctx, users }, k); if (!r || r.fit === 'gpu') break; }
        const line = $('#lrn-size-line'), big = $('#lrn-size-cards'), bar = $('#lrn-size-bar');
        if (!r) { big.textContent = '–'; line.textContent = 'Estimates are not available.'; bar.innerHTML = ''; return; }
        last = { m, users };
        const mem = r.mem;
        if (r.fit !== 'gpu') {
          big.textContent = 'More than 16';
          $('#lrn-size-badge').innerHTML = badge('no', 'Several servers');
          line.textContent = `${nf(users)} conversations at once need about ${gb(mem.total)}. That is more than one server with 16 cards; split the users across several servers or choose a smaller model or context.`;
          bar.innerHTML = '';
          return;
        }
        big.textContent = k + (k === 1 ? ' card' : ' cards');
        $('#lrn-size-badge').innerHTML = badge(r.verdict.id, r.verdict.label);
        line.textContent = `${nf(users)} ${users === 1 ? 'conversation' : 'conversations'} at once need about ${gb(mem.total)}: ${gb(mem.weights)} for the model and ${gb(mem.kv)} of conversation memory. Each person gets about ${tpsTxt(r.tps)} tokens per second.`;
        const cap = r.machine.fastGB;
        const pc = x => (x / cap * 100).toFixed(2) + '%';
        let div = '';
        for (let i = 1; i < k; i++) div += `<span class="cd" style="left:${(i / k * 100).toFixed(2)}%"></span>`;
        bar.innerHTML = `<div class="lrn-cb"><i class="w" style="width:${pc(mem.weights)}"></i><i class="k" style="width:${pc(mem.kv)}"></i><i class="o" style="width:${pc(mem.overhead)}"></i>${div}</div>
          <div class="legend"><span><i class="l-w"></i>Model</span><span><i class="l-k"></i>Conversation memory</span><span><i class="l-o"></i>Working space</span><span class="fine">Total capacity ${gb(cap)}</span></div>`;
      }
      onRange(emp, v => { st.emp = s2e(v); render(); });
      onRange(share, v => { st.share = v; render(); });
      segGroup(modBox, 'data-sizemod', v => { st.mod = v; render(); });
      segGroup(emp.closest('.lrn-demo'), 'data-sizectx', v => { st.ctx = +v; render(); });
      render();
      const btn = $('#lrn-size-calc');
      const P = window.PickerApp;
      if (btn) {
        if (!P || !P.S || !P.S.calc) btn.hidden = true;
        else btn.addEventListener('click', () => {
          if (!last) return;
          const m = last.m;
          const real = byId(m.id);
          Object.assign(P.S.calc, {
            modelId: real ? m.id : '', params: m.params_total_b, moe: m.arch === 'moe',
            activePct: clamp(Math.round(m.params_active_b / m.params_total_b * 100), 2, 60),
            quant: 'q8', ctx: st.ctx, users: last.users, kvBits: 16, attn: 1
          });
          if (P.save) P.save();
          location.hash = '#/calculator';
        });
      }
    }

    /* Checklist tabs */
    const tabs = $('#lrn-cl-tabs');
    if (tabs) {
      const btns = $$('[role="tab"]', tabs);
      const show = b => {
        btns.forEach(x => { const on = x === b; x.setAttribute('aria-selected', String(on)); x.tabIndex = on ? 0 : -1; const p = document.getElementById(x.getAttribute('aria-controls')); if (p) p.hidden = !on; });
      };
      tabs.addEventListener('click', e => { const b = e.target.closest('[role="tab"]'); if (b) show(b); });
      tabs.addEventListener('keydown', e => {
        const i = btns.indexOf(document.activeElement); if (i < 0) return;
        let j = i;
        if (e.key === 'ArrowRight') j = (i + 1) % btns.length; else if (e.key === 'ArrowLeft') j = (i - 1 + btns.length) % btns.length; else return;
        e.preventDefault(); show(btns[j]); btns[j].focus();
      });
    }
  })();

  /* =====================================================================
     11 · COSTS: break-even between buying a machine and paying per token.
     Hardware figures are built-in examples. Hosted prices, exchange rates and
     the price date come from DATA.pricing when it is present.
     ===================================================================== */
  (function initCosts() {
    const PR = D.pricing && typeof D.pricing === 'object' ? D.pricing : null;
    const FX = PR && PR.fx && typeof PR.fx === 'object' ? PR.fx : null;
    const num = x => typeof x === 'number' && isFinite(x);
    const SYM = { USD: '$', EUR: '€', SEK: 'kr', GBP: '£' };
    // The currency chosen on the Costs page if the price list has its rate; otherwise euros, or US dollars without rates.
    function currency() {
      const app = window.PickerApp;
      const want = app && app.S && app.S.cost && app.S.cost.currency;
      if (FX && want && SYM[want] && num(FX[want])) return want;
      if (FX && num(FX.EUR)) return 'EUR';
      return 'USD';
    }
    const rate = c => (FX && num(FX[c]) ? FX[c] : 1);
    function money(usd, whole) {
      const c = currency(), v = usd * rate(c);
      const dec = !whole && Math.abs(v) < 10 ? 2 : 0;
      const n = new Intl.NumberFormat('en-GB', { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(v);
      return c === 'SEK' ? n + ' kr' : SYM[c] + n;
    }
    function axisMoney(v) {   // v is already in the display currency
      const c = currency(), r1 = x => String(Math.round(x * 10) / 10);
      const s = v >= 1e6 ? r1(v / 1e6) + 'M' : v >= 1000 ? r1(v / 1000) + 'k' : String(Math.round(v));
      return c === 'SEK' ? s + ' kr' : SYM[c] + s;
    }
    const asOf = (function () {
      const s = PR && PR.meta && PR.meta.as_of;
      if (!s) return '';
      const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T12:00:00') : new Date(s);
      return isNaN(d) ? String(s) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    })();
    const curve = arr(PR && PR.api_size_curve).filter(b => b && num(b.in_usd_mtok) && num(b.out_usd_mtok))
      .sort((a, b) => (num(a.active_params_b_max) ? a.active_params_b_max : 1e9) - (num(b.active_params_b_max) ? b.active_params_b_max : 1e9));

    /* Price range in the price list, shown under the worked example */
    function priceRange() {
      const el = $('#lrn-cost-range');
      if (!el || !PR) return;
      const open = [], closed = [];
      arr(PR.api_open).forEach(e => arr(e && e.offers).forEach(o => { if (o && num(o.out_usd_mtok)) open.push(o.out_usd_mtok); }));
      curve.forEach(b => open.push(b.out_usd_mtok));
      arr(PR.closed_api).forEach(o => { if (o && num(o.out_usd_mtok)) closed.push(o.out_usd_mtok); });
      if (!open.length && !closed.length) { el.hidden = true; return; }
      const span = l => { const a = Math.min.apply(null, l), b = Math.max.apply(null, l); return a === b ? money(a) : `between ${money(a)} and ${money(b)}`; };
      const where = `In the price list the Costs page uses${asOf ? ` (prices from ${asOf})` : ''}`;
      el.textContent = open.length && closed.length
        ? `${where}, hosted open models cost ${span(open)} per million output tokens, and closed models ${span(closed)}.`
        : open.length ? `${where}, hosted open models cost ${span(open)} per million output tokens.`
          : `${where}, closed models cost ${span(closed)} per million output tokens.`;
      el.hidden = false;
    }
    priceRange();

    const tokS = $('#lrn-be-tok'), hwBox = $('#lrn-be-hw'), apiBox = $('#lrn-be-api'), chart = $('#lrn-be-chart');
    if (!tokS || !hwBox || !apiBox || !chart) { window.addEventListener('learn:show', priceRange); return; }

    const MONTHS = 36, HOURS = 730, KWH = 0.2, IN_SHARE = 0.75;
    // Built-in examples, in US dollars. cap: tokens a month one machine handles with a server engine, busy day and night.
    const MACH = {
      gaming: { label: 'Gaming PC card', noun: 'gaming card', price: 3000, watts: 450, cap: 2e9, big: false, what: 'a desktop PC with one 24 to 32 GB gaming card' },
      work: { label: 'Workstation card', noun: 'workstation card', price: 12000, watts: 800, cap: 4e9, big: false, what: 'a workstation with one 48 to 96 GB workstation card' },
      server: { label: '8-GPU server', noun: 'server', price: 300000, watts: 10000, cap: 4e10, big: true, what: 'a server with eight data-centre graphics cards' }
    };
    const API_EX = { small: { inP: 0.1, outP: 0.3 }, large: { inP: 0.8, outP: 3 } };
    function hosted(id) {
      if (curve.length >= 2) {
        const i = id === 'small' ? 0 : curve.length - 1, b = curve[i];
        return { inP: b.in_usd_mtok, outP: b.out_usd_mtok, data: true, upTo: id === 'small' ? b.active_params_b_max : null, over: id === 'large' ? curve[i - 1].active_params_b_max : null };
      }
      return Object.assign({ data: false }, API_EX[id]);
    }
    const perMillion = a => IN_SHARE * a.inP + (1 - IN_SHARE) * a.outP;

    // Slider: 40 steps per factor of ten, from 1 million to 10 billion tokens a month.
    const PER_DEC = 40;
    const s2t = s => { const t = 1e6 * Math.pow(10, s / PER_DEC); const p = Math.pow(10, Math.floor(Math.log10(t)) - 1); return Math.round(t / p) * p; };
    const t2s = t => Math.round(Math.log10(t / 1e6) * PER_DEC);
    const short = x => (x < 10 && Math.round(x * 10) % 10 ? String(Math.round(x * 10) / 10) : nf(x));
    const tokWords = t => (t >= 1e9 ? short(t / 1e9) + ' billion' : short(t / 1e6) + ' million');

    const st = { tok: 1e9, hw: 'gaming', api: 'small' };
    function calc() {
      const m = MACH[st.hw], a = hosted(st.api), p = perMillion(a);
      const api = st.tok / 1e6 * p;                                    // hosted API, per month
      const fits = m.big || st.api !== 'large';
      const n = Math.max(1, Math.ceil(st.tok / m.cap - 1e-9));          // machines needed
      const util = Math.min(1, st.tok / (n * m.cap));
      const power = n * m.watts / 1000 * HOURS * (0.15 + 0.65 * util) * KWH;   // idle 15% of full power, busy 80%, as on the Costs page
      const upfront = n * m.price;
      const gain = api - power;
      return { m, a, p, api, fits, n, util, power, upfront, be: gain > 0 ? upfront / gain : Infinity };
    }
    const beTxt = be => (be < 1.5 ? 'about a month' : Math.round(be) + ' months');
    function verdict(r) {
      if (!r.fits) return ['Does not fit', 'a large model needs the 8-GPU server'];
      if (r.be <= MONTHS) return [r.be < 1.5 ? 'About 1 month' : Math.round(r.be) + ' months', 'until buying has paid for itself'];
      if (r.be <= 120) return [(Math.round(r.be / 12 * 10) / 10) + ' years', 'until buying pays for itself, longer than the 3 years shown'];
      if (isFinite(r.be)) return ['More than 10 years', 'until buying pays for itself'];
      return ['Never', 'buying does not pay for itself at this volume'];
    }
    function lineText(r) {
      const api = `At ${tokWords(st.tok)} tokens a month the hosted API costs about ${money(r.api)} a month.`;
      if (!r.fits) return `Large open models need several hundred gigabytes of graphics memory, far more than one ${r.m.noun} has. Choose the 8-GPU server, or the small model. ${api}`;
      const busy = r.util >= 0.995 ? 'all of the time' : r.util < 0.01 ? 'less than 1% of the time' : `about ${Math.round(r.util * 100)}% of the time`;
      const buy = r.n > 1
        ? `You would need ${r.n} of these machines: ${money(r.upfront, true)} once, then about ${money(r.power)} a month for electricity. Each would be busy ${busy}.`
        : `The machine costs ${money(r.upfront, true)} once, then about ${money(r.power)} a month for electricity, and would be busy ${busy}.`;
      const never = isFinite(r.be) ? '' : ` ${r.n > 1 ? 'Their' : 'Its'} electricity alone costs more than the hosted API.`;
      return `${api} ${buy}${never}`;
    }

    function niceMax(v) {
      if (!(v > 0)) return 1;
      const p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p;
      return [1, 2, 4, 6, 8, 10].find(k => n <= k + 1e-9) * p;
    }
    function draw(r) {
      const W = Math.max(280, Math.round(chart.clientWidth || 720));
      const narrow = W < 560;
      const H = narrow ? 240 : 300, L = narrow ? 52 : 64, R = narrow ? 82 : 104, T = 16, B = 36;
      const k = rate(currency());
      const lines = [];
      if (r.fits) lines.push({ cls: 'ln-buy', label: 'Buy', v: t => (r.upfront + r.power * t) * k });
      lines.push({ cls: 'ln-api', label: 'Hosted API', v: t => r.api * t * k });
      const maxY = niceMax(Math.max.apply(null, lines.map(l => l.v(MONTHS))) * 1.02);
      const x = t => L + (W - L - R) * t / MONTHS;
      const y = v => T + (H - T - B) * (1 - v / maxY);
      const f = n => n.toFixed(1);
      let s = '';
      [0, 0.25, 0.5, 0.75, 1].forEach(q => {
        const v = q * maxY;
        s += `<line class="cc-grid" x1="${L}" x2="${W - R}" y1="${f(y(v))}" y2="${f(y(v))}"/><text class="cc-tick" x="${L - 8}" y="${f(y(v) + 4)}" text-anchor="end">${esc(axisMoney(v))}</text>`;
      });
      [0, 12, 24, 36].forEach(t => { s += `<text class="cc-tick" x="${f(x(t))}" y="${H - 12}" text-anchor="middle">${t === 0 ? 'Today' : t / 12 + (t === 12 ? ' year' : ' years')}</text>`; });
      const cross = r.fits && r.be <= MONTHS;
      const cx = cross ? x(r.be) : 0, cy = cross ? y(r.api * r.be * k) : 0;
      if (cross) s += `<line class="cc-drop" x1="${f(cx)}" x2="${f(cx)}" y1="${f(cy)}" y2="${H - B}"/>`;
      lines.forEach(l => { s += `<line class="cc-line ${l.cls}" x1="${f(x(0))}" y1="${f(y(l.v(0)))}" x2="${f(x(MONTHS))}" y2="${f(y(l.v(MONTHS)))}"/>`; });
      // direct labels at the right end, nudged apart
      const ends = lines.map(l => ({ l, y: y(l.v(MONTHS)) })).sort((a, b) => a.y - b.y);
      for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 18) ends[i].y = ends[i - 1].y + 18;
      ends.forEach(e => { s += `<text class="cc-label ${e.l.cls}" x="${W - R + 8}" y="${f(e.y + 4)}">${e.l.label}</text>`; });
      if (cross) {
        // The crossing is stated on the chart: a marker and a label placed where it does not touch a line.
        const rows = narrow ? ['Break-even', 'after ' + beTxt(r.be)] : ['Break-even after ' + beTxt(r.be)];
        const LH = 15, tw = Math.max.apply(null, rows.map(t => t.length)) * 7.2, extra = (rows.length - 1) * LH;
        const segs = lines.map(l => [x(0), y(l.v(0)), x(MONTHS), y(l.v(MONTHS))]);
        // yb is the baseline of the first row; the box runs from yb - 13 to the last row's baseline + 3
        const blocked = (x0, x1, yb) => {
          const top = yb - 13, bot = yb + extra + 3;
          if (x0 < L + 2 || x1 > W - R - 2 || top < T || bot > H - B - 2) return true;
          return segs.some(sg => {
            const at = xx => sg[1] + (sg[3] - sg[1]) * (xx - sg[0]) / (sg[2] - sg[0]);
            const lo = Math.min(at(x0), at(x1)) - 3, hi = Math.max(at(x0), at(x1)) + 3;
            return !(hi < top || lo > bot);
          });
        };
        const cands = [['end', cx - 10, cy - 12 - extra], ['start', cx + 10, cy + 22], ['start', cx + 10, cy - 12 - extra], ['end', cx - 10, cy + 22], ['end', W - R - 8, H - B - 10 - extra], ['start', L + 8, T + 15]];
        const pick = cands.find(c => !blocked(c[0] === 'end' ? c[1] - tw : c[1], c[0] === 'end' ? c[1] : c[1] + tw, c[2])) || cands[cands.length - 1];
        s += `<circle class="cc-mark" cx="${f(cx)}" cy="${f(cy)}" r="5.5"/><text class="cc-note" y="${f(pick[2])}" text-anchor="${pick[0]}">${rows.map((t, i) => `<tspan x="${f(pick[1])}"${i ? ` dy="${LH}"` : ''}>${t}</tspan>`).join('')}</text>`;
      }
      const aria = r.fits
        ? `Total spent over 3 years. Buying: ${money(r.upfront, true)} today and ${money(r.upfront + r.power * MONTHS, true)} after 3 years. Hosted API: ${money(r.api * MONTHS, true)} after 3 years. ${cross ? 'The lines cross after ' + beTxt(r.be) + '.' : 'The lines do not cross within 3 years.'}`
        : `Total spent on the hosted API over 3 years: ${money(r.api * MONTHS, true)}. The machine cannot run this model, so it has no line.`;
      chart.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(aria)}">${s}</svg>`;
    }

    // Text that depends only on the currency and the price list
    function statics() {
      const rows = Object.keys(MACH).map(id => [MACH[id].label, `Draws up to ${nf(MACH[id].watts)} W at full load and handles up to about ${tokWords(MACH[id].cap)} tokens a month.`]);
      const desc = id => {
        const a = hosted(id), p = `${money(a.inP)} per million input tokens and ${money(a.outP)} per million output tokens`;
        if (!a.data) return p + ', built-in example.';
        if (id === 'small') return p + (num(a.upTo) ? `, the price list's band for models with up to ${a.upTo}B active parameters.` : ', the cheapest band in the price list.');
        return p + (num(a.over) ? `, the price list's band for models with more than ${a.over}B active parameters.` : ', the most expensive band in the price list.');
      };
      rows.push(['Small model', desc('small')], ['Large model', desc('large')]);
      rows.push(['Input and output', 'Three input tokens for every output token, as in a chat with some pasted text. Work that mostly reads documents has more input, which lowers the hosted price per million tokens.']);
      rows.push(['Electricity', `${money(KWH)} per kWh. A machine draws about 15% of its full power when idle and 80% when busy, as on the Costs page.`]);
      rows.push(['How much a machine handles', 'This depends heavily on the model and the engine. The figures above assume an engine that answers many requests at once (chapter 4) and runs day and night. Answering one person at a time, the same machine handles far less. Above its amount, the chart adds another machine.']);
      rows.push(['Not included', 'Staff time, repairs, spare machines, space in a data centre and VAT.']);
      $('#lrn-be-figs').innerHTML = `<dl class="lrn-be-figs">${rows.map(r => `<dt>${esc(r[0])}</dt><dd>${esc(r[1])}</dd>`).join('')}</dl>`;
      $('#lrn-be-src').textContent = 'Example prices, not quotes. ' + (curve.length >= 2
        ? `Hosted prices come from the price list the Costs page uses${asOf ? ' (' + asOf + ')' : ''}; the hardware figures are built-in examples.`
        : 'All figures are built-in examples.') + ' Staff time, repairs and spare machines are not included.';
    }
    function render() {
      const r = calc();
      $('#lrn-be-tokv').textContent = tokWords(st.tok);
      tokS.setAttribute('aria-valuetext', tokWords(st.tok) + ' tokens a month');
      $('#lrn-be-hwnote').textContent = `Example: ${money(r.m.price, true)} once for ${r.m.what}.`;
      $('#lrn-be-apinote').textContent = `Example: ${money(r.p)} per million tokens, input and output mixed.`;
      const v = verdict(r);
      $('#lrn-be-big').textContent = v[0];
      $('#lrn-be-unit').textContent = v[1];
      $('#lrn-be-line').textContent = lineText(r);
      draw(r);
    }

    tokS.value = t2s(st.tok);
    onRange(tokS, v => { st.tok = s2t(v); render(); });
    segGroup(hwBox, 'data-behw', v => { st.hw = v; render(); });
    segGroup(apiBox, 'data-beapi', v => { st.api = v; render(); });
    let lastW = 0;
    if ('ResizeObserver' in window) new ResizeObserver(() => { const w = Math.round(chart.clientWidth); if (w && w !== lastW) { lastW = w; draw(calc()); } }).observe(chart);
    // the currency may have changed on the Costs page since the last visit
    window.addEventListener('learn:show', () => { priceRange(); statics(); render(); });
    statics();
    render();
  })();

  /* =====================================================================
     12 · LICENCES: grouped from DATA.llm
     ===================================================================== */
  (function initLicences() {
    const box = $('#lrn-lic-list'), filt = $('#lrn-lic-filter');
    if (!box || !filt) return;
    if (!CHAT.length) { filt.hidden = true; box.innerHTML = '<div class="empty"><h3>No model data loaded</h3><p>This copy of the page has no model list. The explanations above still apply.</p></div>'; return; }
    const cat = m => /non-?commercial|research only|research-only/i.test((m.license || '') + ' ' + (m.license_note || '')) ? 'nc' : /^permissive/i.test(m.license_note || '') ? 'open' : 'cond';
    const groups = {};
    CHAT.forEach(m => { const k = m.license || 'Unknown'; (groups[k] = groups[k] || { lic: k, cat: cat(m), models: [] }).models.push(m); });
    const G = Object.values(groups).sort((a, b) => ({ open: 0, cond: 1, nc: 2 }[a.cat] - { open: 0, cond: 1, nc: 2 }[b.cat]) || b.models.length - a.models.length || a.lic.localeCompare(b.lic));
    const count = c => CHAT.filter(m => cat(m) === c).length;
    const CATL = { open: 'Permissive', cond: 'With conditions', nc: 'Non-commercial' };
    const opts = [['all', `All (${CHAT.length})`], ['open', `Permissive (${count('open')})`], ['cond', `With conditions (${count('cond')})`]];
    if (count('nc')) opts.push(['nc', `Non-commercial (${count('nc')})`]);
    filt.innerHTML = opts.map((o, i) => `<button type="button" data-lic="${o[0]}" aria-pressed="${i === 0}">${esc(o[1])}</button>`).join('');
    function render(f) {
      box.innerHTML = G.filter(g => f === 'all' || g.cat === f).map(g => {
        const notes = Array.from(new Set(g.models.map(m => m.license_note || '')));
        const body = notes.length <= 1
          ? `<p class="small">${esc(notes[0] || '')}</p><p class="fine">${g.models.map(m => esc(m.name)).join(', ')}</p>`
          : `<ul class="lrn-licm">${g.models.map(m => `<li><b>${esc(m.name)}</b>: <span class="small">${esc(m.license_note || '')}</span></li>`).join('')}</ul>`;
        return `<div class="lrn-licg"><div class="lrn-licg-h"><b>${esc(g.lic)}</b><span class="pill${g.cat === 'open' ? '' : ' is-warn'}">${CATL[g.cat]}</span><span class="fine">${g.models.length} ${g.models.length === 1 ? 'model' : 'models'}</span></div>${body}</div>`;
      }).join('');
    }
    segGroup(filt, 'data-lic', v => render(v));
    render('all');
  })();

  /* =====================================================================
     13 · GLOSSARY filter
     ===================================================================== */
  (function initGlossary() {
    const input = $('#lrn-gl-in'), box = $('#lrn-gloss');
    if (!input || !box) return;
    const items = $$('details', box);
    const autoOpened = new Set();
    const count = $('#lrn-gl-count'), empty = $('#lrn-gl-empty');
    const upd = () => {
      const q = input.value.trim().toLowerCase();
      let n = 0;
      items.forEach(d => {
        const t = d.textContent.toLowerCase();
        const sum = $('summary', d).textContent.toLowerCase();
        const show = !q || t.includes(q);
        d.hidden = !show; if (show) n++;
        if (q.length >= 2 && sum.includes(q) && !d.open) { d.open = true; autoOpened.add(d); }
        if ((!q || !sum.includes(q)) && autoOpened.has(d)) { d.open = false; autoOpened.delete(d); }
      });
      if (count) count.textContent = q ? `${n} of ${items.length} terms` : `${items.length} terms`;
      if (empty) empty.hidden = n > 0;
    };
    input.addEventListener('input', upd);
    upd();
  })();

  /* ---------- Start ---------- */
  if (/^#\/learn/.test(location.hash) && !view.hidden) handleShow(location.hash);
  // Sticky offsets follow the real height of the app's top bar and of the chapter index.
  function syncOffsets() {
    view.style.setProperty('--lrn-top', topbarH() + 'px');
    view.style.setProperty('--lrn-index-h', (indexH() || 46) + 'px');
  }
  window.addEventListener('resize', () => { syncOffsets(); activeCh = null; updateActive(); });
  window.addEventListener('learn:show', syncOffsets);
  syncOffsets();
  updateActive();
  kick();
})();
