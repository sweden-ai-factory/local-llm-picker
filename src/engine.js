/* Local LLM Picker: estimation engine.
   Pure functions, no DOM. Works in the browser and in Node (for tests).
   All results are estimates. The rules used are described in the comments. */
(function (root) {
  'use strict';

  /* ---------- Quantisation levels (text models) ----------
     bits = average bits per weight including the small scale tables that GGUF
     "K-quants" store next to the weights. */
  const QUANTS = [
    { id: 'q2',  label: '2-bit',  file: 'Q2_K',   bits: 2.7,  quality: 1, short: 'Large quality loss. Only worth it for very big models when nothing else fits.' },
    { id: 'q3',  label: '3-bit',  file: 'Q3_K_M', bits: 3.9,  quality: 2, short: 'Visible quality loss. A fallback when 4-bit does not fit.' },
    { id: 'q4',  label: '4-bit',  file: 'Q4_K_M', bits: 4.85, quality: 3, short: 'The usual default. Small quality loss, about a third of the original size.' },
    { id: 'q5',  label: '5-bit',  file: 'Q5_K_M', bits: 5.7,  quality: 4, short: 'Very close to the original for most uses.' },
    { id: 'q6',  label: '6-bit',  file: 'Q6_K',   bits: 6.6,  quality: 5, short: 'Hard to tell apart from the original in daily use.' },
    { id: 'q8',  label: '8-bit',  file: 'Q8_0',   bits: 8.5,  quality: 6, short: 'Practically the original, at about half its size.' },
    { id: 'f16', label: '16-bit', file: 'BF16',   bits: 16,   quality: 7, short: 'The original precision. Used for training and for servers with plenty of memory.' }
  ];
  const QUANT_BY_ID = Object.fromEntries(QUANTS.map(q => [q.id, q]));

  const KV_BITS = [
    { id: 16, label: '16-bit', short: 'Original precision.' },
    { id: 8,  label: '8-bit',  short: 'Half the memory for the conversation, almost no visible loss.' },
    { id: 4,  label: '4-bit',  short: 'A quarter of the memory, small loss on long documents.' }
  ];

  const GB = 1e9;
  const GIB = 1.073741824;   // memory sizes on spec sheets ("24 GB") are binary gigabytes; model files are counted in decimal bytes
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

  /* ---------- Machine ----------
     Turns a hardware entry plus the user's choices into the numbers the
     calculation needs. */
  function buildMachine(hw, o) {
    o = o || {};
    const count = Math.max(1, o.count || 1);
    const memEach = o.memoryGB || hw.memory_gb;
    let frac = hw.usable_memory_fraction == null ? 1 : hw.usable_memory_fraction;
    if (String(hw.class).startsWith('gpu') && frac >= 1) frac = 0.95;   // the display and driver keep a little graphics memory
    const unified = hw.class === 'unified-memory';
    const isCpu = hw.class === 'cpu';
    const ramGB = o.ramGB == null ? 32 : o.ramGB;
    const ramBw = o.ramBandwidth || 80;               // GB/s on the spec sheet, typical dual-channel DDR5
    let fastGB, offloadGB, bw;
    const total = o.memoryIsTotal ? memEach : memEach * count;     // memoryGB can already be the sum over all cards
    if (unified || isCpu) {
      fastGB = total * frac;
      offloadGB = 0;
      bw = hw.bandwidth_gbs;
    } else {
      fastGB = total * frac * (count > 1 ? 0.96 : 1);   // a little lost per extra card
      // Same share of RAM as a processor-only machine gets (0.85), minus 1 GB of buffers for the card,
      // so adding a small graphics card never leaves less room than running on the processor alone.
      offloadGB = Math.max(0, ramGB * 0.85 - 1);
      bw = hw.bandwidth_gbs;
    }
    return {
      name: hw.name, hw, count, unified, isCpu,
      memoryEachGB: total / count, totalMemoryGB: total,
      fastGB, offloadGB, ramBw, bw,
      tflops: hw.fp16_tflops_dense == null ? null : hw.fp16_tflops_dense * count,
      /* Calibration against llama.cpp's llama-bench (Llama 2 7B at Q4_0, 77 machines with
         published results): time per token = bytes read / (spec-sheet bandwidth x eff) + a fixed
         cost per token (stepS). Graphics cards: about 75% of their bandwidth plus 1 ms.
         Macs and other shared-memory chips: about 80% plus 2 ms. These put the estimate about
         10% below llama-bench, which is close to what Ollama and longer chats give.
         Processors are not in that benchmark set: 50% of the theoretical RAM bandwidth matches
         reported desktop results. */
      eff: (isCpu ? CPU_RAM_EFF : (unified ? 0.8 : 0.75)) * (hw.eff_scale || 1),   // eff_scale: per-chip correction from measured benchmarks
      stepS: isCpu || unified ? 0.002 : 0.001
    };
  }
  // Share of the theoretical RAM bandwidth the processor reaches, for CPU-only runs and for
  // the part of a model that spills from the graphics card into system RAM.
  const CPU_RAM_EFF = 0.5;

  /* ---------- Text models ---------- */

  function kvPerTokenBytes(model) {
    return model.kv_bytes_per_token_fp16 || 0;
  }

  /* Some models are released already compressed (8-bit or 4-bit files). Asking for
     more bits than that gives nothing, so the original file size is the ceiling. */
  function effectiveBits(model, q) {
    return model.native_bits ? Math.min(q.bits, model.native_bits) : q.bits;
  }
  /* The quantisation to show: for compressed releases, "Original" instead of a higher setting. */
  function displayQuant(model, q) {
    if (model.native_bits && q.bits > model.native_bits + 0.05) {
      const n = Math.round(model.native_bits * 10) / 10;
      return { id: 'native', label: 'Original (' + (Math.abs(n - 8.2) < 0.5 ? '8-bit' : Math.abs(n - 4.6) < 0.6 ? '4-bit' : Math.abs(n - 2.7) < 0.5 ? '2-bit' : 'about ' + Math.round(n) + '-bit') + ')', file: 'as released', bits: model.native_bits, quality: Math.min(q.quality, n >= 8 ? 6 : n >= 5.5 ? 4.5 : n >= 4 ? 3.5 : 1.5), short: 'The files as the lab released them. They are already compressed, so a higher setting would not add quality.' };
    }
    return q;
  }

  /* Memory needed, in GB, for a text model. */
  function textMemory(model, q, ctx, users, kvBits) {
    const bits = effectiveBits(model, q);
    const weights = (model.params_resident_b || model.params_total_b) * bits / 8 / GIB;
    const kv = kvPerTokenBytes(model) * (kvBits / 16) * ctx * users / (GB * GIB);
    const vision = (model.modalities || []).includes('image') ? 1.0 : 0;
    const overhead = 1.0 + 0.03 * weights + vision;
    return { weights, kv, overhead, total: weights + kv + overhead, bits };
  }

  /* Speed in tokens per second for one user, and the total for all users.
     Generating text is limited by how fast the memory can be read, because
     every new token needs the model's active weights streamed through the chip once.
     For several users at once the weights are read once per step and shared;
     on MoE models more different experts get touched as the number of users grows. */
  function textSpeed(model, mem, machine, ctx, users, kvBits, tierInfo) {
    // Share of the weights in memory that one token reads. mem.weights counts only the resident
    // parameters, so compare against those (models like Gemma E2B keep a lookup table elsewhere).
    const resident = model.params_resident_b || model.params_total_b;
    const activeFrac = clamp(model.params_active_b / resident, 0.0001, 1);
    const touched = activeFrac >= 1 ? 1 : 1 - Math.pow(1 - activeFrac, users);
    const weightsReadGB = mem.weights * touched * GIB;   // back to decimal GB: speed is bytes per second
    const kvReadGB = users * kvPerTokenBytes(model) * (kvBits / 16) * ctx * 0.5 / GB;   // half-full on average

    // how many weights live in fast memory vs system RAM
    const gpuWeights = tierInfo.weightsFast;
    const ramWeights = Math.max(0, mem.weights - gpuWeights);
    const gFrac = mem.weights > 0 ? gpuWeights / mem.weights : 1;

    // multi-card boost only when a server engine splits the work (tensor parallel)
    let bw = machine.bw;
    if (machine.count > 1 && !machine.unified) {
      bw = bw * (users >= 4 ? 1 + 0.65 * (machine.count - 1) : 1);
    }
    const tFast = ((weightsReadGB * gFrac) + kvReadGB) / (bw * machine.eff);
    const tRam = (weightsReadGB * (1 - gFrac)) / (machine.ramBw * CPU_RAM_EFF);
    // Every step has a fixed cost that does not depend on model size (launching work on the chip).
    // Routing in MoE models adds about twice as much again (graphics card 1 + 2 ms, Mac 2 + 4 ms);
    // reported MoE speeds on Macs fall further behind graphics cards than dense ones do.
    const fixedS = machine.stepS == null ? 0.001 : machine.stepS;
    let step = tFast + tRam + fixedS * (activeFrac < 1 ? 3 : 1);

    // compute limit (matters with many users or slow chips)
    if (machine.tflops && ramWeights === 0) {
      const flops = 2 * model.params_active_b * 1e9 * users;
      step = Math.max(step, flops / (machine.tflops * 1e12 * 0.35));
    }
    const perUser = 1 / step;
    let ttft4k = null;           // seconds to read a 4,000-token prompt
    if (machine.tflops) {
      ttft4k = (2 * model.params_active_b * 1e9 * 4000) / (machine.tflops * 1e12 * 0.4);
    }
    return { perUser, total: perUser * users, ttft4k };
  }

  /* Plain-language verdict. */
  function verdictFor(fit, tps) {
    if (fit === 'no') return { id: 'no', label: "Doesn't fit", rank: 0 };
    if (tps >= 15) return { id: 'great', label: fit === 'gpu' ? 'Runs well' : 'Runs well (uses system RAM)', rank: 3 };
    if (tps >= 6) return { id: 'ok', label: 'Usable', rank: 2 };
    return { id: 'slow', label: 'Slow', rank: 1 };
  }

  /* Full estimate for one model at one quantisation. */
  function estimateText(model, quant, machine, opts) {
    const ctx = opts.ctx, users = opts.users, kvBits = opts.kvBits;
    const mem = textMemory(model, quant, ctx, users, kvBits);
    const nonWeights = mem.kv + mem.overhead;
    let fit, weightsFast;
    if (mem.total <= machine.fastGB) {
      fit = 'gpu'; weightsFast = mem.weights;
    } else if (machine.offloadGB > 0 && mem.total <= machine.fastGB + machine.offloadGB) {
      fit = 'offload';
      weightsFast = Math.max(0, machine.fastGB - nonWeights);
    } else {
      fit = 'no'; weightsFast = Math.max(0, machine.fastGB - nonWeights);
    }
    let speed = null;
    if (fit !== 'no') speed = textSpeed(model, mem, machine, ctx, users, kvBits, { weightsFast });
    const tps = speed ? speed.perUser : 0;
    return {
      model, quant: displayQuant(model, quant), mem, fit, speed, tps,
      verdict: verdictFor(fit, tps),
      neededGB: mem.total,
      shortfallGB: fit === 'no' ? mem.total - (machine.fastGB + machine.offloadGB) : 0
    };
  }

  /* Pick the quantisation to show for a model on a machine: the best quality
     that fits entirely in fast memory (from 6-bit down to 3-bit). If none of
     them fits, look for one that fits with system RAM. If still none, return
     the smallest one so the shortfall can be shown. */
  const AUTO_ORDER = ['f16', 'q8', 'q6', 'q5', 'q4', 'q3', 'q2'];
  function bestQuant(model, machine, opts) {
    const cap = opts.maxQuality || 'q6';
    const order = AUTO_ORDER.slice(AUTO_ORDER.indexOf(cap));
    const tried = order.map(id => estimateText(model, QUANT_BY_ID[id], machine, opts));
    let pick = tried.find(r => r.fit === 'gpu' && r.quant.id !== 'q2');
    if (!pick) pick = tried.find(r => r.fit === 'gpu');
    if (!pick) pick = tried.filter(r => r.fit === 'offload' && r.quant.quality >= 3)[0] || tried.find(r => r.fit === 'offload');
    if (!pick) pick = tried[tried.length - 1];
    return pick;
  }

  /* ---------- Hardware detection helpers ---------- */
  const BRAND_WORDS = new Set(['nvidia', 'geforce', 'amd', 'radeon', 'apple', 'intel', 'graphics', 'gpu', 'direct3d11', 'vs_5_0', 'ps_5_0', 'd3d11', 'angle', 'unspecified', 'version', 'metal', 'renderer', 'opengl', 'engine', 'series', 'ryzen', 'ai', 'core']);
  function tokens(s) {
    return String(s).toLowerCase().replace(/\(tm\)|\(r\)|®|™/g, ' ').replace(/[^a-z0-9.+ ]+/g, ' ')
      .split(/\s+/).filter(t => t && !BRAND_WORDS.has(t));
  }
  /* Find the entry in the list that best matches a GPU name string reported by the browser. */
  function matchHardware(rendererString, list) {
    const rt = new Set(tokens(rendererString));
    if (!rt.size) return null;
    const rl = rt.has('laptop');
    let best = null, bestScore = -99;
    for (const h of list) {
      // compare on the core name: drop bracketed details and memory sizes, which a browser does not report
      const clean = String(h.name).replace(/\([^)]*\)/g, ' ').replace(/\b\d+\s*gb\b/gi, ' ');
      const ht = tokens(clean).filter(t => t !== 'laptop');
      const hl = String(h.class).startsWith('gpu') && (h.form === 'laptop' || /laptop/i.test(h.name));
      if (!ht.length || !ht.some(t => /\d/.test(t))) continue;
      if (hl && !rl) continue;                                   // a laptop entry needs "Laptop" in the reported name
      if (!ht.every(t => rt.has(t))) continue;
      let score = ht.length + (hl === rl ? 2 : -3);              // laptop with laptop, desktop with desktop
      if (ht.length === rt.size - (rl ? 1 : 0)) score += 2;
      if (score > bestScore) { bestScore = score; best = h; }
    }
    return best;
  }

  /* ---------- Formatting ---------- */
  function fmtGB(x) {
    if (x == null || !isFinite(x)) return '–';
    if (x >= 100) return Math.round(x) + ' GB';
    if (x >= 10) return (Math.round(x * 10) / 10).toString().replace(/\.0$/, '') + ' GB';
    return (Math.round(x * 10) / 10).toFixed(1) + ' GB';
  }
  function fmtParams(b) {
    if (b == null) return '–';
    if (b >= 100) return Math.round(b) + 'B';
    if (b >= 10) return (Math.round(b * 10) / 10).toString().replace(/\.0$/, '') + 'B';
    return (Math.round(b * 100) / 100).toString() + 'B';
  }
  function fmtCtx(n) {
    if (n >= 1e6) return (Math.round(n / 1048576 * 10) / 10).toString() + 'M';   // 1,048,576 tokens is called "1M"
    if (n >= 1024) return Math.round(n / 1024) + 'k';
    return String(n);
  }
  function fmtTps(t) {
    if (!isFinite(t) || t <= 0) return '–';
    if (t >= 100) return Math.round(t) + '';
    if (t >= 10) return (Math.round(t * 10) / 10).toString().replace(/\.0$/, '');
    return (Math.round(t * 10) / 10).toFixed(1);
  }
  // One token is about three quarters of an English word.
  const tokensToWords = t => t * 0.75;

  const api = {
    QUANTS, QUANT_BY_ID, KV_BITS, AUTO_ORDER,
    buildMachine, textMemory, textSpeed, estimateText, bestQuant, verdictFor,
    matchHardware, tokens,
    fmtGB, fmtParams, fmtCtx, fmtTps, tokensToWords, clamp
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Engine = api;
})(typeof window !== 'undefined' ? window : globalThis);
