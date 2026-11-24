/* Local LLM Picker: interface. Depends on window.DATA and window.Engine. */
(function () {
  'use strict';
  const E = window.Engine;
  const D = window.DATA;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const NONE_HW = { id: 'none', name: 'No dedicated graphics card (processor or built-in graphics only)', vendor: 'Generic', class: 'cpu', memory_gb: null, memory_options_gb: null, bandwidth_gbs: null, fp16_tflops_dense: null, usable_memory_fraction: 0.85 };
  const hwById = id => id === 'none' ? NONE_HW : D.hardware.find(h => h.id === id);

  /* ---------- State (remembered in this browser only) ---------- */
  const KEY = 'local-llm-picker-v1';
  const defaults = {
    // sim = what the sliders on the Size guide describe (the machine all views use)
    sim: { vram: 24, ram: 32, shared: false, bw: null, tflops: null, count: 1, frac: null, name: null },
    hwId: null, count: 1, memOpt: null, ram: 32, ramBw: 80,
    custom: { cls: 'gpu-consumer', memory: 24, bw: 500 },
    mode: 'text', goal: 'all', commercialOnly: false, sort: 'fit',
    ctx: 8192, users: 1, kvBits: 16, maxQ: 'q6',
    calc: { modelId: '', params: 32, moe: false, activePct: 10, quant: 'q4', ctx: 8192, users: 1, kvBits: 16, attn: 1 }
  };
  let S;
  try { S = Object.assign({}, defaults, JSON.parse(localStorage.getItem(KEY) || '{}')); S.calc = Object.assign({}, defaults.calc, S.calc); S.custom = Object.assign({}, defaults.custom, S.custom); S.sim = Object.assign({}, defaults.sim, S.sim); }
  catch (e) { S = JSON.parse(JSON.stringify(defaults)); }
  if (S.hwId && S.hwId !== 'custom' && !hwById(S.hwId)) S.hwId = null;
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage can be blocked */ } };

  function toast(msg, opts) {
    if (window.RISE && RISE.toast) RISE.toast(msg, Object.assign({ timeout: 2600 }, opts || {}));
  }
  /* Status: shape + word + colour (RISE .status). Speed verdicts: runs well / usable / slow / does not fit. */
  const ST_CLS = { great: 'is-ok', ok: 'is-warn', slow: 'is-warn', no: 'is-bad', all: 'is-ok', part: 'is-warn' };
  const statusHtml = (id, label) => `<span class="status ${ST_CLS[id] || 'is-info'}">${esc(label)}</span>`;
  /* Explanation on demand: hover tooltip, or a toast when tapped on a touch screen */
  const infoDot = t => `<span class="info-dot" tabindex="0" role="img" aria-label="${esc(t)}" data-tip="${esc(t)}">?</span>`;
  const ui = name => (window.RISE && RISE.ui ? RISE.ui(name) : '');
  function copy(text) {
    const done = () => toast('Copied', { status: 'ok' });
    if (navigator.clipboard && window.isSecureContext !== false) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
    function fallback() {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { toast('Copy failed'); }
      ta.remove();
    }
  }

  /* ---------- Machine ---------- */
  /* Rough memory speed when the user only moved the sliders: bigger cards are usually faster ones. */
  const BW_BY_VRAM = [[4, 112], [6, 192], [8, 300], [12, 420], [16, 600], [24, 930], [32, 1500], [48, 900], [96, 1800], [192, 3500], [1e9, 4500]];
  function autoBw(s) {
    if (s.shared) return 273;
    if (!(s.vram > 0)) return S.ramBw;
    return (BW_BY_VRAM.find(([v]) => s.vram <= v) || BW_BY_VRAM[BW_BY_VRAM.length - 1])[1];
  }
  function simKind(s) { return s.shared ? 'shared' : (s.vram > 0 ? 'gpu' : 'cpu'); }
  function currentMachine() {
    const s = S.sim, kind = simKind(s);
    const cls = kind === 'shared' ? 'unified-memory' : (kind === 'gpu' ? 'gpu-consumer' : 'cpu');
    const mem = kind === 'cpu' ? s.ram : s.vram;
    const hw = {
      name: s.name || machineLabel(), class: cls, memory_gb: mem,
      bandwidth_gbs: s.bw || autoBw(s), fp16_tflops_dense: s.tflops || null,
      usable_memory_fraction: kind === 'shared' ? (s.frac || (s.vram >= 48 ? 0.75 : 0.67)) : (kind === 'cpu' ? 0.85 : 1)
    };
    return E.buildMachine(hw, { count: s.count || 1, memoryGB: mem, memoryIsTotal: true, ramGB: s.ram, ramBandwidth: S.ramBw });
  }
  function machineLabel() {
    const s = S.sim, kind = simKind(s);
    if (kind === 'shared') return `${s.name ? s.name + ' · ' : ''}${s.vram} GB shared memory`;
    if (kind === 'gpu') return `${s.name ? s.name + ' · ' : ''}${s.vram} GB graphics + ${s.ram} GB RAM`;
    return `${s.name ? s.name + ' · ' : ''}${s.ram} GB RAM, no dedicated graphics memory`;
  }

  /* ---------- Routing ---------- */
  const views = { machine: $('#view-machine'), sizes: $('#view-sizes'), picker: $('#view-picker'), costs: $('#view-costs'), calculator: $('#view-calculator'), learn: $('#view-learn') };
  const TITLES = { machine: '', sizes: 'What fits · ', picker: 'Models · ', costs: 'Costs · ', calculator: 'Calculator · ', learn: 'Learn · ' };
  const ROUTES = [['#/sizes', 'sizes'], ['#/models', 'picker'], ['#/costs', 'costs'], ['#/calculator', 'calculator'], ['#/learn', 'learn']];
  function route() {
    const h = location.hash || '#/';
    const hit = ROUTES.find(([p]) => h.startsWith(p));
    const name = hit ? hit[1] : 'machine';
    Object.entries(views).forEach(([k, el]) => { el.hidden = k !== name; });
    // step path: the current step is marked, the steps before it show as done
    const steps = $$('.app-path .steps li'), cur = steps.findIndex(li => li.dataset.route === name);
    steps.forEach((li, i) => {
      if (i === cur) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
      li.classList.toggle('is-done', cur > -1 && i < cur);
      const a = $('a', li); if (i === cur) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    $$('.app-nav a').forEach(a => { if (a.dataset.route === name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    if (name === 'machine') renderMachine();
    if (name === 'sizes') renderSizes();
    if (name === 'picker') renderPicker();
    if (name === 'costs') { if (window.CostsUI) window.CostsUI.render($('#costsBody'), window.PickerApp); else $('#costsBody').innerHTML = '<div class="empty"><h3>Costs are coming</h3></div>'; }
    if (name === 'calculator') renderCalc();
    if (name === 'learn') window.dispatchEvent(new CustomEvent('learn:show', { detail: { hash: h } }));
    if (!(name === 'learn' && h.split('/').length > 2)) window.scrollTo(0, 0);
    document.title = TITLES[name] + 'Local LLM Picker';
  }
  window.addEventListener('hashchange', route);
  function updateChip() { /* the machine is shown on each page instead of in the top bar */ }

  /* =====================================================================
     HARDWARE DIALOG
     ===================================================================== */
  const dlg = $('#hwDialog');
  let H = null; // dialog working copy

  const GROUP_ORDER = ['NVIDIA desktop graphics', 'NVIDIA laptop graphics', 'AMD desktop graphics', 'AMD laptop graphics', 'Intel desktop graphics', 'Intel laptop graphics', 'Apple Silicon Macs', 'Shared-memory mini PCs and laptops', 'Workstation and server GPUs', 'Built-in graphics and processor only'];
  function hwGroup(h) {
    if (h.class === 'cpu') return 'Built-in graphics and processor only';
    if (h.class === 'unified-memory') return h.vendor === 'Apple' ? 'Apple Silicon Macs' : 'Shared-memory mini PCs and laptops';
    const lap = h.form === 'laptop' || /laptop/i.test(h.name);
    if ((h.class === 'gpu-datacenter' || h.class === 'gpu-workstation') && !lap) return 'Workstation and server GPUs';
    return (h.vendor || 'Other') + (lap ? ' laptop graphics' : ' desktop graphics');
  }

  const HW_CATS = [['all', 'All'], ['desktop', 'Desktop cards'], ['laptop', 'Laptop'], ['server', 'Workstation and server'], ['mac', 'Mac and shared memory'], ['cpu', 'No graphics card']];
  function hwCat(h) {
    if (h.class === 'cpu') return 'cpu';
    if (h.class === 'unified-memory') return 'mac';
    const lap = h.form === 'laptop' || /laptop/i.test(h.name);
    if (lap) return 'laptop';
    if (h.class === 'gpu-datacenter' || h.class === 'gpu-workstation' || h.form === 'server' || h.form === 'workstation') return 'server';
    return 'desktop';
  }

  function openHardware() {
    H = {
      id: S.hwId, count: S.count, memOpt: S.memOpt, ram: S.sim.ram || S.ram, ramBw: nearestRamType(S.ramBw),
      custom: Object.assign({}, S.custom), filter: '', cat: 'all', customMode: S.hwId === 'custom', detected: null
    };
    renderHw();
    if (!dlg.open) dlg.showModal();
  }

  function renderHw() {
    const sel = H.id && H.id !== 'custom' ? hwById(H.id) : null;
    const body = $('#hwBody');
    let html = '';
    if (!H.customMode) {
      html += `<p class="small hw-intro">Pick the graphics card, Mac or processor you want to run models on. If you use several graphics cards, you can set the number in the next step.</p>
        <div class="hw-detect">
          <button class="btn btn-sm" type="button" id="hwDetect">Detect this computer</button>
          <span class="fine" id="hwDetectMsg">${H.detected ? esc(H.detected) : 'Your browser can read the graphics card name, but not its memory.'}</span>
        </div>
        <div class="segmented segmented-sm hw-cats" id="hwCats" role="group" aria-label="Kind of hardware">${HW_CATS.map(([id, l]) => `<button type="button" data-cat="${id}" aria-pressed="${H.cat === id}">${l}</button>`).join('')}</div>
        <div class="hw-search"><input class="input" type="search" id="hwFilter" placeholder="Search, for example “4090”, “M3 Max” or “H100”" value="${esc(H.filter)}" autocomplete="off" aria-label="Search hardware"></div>
        <div class="hw-list" id="hwList" role="listbox" aria-label="Hardware list">${hwListHtml()}</div>
        <p class="fine" style="margin:var(--s-3) 0 0">Not in the list? <button type="button" class="linkbtn" id="hwCustom">Enter the numbers yourself</button></p>`;
      if (sel) html += hwDetailsHtml(sel);
    } else {
      const c = H.custom;
      html += `<p class="small hw-intro">Enter two numbers from the spec sheet of your hardware. Speed estimates depend mostly on the second one.</p>
        <div class="grid2">
          <div class="field"><label for="cMem">${c.cls === 'cpu' ? 'System memory (GB)' : 'Memory the model can use (GB)'}</label><input class="input num" id="cMem" type="number" min="0" max="4096" step="1" value="${c.memory}"></div>
          <div class="field"><label for="cBw">Memory bandwidth (GB/s)</label><input class="input num" id="cBw" type="number" min="5" max="12000" step="1" value="${c.bw}"></div>
        </div>
        <p class="fine" style="margin:var(--s-2) 0 var(--s-5)">Typical values: gaming graphics card 400–1000 GB/s · Mac Pro or Max chip 270–550 GB/s · Mac Ultra 800 GB/s · desktop RAM 50–90 GB/s · server RAM 200–600 GB/s.</p>
        <div class="field"><label for="cCls">What kind is it?</label>
          <select class="select" id="cCls">
            <option value="gpu-consumer" ${c.cls.startsWith('gpu') ? 'selected' : ''}>Graphics card (own fast memory)</option>
            <option value="unified-memory" ${c.cls === 'unified-memory' ? 'selected' : ''}>Shared memory (Mac, Ryzen AI Max)</option>
            <option value="cpu" ${c.cls === 'cpu' ? 'selected' : ''}>Processor only (system RAM)</option>
          </select></div>
        <p class="fine" style="margin:var(--s-4) 0 0"><button type="button" class="linkbtn" id="hwBack">Back to the list</button></p>`;
      if (c.cls.startsWith('gpu')) html += `<div class="hw-details">${ramFieldHtml()}</div>`;
    }
    body.innerHTML = html;
    const ok = H.customMode ? (H.custom.memory >= 0 && H.custom.bw > 0) : !!sel;
    $('#hwFoot').innerHTML = `<span class="fine">Estimates only. You can change this any time.</span><button class="btn btn-primary" type="button" id="hwDone" ${ok ? '' : 'disabled'}>Use this hardware</button>`;
    bindHw();
  }

  function hwListHtml() {
    const f = H.filter.trim().toLowerCase();
    const q = f.split(/\s+/).filter(Boolean);
    const items = [NONE_HW].concat(D.hardware).filter(h => (H.cat === 'all' || hwCat(h) === H.cat)).filter(h => !q.length || q.every(t => (h.name + ' ' + (h.vendor || '') + ' ' + (h.form || '') + (h.id === 'none' ? ' cpu integrated igpu built-in no graphics' : '')).toLowerCase().includes(t)));
    if (!items.length) return `<div class="hw-empty">Nothing found. Try fewer letters, or enter the numbers yourself.</div>`;
    const groups = {};
    items.forEach(h => { (groups[hwGroup(h)] = groups[hwGroup(h)] || []).push(h); });
    const names = Object.keys(groups).sort((a, b) => (GROUP_ORDER.indexOf(a) + 1 || 99) - (GROUP_ORDER.indexOf(b) + 1 || 99));
    return names.map(g => `<div class="hw-group">${esc(g)}</div>` + groups[g].map(h => {
      const mem = h.memory_options_gb ? h.memory_options_gb[0] + '–' + h.memory_options_gb[h.memory_options_gb.length - 1] : h.memory_gb;
      return `<button type="button" class="hw-item" role="option" data-hw="${esc(h.id)}" aria-selected="${H.id === h.id}"><span>${esc(h.name)}</span><span class="fine">${mem ? mem + ' GB' : ''}${h.bandwidth_gbs ? ' · ' + h.bandwidth_gbs + ' GB/s' : ''}</span></button>`;
    }).join('')).join('');
  }

  const RAM_OPTIONS = [4, 8, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384, 512, 768, 1024, 2048];
  // Spec-sheet (theoretical) figures, like the hardware list; the engine applies the real-world share.
  const RAM_TYPES = [[25, 'One memory stick (single channel), about 25 GB/s'], [50, 'Older PC or laptop (DDR4), about 50 GB/s'], [80, 'Typical newer PC or laptop (DDR5), about 80 GB/s'], [120, 'Fast laptop memory (LPDDR5X), about 120 GB/s'], [300, 'Server with many memory channels, about 300 GB/s']];
  const nearestRamType = v => RAM_TYPES.reduce((a, b) => Math.abs(b[0] - v) < Math.abs(a[0] - v) ? b : a)[0];
  function ramFieldHtml(cpuMode, showType) {
    return `<div class="field"><label for="hwRam">${cpuMode ? 'Memory (RAM) in your system' : 'System memory (RAM)'}</label>
      <select class="select" id="hwRam">${RAM_OPTIONS.map(r => `<option value="${r}" ${r === H.ram ? 'selected' : ''}>${r} GB</option>`).join('')}</select>
      ${cpuMode ? '' : `<span class="hint">Models too big for the graphics card can spill into system RAM. That works, but runs slower.</span>`}</div>
      ${showType ? `<div class="field"><label for="hwRamType">Type of memory</label><select class="select" id="hwRamType">${RAM_TYPES.map(([v, l]) => `<option value="${v}" ${v === nearestRamType(H.ramBw) ? 'selected' : ''}>${l}</option>`).join('')}</select><span class="hint">Memory speed sets how fast text appears. If you do not know, choose the DDR5 option for a computer from 2022 or later, DDR4 for an older one.</span></div>` : ''}`;
  }
  function hwDetailsHtml(h) {
    let out = `<div class="hw-details"><div class="label" style="margin:0">Details for ${esc(h.name)}</div>`;
    if (h.memory_options_gb && h.memory_options_gb.length > 1 && h.class !== 'cpu') {   // processors: the RAM field below sets the size
      const cur = H.memOpt || h.memory_gb || h.memory_options_gb[0];
      out += `<div class="field"><label for="hwMemOpt">Memory size of your ${h.class === 'unified-memory' ? 'machine' : 'card'}</label>
        <select class="select" id="hwMemOpt">${h.memory_options_gb.map(m => `<option value="${m}" ${m === cur ? 'selected' : ''}>${m} GB</option>`).join('')}</select>
        ${h.class === 'unified-memory' ? `<span class="hint">On these machines the processor and graphics share one pool of memory. The system reserves part of it, so only about ${Math.round((h.usable_memory_fraction || .75) * 100)}% can hold a model.</span>` : ''}</div>`;
    }
    if (h.gpus_per_system) {
      out += `<p class="help" style="margin:0">This is a complete system with ${h.gpus_per_system} graphics cards. The memory shown is the total for all of them.</p>`;
      out += ramFieldHtml(false);
    } else if (h.class.startsWith('gpu')) {
      out += `<div class="field"><span class="field-label">How many of these cards?</span>
        <div class="stepper"><button class="btn btn-icon" type="button" id="cntMinus" aria-label="Fewer cards">${ui('minus')}</button><output id="cntOut">${H.count}</output><button class="btn btn-icon" type="button" id="cntPlus" aria-label="More cards">${ui('plus')}</button></div>
        ${H.count > 1 ? `<span class="hint">${esc(h.multi_gpu || 'Memory adds up across cards. Speed gains depend on the program you use.')}</span>` : ''}</div>`;
      out += ramFieldHtml(false);
    }
    if (h.class === 'cpu') out += ramFieldHtml(true, !h.bandwidth_gbs);
    if (h.class === 'unified-memory') out += '';
    out += '</div>';
    return out;
  }

  function bindHw() {
    const body = $('#hwBody');
    const filter = $('#hwFilter', body);
    if (filter) filter.addEventListener('input', () => { H.filter = filter.value; $('#hwList').innerHTML = hwListHtml(); bindList(); });
    function bindList() {
      $$('.hw-item', body).forEach(b => b.addEventListener('click', () => {
        H.id = b.dataset.hw; const h = hwById(H.id); H.memOpt = h.memory_gb || (h.memory_options_gb && h.memory_options_gb[0]) || null;
        if (!h.class.startsWith('gpu') || h.gpus_per_system) H.count = 1;
        const scroll = $('#hwList') ? $('#hwList').scrollTop : 0;
        renderHw(); const l = $('#hwList'); if (l) l.scrollTop = scroll;
        const d = $('#hwBody .hw-details'); if (d) d.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }));
    }
    bindList();
    $$('[data-cat]', body).forEach(b => b.addEventListener('click', () => { H.cat = b.dataset.cat; $$('[data-cat]', body).forEach(x => x.setAttribute('aria-pressed', x === b)); $('#hwList').innerHTML = hwListHtml(); bindList(); }));
    const on = (id, ev, fn) => { const el = $(id, dlg); if (el) el.addEventListener(ev, fn); };
    on('#hwCustom', 'click', () => { H.customMode = true; H.id = 'custom'; renderHw(); });
    on('#hwBack', 'click', () => { H.customMode = false; H.id = null; renderHw(); });
    on('#hwDetect', 'click', runDetect);
    on('#cntMinus', 'click', () => { H.count = Math.max(1, H.count - 1); renderHw(); });
    on('#cntPlus', 'click', () => { H.count = Math.min(16, H.count + 1); renderHw(); });
    on('#hwRam', 'change', e => { H.ram = +e.target.value; });
    on('#hwMemOpt', 'change', e => { H.memOpt = +e.target.value; });
    on('#hwRamType', 'change', e => { H.ramBw = +e.target.value; });
    on('#cMem', 'input', e => { H.custom.memory = +e.target.value; $('#hwDone').disabled = !(H.custom.memory >= 0 && H.custom.bw > 0); });
    on('#cBw', 'input', e => { H.custom.bw = +e.target.value; $('#hwDone').disabled = !(H.custom.memory >= 0 && H.custom.bw > 0); });
    on('#cCls', 'change', e => { H.custom.cls = e.target.value; renderHw(); });
    on('#hwDone', 'click', () => {
      S.hwId = H.customMode ? 'custom' : H.id;
      S.count = H.count; S.memOpt = H.memOpt; S.ram = H.ram; S.ramBw = H.ramBw; S.custom = H.custom;
      S.sim = simFromDialog();
      save(); dlg.close(); route();
    });
  }

  /* Turns what was chosen in the dialog into the slider values. */
  function simFromDialog() {
    const base = { vram: 0, ram: H.ram, shared: false, bw: null, tflops: null, count: 1, frac: null, name: null };
    if (H.customMode) {
      const c = H.custom, mem = Math.max(0, +c.memory || 0);
      if (c.cls === 'unified-memory') return Object.assign(base, { vram: mem, shared: true, bw: c.bw, name: 'Custom' });
      // 0 GB on a graphics card means "no card": then the RAM speed applies, not the card's bandwidth
      if (c.cls === 'cpu' || mem === 0) return Object.assign(base, { ram: mem > 0 ? mem : H.ram, bw: c.cls === 'cpu' ? c.bw : null, name: 'Custom' });
      return Object.assign(base, { vram: mem, bw: c.bw, name: 'Custom' });
    }
    const h = hwById(H.id);
    if (h.class === 'unified-memory') return Object.assign(base, { vram: H.memOpt || h.memory_gb, shared: true, bw: h.bandwidth_gbs, tflops: h.fp16_tflops_dense, frac: h.usable_memory_fraction, name: h.name });
    if (h.class === 'cpu') return Object.assign(base, { bw: h.bandwidth_gbs || H.ramBw, name: h.id === 'none' ? null : h.name });
    if (h.gpus_per_system) return Object.assign(base, { vram: H.memOpt || h.memory_gb, bw: h.bandwidth_gbs, tflops: h.fp16_tflops_dense, count: h.gpus_per_system, name: h.name });
    const n = H.count || 1;
    return Object.assign(base, { vram: (H.memOpt || h.memory_gb) * n, bw: h.bandwidth_gbs, tflops: h.fp16_tflops_dense, count: n, name: (n > 1 ? n + ' × ' : '') + h.name });
  }
  $('#hwClose').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });

  async function runDetect() {
    const msg = $('#hwDetectMsg'); msg.textContent = 'Looking…';
    const names = [];
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
      if (gl) {
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        if (ext) names.push(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
      }
    } catch (e) { /* ignore */ }
    try {
      if (navigator.gpu) {
        const a = await navigator.gpu.requestAdapter();
        const i = a && (a.info || (a.requestAdapterInfo && await a.requestAdapterInfo()));
        if (i) names.push([i.vendor, i.architecture, i.device, i.description].filter(Boolean).join(' '));
      }
    } catch (e) { /* ignore */ }
    const useful = names.filter(n => n && !/swiftshader|llvmpipe|basic render|software/i.test(n));
    let found = null, raw = useful[0] || '';
    for (const n of useful) { found = E.matchHardware(n, D.hardware); if (found) { raw = n; break; } }
    const cores = navigator.hardwareConcurrency;
    if (found) {
      H.id = found.id; H.memOpt = found.memory_gb || (found.memory_options_gb && found.memory_options_gb[0]) || null;
      H.detected = `Your browser reports “${shorten(raw)}”. We picked ${found.name}. Please check the memory size below.`;
    } else if (raw) {
      H.detected = `Your browser reports “${shorten(raw)}”, which is not in our list. Search for it below.`;
    } else {
      H.detected = 'Your browser does not share its graphics card name. Please pick it from the list.' + (cores ? ` (${cores} processor threads found.)` : '');
    }
    renderHw();
  }
  const shorten = s => String(s).replace(/^ANGLE \(|\)$/g, '').replace(/Direct3D11.*$/, '').replace(/\s+/g, ' ').trim().slice(0, 70);

  /* =====================================================================
     PICKER VIEW
     ===================================================================== */
  const GOALS = [
    { id: 'all', label: 'Anything' },
    { id: 'coding', label: 'Coding' },
    { id: 'vision', label: 'Understands images' },
    { id: 'multilingual', label: 'German, Swedish and others' },
    { id: 'reasoning', label: 'Hard reasoning' },
    { id: 'agents', label: 'Agents and tools' },
    { id: 'long-context', label: 'Long documents' }
  ];
  const MODES = [
    { id: 'text', label: 'Text and chat' },
    { id: 'image', label: 'Images' },
    { id: 'video', label: 'Video' },
    { id: 'speech', label: 'Speech' }
  ];
  const TIER_RANK = { 'frontier-class': 4, 'strong': 3, 'efficient': 2, 'tiny': 1 };
  const NOW = new Date('2026-11-19');
  function monthsOld(rel) { if (!rel) return 12; const d = new Date(rel + '-01'); return Math.max(0, (NOW - d) / (30.4 * 864e5)); }

  function textOpts() { return { ctx: S.ctx, users: S.users, kvBits: S.kvBits, maxQuality: S.maxQ }; }

  function modelMatchesGoal(m, goal) {
    if (goal === 'all') return true;
    if (goal === 'vision') return (m.modalities || []).includes('image');
    return (m.strengths || []).includes(goal);
  }
  // Permissive licences with no size or revenue limits. Everything else may still allow business use, but with conditions.
  const commercialOk = m => /^(apache|mit\b|openmdw|nvidia open model)/i.test(m.license || '');

  function scoreText(r) {
    const m = r.model;
    // Capability: the published index when we have it, otherwise a rough guess from tier and size.
    const size = Math.log2(Math.max(1, m.params_total_b)) * 0.6 + Math.log2(Math.max(1, m.params_active_b)) * 0.4;
    // The published index only separates models well near the top, so it is added on top of tier and size, not used alone.
    const base = (TIER_RANK[m.tier] || 2) * 5 + size * 1.2 + (m.quality_index != null ? m.quality_index * 0.8 : 0);
    const quantPenalty = (6 - Math.min(r.quant.quality, 6)) * 1.5;      // 4-bit costs a little, 2-bit costs a lot
    const speedBonus = r.verdict.id === 'great' ? 4 : r.verdict.id === 'ok' ? 0 : -6;
    return base - quantPenalty + speedBonus - Math.min(4, monthsOld(m.released) * 0.1);
  }

  function evaluateText(machine) {
    const base = textOpts();
    let list = D.llm.filter(m => m.kind !== 'embedding');
    list = list.filter(m => modelMatchesGoal(m, S.goal));
    if (S.commercialOnly) list = list.filter(commercialOk);
    return list.map(m => {
      const opts = Object.assign({}, base, { ctx: Math.min(base.ctx, m.context_max || base.ctx) });
      const r = E.bestQuant(m, machine, opts);
      r.opts = opts; r.score = scoreText(r);
      return r;
    });
  }

  const SORTS = {
    fit: (a, b) => b.score - a.score,
    speed: (a, b) => b.tps - a.tps,
    newest: (a, b) => (b.model.released || '').localeCompare(a.model.released || ''),
    small: (a, b) => a.neededGB - b.neededGB
  };

  const VRAM_STEPS = [0, 2, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128, 192, 256, 384, 512];
  const RAM_STEPS = [4, 8, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384, 512, 768, 1024, 2048];
  const SHARED_STEPS = [8, 16, 24, 32, 36, 48, 64, 96, 128, 192, 256, 512];
  const CTX_STEPS = [2048, 4096, 8192, 16384, 32768, 65536, 131072, 262144, 524288, 1048576];
  const USER_STEPS = [1, 2, 4, 8, 16, 32, 64];
  const nearestIdx = (arr, v) => arr.reduce((bi, x, i) => Math.abs(x - v) < Math.abs(arr[bi] - v) ? i : bi, 0);

  const CLASSES = [
    { id: 'tiny', name: 'Tiny', range: 'up to 4B', lo: 0.5, hi: 4, summary: 'Fast and light, for simple jobs.',
      can: 'Rewrite, shorten or translate short texts, sort messages into categories, pull names and dates out of text, answer simple questions.',
      limits: 'Often wrong about facts, weak at reasoning in several steps, and unreliable at programming beyond a few lines. Runs on phones and older laptops.' },
    { id: 'small', name: 'Small', range: '5–14B', lo: 5, hi: 14, summary: 'An everyday helper.',
      can: 'Chat, summaries, translation between common languages, short pieces of code, drafting emails and documents, simple use of tools.',
      limits: 'Loses track in long, complicated tasks. Facts about rare topics are often wrong, and less common languages are weaker.' },
    { id: 'mid', name: 'Mid-size', range: '15–40B', lo: 15, hi: 40, summary: 'The usual best fit for one good graphics card.',
      can: 'Solid help with programming, reasoning step by step, following long instructions, answering questions about your own documents, and working with tools on its own while you supervise.',
      limits: 'Behind the biggest models on hard maths, research-level questions and very large codebases.' },
    { id: 'large', name: 'Large', range: '50–140B', lo: 50, hi: 140, summary: 'Clearly better knowledge and writing.',
      can: 'More reliable at long multi-step work with tools, harder programming, and staying on task. Roughly comparable to the paid assistants of a year or two ago.',
      limits: 'Needs workstation or server memory. Still behind the newest paid services on the hardest problems.' },
    { id: 'xl', name: 'Very large', range: '150–500B', lo: 150, hi: 500, summary: 'Close to the leading paid services on many tasks.',
      can: 'Complex programming agents, difficult analysis and long documents, with answers that approach those of the best paid services.',
      limits: 'Needs a server with several large graphics cards or hundreds of GB of memory. Only mixture-of-experts designs make this size practical.' },
    { id: 'frontier', name: 'Frontier', range: '500B and up', lo: 500, hi: 3000, summary: 'The largest open models.',
      can: 'The strongest open models available. On many tests they come close to the leading paid services.',
      limits: 'Need a small server cluster or a machine with a terabyte of memory, and they stay slow unless the hardware is very large.' }
  ];

  function synthModel(p, moe) {
    return { id: 'synth', name: 'x', params_total_b: p, params_active_b: moe ? Math.max(1.5, p * 0.07) : p, kv_bytes_per_token_fp16: 40000 * Math.sqrt(p), modalities: [], arch: moe ? 'moe' : 'dense' };
  }
  function maxSize(pred) {
    let lo = 0.1, hi = 6000;
    if (!pred(lo)) return 0;
    if (pred(hi)) return hi;
    for (let i = 0; i < 40; i++) { const mid = Math.sqrt(lo * hi); if (pred(mid)) lo = mid; else hi = mid; }
    return lo;
  }
  function roundSize(p) {
    if (p <= 0) return 0;
    if (p < 10) return Math.round(p * 2) / 2;
    if (p < 100) return Math.round(p / 1) * 1;
    if (p < 1000) return Math.round(p / 10) * 10;
    return Math.round(p / 100) * 100;
  }
  const fmtSize = p => p <= 0 ? '–' : (p >= 1000 ? (Math.round(p / 100) / 10) + 'T' : E.fmtParams(p));

  function guideCompute(machine) {
    const Q4 = E.QUANT_BY_ID.q4;
    const opts = { ctx: S.ctx, users: S.users, kvBits: S.kvBits };
    // A standard model is comfortable when it fits in fast memory and gives at least 8 tokens per second.
    // (An MoE model may spill into RAM and still be comfortable.)
    const okFast = r => r.fit === 'gpu' && r.tps >= 8;
    const okSlow = r => r.fit !== 'no' && r.tps >= 1.5;
    // A small graphics card never makes things worse: what runs well on the processor alone still counts.
    const cpuM = machine.isCpu || machine.unified ? null : E.buildMachine(
      { name: 'cpu', class: 'cpu', memory_gb: S.sim.ram, bandwidth_gbs: S.ramBw, usable_memory_fraction: 0.85 },
      { memoryGB: S.sim.ram, ramGB: S.sim.ram, ramBandwidth: S.ramBw });
    const ev = (p, moe) => {
      const r = E.estimateText(synthModel(p, moe), Q4, machine, opts);
      if (!cpuM || okFast(r)) return r;
      const c = E.estimateText(synthModel(p, moe), Q4, cpuM, opts);
      return okFast(c) ? c : r;
    };
    const fastRaw = maxSize(p => okFast(ev(p, false))), fastMax = roundSize(fastRaw);
    const slowMax = roundSize(maxSize(p => okSlow(ev(p, false))));
    const moeMax = roundSize(maxSize(p => { const r = ev(p, true); return r.fit !== 'no' && r.tps >= 8; }));
    const fastTps = fastRaw > 0 ? ev(fastRaw, false).tps : null;   // speed at the limit itself, before rounding
    const all = D.llm.filter(m => m.kind !== 'embedding').map(m => {
      const o = Object.assign({}, opts, { ctx: Math.min(opts.ctx, m.context_max || opts.ctx) });
      const r = E.bestQuant(m, machine, o); r.opts = o; r.score = scoreText(r); return r;
    });
    const classes = CLASSES.map(c => {
      const lo = ev(c.lo, false), hi = ev(c.hi, false);
      let status = 'no';
      if (okFast(hi)) status = 'all'; else if (okFast(lo)) status = 'part'; else if (okSlow(hi) || okSlow(lo)) status = 'slow';
      const moeHi = ev(c.hi, true);
      // at 4-bit or better, like the size limits above; a 2-bit squeeze would contradict a "Doesn't fit" row
      const examples = all.filter(r => r.fit !== 'no' && r.quant.quality >= 3 && r.model.params_total_b >= c.lo * 0.9 && r.model.params_total_b <= c.hi * 1.1).sort((a, b) => b.score - a.score).slice(0, 3);
      return { c, lo, hi, status, moeHi, examples };
    });
    return { fastMax, fastTps, slowMax, moeMax, classes, machine };
  }

  const STATUS = {
    all: { badge: 'great', label: 'Runs well' },
    part: { badge: 'ok', label: 'Smaller ones run well' },
    slow: { badge: 'slow', label: 'Only slowly' },
    no: { badge: 'no', label: "Doesn't fit" }
  };

  /* =====================================================================
     SHARED PIECES OF THE GUIDED PATH
     ===================================================================== */
  const ctxLine = () => `<p class="ctx-line"><span class="label">Your machine</span><strong>${esc(machineLabel())}</strong><a href="#/">Change</a></p>`;
  const pageHead = (title, sub) => `<div class="page-head"><h1>${title}</h1>${sub || ''}</div>`;
  /* A slider as a RISE range row: label, slider with its value, optional tick marks and hint */
  const rangeField = (o) => `<div class="field"><label for="${o.id}">${o.label}</label>
      <div class="range-row"><input class="range" type="range" id="${o.id}" min="${o.min}" max="${o.max}" step="${o.step || 1}" value="${o.value}"${o.aria ? ` aria-label="${esc(o.aria)}"` : ''}><output id="${o.out}" for="${o.id}">${o.text || ''}</output>
      ${o.ticks ? `<div class="ticks" aria-hidden="true">${o.ticks.map(t => `<span>${t}</span>`).join('')}</div>` : ''}</div>
      ${o.hint != null ? `<span class="hint"${o.hintId ? ` id="${o.hintId}"` : ''}>${o.hint}</span>` : ''}</div>`;

  /* One answer used on step 1 and step 2: the largest standard model that runs at a comfortable speed. */
  function answerOf(g) {
    const noFit = g.fastMax === 0;
    const head = noFit ? g.slowMax : g.fastMax;
    const cls = head > 0 ? (CLASSES.find(c => head >= c.lo * 0.95 && head <= c.hi * 1.05) || CLASSES.filter(c => c.hi <= head).pop() || CLASSES[0]) : null;
    return { noFit, head, cls, tps: noFit ? null : g.fastTps };
  }

  /* =====================================================================
     STEP 1: MACHINE
     ===================================================================== */
  const EXAMPLES = [
    { label: 'Office laptop', sim: { vram: 0, ram: 16, shared: false } },
    { label: 'Gaming laptop', sim: { vram: 8, ram: 16, shared: false } },
    { label: 'Gaming PC', sim: { vram: 16, ram: 32, shared: false } },
    { label: 'MacBook Pro', sim: { vram: 36, ram: 0, shared: true } },
    { label: 'Workstation', sim: { vram: 48, ram: 128, shared: false } },
    { label: 'AI server', sim: { vram: 256, ram: 512, shared: false } }
  ];

  function setSim(patch, keepName) {
    Object.assign(S.sim, patch, keepName ? {} : { name: null, bw: null, tflops: null, count: 1, frac: null });
    S.hwId = null; save();
  }

  function renderMachine() {
    const root = $('#machineBody'), s = S.sim, shared = !!s.shared;
    const vi = nearestIdx(VRAM_STEPS, s.vram), ri = nearestIdx(RAM_STEPS, s.ram), si = nearestIdx(SHARED_STEPS, s.vram);
    root.innerHTML = `
      ${pageHead('What does your computer have?', '<p>Find out which open AI models your computer or server can run.</p>')}
      <div class="machine-grid">
        <div class="machine-inputs">
          ${shared ? rangeField({ id: 'gShared', out: 'gSharedV', label: 'Memory', min: 0, max: SHARED_STEPS.length - 1, value: si, aria: 'Shared memory in GB',
              hint: 'The processor and graphics share this memory. The system keeps part of it, so about two thirds to three quarters can hold a model.' })
          : rangeField({ id: 'gVram', out: 'gVramV', label: 'Graphics card memory', min: 0, max: VRAM_STEPS.length - 1, value: vi, aria: 'Graphics card memory in GB',
              ticks: ['None', '8', '24', '80', '512 GB'], hint: '', hintId: 'gVramHelp' }) +
            rangeField({ id: 'gRam', out: 'gRamV', label: 'Computer memory (RAM)', min: 0, max: RAM_STEPS.length - 1, value: ri, aria: 'System memory in GB',
              ticks: ['4', '16', '64', '256', '2048 GB'], hint: 'Models too big for the graphics card can spill into this, but they run slower.' })}
          <label class="switch"><input type="checkbox" id="gSharedSw" ${shared ? 'checked' : ''}><span>Mac or other computer with shared memory</span></label>
        </div>
        <div class="machine-answer">
          <div id="liveAnswer" aria-live="polite"></div>
          <div class="actions"><a class="btn btn-primary btn-lg" href="#/sizes">See what fits</a></div>
        </div>
      </div>
      <details class="more" id="notSure"><summary>Not sure what you have?</summary><div class="more-body">
        <p class="small" style="margin:0 0 var(--s-3)">Start from a typical example, let your browser guess, or search a list of graphics cards, Macs and servers.</p>
        <div class="chips" id="examples">${EXAMPLES.map((e, i) => `<button class="chip" type="button" data-ex="${i}">${esc(e.label)}</button>`).join('')}</div>
        <div class="row-actions"><button class="btn btn-sm" type="button" id="gDetect">Detect this computer</button><button class="btn btn-sm" type="button" id="gPick">Choose from a list</button></div>
      </div></details>`;
    $$('input[type=range]', root).forEach(paintRange);
    const gv = $('#gVram'); if (gv) gv.addEventListener('input', () => { setSim({ vram: VRAM_STEPS[+gv.value] }); updateMachine(); });
    const gr = $('#gRam'); if (gr) gr.addEventListener('input', () => { setSim({ ram: RAM_STEPS[+gr.value] }); updateMachine(); });
    const gs = $('#gShared'); if (gs) gs.addEventListener('input', () => { setSim({ vram: SHARED_STEPS[+gs.value] }); updateMachine(); });
    $('#gSharedSw').addEventListener('change', e => {
      setSim(e.target.checked ? { shared: true, vram: 32 } : { shared: false, vram: 16, ram: 32 });
      renderMachine();
    });
    $$('[data-ex]', root).forEach(b => b.addEventListener('click', () => {
      const ex = EXAMPLES[+b.dataset.ex];
      setSim(Object.assign({}, ex.sim, ex.sim.shared ? { ram: 0 } : {}));
      renderMachine();
    }));
    $('#gPick').addEventListener('click', openHardware);
    $('#gDetect').addEventListener('click', () => { openHardware(); setTimeout(runDetect, 50); });
    updateMachine();
  }

  const SIZE_TIP = 'B means billions of parameters, the learned values inside a model. More parameters usually means more knowledge and better answers, and a bigger file.';
  function updateMachine() {
    const s = S.sim;
    const set = (id, t) => { const el = $(id); if (el) el.textContent = t; };
    set('#gVramV', s.vram === 0 ? 'None' : s.vram + ' GB'); set('#gRamV', s.ram + ' GB'); set('#gSharedV', s.vram + ' GB');
    set('#gVramHelp', s.vram === 0
      ? 'No dedicated graphics card, or only the one built into the processor. Models run from computer memory, which is slower.'
      : 'The memory on the card itself. Laptops often have 4 to 8 GB, gaming PCs 8 to 32 GB.');
    const a = answerOf(guideCompute(currentMachine()));
    let html;
    if (a.head === 0) html = `<p class="answer-num is-text">Very little fits yet</p><p class="answer-sub">Add memory to run even small models.</p>`;
    else if (a.noFit) html = `<p class="answer-num is-text">Models up to about ${fmtSize(a.head)}, slowly</p><p class="answer-sub">Nothing reaches a comfortable speed on this machine.</p>`;
    else html = `<p class="answer-pre">You can run models up to about</p><p class="answer-num">${fmtSize(a.head)}</p><p class="answer-sub">${a.cls ? esc(a.cls.name) + ' models: ' + esc(a.cls.summary.replace(/\.$/, '').toLowerCase()) : ''}${infoDot(SIZE_TIP)}</p>`;
    $('#liveAnswer').innerHTML = html;
  }

  /* =====================================================================
     STEP 2: SIZES
     ===================================================================== */
  function renderSizes() {
    const root = $('#sizesBody');
    root.innerHTML = `${pageHead('What fits', ctxLine())}
      <div id="sizesResult"></div>
      <details class="more" id="assume"><summary>Change assumptions</summary><div class="more-body" id="assumeBody"></div></details>
      <div class="step-actions"><a class="btn btn-primary btn-lg" href="#/models">Show models that fit</a><a class="btn btn-quiet" href="#/costs">What would it cost?</a></div>`;
    renderAssume();
    updateSizes();
  }

  function renderAssume() {
    const body = $('#assumeBody'); if (!body) return;
    const ci = nearestIdx(CTX_STEPS, S.ctx), ui = nearestIdx(USER_STEPS, S.users);
    const auto = !S.sim.bw;
    const bwNow = Math.round(S.sim.bw || autoBw(S.sim));
    const bwSlider = Math.round(Math.log(bwNow / 20) / Math.log(5000 / 20) * 1000);
    body.innerHTML = `<div class="assume-grid">
      ${rangeField({ id: 'gCtx', out: 'gCtxV', label: 'Context length', min: 0, max: CTX_STEPS.length - 1, value: ci, text: E.fmtCtx(S.ctx),
        hint: 'How much text the model keeps in view at once. 8k is a few pages, 128k a short book.' })}
      ${rangeField({ id: 'gUsers', out: 'gUsersV', label: 'People using it at once', min: 0, max: USER_STEPS.length - 1, value: ui, text: S.users,
        hint: 'Each person needs their own conversation memory.' })}
      ${rangeField({ id: 'gBw', out: 'gBwV', label: 'Memory speed', min: 0, max: 1000, value: bwSlider, text: `${bwNow} GB/s ${auto ? '(estimated)' : ''}`,
        hint: `How fast the chip reads its memory. It sets how quickly text appears. ${auto ? 'Estimated from the memory size; choosing your exact hardware makes it precise.' : '<button class="linkbtn" type="button" id="gBwReset">Back to the estimate</button>'}` })}
    </div>`;
    $$('input[type=range]', body).forEach(paintRange);
    const c = $('#gCtx'), u = $('#gUsers'), b = $('#gBw');
    c.addEventListener('input', () => { S.ctx = CTX_STEPS[+c.value]; $('#gCtxV').textContent = E.fmtCtx(S.ctx); save(); updateSizes(); });
    u.addEventListener('input', () => { S.users = USER_STEPS[+u.value]; $('#gUsersV').textContent = S.users; save(); updateSizes(); });
    b.addEventListener('input', () => { S.sim.bw = Math.round(20 * Math.pow(5000 / 20, +b.value / 1000)); $('#gBwV').textContent = S.sim.bw + ' GB/s'; save(); updateSizes(); });
    b.addEventListener('change', renderAssume);
    const rst = $('#gBwReset'); if (rst) rst.addEventListener('click', () => { S.sim.bw = null; save(); renderAssume(); updateSizes(); });
  }

  function updateSizes() {
    const machine = currentMachine();
    const g = guideCompute(machine);
    const a = answerOf(g);
    const idx = a.cls ? CLASSES.indexOf(a.cls) : 0;
    const row = g.classes[idx];

    let answer;
    if (a.head === 0) answer = `<div class="answer"><p class="answer-pre">With this machine</p><p class="answer-num is-text">Very little fits</p><p class="answer-sub">Even the smallest models are tight here. A shorter context, fewer people at once (under “Change assumptions”) or more memory would help.</p></div>`;
    else if (a.noFit) answer = `<div class="answer"><p class="answer-pre">With this machine you can run</p><p class="answer-num is-text">up to ${fmtSize(a.head)}, slowly</p><p class="answer-sub">Nothing reaches a comfortable speed. Smaller models answer faster; larger ones need more or faster memory.</p></div>`;
    else answer = `<div class="answer"><p class="answer-pre">You can run models up to about</p><p class="answer-num">${fmtSize(a.head)}</p>
        <p class="answer-sub">Answers appear at about ${E.fmtTps(a.tps)} tokens per second, roughly ${wordsPerSec(a.tps)} words per second.${infoDot('A token is a piece of a word. One token is about three quarters of an English word. Figures assume the usual 4-bit setting.')}</p></div>`;

    // What a model of this size can do: one card, not six
    let expect = '';
    if (a.cls && row) {
      const c = a.cls;
      const ex = row.examples.length
        ? `<div class="expect-ex"><p class="label">Models of this size that fit</p><ul class="ex">${row.examples.map(r => `<li><strong>${esc(r.model.name)}</strong> <span class="fine">${E.fmtGB(r.neededGB)} · ${E.fmtTps(r.tps)} tokens/s</span><span class="small" style="display:block">${esc(r.model.good_for || '')}</span></li>`).join('')}</ul></div>` : '';
      expect = `<section class="expect"><div><p class="label">What to expect from ${esc(c.name.toLowerCase())} models (${esc(c.range)})</p>
        <p class="expect-can">${esc(c.can)}</p>
        <p class="expect-limits"><span class="label">Falls short</span>${esc(c.limits)}</p></div>${ex}</section>`;
    }

    const moeNote = g.moeMax > g.fastMax ? `A mixture-of-experts model (many specialist blocks, few used per word) can be larger, up to about ${fmtSize(g.moeMax)}.` : '';
    const compare = `<details class="more"><summary>Compare all sizes</summary><div class="more-body"><div class="rows">${g.classes.map(classRowHtml).join('')}</div>
      <p class="fine" style="margin:14px 0 0">Sizes are in billions of parameters (B), the learned values inside a model. Capability is a rough guide: newer models do more for their size. Assumes the 4-bit setting, ${E.fmtCtx(S.ctx)} tokens of context and ${S.users} ${S.users === 1 ? 'user' : 'users'}. Typical error is about ±30%.</p></div></details>`;

    $("#sizesResult").innerHTML = `${answer}${rulerHtml(g, moeNote)}${expect}${compare}`;
    $$('#sizesResult [data-toggle]').forEach(b => b.addEventListener('click', () => {
      const item = b.closest('.row-item'); const d = $('.detail', item); const open = d.hidden;
      d.hidden = !open; item.classList.toggle('open', open); b.setAttribute('aria-expanded', open);
    }));
  }

  /* Log-scale ruler from 0.5B to 3T parameters. */
  function rulerHtml(g, moeNote) {
    const MIN = 0.5, MAX = 3000, L = Math.log(MAX / MIN);
    const pos = p => Math.max(0, Math.min(100, Math.log(Math.max(p, MIN) / MIN) / L * 100));
    const fast = g.fastMax > 0 ? pos(g.fastMax) : 0;
    const slow = g.slowMax > 0 ? Math.max(fast, pos(g.slowMax)) : fast;
    const moe = g.moeMax > g.fastMax ? pos(g.moeMax) : null;
    const ticks = [1, 4, 14, 40, 140, 500, 2000];
    const bands = CLASSES.map(c => { const a = pos(c.lo === 0.5 ? 0.5 : c.lo), b = pos(Math.min(c.hi, MAX)); return `<span class="rl-band" style="left:${a}%;width:${Math.max(0, b - a)}%"><i>${esc(c.name)}</i></span>`; }).join('');
    return `<figure class="ruler" aria-label="Largest model sizes that fit">
      <div class="rl-bands" aria-hidden="true">${bands}</div>
      <div class="rl-track"><span class="rl-fast" style="width:${fast}%"></span><span class="rl-slow" style="left:${fast}%;width:${Math.max(0, slow - fast)}%"></span>
        ${moe != null ? `<span class="rl-moe" style="left:${moe}%"><b>◆</b></span>` : ''}</div>
      <div class="rl-ticks" aria-hidden="true">${ticks.map(t => `<span style="left:${pos(t)}%">${t >= 1000 ? t / 1000 + 'T' : t + 'B'}</span>`).join('')}</div>
      <ul class="legend"><li><i style="--k:var(--ok-mark)"></i>Runs at a comfortable speed</li>${slow > fast ? '<li><i style="--k:var(--warn-mark)"></i>Fits, but slowly</li>' : ''}${moe != null ? '<li><i class="lg-moe">◆</i>Mixture of experts</li>' : ''}</ul>
      <figcaption>Model sizes from small (left) to huge (right). ${moeNote || ''}</figcaption></figure>`;
  }

  function classRowHtml(row) {
    const c = row.c, st = STATUS[row.status];
    const ref = row.status === 'all' ? row.hi : (row.status === 'part' ? row.lo : (row.status === 'slow' ? (row.hi.fit !== 'no' ? row.hi : row.lo) : null));
    const speed = ref ? `<span class="rh-speed num">${E.fmtTps(ref.tps)} tokens/s</span>` : '';
    const moeLine = row.moeHi.fit !== 'no' && c.hi >= 50
      ? `<p class="small" style="margin:var(--s-3) 0 0">As a mixture-of-experts model of ${fmtSize(c.hi)}, it would run at about ${E.fmtTps(row.moeHi.tps)} tokens per second here.</p>`
      : (c.hi >= 50 && row.status === 'no' ? `<p class="small" style="margin:var(--s-3) 0 0">It does not fit here even as a mixture-of-experts model.</p>` : '');
    const ex = row.examples.length
      ? `<ul class="ex">${row.examples.map(r => `<li><strong>${esc(r.model.name)}</strong> <span class="fine">${E.fmtGB(r.neededGB)} · ${E.fmtTps(r.tps)} tokens/s</span></li>`).join('')}</ul>`
      : `<p class="small">None of the models in our list of this size fits this machine.</p>`;
    return `<div class="row-item" data-cls="${c.id}">
      <button class="row-head" type="button" aria-expanded="false" data-toggle>
        <span class="rh-main"><span class="name">${esc(c.name)} <span class="fine" style="font-weight:400">${esc(c.range)}</span></span><span class="goodfor">${esc(c.summary)}</span></span>
        <span class="rh-side">${statusHtml(row.status, st.label)}${speed}</span>
        <span class="chev" aria-hidden="true">${ui('chevron-down')}</span></button>
      <div class="detail" hidden>
        <div><p class="label">What you can expect</p><p style="margin:0 0 var(--s-2)">${esc(c.can)}</p><p class="label" style="margin-top:var(--s-4)">Where it falls short</p><p style="margin:0">${esc(c.limits)}</p>${moeLine}</div>
        <div><p class="label">Models of this size that fit</p>${ex}</div>
      </div></div>`;
  }

  /* =====================================================================
     STEP 3: MODELS
     ===================================================================== */
  function renderPicker() {
    const body = $('#pickerBody');
    const machine = currentMachine();
    body.innerHTML = `${pageHead('Pick a model', ctxLine())}
      ${modeTabs(MODES.map(m => [m.id, m.label]), S.mode, 'data-mode')}
      <div id="results"></div>`;
    $$('[data-mode]', body).forEach(b => b.addEventListener('click', () => { S.mode = b.dataset.mode; save(); renderPicker(); }));
    if (S.mode === 'text') renderTextResults(machine);
    else if (window.MediaUI) window.MediaUI.render($('#results'), machine, S, { esc, hwById, save, rerender: renderPicker });
    else $('#results').innerHTML = `<div class="empty"><h3>Coming soon</h3></div>`;
  }

  /* Text / Images / Video / Speech: RISE tabs (one view of the results at a time) */
  function modeTabs(list, cur, attr) {
    return `<div class="tabs mode-tabs" role="tablist" aria-label="What do you want to run?">${list.map(([id, label]) => `<button type="button" role="tab" ${attr}="${id}" aria-selected="${(cur || 'text') === id}" tabindex="${(cur || 'text') === id ? 0 : -1}">${label}</button>`).join('')}</div>`;
  }

  function renderTextResults(machine) {
    const root = $('#results');
    const all = evaluateText(machine);
    const fits = all.filter(r => r.fit !== 'no').sort(SORTS.fit);
    const no = all.filter(r => r.fit === 'no').sort((a, b) => b.score - a.score);
    const best = pickBest(fits);
    // suggestions at 4-bit or better first; 2- and 3-bit squeezes only fill up the list
    const rest = fits.filter(r => r !== best);
    const others = rest.filter(r => r.quant.quality >= 3).concat(rest.filter(r => r.quant.quality < 3)).slice(0, 4);
    const sorted = fits.slice().sort(SORTS[S.sort] || SORTS.fit);
    const good = sorted.filter(r => r.verdict.id === 'great'), meh = sorted.filter(r => r.verdict.id !== 'great');

    let html = `<div class="usefor"><label for="goalSel">I want to use it for</label>
      <select class="select" id="goalSel">${GOALS.map(g => `<option value="${g.id}" ${S.goal === g.id ? 'selected' : ''}>${g.label}</option>`).join('')}</select></div>`;

    if (!all.length) {
      html += `<div class="empty"><h3>No models match this</h3><p>Choose “Anything”, or switch off the licence filter under “All models and settings”.</p></div>`;
    } else if (best) {
      html += bestHtml(best, machine);
      if (others.length) html += `<h2 class="sec">Other good options</h2><div class="rows">${others.map((r, i) => rowHtml(r, machine, 'o' + i)).join('')}</div>`;
    } else {
      html += `<div class="empty"><h3>Nothing in the list fits this machine yet</h3><p>The smallest model needs more memory than you have. Open “All models and settings” to see what each one needs.</p></div>`;
    }

    html += `<details class="more" id="allModels" style="margin-top:var(--s-7)" ${S.allOpen ? 'open' : ''}><summary>All models and settings <span class="fine">${fits.length} of ${all.length} fit</span></summary><div class="more-body">
      ${adjustHtml()}
      <div class="sort-row"><label class="field-label" for="sortSel">Sort by</label>
        <select class="select" id="sortSel"><option value="fit" ${S.sort === 'fit' ? 'selected' : ''}>Best for your machine</option><option value="speed" ${S.sort === 'speed' ? 'selected' : ''}>Fastest</option><option value="newest" ${S.sort === 'newest' ? 'selected' : ''}>Newest</option><option value="small" ${S.sort === 'small' ? 'selected' : ''}>Least memory</option></select></div>
      ${good.length ? `<h3 class="sec">Runs well <span class="fine">${good.length}</span></h3><div class="rows">${good.map((r, i) => rowHtml(r, machine, 'g' + i)).join('')}</div>` : ''}
      ${meh.length ? `<h3 class="sec">Usable or slow <span class="fine">${meh.length}</span></h3><div class="rows">${meh.map((r, i) => rowHtml(r, machine, 'm' + i)).join('')}</div>` : ''}
      ${no.length ? `<h3 class="sec">Do not fit <span class="fine">${no.length}</span></h3><div class="rows">${no.map((r, i) => rowHtml(r, machine, 'n' + i)).join('')}</div>` : ''}
    </div></details>
    ${best ? '' : '<div class="step-actions"><a class="btn" href="#/costs">What would it cost?</a></div>'}`;
    root.innerHTML = html;
    bindTextResults(machine, all);
  }

  /* The best pick (list sorted by score): a comfortable speed at 4-bit or better, so the start command,
     which downloads a 4-bit file, also fits. A 2- or 3-bit squeeze is shown only when nothing else is usable. */
  function pickBest(fits) {
    return fits.find(r => r.verdict.rank >= 2 && r.quant.quality >= 3) || fits.find(r => r.verdict.rank >= 2) || fits[0];
  }
  // words per second, without false precision
  const wordsPerSec = t => { const w = E.tokensToWords(t); return w >= 10 ? String(Math.round(w)) : E.fmtTps(w); };

  function adjustHtml() {
    const ci = nearestIdx(CTX_STEPS, S.ctx), ui = nearestIdx(USER_STEPS, S.users);
    return `<div class="assume-grid">
      ${rangeField({ id: 'adjCtx', out: 'adjCtxV', label: 'Context length', min: 0, max: CTX_STEPS.length - 1, value: ci, text: E.fmtCtx(S.ctx),
        hint: 'How much text the model keeps in view at once. 8k is a few pages, 128k a short book.' })}
      ${rangeField({ id: 'adjUsers', out: 'adjUsersV', label: 'People using it at once', min: 0, max: USER_STEPS.length - 1, value: ui, text: S.users,
        hint: 'Each person needs their own conversation memory.' })}
      <div class="field"><span class="field-label" id="adjQl">Quality ceiling</span>
        <div class="segmented segmented-sm" role="group" aria-labelledby="adjQl">${[['q6', 'Balanced'], ['q8', 'Higher'], ['f16', 'Maximum'], ['q4', 'Smaller']].map(([id, l]) => `<button type="button" data-maxq="${id}" aria-pressed="${S.maxQ === id}">${l}</button>`).join('')}</div>
        <span class="hint">We choose the highest quality level that fits, up to this one. Higher quality needs more memory and runs slower.</span></div>
      <div class="field"><label class="switch"><input type="checkbox" id="adjCom" ${S.commercialOnly ? 'checked' : ''}><span>Only models without business restrictions</span></label>
        <span class="hint">Keeps permissive licences such as Apache-2.0 or MIT. Other models may allow business use with conditions such as a revenue limit, so read their licence.</span></div>
    </div>`;
  }

  function sizeLabel(m) {
    if (m.arch === 'moe') return `${E.fmtParams(m.params_total_b)} · ${E.fmtParams(m.params_active_b)} active`;
    return E.fmtParams(m.params_total_b);
  }

  function bestHtml(r, machine) {
    const m = r.model;
    return `<section class="best" aria-label="Best pick for your machine">
      <span class="overline">Best pick for your machine</span>
      <h2 class="best-name">${esc(m.name)}</h2>
      <p class="best-size">${esc(sizeLabel(m))}${m.arch === 'moe' ? ' (mixture of experts)' : ''} · ${esc(m.lab || '')}</p>
      <p class="why">${esc(m.good_for || '')}</p>
      <div class="best-stats">
        <div class="metric"><span class="metric-value num">${E.fmtTps(r.tps)}</span><span class="metric-label">tokens per second, about ${wordsPerSec(r.tps)} words</span></div>
        <div class="metric"><span class="metric-value num">${E.fmtGB(r.neededGB)}</span><span class="metric-label">memory needed</span></div>
        ${statusHtml(r.verdict.id, r.verdict.label)}
      </div>
      <div class="actions">
        ${m.ollama_tag && r.quant.quality >= 3 ? `<button class="btn btn-primary" type="button" data-copy="ollama run ${esc(m.ollama_tag)}">${ui('copy')}Copy start command</button>` : (m.hf_repo ? `<a class="btn btn-primary" target="_blank" rel="noopener" href="https://huggingface.co/${esc(m.hf_repo)}">Open model page</a>` : '')}
        <button class="btn" type="button" data-cost="${esc(m.id)}">What would it cost?</button>
      </div></section>`;
  }

  function rowHtml(r, machine, key) {
    const m = r.model;
    const speed = r.fit === 'no' ? `<span class="rh-speed fine">needs ${E.fmtGB(r.neededGB)}</span>` : `<span class="rh-speed num">${E.fmtTps(r.tps)} tokens/s</span>`;
    return `<div class="row-item" data-key="${key}">
      <button class="row-head" type="button" aria-expanded="false" data-toggle>
        <span class="rh-main"><span class="name">${esc(m.name)}</span>${m.good_for ? `<span class="goodfor">${esc(m.good_for)}</span>` : ''}</span>
        <span class="rh-side">${statusHtml(r.verdict.id, r.verdict.label)}${speed}</span>
        <span class="chev" aria-hidden="true">${ui('chevron-down')}</span>
      </button>
      <div class="detail" hidden>${detailHtml(r, machine)}</div></div>`;
  }

  function detailHtml(r, machine) {
    const m = r.model, mem = r.mem;
    const total = mem.total;
    const cap = Math.max(machine.fastGB + (r.fit === 'offload' ? machine.offloadGB : 0), total);
    const w = v => (v / cap * 100).toFixed(1) + '%';
    const limitPct = (machine.fastGB / cap * 100);
    const ctxNote = r.opts.ctx < S.ctx ? ` (this model supports up to ${E.fmtCtx(m.context_max)})` : '';
    const gpuNote = r.fit === 'offload' ? `<div class="callout is-warn" style="margin:var(--s-4) 0 0"><p>Part of this model sits in computer memory, which is much slower than graphics memory. Mixture-of-experts models cope with this better than dense ones.</p></div>` : '';
    const quant = r.quant;
    const nativeNote = m.native_bits && m.native_bits < quant.bits ? ' This model is released in a compact format already, so higher settings gain little.' : '';
    const tags = [];
    if ((m.modalities || []).includes('image')) tags.push('reads images');
    if (m.thinking && m.thinking !== 'none') tags.push('thinks before answering');
    return `<div>
      <p class="label">Where the memory goes</p>
      <div class="membar-wrap"><div class="membar-limit ${limitPct < 14 ? 'at-start' : ''}" style="left:${limitPct.toFixed(1)}%"><span>${machine.offloadGB > 0 ? 'Graphics memory' : 'Your memory'} ${E.fmtGB(machine.fastGB)}</span></div>
      <div class="membar" role="img" aria-label="Model ${E.fmtGB(mem.weights)}, conversation ${E.fmtGB(mem.kv)}, working space ${E.fmtGB(mem.overhead)}"><div class="seg-w" style="width:${w(mem.weights)}"></div><div class="seg-k" style="width:${w(mem.kv)}"></div><div class="seg-o" style="width:${w(mem.overhead)}"></div></div></div>
      <div class="legend"><span><i class="l-w"></i>Model ${E.fmtGB(mem.weights)}</span><span><i class="l-k"></i>Conversation ${E.fmtGB(mem.kv)}</span><span><i class="l-o"></i>Working space ${E.fmtGB(mem.overhead)}</span></div>
      ${gpuNote}
      <dl class="props">
        <dt>Precision</dt><dd>${esc(quant.label)} (${esc(quant.file)}). ${esc(quant.short)}${nativeNote}</dd>
        <dt>Context</dt><dd>${E.fmtCtx(r.opts.ctx)} tokens${esc(ctxNote)}, ${S.users} ${S.users === 1 ? 'user' : 'users'}</dd>
        ${S.users > 1 && r.speed ? `<dt>All users together</dt><dd>${E.fmtTps(r.speed.total)} tokens/s, ${E.fmtTps(r.tps)} each</dd>` : ''}
      </dl></div>
      <div>
        <dl class="props">
          <dt>Size</dt><dd>${esc(sizeLabel(m))}${m.arch === 'moe' ? ' (mixture of experts)' : ''}${tags.length ? ', ' + esc(tags.join(', ')) : ''}</dd>
          ${m.weak_at ? `<dt>Weaker at</dt><dd>${esc(m.weak_at)}</dd>` : ''}
          <dt>Released</dt><dd>${esc(m.released || '')} by ${esc(m.lab || '')}</dd>
          <dt>Licence</dt><dd>${esc(m.license || '')}${m.license_note ? `<br><span class="fine">${esc(m.license_note)}</span>` : ''}</dd>
          ${m.notes ? `<dt>Good to know</dt><dd>${esc(m.notes)}</dd>` : ''}
        </dl>
        ${m.ollama_tag && (r.quant.quality >= 3 || r.fit === 'no') ? `<div class="cmd"><code>ollama run ${esc(m.ollama_tag)}</code><button class="btn btn-sm" type="button" data-copy="ollama run ${esc(m.ollama_tag)}">Copy</button></div>` : ''}
        <div class="actions">
          <button class="btn btn-sm" type="button" data-cost="${esc(m.id)}">What would it cost?</button>
          ${m.hf_repo ? `<a class="btn btn-quiet btn-sm" target="_blank" rel="noopener" href="https://huggingface.co/${esc(m.hf_repo)}">Model page</a>` : ''}
          ${m.gguf_repo ? `<a class="btn btn-quiet btn-sm" target="_blank" rel="noopener" href="https://huggingface.co/${esc(m.gguf_repo)}">Compact files</a>` : ''}
          <button class="btn btn-quiet btn-sm" type="button" data-calc="${esc(m.id)}">Calculator</button>
        </div>
      </div>`;
  }

  function bindTextResults(machine, all) {
    const root = $('#results');
    const goal = $('#goalSel', root); if (goal) goal.addEventListener('change', () => { S.goal = goal.value; save(); renderPicker(); });
    $$('[data-toggle]', root).forEach(b => b.addEventListener('click', () => {
      const item = b.closest('.row-item'); const d = $('.detail', item); const open = d.hidden;
      d.hidden = !open; item.classList.toggle('open', open); b.setAttribute('aria-expanded', open);
    }));
    const sort = $('#sortSel', root); if (sort) sort.addEventListener('change', () => { S.sort = sort.value; S.allOpen = true; save(); renderPicker(); });
    const rerender = () => { S.allOpen = true; save(); renderPicker(); };
    const c = $('#adjCtx', root); if (c) { c.addEventListener('change', () => { S.ctx = CTX_STEPS[+c.value]; rerender(); }); c.addEventListener('input', () => { $('#adjCtxV').textContent = E.fmtCtx(CTX_STEPS[+c.value]); }); }
    const u = $('#adjUsers', root); if (u) { u.addEventListener('change', () => { S.users = USER_STEPS[+u.value]; rerender(); }); u.addEventListener('input', () => { $('#adjUsersV').textContent = USER_STEPS[+u.value]; }); }
    $$('[data-maxq]', root).forEach(b => b.addEventListener('click', () => { S.maxQ = b.dataset.maxq; rerender(); }));
    const com = $('#adjCom', root); if (com) com.addEventListener('change', () => { S.commercialOnly = com.checked; rerender(); });
    $$('input[type=range]', root).forEach(paintRange);
    $$('[data-copy]', root).forEach(b => b.addEventListener('click', () => copy(b.dataset.copy)));
    $$('[data-calc]', root).forEach(b => b.addEventListener('click', () => openInCalc(b.dataset.calc)));
    $$('[data-cost]', root).forEach(b => b.addEventListener('click', () => openInCosts(b.dataset.cost)));
    const all2 = $('#allModels', root); if (all2) all2.addEventListener('toggle', () => { S.allOpen = all2.open; });
  }

  function openInCosts(id) {
    S.cost = Object.assign({}, S.cost, { modelId: id }); save(); location.hash = '#/costs';
  }

  function paintRange(el) {
    const set = () => el.style.setProperty('--pct', ((el.value - el.min) / (el.max - el.min) * 100) + '%');
    set(); el.addEventListener('input', set);
  }

  function openInCalc(id) {
    const m = D.llm.find(x => x.id === id); if (!m) return;
    const q = 'q4';
    S.calc = Object.assign({}, S.calc, {
      modelId: id, params: m.params_total_b, moe: m.arch === 'moe',
      activePct: Math.round(m.params_active_b / m.params_total_b * 100),
      quant: q, ctx: Math.min(S.ctx, m.context_max || S.ctx), users: S.users, kvBits: S.kvBits, attn: 1
    });
    save(); location.hash = '#/calculator';
  }

  /* =====================================================================
     CALCULATOR VIEW
     ===================================================================== */
  const P_MIN = 0.3, P_MAX = 1500;
  const pToSlider = p => Math.round(Math.log(p / P_MIN) / Math.log(P_MAX / P_MIN) * 1000);
  const sliderToP = s => P_MIN * Math.pow(P_MAX / P_MIN, s / 1000);
  const roundP = p => p < 3 ? Math.round(p * 10) / 10 : p < 30 ? Math.round(p * 2) / 2 : Math.round(p);
  const CTX_MIN = 1024, CTX_MAX = 2 * 1048576;
  const ctxToSlider = c => Math.round(Math.log(c / CTX_MIN) / Math.log(CTX_MAX / CTX_MIN) * 1000);
  const sliderToCtx = s => { const v = CTX_MIN * Math.pow(CTX_MAX / CTX_MIN, s / 1000); const k = [1024, 2048, 4096, 8192, 12288, 16384, 24576, 32768, 49152, 65536, 98304, 131072, 196608, 262144, 393216, 524288, 786432, 1048576, 2097152]; return k.reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a); };
  const USERS_MIN = 1, USERS_MAX = 128;
  const uToSlider = u => Math.round(Math.log(u) / Math.log(USERS_MAX) * 100);
  const sliderToU = s => Math.max(1, Math.round(Math.pow(USERS_MAX, s / 100)));

  function calcModel() {
    const c = S.calc;
    const real = c.modelId ? D.llm.find(m => m.id === c.modelId) : null;
    const total = c.params;
    const active = c.moe ? Math.max(0.1, total * c.activePct / 100) : total;
    const kv = real && c.attn === 1 && Math.abs(real.params_total_b - total) < 1e-6
      ? real.kv_bytes_per_token_fp16
      : 50000 * Math.sqrt(total) * (c.attn || 1);
    return { id: 'calc', name: 'Your model', params_total_b: total, params_active_b: active, kv_bytes_per_token_fp16: kv, modalities: [], arch: c.moe ? 'moe' : 'dense', native_bits: real && Math.abs(real.params_total_b - total) < 1e-6 ? real.native_bits : null, real };
  }

  function calcEstimate() {
    const c = S.calc; const machine = currentMachine();
    const model = calcModel(); const quant = E.QUANT_BY_ID[c.quant];
    const opts = { ctx: c.ctx, users: c.users, kvBits: c.kvBits };
    const r = machine ? E.estimateText(model, quant, machine, opts) : null;
    const mem = E.textMemory(model, quant, c.ctx, c.users, c.kvBits);
    return { model, quant, machine, r, mem, opts };
  }

  function renderCalc() {
    updateChip();
    const root = $('#calcBody');
    const c = S.calc;
    const machine = currentMachine();
    const realOptions = D.llm.filter(m => m.kind !== 'embedding').slice().sort((a, b) => (a.family || '').localeCompare(b.family || '') || a.params_total_b - b.params_total_b);
    root.innerHTML = `
      ${pageHead('Calculator', '<p>Move the sliders to see how model size, precision and context length change the memory you need and the speed you get.</p>')}
      <div class="calc">
        <div class="controls" id="calcControls">
          <div class="field"><label for="cModel">Start from a real model <span class="fine" style="font-weight:400">(optional)</span></label>
            <select class="select" id="cModel"><option value="">Custom size</option>${realOptions.map(m => `<option value="${esc(m.id)}" ${m.id === c.modelId ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></div>

          ${rangeField({ id: 'sParams', out: 'vParams', label: 'Model size', min: 0, max: 1000, value: pToSlider(c.params), ticks: ['0.3B', '3B', '30B', '300B', '1.5T'],
            hint: 'The number of learned values (parameters) in the model, in billions. More parameters usually means a more capable model, and a bigger file.' })}

          <div class="field"><span class="field-label" id="cTypeL">Type</span>
            <div class="segmented segmented-sm" role="group" aria-labelledby="cTypeL"><button type="button" data-moe="0" aria-pressed="${!c.moe}">Dense</button><button type="button" data-moe="1" aria-pressed="${c.moe}">Mixture of experts</button></div>
            <span class="hint" id="hMoe"></span>
            <div id="moeBox" ${c.moe ? '' : 'hidden'} style="margin-top:var(--s-2)">${rangeField({ id: 'sActive', out: 'vActive', label: 'Share used per word', min: 2, max: 60, value: c.activePct })}</div></div>

          <div class="field"><span class="field-label" id="cPrecL">Precision (quantisation)</span>
            <div class="segmented segmented-sm" role="group" aria-labelledby="cPrecL">${E.QUANTS.slice().reverse().map(q => `<button type="button" data-q="${q.id}" aria-pressed="${c.quant === q.id}">${q.label}</button>`).join('')}</div>
            <span class="hint" id="hQuant"></span></div>

          ${rangeField({ id: 'sCtx', out: 'vCtx', label: 'Context length', min: 0, max: 1000, value: ctxToSlider(c.ctx), ticks: ['1k', '8k', '64k', '512k', '2M'],
            hint: 'How much text the model keeps in view at once: your question, any documents and its answer so far. Longer context needs more memory.' })}

          ${rangeField({ id: 'sUsers', out: 'vUsers', label: 'People using it at once', min: 0, max: 100, value: uToSlider(c.users),
            hint: 'Every active conversation keeps its own context in memory. Several people at once share the model itself.' })}

          <details class="more"><summary>More settings</summary><div class="more-body">
            <div class="field"><span class="field-label" id="cKvL">Conversation memory precision</span>
              <div class="segmented segmented-sm" role="group" aria-labelledby="cKvL">${E.KV_BITS.map(k => `<button type="button" data-kv="${k.id}" aria-pressed="${c.kvBits === k.id}">${k.label}</button>`).join('')}</div>
              <span class="hint" id="hKv"></span></div>
            <div class="field"><label for="cAttn">How the model stores its conversation memory</label>
              <select class="select" id="cAttn"><option value="1" ${c.attn === 1 ? 'selected' : ''}>Standard</option><option value="0.25" ${c.attn === 0.25 ? 'selected' : ''}>Compact (some newer designs use about a quarter)</option><option value="0.12" ${c.attn === 0.12 ? 'selected' : ''}>Very compact (hybrid designs)</option></select>
              <span class="hint">Newer models are built to need less memory for long conversations. If you started from a real model, its actual value is used when this is on Standard.</span></div>
          </div></details>
        </div>

        <div class="results" id="calcResults"></div>
      </div>`;
    bindCalc();
    updateCalc();
  }

  function bindCalc() {
    const root = $('#calcBody');
    const c = S.calc;
    const touch = () => { save(); updateCalc(); };
    $('#cModel').addEventListener('change', e => {
      const m = D.llm.find(x => x.id === e.target.value);
      c.modelId = e.target.value;
      if (m) { c.params = m.params_total_b; c.moe = m.arch === 'moe'; c.activePct = Math.max(2, Math.min(60, Math.round(m.params_active_b / m.params_total_b * 100))); c.ctx = Math.min(c.ctx, m.context_max || c.ctx); c.attn = 1; }
      renderCalc(); save();
    });
    const sp = $('#sParams'); sp.addEventListener('input', () => { c.params = roundP(sliderToP(+sp.value)); if (c.modelId) { const m = D.llm.find(x => x.id === c.modelId); if (!m || Math.abs(m.params_total_b - c.params) > 1e-6) { /* keeps model link for kv data only while equal */ } } touch(); });
    $$('[data-moe]', root).forEach(b => b.addEventListener('click', () => { c.moe = b.dataset.moe === '1'; $$('[data-moe]', root).forEach(x => x.setAttribute('aria-pressed', x === b)); $('#moeBox').hidden = !c.moe; touch(); }));
    const sa = $('#sActive'); sa.addEventListener('input', () => { c.activePct = +sa.value; touch(); });
    $$('[data-q]', root).forEach(b => b.addEventListener('click', () => { c.quant = b.dataset.q; $$('[data-q]', root).forEach(x => x.setAttribute('aria-pressed', x === b)); touch(); }));
    const sc = $('#sCtx'); sc.addEventListener('input', () => { c.ctx = sliderToCtx(+sc.value); touch(); });
    const su = $('#sUsers'); su.addEventListener('input', () => { c.users = sliderToU(+su.value); touch(); });
    $$('[data-kv]', root).forEach(b => b.addEventListener('click', () => { c.kvBits = +b.dataset.kv; $$('[data-kv]', root).forEach(x => x.setAttribute('aria-pressed', x === b)); touch(); }));
    $('#cAttn').addEventListener('change', e => { c.attn = +e.target.value; touch(); });
    $$('input[type=range]', root).forEach(paintRange);
  }

  function updateCalc() {
    const c = S.calc;
    const est = calcEstimate();
    const { model, quant, machine, r, mem } = est;
    $('#vParams').textContent = E.fmtParams(c.params) + (c.moe ? ` total · ${E.fmtParams(model.params_active_b)} active` : '');
    $('#vActive').textContent = `${c.activePct}% (${E.fmtParams(model.params_active_b)})`;
    $('#vCtx').textContent = E.fmtCtx(c.ctx) + ' tokens';
    $('#vUsers').textContent = c.users;
    $('#hMoe').textContent = c.moe
      ? 'A mixture-of-experts model holds many specialist blocks but uses only a few for each word. It needs memory for all of them, but runs about as fast as a much smaller model.'
      : 'A dense model uses all of its parameters for every word it writes.';
    $('#hQuant').textContent = quant.short + ' ' + `(${quant.bits} bits per value on average.)`;
    $('#hKv').textContent = (E.KV_BITS.find(k => k.id === c.kvBits) || {}).short || '';

    const res = $('#calcResults');
    const needed = mem.total;
    let verdictHtml, sugg = [];
    const avail = machine ? machine.fastGB : null;
    if (!machine) {
      verdictHtml = `<div class="metric"><span class="metric-value num">${E.fmtGB(needed)}</span><span class="metric-label">memory needed</span></div>
        <p class="small" style="margin:0">Set your hardware to see whether this fits and how fast it would run. <button class="linkbtn" type="button" id="calcSetHw">Choose hardware</button></p>`;
    } else {
      const v = r.verdict;
      // one status: the speed verdict, with its mark and its word
      verdictHtml = `<div class="verdict ${ST_CLS[v.id] || 'is-info'}"><span class="status-mark" aria-hidden="true"></span>
        <h2 class="verdict-title">${r.fit === 'no' ? 'Does not fit' : r.fit === 'offload' ? 'Fits with overflow' : 'Fits'}</h2>
        <p class="verdict-text">${r.fit === 'no' ? 'On' : esc(v.label) + ' on'} ${esc(machineLabel())}</p></div>`;
      sugg = suggestions(est);
    }

    // one plain sentence: what is needed against what the machine has, and how far short it falls
    function memorySentence(need, m, rr) {
      if (!m) return `Memory needed: <span class="num">${E.fmtGB(need)}</span>`;
      if (rr.fit === 'no') return `<span class="num">${E.fmtGB(need)}</span> needed, but this machine has only <span class="num">${E.fmtGB(m.fastGB + m.offloadGB)}</span> to use: <span class="num">${E.fmtGB(rr.shortfallGB)}</span> short.`;
      if (rr.fit === 'offload') return `<span class="num">${E.fmtGB(need)}</span> needed: <span class="num">${E.fmtGB(m.fastGB)}</span> in fast memory and the rest in computer memory.`;
      return `<span class="num">${E.fmtGB(need)}</span> needed, <span class="num">${E.fmtGB(m.fastGB)}</span> available.`;
    }
    const cap = Math.max(needed, avail || 0) * 1.0;
    const pc = x => (x / cap * 100).toFixed(1) + '%';
    const limitPct = avail ? Math.min(100, avail / cap * 100) : null;
    res.innerHTML = `${verdictHtml}
      <div><p class="field-label" style="margin:0">${memorySentence(needed, machine, r)}</p>
      <div class="membar-wrap">${limitPct != null ? `<div class="membar-limit ${limitPct < 14 ? 'at-start' : ''}" style="left:${limitPct.toFixed(1)}%"><span>${machine.offloadGB > 0 ? 'Fast memory' : 'Available'}</span></div>` : ''}
        <div class="membar" role="img" aria-label="Model ${E.fmtGB(mem.weights)}, conversation memory ${E.fmtGB(mem.kv)}, working space ${E.fmtGB(mem.overhead)}"><div class="seg-w" style="width:${pc(mem.weights)}"></div><div class="seg-k" style="width:${pc(mem.kv)}"></div><div class="seg-o" style="width:${pc(mem.overhead)}"></div></div></div>
      <div class="legend"><span><i class="l-w"></i>Model ${E.fmtGB(mem.weights)}</span><span><i class="l-k"></i>Conversation memory ${E.fmtGB(mem.kv)}</span><span><i class="l-o"></i>Working space ${E.fmtGB(mem.overhead)}</span></div></div>
      ${machine && r.speed ? `<div class="metrics"><div class="metric"><span class="metric-value num">${E.fmtTps(r.speed.perUser)}</span><span class="metric-label">tokens per second${c.users > 1 ? ' per user' : ''}<br>≈ ${wordsPerSec(r.speed.perUser)} words per second</span></div>
        ${c.users > 1 ? `<div class="metric"><span class="metric-value num">${E.fmtTps(r.speed.total)}</span><span class="metric-label">tokens per second<br>for all ${c.users} users</span></div>` : (r.speed.ttft4k ? `<div class="metric"><span class="metric-value num">${r.speed.ttft4k < 1 ? '&lt;1' : Math.round(r.speed.ttft4k)}<small>s</small></span><span class="metric-label">to read a 4,000-token prompt</span></div>` : '')}</div>` : ''}
      ${sugg.length ? `<div><p class="field-label" style="margin:0 0 var(--s-2)">${r && r.fit === 'no' ? 'To make it fit' : 'To make it faster'}</p><div class="suggest">${sugg.map((s, i) => `<button class="btn btn-sm" type="button" data-sug="${i}">${esc(s.label)}</button>`).join('')}</div></div>` : ''}
      ${machine && r && r.fit === 'offload' ? `<div class="callout is-warn"><p>Part of the model would sit in system RAM. It works, but is much slower than keeping everything in graphics memory.</p></div>` : ''}
      <p class="fine" style="margin:0">Estimates for a single program such as llama.cpp or Ollama${c.users >= 4 ? ' (for this many users a server program such as vLLM is the better choice)' : ''}. Real results vary by ±30%.</p>`;
    const set = $('#calcSetHw'); if (set) set.addEventListener('click', openHardware);
    $$('[data-sug]', res).forEach(b => b.addEventListener('click', () => { Object.assign(S.calc, sugg[+b.dataset.sug].patch); save(); renderCalc(); }));
  }

  function suggestions(est) {
    const { model, machine, r } = est; const c = S.calc; const out = [];
    const tryIt = (patch, label) => {
      const cc = Object.assign({}, c, patch);
      const q = E.QUANT_BY_ID[cc.quant];
      const rr = E.estimateText(model, q, machine, { ctx: cc.ctx, users: cc.users, kvBits: cc.kvBits });
      return { rr, label, patch };
    };
    const needFit = r.fit === 'no';
    const better = x => needFit ? (x.rr.fit !== 'no') : (x.rr.tps > r.tps * 1.25 && x.rr.fit !== 'no');
    const qi = E.QUANTS.findIndex(q => q.id === c.quant);
    if (qi > 0) { const x = tryIt({ quant: E.QUANTS[qi - 1].id }, `Use ${E.QUANTS[qi - 1].label}`); if (better(x)) out.push(x); }
    if (qi > 1) { const x = tryIt({ quant: 'q4' }, 'Use 4-bit'); if (better(x) && !out.some(o => o.patch.quant === 'q4') && E.QUANTS[qi].bits > 4.85) out.push(x); }
    if (c.ctx > 4096) { const x = tryIt({ ctx: Math.max(2048, c.ctx / 2) }, `Halve the context to ${E.fmtCtx(Math.max(2048, c.ctx / 2))}`); if (better(x)) out.push(x); }
    if (c.kvBits > 8) { const x = tryIt({ kvBits: 8 }, 'Store conversation memory in 8-bit'); if (better(x)) out.push(x); }
    if (c.users > 1) { const x = tryIt({ users: Math.max(1, Math.floor(c.users / 2)) }, `Serve ${Math.max(1, Math.floor(c.users / 2))} users`); if (better(x)) out.push(x); }
    return out.slice(0, 4);
  }

  /* ---------- Boot ---------- */
  // the small "?" marks carry their explanation in the title attribute, which touch screens do not show: tapping one shows it
  document.addEventListener('click', e => {
    const t = e.target.closest && e.target.closest('.info-dot, .tip');
    if (!t) return;
    if (matchMedia('(hover: hover)').matches && window.innerWidth > 640) return;   // pointer screens show the tooltip on hover
    const txt = t.getAttribute('data-tip') || t.getAttribute('title') || t.getAttribute('aria-label');
    if (txt) toast(txt, { timeout: 6000 });
  });
  $('#dataDate').textContent = (D.meta && D.meta.updated) || '';

  /* Start over: clear every saved setting of this app and reload, so all state (Learn demos, dialog) starts fresh */
  const resetGo = $('#resetGo');
  if (resetGo) resetGo.addEventListener('click', () => {
    try { Object.keys(localStorage).filter(k => k.indexOf('local-llm-picker') === 0).forEach(k => localStorage.removeItem(k)); } catch (e) { /* storage can be blocked */ }
    try { sessionStorage.clear(); } catch (e) { /* ignore */ }
    if (location.hash !== '#/') location.hash = '#/';
    location.reload();
  });
  // Let other modules (media view, learn page) reach shared helpers.
  window.PickerApp = { S, save, currentMachine, machineLabel, openHardware, esc, copy, toast, paintRange, hwById, openInCalc, openInCosts, evaluateText, scoreText, pickBest };
  window.dispatchEvent(new Event('picker:ready'));
  // URL switches for screenshots and links: ?view=sizes | models | costs | calculator | learn/memory, ?mode=image, ?open=hardware (nothing is saved)
  const qs = new URLSearchParams(location.search);
  if (qs.get('view') && (!location.hash || location.hash === '#/')) history.replaceState(null, '', '#/' + qs.get('view').replace(/^[#/]+/, ''));
  if (qs.get('mode') && MODES.some(m => m.id === qs.get('mode'))) S.mode = qs.get('mode');
  route();
  if (qs.get('open') === 'hardware') openHardware();
})();
