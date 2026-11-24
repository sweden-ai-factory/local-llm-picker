/* Local LLM Picker: image, video and speech view.
   These models work differently from chat models: no context length, no conversation memory.
   Memory depends on the model files, the text encoder and the picture/clip size.
   Speed is scaled from a measured reference run on a known graphics card. */
(function () {
  'use strict';
  const E = window.Engine;
  const D = window.DATA;

  const KIND_LABEL = { image: 'Image', 'image-edit': 'Image editing', video: 'Video', tts: 'Speech', stt: 'Transcription' };
  const PREC_ORDER = ['fp32', 'bf16', 'fp16','fp8', 'mxfp8', 'int8', 'q8', 'q6', 'q5', 'nvfp4', 'fp4', 'w4a8', 'nf4', 'int4', 'q4', 'q3', 'q2'];
  const PREC_LABEL = { fp32: 'Original (32-bit)', bf16:'Original (16-bit)', fp16: 'Original (16-bit)', fp8: '8-bit (FP8)', mxfp8: '8-bit (FP8)', int8: '8-bit (INT8)', q8: '8-bit (GGUF)', q6: '6-bit (GGUF)', q5: '5-bit (GGUF)', q4: '4-bit (GGUF)', q3: '3-bit (GGUF)', q2: '2-bit (GGUF)', nvfp4: '4-bit (NVFP4)', fp4: '4-bit (FP4)', w4a8: '4-bit (W4A8)', nf4: '4-bit (NF4)', int4: '4-bit (INT4)' };
  const SKIP_PREC = /fp32|mlx|onnx/i;
  const precRank = k => { const i = PREC_ORDER.findIndex(p => k.toLowerCase().includes(p)); return i < 0 ? 99 : i; };
  const precLabel = k => { const i = PREC_ORDER.find(p => k.toLowerCase().includes(p)); return PREC_LABEL[i] || k; };
  const TIER_RANK = { 'frontier-class': 4, strong: 3, efficient: 2, tiny: 1 };

  const IMG_SIZES = [[0.26, '512 × 512'], [0.59, '768 × 768'], [1.05, '1024 × 1024'], [2.36, '1536 × 1536'], [4.19, '2048 × 2048']];
  const VID_RES = [[0.41, '480p (832 × 480)'], [0.92, '720p (1280 × 720)'], [2.07, '1080p (1920 × 1080)']];

  function fmtTime(s) {
    if (s == null || !isFinite(s)) return '–';
    if (s < 1) return '< 1 s';
    if (s < 90) return Math.round(s) + ' s';
    if (s < 5400) return (Math.round(s / 6) / 10).toString() + ' min';
    return (Math.round(s / 360) / 10).toString() + ' h';
  }

  /* Reference run: a known graphics card, or a plain CPU for the small speech models. */
  function refInfo(m, hwList) {
    const r = m.speed_reference || {};
    const hint = r.gpu_id_hint || r.gpu || '';
    if (/cpu|raspberry/i.test(hint)) return { cpu: true };
    const hw = E.matchHardware(hint, hwList);
    return hw ? { hw } : null;
  }

  function perfOf(hw, useBandwidth) {
    // compute-bound work: use fp16 TFLOPs. If unknown, fall back to memory bandwidth, with a penalty for chips that are weak at compute.
    if (hw.fp16_tflops_dense && !useBandwidth) return { v: hw.fp16_tflops_dense, rough: false };
    const perGBs = hw.class === 'unified-memory' ? 0.035 : (hw.class === 'cpu' ? 0.005 : 0.1);
    return { v: Math.max(0.1, (hw.bandwidth_gbs || 100) * perGBs), rough: true };
  }

  function workloadScale(m, w) {
    const t = m.typical_workload || {};
    if (m.kind === 'video') {
      const typ = (t.megapixels || 0.92) * (t.seconds || 5) * (t.fps || 16);
      const cur = w.vidMP * w.vidSec * (t.fps || 16);
      return { mem: cur / typ, time: Math.pow(cur / typ, 1.35) };
    }
    if (m.kind === 'image' || m.kind === 'image-edit') {
      const typ = t.megapixels || 1.05;
      return { mem: w.imgMP / typ, time: Math.pow(w.imgMP / typ, 1.15) };
    }
    return { mem: 1, time: 1 };
  }

  function evaluate(m, machine, w) {
    const sc = workloadScale(m, w);
    const usable = Object.entries(m.weights_gb_by_precision || {}).filter(([k, v]) => v && (!/fp4/i.test(k) || (machine.hw && machine.hw.fp4_support)));
    let precs = usable.filter(([k]) => !SKIP_PREC.test(k));
    if (!precs.length) precs = usable;          // some small speech models ship only one full-precision (fp32) file
    precs.sort((a, b) => precRank(a[0]) - precRank(b[0]));
    if (!precs.length) return null;
    const encByP = m.text_encoder_gb_by_precision ? Object.values(m.text_encoder_gb_by_precision).filter(Boolean).sort((x, y) => y - x) : null;
    const compBase = m.text_encoder_gb != null ? m.text_encoder_gb : (m.components || []).reduce((s, c) => s + (c.params_b || 0) * 2, 0);
    const encOpts = encByP && encByP.length ? encByP : [compBase];
    const resident = m.weights_resident_fraction || 1;
    const actBase = m.activation_gb_at_typical != null ? m.activation_gb_at_typical : (m.kind === 'video' ? 6 : (m.kind === 'tts' || m.kind === 'stt') ? 0.5 : 2);
    const act = actBase * sc.mem;
    const over = 0.8;
    const isSmall = m.kind === 'tts' || m.kind === 'stt';
    const canOff = m.can_offload_text_encoder !== false;

    const tryPrec = ([key, Wfile]) => {
      const W = Wfile * resident;                       // what has to sit in fast memory at one time
      const encMin = encOpts[encOpts.length - 1];
      let fit = 'no', comp = encMin, need = W + encMin + act + over;
      for (const enc of encOpts) {                       // the largest text encoder that still fits
        const full = W + enc + act + over;
        if (full <= machine.fastGB) { fit = 'gpu'; comp = enc; need = full; break; }
      }
      if (fit === 'no') {
        const lean = Math.max(W, encMin) + act + over;
        const ramOk = Wfile + encMin <= machine.fastGB + machine.offloadGB;
        if (!machine.unified && !machine.isCpu && !isSmall && canOff && ramOk && lean <= machine.fastGB) { fit = 'offload'; need = lean; }
        else if (!machine.unified && !machine.isCpu && !isSmall && ramOk && machine.offloadGB > 0 && lean <= machine.fastGB + machine.offloadGB * 0.5) { fit = 'offload'; need = lean; }
        else if (isSmall && machine.isCpu === false && need <= machine.fastGB + machine.offloadGB) { fit = 'offload'; }
      }
      return { key, W: Wfile, full: need, fit, need, comp };
    };
    const tried = precs.map(tryPrec);
    let pick = tried.find(t => t.fit === 'gpu') || tried.find(t => t.fit === 'offload') || tried[tried.length - 1];
    const compGB = pick.comp;

    // speed
    let seconds = null, rough = false, basis = 'none';
    const ref = m.speed_reference || {};
    if (ref.seconds && pick.fit !== 'no') {
      const info = refInfo(m, D.hardware);
      const here = machine.hw;
      if (info && info.cpu) {
        // small speech models run on a plain processor: no graphics card scaling
        seconds = ref.seconds * sc.time; rough = true; basis = 'cpu';
      } else if (info && here) {
        // compare like with like: TFLOPs only when both chips have a figure, otherwise memory bandwidth for both
        const both = !!(info.hw.fp16_tflops_dense && here.fp16_tflops_dense);
        const a = perfOf(info.hw, !both), b = perfOf(here, !both);
        rough = a.rough || b.rough;
        seconds = ref.seconds * (a.v / b.v) * sc.time;
        basis = 'scaled';
        if (/gguf|q[2-8]/i.test(pick.key)) seconds *= 1.15;
        // the reference run may already include the cost of moving data between RAM and the card
        if (ref.offloaded) { if (pick.fit === 'gpu') seconds *= 0.75; } else if (pick.fit === 'offload') seconds *= 1.6;
      }
    }
    const t = m.typical_workload || {};
    let metric = null, verdictId = 'no';
    if (pick.fit !== 'no') {
      if (seconds == null) verdictId = pick.fit === 'gpu' ? 'ok' : 'slow';
      else if (m.kind === 'image' || m.kind === 'image-edit') verdictId = seconds <= 20 ? 'great' : seconds <= 90 ? 'ok' : 'slow';
      else if (m.kind === 'video') verdictId = seconds <= 150 ? 'great' : seconds <= 900 ? 'ok' : 'slow';
      else if (m.kind === 'tts') { const rtf = seconds / (t.audio_seconds || 10); metric = rtf; verdictId = rtf <= 0.6 ? 'great' : rtf <= 2 ? 'ok' : 'slow'; }
      else { const rtf = seconds / (t.audio_seconds || 60); metric = rtf; verdictId = rtf <= 0.1 ? 'great' : rtf <= 0.5 ? 'ok' : 'slow'; }
      if (pick.fit === 'offload' && verdictId === 'great') verdictId = 'ok';
    }
    const labels = { great: 'Runs well', ok: 'Usable', slow: 'Slow', no: "Doesn't fit" };
    return { model: m, pick, fit: pick.fit, need: pick.need, seconds, rough, metric, sc, act, compGB, verdict: { id: verdictId, label: labels[verdictId] }, tried };
  }

  function score(r) {
    const m = r.model;
    const d = new Date(m.released ? m.released + '-01' : '2025-01-01');
    const months = Math.max(0, (new Date('2026-11-19') - d) / (30.4 * 864e5));
    const v = { great: 4, ok: 2, slow: 0, no: -9 }[r.verdict.id];
    return (TIER_RANK[m.tier] || 2) * 10 + v - Math.min(8, months * 0.25) + Math.log2(Math.max(1, m.params_total_b || 1)) * 0.5;
  }

  function render(root, machine, S, H) {
    const esc = H.esc;
    S.imgMP = S.imgMP || 1.05; S.vidMP = S.vidMP || 0.92; S.vidSec = S.vidSec || 5; S.speechKind = S.speechKind || 'tts';
    const mode = S.mode;
    const kinds = mode === 'image' ? ['image', 'image-edit'] : mode === 'video' ? ['video'] : [S.speechKind];
    const w = { imgMP: S.imgMP, vidMP: S.vidMP, vidSec: S.vidSec };
    const list = D.media.filter(m => kinds.includes(m.kind));

    // one quiet line of settings
    let html = '<div class="usefor media-set">';
    if (mode === 'speech') {
      html += `<span class="segmented segmented-sm" role="group" aria-label="Speech task"><button type="button" data-sk="tts" aria-pressed="${S.speechKind === 'tts'}">Text to speech</button><button type="button" data-sk="stt" aria-pressed="${S.speechKind === 'stt'}">Speech to text</button></span>`;
    }
    if (mode === 'image') {
      html += `<label for="mImg">Picture size</label><select class="select" id="mImg">${IMG_SIZES.map(([v, l]) => `<option value="${v}" ${v === S.imgMP ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    }
    if (mode === 'video') {
      html += `<label for="mVres">Resolution</label><select class="select" id="mVres">${VID_RES.map(([v, l]) => `<option value="${v}" ${v === S.vidMP ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <label for="mVsec">Length</label><input class="range" type="range" id="mVsec" min="2" max="20" step="1" value="${S.vidSec}" aria-label="Clip length in seconds"><output class="val" id="mVsecV" for="mVsec">${S.vidSec} s</output>`;
    }
    html += '</div>';

    if (!list.length) {
      html += `<div class="empty"><h3>No models in this category yet</h3></div>`;
      root.innerHTML = html; bind(); return;
    }

    const res = list.map(m => evaluate(m, machine, w)).filter(Boolean);
    res.forEach(r => { r.score = score(r); });
    const fits = res.filter(r => r.fit !== 'no').sort((a, b) => b.score - a.score);
    const no = res.filter(r => r.fit === 'no').sort((a, b) => b.score - a.score);
    const good = fits.filter(r => r.verdict.id === 'great'), meh = fits.filter(r => r.verdict.id !== 'great');
    // Suggestions leave out models that may not be used in the EU at all; they stay in "All models" with their licence note.
    const regionBan = r => /not licensed|no rights/i.test(r.model.license_note || '') && /\bEU\b/.test(r.model.license_note || '');
    const pool = fits.filter(r => !regionBan(r));
    const best = pool.find(r => r.verdict.id !== 'slow' && r.seconds != null) || pool.find(r => r.verdict.id !== 'slow') || pool[0] || fits[0];
    const others = pool.filter(r => r !== best).slice(0, 4);

    if (best) {
      html += bestHtml(best, esc);
      if (others.length) html += `<h2 class="sec">Other good options</h2><div class="rows">${others.map(r => rowHtml(r, machine, esc)).join('')}</div>`;
    } else html += `<div class="empty"><h3>Nothing here fits this machine yet</h3><p>Open “All models” to see what each one needs.</p></div>`;

    html += `<details class="more" style="margin-top:var(--s-7)"><summary>All models <span class="fine">${fits.length} of ${res.length} fit</span></summary><div class="more-body">
      ${good.length ? `<h3 class="sec" style="margin-top:var(--s-2)">Runs well <span class="fine">${good.length}</span></h3><div class="rows">${good.map(r => rowHtml(r, machine, esc)).join('')}</div>` : ''}
      ${meh.length ? `<h3 class="sec">Usable or slow <span class="fine">${meh.length}</span></h3><div class="rows">${meh.map(r => rowHtml(r, machine, esc)).join('')}</div>` : ''}
      ${no.length ? `<h3 class="sec">Do not fit <span class="fine">${no.length}</span></h3><div class="rows">${no.map(r => rowHtml(r, machine, esc)).join('')}</div>` : ''}
      <p class="fine" style="margin-top:var(--s-5)">Speeds are scaled from a measured run on another graphics card and can be off by a factor of two. Video and large images are the least predictable.</p></div></details>`;
    root.innerHTML = html;
    bind();

    function bind() {
      root.querySelectorAll('[data-sk]').forEach(b => b.addEventListener('click', () => { S.speechKind = b.dataset.sk; H.save(); H.rerender(); }));
      const mi = root.querySelector('#mImg'); if (mi) mi.addEventListener('change', () => { S.imgMP = +mi.value; H.save(); H.rerender(); });
      const mv = root.querySelector('#mVres'); if (mv) mv.addEventListener('change', () => { S.vidMP = +mv.value; H.save(); H.rerender(); });
      const ms = root.querySelector('#mVsec');
      if (ms) { window.PickerApp && window.PickerApp.paintRange(ms); ms.addEventListener('input', () => { root.querySelector('#mVsecV').textContent = ms.value + ' s'; }); ms.addEventListener('change', () => { S.vidSec = +ms.value; H.save(); H.rerender(); }); }
      root.querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', () => {
        const item = b.closest('.row-item'); const d = item.querySelector('.detail'); const open = d.hidden;
        d.hidden = !open; item.classList.toggle('open', open); b.setAttribute('aria-expanded', open);
      }));
      root.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', () => window.PickerApp.copy(b.dataset.copy)));
    }
  }

  function timeLabel(r) {
    const m = r.model;
    if (r.seconds == null) return { big: '–', small: 'speed unknown' };
    if (m.kind === 'tts') return { big: fmtTime(r.seconds / ((m.typical_workload || {}).audio_seconds || 10) * 60), small: 'per minute of speech' };
    if (m.kind === 'stt') return { big: fmtTime(r.seconds / ((m.typical_workload || {}).audio_seconds || 60) * 3600), small: 'per hour of audio' };
    if (m.kind === 'video') return { big: fmtTime(r.seconds), small: 'per clip' };
    return { big: fmtTime(r.seconds), small: 'per picture' };
  }

  // also flag region bans ("Not licensed in the EU ...") and revenue caps, which matter to most readers here
  // permissive licences (Apache, MIT, BSD, OpenMDW) have no business limits; anything else gets the tag, and so does any note that says a region or use is excluded
  const restricted = m => !/^(apache|mit|bsd|openmdw|cc0)/i.test(m.license || '') || /not licensed|no rights/i.test(m.license_note || '');

  /* status: shape + word + colour (RISE .status) */
  const ST_CLS = { great: 'is-ok', ok: 'is-warn', slow: 'is-warn', no: 'is-bad' };
  const st = v => `<span class="status ${ST_CLS[v.id] || 'is-info'}">${String(v.label).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))}</span>`;

  function bestHtml(r, esc) {
    const m = r.model; const t = timeLabel(r);
    return `<section class="best" aria-label="Best pick for your machine">
      <span class="overline">Best pick for your machine</span><h2 class="best-name">${esc(m.name)}</h2>
      <p class="best-size">${esc(KIND_LABEL[m.kind] || m.kind)} · ${esc(m.lab || '')}${restricted(m) ? ` · Licence limits business use (${esc(m.license || '')})` : ''}</p>
      <p class="why">${esc(m.good_for || '')}</p>
      <div class="best-stats">
        <div class="metric"><span class="metric-value num">${esc(t.big)}</span><span class="metric-label">${esc(t.small)}${r.rough ? ', rough estimate' : ''}</span></div>
        <div class="metric"><span class="metric-value num">${E.fmtGB(r.need)}</span><span class="metric-label">memory needed</span></div>
        ${st(r.verdict)}
      </div>
      ${m.hf_repo ? `<div class="actions"><a class="btn btn-primary" target="_blank" rel="noopener" href="https://huggingface.co/${esc(m.hf_repo)}">Open model page</a></div>` : ''}</section>`;
  }

  function rowHtml(r, machine, esc) {
    const m = r.model; const t = timeLabel(r);
    const cap = machine.fastGB + (r.fit === 'offload' ? machine.offloadGB : 0);
    const pct = Math.min(100, r.need / Math.max(cap, .1) * 100);
    const comm = restricted(m);
    const side = r.fit === 'no' ? '<span class="rh-speed fine">needs more memory</span>' : `<span class="rh-speed num">${esc(t.big)} ${esc(t.small)}</span>`;
    return `<div class="row-item"><button class="row-head" type="button" aria-expanded="false" data-toggle>
      <span class="rh-main"><span class="name">${esc(m.name)}</span>${m.good_for ? `<span class="goodfor">${esc(m.good_for)}</span>` : ''}</span>
      <span class="rh-side">${st(r.verdict)}${side}</span>
      <span class="chev" aria-hidden="true">${window.RISE ? RISE.ui('chevron-down') : ''}</span></button>
      <div class="detail" hidden>
        <div><dl class="props">
          <dt>Memory</dt><dd>${r.fit === 'no' ? `${E.fmtGB(r.need)} needed, but this machine has only ${E.fmtGB(cap)}` : `${E.fmtGB(r.need)} needed, ${E.fmtGB(cap)} available`} · ${esc(precLabel(r.pick.key))}: ${E.fmtGB(r.pick.W)} of model files${r.compGB ? ` plus ${E.fmtGB(r.compGB)} for the text encoder` : ''}</dd>
          ${m.weak_at ? `<dt>Weaker at</dt><dd>${esc(m.weak_at)}</dd>` : ''}
          <dt>Can make</dt><dd>${esc(m.output_limits || '')}</dd>
          ${m.speed_reference && m.speed_reference.value ? `<dt>Reported speed</dt><dd>${esc(m.speed_reference.value)}${m.speed_reference.source ? ` <a href="${esc(m.speed_reference.source)}" target="_blank" rel="noopener">source</a>` : ''}</dd>` : ''}
          ${m.speed_scaling ? `<dt>How time grows</dt><dd>${esc(m.speed_scaling)}</dd>` : ''}
        </dl></div>
        <div><dl class="props">
          <dt>Licence</dt><dd>${esc(m.license || '')}${comm ? ' <span class="pill is-warn">Check licence</span>' : ''}${m.license_note ? `<br><span class="fine">${esc(m.license_note)}</span>` : ''}</dd>
          ${(m.tools || []).length ? `<dt>Runs in</dt><dd>${esc(m.tools.join(', '))}</dd>` : ''}
          ${m.notes ? `<dt>Good to know</dt><dd>${esc(m.notes)}</dd>` : ''}
        </dl>
        ${m.hf_repo ? `<div class="actions"><a class="btn btn-sm" target="_blank" rel="noopener" href="https://huggingface.co/${esc(m.hf_repo)}">Model page</a></div>` : ''}</div>
      </div></div>`;
  }

  window.MediaUI = { render, evaluate, score };
  // the router ran before this script was loaded: draw the models page again if it opened in a media mode
  if ((location.hash || '').startsWith('#/models') && window.PickerApp && window.PickerApp.S.mode !== 'text') window.dispatchEvent(new Event('hashchange'));
})();
