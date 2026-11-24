/* Local LLM Picker: Costs page (step 4).
   Compares buying and running hardware, a hosted API for the same open model, renting a GPU by the hour,
   and paid closed assistants as a reference. Needs window.DATA.pricing (data/pricing.json). */
(function () {
  'use strict';
  const E = window.Engine;
  const D = window.DATA;
  const P = D.pricing;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  /* ---------- Who uses it, and how ---------- */
  const WHO = [
    { id: 'me', label: 'Just me', users: 1, days: 22, power: 'household' },
    { id: 'team', label: 'A small team', users: 10, days: 22, power: 'business' },
    { id: 'company', label: 'A company', users: 100, days: 22, power: 'business' }
  ];
  const FALLBACK_PROFILES = [
    { id: 'occasional', label: 'A few questions a day', requests_per_user_day: 8, input_tokens: 600, output_tokens: 400 },
    { id: 'daily', label: 'A daily helper', requests_per_user_day: 40, input_tokens: 1500, output_tokens: 600 },
    { id: 'coding', label: 'Heavy coding assistant', requests_per_user_day: 120, input_tokens: 8000, output_tokens: 800 },
    { id: 'documents', label: 'Reading and summarising documents', requests_per_user_day: 25, input_tokens: 15000, output_tokens: 800 }
  ];
  const profiles = () => (P && P.usage_profiles && P.usage_profiles.length ? P.usage_profiles : FALLBACK_PROFILES);
  const CURRENCIES = ['EUR', 'SEK', 'USD'];
  const SYMBOL = { EUR: '€', SEK: 'kr', USD: '$' };

  /* ---------- Settings (kept inside the app state) ---------- */
  const COST_DEFAULTS = { modelId: null, who: 'me', how: 'daily', users: null, currency: 'EUR', years: 3, hours: 'auto', owned: false, region: 'Sweden', admin: 0 };
  function cfg(S) {
    // always the same object, so handlers created earlier keep working
    if (!S.cost) S.cost = {};
    for (const k of Object.keys(COST_DEFAULTS)) if (S.cost[k] === undefined) S.cost[k] = COST_DEFAULTS[k];
    return S.cost;
  }

  /* ---------- Money ---------- */
  const fxOf = c => (P && P.fx && P.fx[c]) || ({ USD: 1, EUR: 0.86, SEK: 9.5 }[c]);
  function money(usd, c, opts) {
    if (usd == null || !isFinite(usd)) return '–';
    const v = usd * fxOf(c);
    const abs = Math.abs(v);
    const dec = abs < 10 && !(opts && opts.whole) ? 2 : 0;
    const n = new Intl.NumberFormat('en-GB', { maximumFractionDigits: dec, minimumFractionDigits: dec }).format(Math.round(v * Math.pow(10, dec)) / Math.pow(10, dec));
    return c === 'SEK' ? n + ' kr' : SYMBOL[c] + n;
  }
  /* Token counts in words: 286 thousand, 2.6 million, 44 million, 1.2 billion. */
  function fmtTok(t) {
    if (!(t > 0)) return '0';
    if (t >= 1e9) return +(t / 1e9).toFixed(1) + ' billion';
    if (t >= 1e7) return Math.round(t / 1e6) + ' million';
    if (t >= 1e6) return +(t / 1e6).toFixed(1) + ' million';
    if (t >= 1e3) return Math.round(t / 1e3) + ' thousand';
    return String(Math.round(t));
  }
  const yrs = n => n + (n === 1 ? ' year' : ' years');
  function moneyFine(usd, c) {
    const v = usd * fxOf(c);
    if (v >= 0.1 || v === 0) return money(usd, c);
    const n = Number(v.toPrecision(2)).toString();
    return c === 'SEK' ? n + ' kr' : SYMBOL[c] + n;
  }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  /* ---------- Usage ---------- */
  /* Hours a month the machine (or the rented GPU) is switched on. */
  function hoursFor(c, who) {
    if (c.hours === 'all') return 730;
    if (c.hours === 'office') return 176;
    if (c.hours === 'few') return 88;
    return who.id === 'me' ? 88 : who.id === 'team' ? 176 : 730;
  }
  function usageOf(c) {
    const who = WHO.find(w => w.id === c.who) || WHO[0];
    const prof = profiles().find(p => p.id === c.how) || profiles()[1] || profiles()[0];
    const users = c.users || who.users;
    const reqMonth = users * prof.requests_per_user_day * who.days;
    const tin = reqMonth * prof.input_tokens, tout = reqMonth * prof.output_tokens;
    const cachedShare = prof.cached_input_share || 0;
    const peakShare = prof.peak_share || ({ occasional: 0.1, daily: 0.2, coding: 0.4, documents: 0.2 }[prof.id]) || 0.2;
    const peak = users <= 1 ? 1 : Math.max(1, Math.ceil(users * peakShare));
    const ctxNeed = Math.max(8192, Math.ceil((prof.input_tokens + prof.output_tokens) * 1.5 / 2048) * 2048);
    return { who, prof, users, reqMonth, tin, tout, tokens: tin + tout, cachedShare, tinUncached: tin * (1 - cachedShare), peak, peakShare, ctxNeed };
  }
  /* Cost of the text going in. Repeated context that a provider has cached is billed at a lower price. */
  function inputCost(o, use) {
    const cached = o.cached_in_usd_mtok != null ? o.cached_in_usd_mtok : o.in_usd_mtok;
    return (use.tin / 1e6) * ((1 - use.cachedShare) * o.in_usd_mtok + use.cachedShare * cached);
  }
  const tokenCost = (o, use) => inputCost(o, use) + (use.tout / 1e6) * o.out_usd_mtok;

  /* ---------- Hardware prices and candidates ---------- */
  function hwPrice(h, memOpt) {
    const hp = P && (P.hardware_prices || []).find(x => x.hardware_id === h.id);
    if (hp) {
      if (hp.by_memory_gb && memOpt && hp.by_memory_gb[String(memOpt)] != null) return hp.by_memory_gb[String(memOpt)];
      // the single price belongs to the standard memory size; a size without its own price is not priced
      if (hp.by_memory_gb && memOpt && memOpt !== h.memory_gb) return null;
      if (hp.usd != null) return hp.usd;
    }
    const a = h.approx_price_usd;
    if (memOpt && h.memory_gb && memOpt !== h.memory_gb) return null;   // the rough price is for the standard size only
    return a && a.value != null ? a.value : null;
  }
  const isServerCpu = h => h.form === 'server' || h.form === 'workstation' || /epyc|xeon|threadripper/i.test(h.name);
  // sold as a whole computer, not as a card for another computer
  const isComplete = h => !!h.gpus_per_system || h.class === 'unified-memory' || /DGX Station/i.test(h.name);
  const hostCost = (h, count) => {
    const hs = (P && P.host_system) || {};
    if (isComplete(h)) return 0;
    if (h.class === 'cpu') {
      // The price list has the memory only (no processor, board or case). The host prices in pricing.json
      // already include 64 GB of desktop RAM or 384 GB of server RAM, so that part is taken out again.
      const server = isServerCpu(h);
      const base = server ? (hs.server_1to4_gpu_usd || 9000) : (hs.consumer_gpu_desktop_usd || 900);
      return Math.max(0, base - (hwPrice(h, server ? 384 : 64) || 0));
    }
    if (count > 4) return hs.server_8gpu_chassis_usd || 30000;          // no desktop or workstation takes more than four cards
    if (h.class === 'gpu-consumer') return count <= 2 ? (hs.consumer_gpu_desktop_usd || 900) : (hs.workstation_usd || 3000);
    if (h.class === 'gpu-workstation') return hs.workstation_usd || 3000;
    return hs.server_1to4_gpu_usd || 9000;
  };
  const powerW = (h, count) => {
    // complete 8-GPU systems list the power of the whole system
    if (h.gpus_per_system) return h.power_w || 700 * h.gpus_per_system + 2000;
    const per = h.power_w || ({ 'gpu-consumer': 300, 'gpu-workstation': 300, 'gpu-datacenter': 500, 'unified-memory': 80, cpu: 150 }[h.class] || 250);
    return per * count + (String(h.class).startsWith('gpu') ? 150 : 0);
  };

  const quantFor = () => E.QUANT_BY_ID.q4;

  /* How many people at once can this machine serve comfortably (at least 8 tokens per second each)?
     Hardware to buy or rent must hold the model in fast memory. On the user's own machine one person may also
     use a model that spills into system RAM, as the Models page does (spill = true). */
  function capacityOf(model, machine, ctx, spill) {
    let best = 0, bestR = null;
    for (const U of [1, 2, 4, 8, 16, 32, 64, 128, 256]) {
      const r = E.estimateText(model, quantFor(), machine, { ctx, users: U, kvBits: 16 });
      if (r.tps >= 8 && (r.fit === 'gpu' || (spill && U === 1 && r.fit === 'offload'))) { best = U; bestR = r; } else break;
    }
    return { users: best, r: bestR };
  }

  /* Server modules (SXM, OAM) only work on the maker's own 8-GPU board, which the host prices do not include:
     they can be bought as part of a complete 8-GPU system, not one by one. */
  const moduleOnly = h => !h.gpus_per_system && /\bSXM|HGX|Gaudi 2|Instinct MI3\d\dX$/i.test(h.name);
  function buyCandidates() {
    const out = [];
    for (const h of D.hardware) {
      if ((h.form === 'laptop' || /laptop/i.test(h.name)) && h.class !== 'unified-memory') continue;   // Macs count even when sold as laptops
      if (moduleOnly(h) || /jetson|raspberry/i.test(h.name)) continue;      // development boards are not advice for a business
      const opts = h.memory_options_gb && h.memory_options_gb.length ? h.memory_options_gb : [h.memory_gb];
      const counts = (h.gpus_per_system || isComplete(h) || !String(h.class).startsWith('gpu')) ? [1] : [1, 2, 4, 8];
      for (const mem of opts) {
        if (!mem) continue;
        const unit = hwPrice(h, mem);
        if (unit == null) continue;
        for (const count of counts) {
          const price = unit * count + hostCost(h, count);
          const hw = Object.assign({}, h, { memory_gb: mem });
          // a complete 8-GPU system: one price, but the engine needs to know it has 8 chips (speed, compute), as on step 1
          const machine = E.buildMachine(hw, { count: h.gpus_per_system || count, memoryGB: mem, memoryIsTotal: !!h.gpus_per_system, ramGB: 64, ramBandwidth: 80 });
          out.push({ h, mem, count, price, power: powerW(h, count), machine, label: hwLabel(h, mem, count) });
        }
      }
    }
    return out;
  }
  function hwLabel(h, mem, count) {
    if (h.class === 'cpu') {
      const t = h.name.replace(/^No dedicated graphics card:\s*/i, '').replace(/\s*\([^)]*\)\s*$/, '');
      return t.charAt(0).toUpperCase() + t.slice(1) + ', ' + mem + ' GB RAM';
    }
    const n = h.name.replace(/^NVIDIA |^AMD /, '');
    const hp = P && (P.hardware_prices || []).find(x => x.hardware_id === h.id);
    return (count > 1 ? count + ' × ' : '') + n + (h.memory_options_gb && h.memory_options_gb.length > 1 ? ' (' + mem + ' GB)' : '') + (hp && hp.kind === 'used' ? ', used' : '');
  }
  let _cands = null;
  const candidates = () => _cands || (_cands = buyCandidates());

  function monthlyPower(power, busyShare, kwhUsd, hoursOn) {
    // idle draw is about 15% of full power, full load about 80%
    const kwh = power / 1000 * hoursOn * (0.15 + 0.65 * busyShare);
    return kwh * kwhUsd;
  }
  function kwhPrice(c, who) {
    const row = P && (P.electricity || []).find(e => e.region === c.region);
    if (!row) return 0.2;
    return (who.power === 'household' ? row.household_usd_kwh : row.business_usd_kwh) || row.household_usd_kwh || 0.2;
  }

  /* ---------- The options ---------- */

  /* How many machines does the work need? Two limits: enough memory and speed for the people active at the same
     moment, and enough total processing time. Reading long prompts takes compute, writing takes memory bandwidth.
     A machine is planned to be busy at most half of the hours it is on, so replies are not queued. */
  /* Compute power (16-bit TFLOPs) when the hardware list has no figure, which is the case for most consumer
     cards and all Macs: a share of the memory bandwidth. The shares are fitted to the llama.cpp prompt-reading
     measurements (pp512, Llama 2 7B at 4-bit) of 78 entries in hardware.json, so that for each group the typical
     estimate equals the typical measurement: graphics cards 0.12, Apple chips 0.06 (M5 and M6 chips have extra
     matrix hardware: 0.2), other shared-memory chips 0.22. Processors have no measurements; 0.04 is a guess that
     gives about 90 tokens a second for an 8B model on a desktop. */
  function tflopsOf(machine) {
    if (machine.tflops) return machine.tflops;
    const hw = machine.hw || {};
    let perGBs;
    if (machine.isCpu) perGBs = 0.04;
    else if (machine.unified) perGBs = hw.vendor === 'Apple' || !hw.vendor ? (/\bM[56]\b/.test(hw.name || '') ? 0.2 : 0.06) : 0.22;
    else perGBs = 0.12;
    return machine.bw * perGBs * (machine.unified || machine.isCpu ? 1 : machine.count || 1);
  }
  function machinesNeeded(model, use, machine, cap, hoursOn) {
    const prefillRate = tflopsOf(machine) * 1e12 * 0.4 / (2 * model.params_active_b * 1e9);   // tokens read per second
    // Writing speed for all users together, at the number of people who are typically active at once on one machine.
    const atOnce = Math.max(1, Math.min(cap.users, use.peak));
    const rr = atOnce === cap.users ? cap.r : E.estimateText(model, quantFor(), machine, { ctx: use.ctxNeed, users: atOnce, kvBits: 16 });
    const decodeRate = Math.max(1, rr && rr.speed ? rr.speed.total : 1);
    const busyH = (use.tinUncached / prefillRate + use.tout / decodeRate) / 3600;
    const byLoad = Math.ceil(busyH / (0.5 * hoursOn));
    const byPeople = Math.ceil(use.peak / cap.users);
    return { machines: Math.max(1, byLoad, byPeople), busyH, byLoad, byPeople };
  }

  function planBuy(model, use, c, machineNow) {
    const ctx = use.ctxNeed;
    const kwh = kwhPrice(c, use.who);
    const hoursOn = hoursFor(c, use.who);
    const months = c.years * 12;
    const serverGrade = h => h.class === 'gpu-datacenter' || h.class === 'gpu-workstation' || !!h.gpus_per_system || isServerCpu(h);
    const tcoOf = (cand, cap) => {
      const mn = machinesNeeded(model, use, cand.machine, cap, hoursOn);
      // more than four ordinary machines is a fleet: only server hardware is offered for that
      if (mn.machines > 4 && !serverGrade(cand.h)) return null;
      if (mn.machines > 64) return null;
      const busyShare = Math.min(1, mn.busyH / (mn.machines * hoursOn));
      const power = monthlyPower(cand.power * mn.machines, busyShare, kwh, hoursOn);
      // every machine beyond the first takes a little staff time to look after (2 hours a month at 60 USD)
      const upkeep = (mn.machines - 1) * 120;
      return { machines: mn.machines, busyShare, upfront: cand.price * mn.machines, power, tco: cand.price * mn.machines + (power + upkeep) * months };
    };
    // 1. the user's own machine, if it is enough
    let own = null;
    if (machineNow) {
      const capOwn = capacityOf(model, machineNow, ctx, true);
      const mnOwn = capOwn.users > 0 ? machinesNeeded(model, use, machineNow, capOwn, hoursOn) : null;
      // only "enough" when this one machine can carry the whole load; otherwise more hardware has to be bought
      if (mnOwn && mnOwn.machines === 1) own = { cap: capOwn, machine: machineNow, mn: mnOwn };
    }
    // 2. the cheapest purchasable configuration that is enough
    let best = null;
    for (const cand of candidates()) {
      const cap = capacityOf(model, cand.machine, ctx);
      if (cap.users === 0) continue;
      const t = tcoOf(cand, cap);
      if (t && (!best || t.tco < best.t.tco)) best = { cand, cap, t };
    }
    return { own, best, hoursOn, kwh, months };
  }

  function apiOffers(model) {
    const e = P && (P.api_open || []).find(x => x.model_id === model.id);
    return e ? (e.offers || []).filter(o => o.in_usd_mtok != null && o.out_usd_mtok != null) : [];
  }
  const isEU = o => o.region === 'EU' || o.region === 'CH';
  function apiPlan(model, use) {
    const offers = apiOffers(model).map(o => Object.assign({ monthly: tokenCost(o, use) }, o)).sort((a, b) => a.monthly - b.monthly);
    if (offers.length) {
      const eu = offers.find(isEU);
      return { kind: 'listed', best: offers[0], eu: eu && eu !== offers[0] ? eu : null, offers, monthly: offers[0].monthly };
    }
    // no listing: estimate from the price curve by active parameters
    const curve = ((P && P.api_size_curve) || []).filter(b => b.in_usd_mtok != null);
    const band = curve.find(b => b.active_params_b_max == null || model.params_active_b <= b.active_params_b_max) || curve[curve.length - 1];
    if (band) {
      return { kind: 'estimated', band, monthly: tokenCost(band, use), offers: [] };
    }
    return null;
  }

  function rentPlan(model, use, c) {
    const ctx = use.ctxNeed;
    const hours = hoursFor(c, use.who);
    let best = null;
    for (const g of (P && P.gpu_rental) || []) {
      const h = D.hardware.find(x => x.id === g.hardware_id);
      const offers = (g.offers || []).filter(o => o.usd_per_gpu_hour != null);
      if (!h || !offers.length) continue;
      const od = offers.filter(o => o.type === 'on-demand');
      const offer = (od.length ? od : offers).slice().sort((a, b) => a.usd_per_gpu_hour - b.usd_per_gpu_hour)[0];
      for (const count of [1, 2, 4, 8]) {
        const machine = E.buildMachine(h, { count, memoryGB: h.memory_gb, ramGB: 128, ramBandwidth: 80 });
        const cap = capacityOf(model, machine, ctx);
        if (cap.users === 0) continue;
        const mn = machinesNeeded(model, use, machine, cap, hours);
        const monthly = mn.machines * count * offer.usd_per_gpu_hour * hours;
        if (!best || monthly < best.monthly) best = { g, h, offer, count, machines: mn.machines, monthly, hours, cap };
      }
    }
    return best;
  }

  function closedPlan(use) {
    // models whose weights are published are not closed assistants (Mistral Large 4 and Small 4 are in the open-model list)
    const openWeights = o => o.open_weights === true || /\bopen weights\b/i.test(o.note || '');
    const list = ((P && P.closed_api) || []).filter(o => !openWeights(o));
    const withCost = list.filter(o => o.in_usd_mtok != null && o.out_usd_mtok != null).map(o => Object.assign({ monthly: tokenCost(o, use) }, o));
    const small = withCost.filter(o => o.tier === 'small').sort((a, b) => a.monthly - b.monthly)[0] || null;
    const flag = withCost.filter(o => o.tier === 'flagship').sort((a, b) => a.monthly - b.monthly)[0] || null;
    const subs = ((P && P.subscriptions) || []).filter(s => s.usd_per_month != null);
    const seatType = use.users > 1 ? 'team' : 'individual';
    // the reference is the plan closest to the usual standard seat (about 20 USD for one person, 30 for a team seat), not the cheapest add-on
    const target = seatType === 'team' ? 30 : 20;
    const near = list => list.slice().sort((a, b) => Math.abs(a.usd_per_month - target) - Math.abs(b.usd_per_month - target))[0] || null;
    const sub = near(subs.filter(s => s.seat_type === seatType)) || near(subs);
    return { small, flag, sub, subMonthly: sub ? sub.usd_per_month * use.users : null };
  }

  /* ---------- Everything together ---------- */
  function compute(H) {
    const S = H.S, c = cfg(S);
    const use = usageOf(c);
    const model = D.llm.find(m => m.id === c.modelId);
    const machineNow = H.currentMachine();
    const buy = planBuy(model, use, c, machineNow);
    const api = apiPlan(model, use);
    const rent = rentPlan(model, use, c);
    const closed = closedPlan(use);

    // local monthly numbers
    let local = null;
    const admin = (c.admin || 0) * 60;                 // staff time at an assumed hourly cost of 60 USD
    if (rent && admin) { rent.admin = admin; rent.monthly += admin; }   // you run the software on a rented GPU too
    if (c.owned && buy.own) {
      // the user already has a machine that is enough: only power (and staff time) count
      const m = buy.own.machine, mn = buy.own.mn;
      const watts = (m.isCpu ? 150 : m.unified ? 100 : 350 * (m.count || 1) + 150) * mn.machines;
      const busyShare = Math.min(1, mn.busyH / (mn.machines * buy.hoursOn));
      const power = monthlyPower(watts, busyShare, buy.kwh, buy.hoursOn);
      local = { cand: null, machines: mn.machines, upfront: 0, power, admin, amort: 0, monthly: power + admin, fixedMonthly: power + admin, cap: buy.own.cap, usingOwn: true, watts };
    } else if (buy.best) {
      const bc = buy.best;
      const amort = bc.t.upfront / (c.years * 12);
      local = { cand: bc.cand, machines: bc.t.machines, upfront: bc.t.upfront, power: bc.t.power, admin, amort, monthly: amort + bc.t.power + admin, fixedMonthly: bc.t.power + admin, cap: bc.cap, usingOwn: false, watts: bc.cand.power * bc.t.machines };
    }
    return { c, use, model, buy, api, rent, closed, local, machineNow };
  }

  /* ---------- Chart ---------- */
  /* A round tick step (1, 2, 2.5 or 5 times a power of ten) that gives about four steps up to v. */
  function niceStep(v) {
    if (!(v > 0)) return 1;
    const raw = v / 4, p = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  }
  function chartHtml(r, cur, width) {
    const years = r.c.years, N = years * 12;
    const lines = [];
    if (r.local) lines.push({ id: 'buy', label: 'Buy', upfront: r.local.upfront, m: r.local.fixedMonthly, cls: 'ln-buy' });
    if (r.api) lines.push({ id: 'api', label: 'Hosted API', upfront: 0, m: r.api.monthly, cls: 'ln-api' });
    if (r.rent) lines.push({ id: 'rent', label: 'Rent a GPU', upfront: 0, m: r.rent.monthly, cls: 'ln-rent' });
    if (r.closed && (r.closed.flag || r.closed.sub)) {
      const m = r.closed.flag ? r.closed.flag.monthly : r.closed.subMonthly;
      lines.push({ id: 'paid', label: 'Paid assistant', upfront: 0, m, cls: 'ln-paid' });
    }
    if (!lines.length) return '';
    // the paid reference must not squash the three real options into the bottom of the chart
    let offChart = '';
    const pi = lines.findIndex(l => l.id === 'paid');
    if (pi >= 0 && lines.length > 1) {
      const end = l => l.upfront + l.m * N;
      const restMax = Math.max(...lines.filter(l => l.id !== 'paid').map(end));
      if (end(lines[pi]) > 2.5 * restMax) { offChart = ` The paid assistant would reach about ${money(end(lines[pi]), cur, { whole: true })}, far above this chart.`; lines.splice(pi, 1); }
    }
    // drawn at the width it is shown at, so the text stays readable on a phone
    const W = Math.max(320, Math.min(760, Math.round(width || 760))), narrow = W < 520;
    const Ht = narrow ? 260 : 320, L = narrow ? 50 : 64, R = narrow ? 104 : 128, T = 18, B = 40;
    const fx = fxOf(cur);
    const val = (l, t) => l.upfront + l.m * t;
    // ticks are round numbers in the currency shown, not in dollars
    const top = Math.max(...lines.map(l => val(l, N))) * fx;
    const stepY = niceStep(top), maxY = Math.max(stepY, Math.ceil(top / stepY) * stepY) / fx;
    const yTicks = []; for (let v = 0; v <= maxY * fx + stepY / 2; v += stepY) yTicks.push(v / fx);
    const x = t => L + (W - L - R) * t / N;
    const y = v => T + (Ht - T - B) * (1 - v / maxY);
    const xTicks = [];
    const step = N <= 24 ? 6 : 12;
    for (let t = 0; t <= N; t += step) xTicks.push(t);
    const fmtAxis = v => { const u = Math.round(v * fx * 100) / 100; const k = SYMBOL[cur] === 'kr'; const n = u >= 1e6 ? +(u / 1e6).toFixed(2) + 'M' : u >= 1000 ? +(u / 1000).toFixed(1) + 'k' : +u.toFixed(2); return (k ? '' : SYMBOL[cur]) + n + (k ? ' kr' : ''); };
    // direct labels at the right end, nudged apart and kept inside the drawing
    const ends = lines.map(l => ({ l, y: y(val(l, N)) })).sort((a, b) => a.y - b.y);
    const gap = 16, bottom = Ht - B + 6;
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < gap) ends[i].y = ends[i - 1].y + gap;
    for (let i = ends.length - 1; i >= 0; i--) { const lim = i === ends.length - 1 ? bottom : ends[i + 1].y - gap; if (ends[i].y > lim) ends[i].y = lim; }
    const paid = lines.find(l => l.id === 'paid') || offChart;
    const paidName = !paid ? '' : r.closed.flag ? r.closed.flag.model + ' at its pay-per-use price' : r.closed.sub.plan + ' at its monthly price';
    return `<figure class="cost-chart"><svg viewBox="0 0 ${W} ${Ht}" role="img" aria-label="Total cost over ${yrs(years)} for each option">
      ${yTicks.map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="cc-grid"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" class="cc-tick">${fmtAxis(v)}</text>`).join('')}
      ${xTicks.map(t => `<text x="${x(t)}" y="${Ht - 14}" text-anchor="middle" class="cc-tick">${t === 0 ? 'Today' : t % 12 === 0 ? t / 12 + (t === 12 ? (narrow ? ' yr' : ' year') : (narrow ? ' yrs' : ' years')) : t + (narrow ? ' mo' : ' months')}</text>`).join('')}
      ${lines.map(l => `<line x1="${x(0)}" y1="${y(val(l, 0))}" x2="${x(N)}" y2="${y(val(l, N))}" class="cc-line ${l.cls}"/>`).join('')}
      ${ends.map(e => `<text x="${W - R + 8}" y="${e.y + 4}" class="cc-label ${e.l.cls}">${e.l.label}</text>`).join('')}
    </svg>
    <figcaption>Total money spent over ${yrs(years)}. A line that starts higher but rises more slowly is the one that pays off over time. Where two lines cross, the cheaper option changes.${paidName ? ` “Paid assistant” is ${esc(paidName)}.` : ''}${offChart}</figcaption></figure>`;
  }

  /* ---------- Headline ---------- */
  function headline(r, cur) {
    const loc = r.local;
    if (!loc) return { big: 'No single machine fits', sub: 'This model is too large for one machine in our list. A hosted API or a cluster of servers is the practical route.' };
    const alt = [];
    if (r.api) alt.push({ n: 'a hosted API', m: r.api.monthly });
    if (r.rent) alt.push({ n: 'renting a GPU', m: r.rent.monthly });
    if (!alt.length) return { big: `About ${money(loc.monthly, cur)} a month`, sub: 'No cloud price found for this model to compare with.' };
    alt.sort((a, b) => a.m - b.m);
    const cheapest = alt[0];
    const months = r.c.years * 12;
    if (loc.usingOwn) {
      return { big: `Running it on your own machine costs about ${money(loc.monthly, cur)} a month`, sub: `That is the electricity${r.c.admin ? ' and staff time' : ''}. ${cheapest.n[0].toUpperCase() + cheapest.n.slice(1)} would cost about ${money(cheapest.m, cur)} a month for the same use.` };
    }
    const saving = cheapest.m - loc.fixedMonthly;
    if (saving > 0) {
      const be = loc.upfront / saving;
      if (be <= months) {
        return { big: `Buying pays for itself after ${be < 1.5 ? 'about a month' : Math.round(be) + ' months'}`, sub: `Compared with ${cheapest.n}: about ${money(loc.upfront, cur, { whole: true })} upfront, then ${money(loc.fixedMonthly, cur)} a month for power, against ${money(cheapest.m, cur)} a month.` };
      }
      if (be > 120) return { big: `${cheapest.n[0].toUpperCase() + cheapest.n.slice(1)} is cheaper for this use`, sub: `About ${money(cheapest.m, cur)} a month, against ${money(loc.monthly, cur)} a month for buying and running hardware. Buying would take more than ten years to pay off.` };
      return { big: `Buying takes ${yrs(Math.round(be / 12 * 10) / 10)} to pay off`, sub: `That is longer than the ${yrs(r.c.years)} assumed. ${cheapest.n[0].toUpperCase() + cheapest.n.slice(1)} costs about ${money(cheapest.m, cur)} a month; hardware is ${money(loc.upfront, cur, { whole: true })} upfront.` };
    }
    return { big: `${cheapest.n[0].toUpperCase() + cheapest.n.slice(1)} is cheaper for this use`, sub: `About ${money(cheapest.m, cur)} a month, against ${money(loc.monthly, cur)} a month for buying and running hardware (including its price spread over ${yrs(r.c.years)}).` };
  }

  /* ---------- Page ---------- */
  function render(root, H) {
    const S = H.S, c = cfg(S);
    if (S.mode && S.mode !== 'text' && window.MediaUI && window.MediaUI.evaluate) { renderMedia(root, H); return; }
    if (!P) { root.innerHTML = '<div class="empty"><h3>Price data is missing</h3><p>The cost comparison needs data/pricing.json.</p></div>'; return; }
    // model: remembered, else the best pick for the current machine
    const textModels = D.llm.filter(m => m.kind !== 'embedding');
    if (!c.modelId || !textModels.some(m => m.id === c.modelId)) {
      const all = H.evaluateText(H.currentMachine());
      const fits = all.filter(r => r.fit !== 'no').sort((a, b) => b.score - a.score);
      // the same model as the best pick on step 3
      const best = H.pickBest ? H.pickBest(fits) : (fits.find(r => r.verdict.rank >= 2) || fits[0]);
      c.modelId = best ? best.model.id : textModels[0].id;
    }
    if (S.mode && S.mode !== 'text') { /* costs cover text models only */ }

    const cur = c.currency;
    root.innerHTML = `
      <div class="page-head"><h1>What would it cost?</h1>${ctxLine(H)}</div>
      ${modeSwitch(S)}
      <div class="usefor"><label for="cModelSel">For</label>
        <select class="select" id="cModelSel">${textModels.slice().sort((a, b) => a.name.localeCompare(b.name)).map(m => `<option value="${esc(m.id)}" ${m.id === c.modelId ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
        <span class="small">text models only</span></div>
      <div class="asks">
        <div class="ask"><span class="ask-q">Who will use it?</span>
          <div class="segmented" role="group" aria-label="Who will use it?">${WHO.map(w => `<button type="button" data-who="${w.id}" aria-pressed="${c.who === w.id}">${w.label}</button>`).join('')}</div></div>
        <div class="ask"><span class="ask-q">How do they use it?</span>
          <div class="segmented" role="group" aria-label="How do they use it?">${profiles().map(p => `<button type="button" data-how="${esc(p.id)}" aria-pressed="${c.how === p.id}">${esc(p.label)}</button>`).join('')}</div></div>
      </div>
      <div id="costResult"></div>
      <details class="more" id="costAdjust"><summary>Change assumptions</summary><div class="more-body" id="costAdjustBody"></div></details>
      <details class="more" id="costHow"><summary>How this is calculated</summary><div class="more-body" id="costHowBody"></div></details>
      <p class="fine cost-foot" id="costFoot"></p>`;

    bindMode(root, H);
    $$('[data-who]', root).forEach(b => b.addEventListener('click', () => { c.who = b.dataset.who; c.users = null; H.save(); render(root, H); }));
    $$('[data-how]', root).forEach(b => b.addEventListener('click', () => { c.how = b.dataset.how; H.save(); render(root, H); }));
    $('#cModelSel', root).addEventListener('change', e => { c.modelId = e.target.value; H.save(); render(root, H); });
    renderAdjust(root, H);
    update(root, H);
  }

  const ctxLine = H => `<p class="ctx-line"><span class="label">Your machine</span><strong>${esc(H.machineLabel())}</strong><a href="#/">Change</a></p>`;

  function renderAdjust(root, H) {
    const c = cfg(H.S);
    const use = usageOf(c);
    const regions = (P.electricity || []).map(e => e.region);
    $('#costAdjustBody', root).innerHTML = `<div class="assume-grid">
      <div class="field"><label for="aUsers">Number of users</label><input id="aUsers" type="number" min="1" max="100000" step="1" value="${use.users}"><span class="hint">Changing this overrides the choice above.</span></div>
      <div class="field"><label for="aYears">Years of use</label><select id="aYears">${[1, 2, 3, 4, 5].map(y => `<option value="${y}" ${c.years === y ? 'selected' : ''}>${y} ${y === 1 ? 'year' : 'years'}</option>`).join('')}</select><span class="hint">Hardware cost is spread over this time.</span></div>
      <div class="field"><label for="aHours">Machine runs</label><select id="aHours"><option value="auto" ${c.hours === 'auto' ? 'selected' : ''}>Automatic for this group</option><option value="all" ${c.hours === 'all' ? 'selected' : ''}>All day, every day</option><option value="office" ${c.hours === 'office' ? 'selected' : ''}>Office hours</option><option value="few" ${c.hours === 'few' ? 'selected' : ''}>A few hours a day</option></select><span class="hint">Affects power and how long a rented GPU is paid for.</span></div>
      <div class="field"><label for="aRegion">Electricity price from</label><select id="aRegion">${regions.map(r => `<option ${r === c.region ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select></div>
      <div class="field"><label for="aAdmin">Staff time to run it (hours a month)</label><input id="aAdmin" type="number" min="0" max="500" step="1" value="${c.admin}"><span class="hint">Counted at ${money(60, c.currency, { whole: true })} an hour, for buying and for renting. Zero for a personal machine.</span></div>
      <div class="field"><label class="switch"><input type="checkbox" id="aOwned" ${c.owned ? 'checked' : ''}><span>I already own suitable hardware</span></label><span class="hint">Then only power is counted for running it yourself.</span></div>
      <div class="field"><span class="field-label">Currency</span><div class="segmented segmented-sm" role="group" aria-label="Currency">${CURRENCIES.map(x => `<button type="button" data-cur="${x}" aria-pressed="${c.currency === x}">${x}</button>`).join('')}</div></div>
    </div>`;
    const rer = () => { H.save(); render(root, H); };
    $('#aUsers', root).addEventListener('change', e => { c.users = Math.max(1, +e.target.value || 1); rer(); $('#costAdjust').open = true; });
    $('#aYears', root).addEventListener('change', e => { c.years = +e.target.value; rer(); $('#costAdjust').open = true; });
    $('#aHours', root).addEventListener('change', e => { c.hours = e.target.value; rer(); $('#costAdjust').open = true; });
    $('#aRegion', root).addEventListener('change', e => { c.region = e.target.value; rer(); $('#costAdjust').open = true; });
    $('#aAdmin', root).addEventListener('change', e => { c.admin = Math.max(0, +e.target.value || 0); rer(); $('#costAdjust').open = true; });
    $('#aOwned', root).addEventListener('change', e => { c.owned = e.target.checked; rer(); $('#costAdjust').open = true; });
    $$('[data-cur]', root).forEach(b => b.addEventListener('click', () => { c.currency = b.dataset.cur; H.save(); update(root, H); $$('[data-cur]', root).forEach(x => x.setAttribute('aria-pressed', x === b)); }));
  }

  const TIPS = {
    api: 'A company runs the same open model on its servers. You pay for the text it reads and writes, counted in tokens (pieces of words). API is the way programs send it requests.',
    gpu: 'A GPU is a graphics card. You rent a machine with one or more in a data centre, pay for every hour it is switched on, and install the model yourself.'
  };
  function tile(title, big, sub, extra, flag, tip) {
    const t = tip ? `<span class="info-dot" tabindex="0" role="img" aria-label="${esc(tip)}" data-tip="${esc(tip)}">?</span>` : '';
    return `<div class="tile${flag ? ' is-low' : ''}"><p class="tile-title">${title}${t}${flag ? ' <span class="pill">Lowest</span>' : ''}</p><p class="metric-value num">${big}<small>/ month</small></p><p class="tile-sub">${sub}</p>${extra ? `<p class="tile-extra">${extra}</p>` : ''}</div>`;
  }

  function update(root, H) {
    const c = cfg(H.S), cur = c.currency;
    const r = compute(H);
    const hl = headline(r, cur);
    const lowest = Math.min(...[r.local && r.local.monthly, r.api && r.api.monthly, r.rent && r.rent.monthly].filter(v => v != null));
    const loc = r.local;

    const buyTile = loc
      ? tile('Buy and run it yourself', money(loc.monthly, cur), loc.usingOwn ? 'Power only, on your own machine' : `${money(loc.upfront, cur, { whole: true })} upfront, spread over ${yrs(c.years)}, plus power`,
        `${esc(loc.usingOwn ? 'Your machine' : loc.cand.label)}${loc.machines > 1 ? ` (${loc.machines} machines)` : ''}`, loc.monthly === lowest)
      : tile('Buy and run it yourself', '–', 'No single machine in our list is enough', '', false);
    let apiSub = '', apiExtra = '';
    if (r.api) {
      if (r.api.kind === 'listed') { apiSub = `Cheapest of ${r.api.offers.length} ${r.api.offers.length === 1 ? 'provider' : 'providers'}: ${esc(r.api.best.provider)}`; apiExtra = r.api.eu ? `EU-hosted: ${esc(r.api.eu.provider)}, ${money(r.api.eu.monthly, cur)} a month` : (isEU(r.api.best) ? 'Hosted in the EU' : ''); }
      else { apiSub = 'Estimated from prices of models this size'; apiExtra = 'No provider lists this exact model'; }
    }
    const apiTile = r.api ? tile('Hosted API, same model', money(r.api.monthly, cur), apiSub, apiExtra, r.api.monthly === lowest, TIPS.api) : tile('Hosted API, same model', '–', 'No price found', '', false, TIPS.api);
    const rentTile = r.rent
      ? tile('Rent a GPU', money(r.rent.monthly, cur), `${r.rent.machines * r.rent.count} × ${esc(r.rent.h.name.replace(/^NVIDIA /, ''))}, ${r.rent.hours >= 730 ? 'all day' : r.rent.hours >= 176 ? 'office hours' : 'a few hours a day'}`, `${money(r.rent.offer.usd_per_gpu_hour, cur)} per GPU hour at ${esc(r.rent.offer.provider)}`, r.rent.monthly === lowest, TIPS.gpu)
      : tile('Rent a GPU', '–', 'No rentable GPU fits this model', '', false, TIPS.gpu);

    const cl = r.closed;
    const paidBits = [];
    if (cl.small) paidBits.push(`${esc(cl.small.model)}: ${money(cl.small.monthly, cur)}`);
    if (cl.flag) paidBits.push(`${esc(cl.flag.model)}: ${money(cl.flag.monthly, cur)}`);
    if (cl.sub) paidBits.push(`${cl.sub.plan.indexOf(cl.sub.vendor) === 0 ? '' : esc(cl.sub.vendor) + ' '}${esc(cl.sub.plan)}: ${money(cl.subMonthly, cur)} for ${r.use.users} ${r.use.users === 1 ? 'seat' : 'seats'}`);
    const paid = paidBits.length ? `<p class="paid-ref"><span class="label">For comparison, paid assistants</span>${paidBits.join(' · ')} a month for the same use. They run different models with different features, so use these figures only as a rough reference.</p>` : '';

    // where buying starts to pay off, in tokens per month
    let beNote = '';
    if (r.api && loc && !loc.usingOwn) {
      const perTok = r.api.monthly / Math.max(1, r.use.tokens);
      if (perTok > 0) {
        const tok = loc.monthly / perTok;
        beNote = `<p class="small">At this model's hosted price, buying starts to cost less above roughly <strong>${fmtTok(tok)} tokens a month</strong>. This use is about ${fmtTok(r.use.tokens)}.</p>`;
      }
    }
    const warn = loc && !loc.usingOwn && r.buy.own === null && r.machineNow
      ? `<div class="callout is-info"><p>${c.owned ? 'Your own machine is not enough for this model and this use, so the price of hardware that is enough is shown.' : 'Your current machine is not enough for this model and this use, so the price is for the cheapest hardware in our list that is.'}</p></div>` : '';
    const own = r.buy.own && !c.owned
      ? `<p class="small" style="margin:var(--s-3) 0 0">Your own machine is enough for this. If you already have it, <button class="linkbtn" type="button" id="useOwn">count only the running cost</button>.</p>` : '';
    const m = r.model, perReq = r.use.prof.input_tokens + r.use.prof.output_tokens;
    const ctxWarn = m.context_max && m.context_max < perReq
      ? `<div class="callout is-warn"><p>${esc(m.name)} can read at most ${E.fmtCtx(m.context_max)} tokens at a time, and this use sends about ${E.fmtCtx(perReq)} per request. The prices assume it could; in practice you would need a model with a longer context.</p></div>` : '';

    $('#costResult', root).innerHTML = `<div class="cost-answer"><p class="cost-big">${esc(hl.big)}</p><p class="cost-sub">${esc(hl.sub)}</p>${own}${warn}${ctxWarn}</div>
      <div class="tiles">${buyTile}${apiTile}${rentTile}</div>
      ${chartHtml(r, cur, $('#costResult', root).clientWidth)}
      ${beNote}${paid}
      <p class="small reasons">Price is one reason among several. Running it yourself keeps your data on your own machines, works without internet, and has no per-use limits.</p>`;
    const uo = $('#useOwn', root); if (uo) uo.addEventListener('click', () => { c.owned = true; H.save(); render(root, H); });

    // calculation details
    const use = r.use;
    const rows = [];
    const n = v => v.toLocaleString('en-GB');
    rows.push(['Usage', `${use.users} ${use.users === 1 ? 'user' : 'users'} × ${use.prof.requests_per_user_day} requests a day × ${use.who.days} working days. Each request sends about ${n(use.prof.input_tokens)} tokens and gets about ${n(use.prof.output_tokens)} back (a token is about three quarters of a word). That is about ${fmtTok(use.tin)} tokens in and ${fmtTok(use.tout)} out a month.${use.cachedShare > 0 ? ` About ${Math.round(use.cachedShare * 100)}% of the text going in repeats earlier requests (the conversation so far, the same files). Many hosted APIs charge less for that part, and your own machine does not need to read it again.` : ''}`]);
    rows.push(['People at the same moment', use.users <= 1 ? 'One.' : `About ${use.peak}. For this kind of use we assume about ${Math.round(use.peakShare * 100)}% of the users are working at the same moment.`]);
    if (loc) rows.push(['Hardware', `${loc.usingOwn ? 'Your machine' : esc(loc.cand.label)}${loc.machines > 1 ? ' × ' + loc.machines : ''}. Serves about ${loc.cap.users} ${loc.cap.users === 1 ? 'person' : 'people'} at a comfortable speed (at least 8 tokens a second each).${loc.usingOwn ? '' : ' The price includes the rest of the computer when the price list has only the graphics card or the memory.'} Power: about ${n(Math.round(loc.watts))} W at full load, idle draw about 15% of that, ${hoursFor(c, use.who)} hours a month switched on, electricity at ${money(r.buy.kwh, cur)} per kWh.`]);
    if (r.api && r.api.offers && r.api.offers.length) rows.push(['Hosted API prices', r.api.offers.slice(0, 4).map(o => `${esc(o.provider)}: ${money(o.in_usd_mtok, cur)} in${use.cachedShare > 0 && o.cached_in_usd_mtok != null ? ` (${money(o.cached_in_usd_mtok, cur)} for repeated text)` : ''} / ${money(o.out_usd_mtok, cur)} out per million tokens${isEU(o) ? ' (EU)' : ''}${o.url ? ` <a href="${esc(o.url)}" target="_blank" rel="noopener">source</a>` : ''}`).join('<br>')]);
    else if (r.api && r.api.band) rows.push(['Hosted API prices', `No provider lists this model. Estimate from the typical price of models with up to ${r.api.band.active_params_b_max} billion active parameters: ${money(r.api.band.in_usd_mtok, cur)} in / ${money(r.api.band.out_usd_mtok, cur)} out per million tokens.`]);
    if (r.rent) rows.push(['Rented GPU', `${r.rent.machines * r.rent.count} × ${esc(r.rent.h.name)} at ${money(r.rent.offer.usd_per_gpu_hour, cur)} per GPU hour (${esc(r.rent.offer.type || 'on-demand')}, ${esc(r.rent.offer.provider)}), ${r.rent.hours} hours a month.${r.rent.offer.url ? ` <a href="${esc(r.rent.offer.url)}" target="_blank" rel="noopener">source</a>` : ''}`]);
    $('#costHowBody', root).innerHTML = `<dl class="how">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;

    const asOf = (P.meta && P.meta.as_of) || '', d = /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? new Date(asOf + 'T12:00:00') : null;
    $('#costFoot', root).innerHTML = `Prices are snapshots from ${esc(d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : asOf)} and change often; graphics card and memory prices in particular. Exchange rates: 1 USD = ${(+fxOf('EUR')).toFixed(2)} EUR = ${(+fxOf('SEK')).toFixed(1)} SEK. Hardware, rental and API prices are before VAT; household electricity includes it. Not included: staff time (unless set above), backup machines, software support, and the quality difference of paid assistants.`;
  }


  /* =====================================================================
     IMAGES, VIDEO AND SPEECH
     ===================================================================== */
  const MODE_LABEL = { text: 'Text and chat', image: 'Images', video: 'Video', speech: 'Speech' };
  const modeSwitch = S => `<div class="tabs mode-tabs" role="tablist" aria-label="What do you want to run?">${Object.keys(MODE_LABEL).map(k => `<button type="button" role="tab" data-cmode="${k}" aria-selected="${(S.mode || 'text') === k}" tabindex="${(S.mode || 'text') === k ? 0 : -1}">${MODE_LABEL[k]}</button>`).join('')}</div>`;
  function bindMode(root, H) {
    $$('[data-cmode]', root).forEach(b => b.addEventListener('click', () => { H.S.mode = b.dataset.cmode; H.save(); render(root, H); }));
  }
  const MEDIA_FALLBACK = {
    image: [{ id: 'light', label: 'A few pictures a week', units_per_month: 40 }, { id: 'regular', label: 'A few pictures a day', units_per_month: 400 }, { id: 'heavy', label: 'A production workflow', units_per_month: 4000 }],
    video: [{ id: 'light', label: 'A few clips a month', units_per_month: 10 }, { id: 'regular', label: 'A few clips a week', units_per_month: 100 }, { id: 'heavy', label: 'A clip every few minutes', units_per_month: 1000 }],
    tts: [{ id: 'light', label: 'A few minutes of speech a day', units_per_month: 2 }, { id: 'regular', label: 'An hour a day', units_per_month: 20 }, { id: 'heavy', label: 'Narration at scale', units_per_month: 200 }],
    stt: [{ id: 'light', label: 'A few meetings a month', units_per_month: 5 }, { id: 'regular', label: 'Meetings every day', units_per_month: 50 }, { id: 'heavy', label: 'A call centre', units_per_month: 500 }]
  };
  const mediaKind = S => (S.mode === 'image' ? 'image' : S.mode === 'video' ? 'video' : (S.speechKind || 'tts'));
  const mediaProfiles = kind => {
    const list = ((P && P.media_usage_profiles) || []).filter(p => p.kind === kind);
    return list.length ? list : MEDIA_FALLBACK[kind];
  };
  const unitWord = (kind, n) => ({ image: n === 1 ? 'picture' : 'pictures', video: n === 1 ? 'clip' : 'clips', tts: n === 1 ? 'hour of speech' : 'hours of speech', stt: n === 1 ? 'hour of audio' : 'hours of audio' }[kind]);

  /* What one hosted offer costs for one of our units: a picture, a clip of the chosen length, an hour of audio. */
  function perUnitPrice(o, kind, w) {
    if (o.usd_per_unit == null) return null;
    switch (o.unit) {
      case 'image': return kind === 'image' ? o.usd_per_unit : null;
      case 'megapixel': return kind === 'image' ? o.usd_per_unit * w.imgMP : null;
      case 'video_second': return kind === 'video' ? o.usd_per_unit * w.vidSec : null;
      case 'video_clip': return kind === 'video' ? o.usd_per_unit : null;
      case '1k_characters': return kind === 'tts' ? o.usd_per_unit * 90 : null;      // an hour of speech is about 15,000 words, roughly 90,000 characters
      case 'audio_minute': return kind === 'tts' || kind === 'stt' ? o.usd_per_unit * 60 : null;
      case 'audio_hour': return kind === 'tts' || kind === 'stt' ? o.usd_per_unit : null;
      default: return null;
    }
  }
  /* Seconds of machine time for one unit. */
  function secPerUnit(r, m) {
    if (r.seconds == null) return null;
    if (m.kind === 'tts' || m.kind === 'stt') return r.seconds / ((m.typical_workload || {}).audio_seconds || (m.kind === 'tts' ? 10 : 60)) * 3600;
    return r.seconds;
  }

  function computeMedia(H) {
    const S = H.S, c = cfg(S);
    const kind = mediaKind(S);
    const MU = window.MediaUI;
    const w = { imgMP: S.imgMP || 1.05, vidMP: S.vidMP || 0.92, vidSec: S.vidSec || 5 };
    const kinds = kind === 'image' ? ['image', 'image-edit'] : [kind];
    const list = D.media.filter(x => kinds.includes(x.kind));
    if (!c.mediaId || !list.some(x => x.id === c.mediaId)) {
      const machine = H.currentMachine();
      const ranked = list.map(x => MU.evaluate(x, machine, w)).filter(Boolean).filter(r => r.fit === 'gpu' && r.seconds != null).sort((a, b) => MU.score(b) - MU.score(a));
      let pick = ranked[0];
      if (!pick) {
        const ref = candidates().find(x => x.mem >= 80 && x.count === 1);
        if (ref) pick = list.map(x => MU.evaluate(x, ref.machine, w)).filter(Boolean).filter(r => r.fit === 'gpu' && r.seconds != null).sort((a, b) => MU.score(b) - MU.score(a))[0];
      }
      c.mediaId = (pick || { model: list[0] }).model.id;
    }
    const m = list.find(x => x.id === c.mediaId);
    const profs = mediaProfiles(kind);
    const prof = profs.find(p => p.id === c.mediaHow) || profs[1] || profs[0];
    const units = c.mediaUnits || prof.units_per_month;
    const who = { id: 'me', power: 'household' };
    const kwh = kwhPrice(c, c.mediaBusiness ? { power: 'business' } : who);
    const hoursOn = c.hours === 'all' ? 730 : c.hours === 'office' ? 176 : 88;
    const months = c.years * 12;
    const admin = (c.admin || 0) * 60;

    // buying: the user's own machine if it can do it, otherwise the cheapest suitable machine in the list
    const machineNow = H.currentMachine();
    const own = (() => { const r = MU.evaluate(m, machineNow, w); const sp = r && r.fit === 'gpu' ? secPerUnit(r, m) : null; return sp ? { r, sp, machine: machineNow } : null; })();
    let best = null;
    for (const cand of candidates()) {
      const r = MU.evaluate(m, cand.machine, w);
      if (!r || r.fit !== 'gpu' || r.verdict.id === 'slow') continue;
      const sp = secPerUnit(r, m); if (!sp) continue;
      const busyH = units * sp / 3600;
      const machines = Math.max(1, Math.ceil(busyH / (0.5 * hoursOn)));
      if (machines > 4) continue;
      const power = monthlyPower(cand.power * machines, Math.min(1, busyH / (machines * hoursOn)), kwh, hoursOn);
      const tco = cand.price * machines + (power + (machines - 1) * 120 + admin) * months;
      if (!best || tco < best.tco) best = { cand, r, sp, busyH, machines, power, tco };
    }
    let local = null;
    if (c.owned && own) {
      const busyH = units * own.sp / 3600;
      const power = monthlyPower(((machineNow.isCpu ? 150 : machineNow.unified ? 100 : 350 * (machineNow.count || 1) + 150)), Math.min(1, busyH / hoursOn), kwh, hoursOn);
      local = { cand: null, machines: 1, upfront: 0, power, admin, amort: 0, monthly: power + admin, fixedMonthly: power + admin, usingOwn: true, sp: own.sp, busyH };
    } else if (best) {
      const amort = best.cand.price * best.machines / months;
      local = { cand: best.cand, machines: best.machines, upfront: best.cand.price * best.machines, power: best.power, admin, amort, monthly: amort + best.power + admin, fixedMonthly: best.power + admin, usingOwn: false, sp: best.sp, busyH: best.busyH };
    }

    // hosted services
    const offers = (((P && P.media_api) || []).find(x => x.model_id === m.id) || { offers: [] }).offers
      .map(o => ({ o, per: perUnitPrice(o, kind, w) })).filter(x => x.per != null).sort((a, b) => a.per - b.per);
    const api = offers.length ? { best: offers[0].o, per: offers[0].per, offers, monthly: offers[0].per * units, kind: 'listed' } : null;

    // rented GPU, billed only while it works (plus a quarter for starting up)
    let rent = null;
    for (const g of (P && P.gpu_rental) || []) {
      const h = D.hardware.find(x => x.id === g.hardware_id);
      const gos = (g.offers || []).filter(o => o.usd_per_gpu_hour != null);
      if (!h || !gos.length) continue;
      const od = gos.filter(o => o.type === 'on-demand');
      const offer = (od.length ? od : gos).slice().sort((a, b) => a.usd_per_gpu_hour - b.usd_per_gpu_hour)[0];
      for (const count of [1, 2, 4]) {
        const machine = E.buildMachine(h, { count, memoryGB: h.memory_gb, ramGB: 128, ramBandwidth: 80 });
        const r = MU.evaluate(m, machine, w);
        if (!r || r.fit !== 'gpu' || r.verdict.id === 'slow') continue;
        const sp = secPerUnit(r, m); if (!sp) continue;
        // more cards do not make one picture faster, so use the single-card time and one card
        if (count > 1) continue;
        const perUnit = sp / 3600 * offer.usd_per_gpu_hour * 1.25;
        const monthly = perUnit * units + admin;
        if (!rent || monthly < rent.monthly) rent = { g, h, offer, count, perUnit, monthly, sp, hours: units * sp / 3600 * 1.25, kind: 'media' };
      }
    }

    // paid reference
    const closedList = ((P && P.media_closed) || []).filter(x => x.kind === (kind === 'image' ? 'image' : kind));
    const closedOffers = closedList.map(x => ({ x, per: perUnitPrice(x, kind, w) })).filter(y => y.per != null).sort((a, b) => a.per - b.per);
    const closed = { flag: closedOffers.length ? Object.assign({ model: closedOffers[0].x.product, vendor: closedOffers[0].x.vendor, monthly: closedOffers[0].per * units }, closedOffers[0].x) : null, small: null, sub: null, subMonthly: null };
    return { c, kind, m, w, prof, profs, units, local, api, rent, closed, own, hoursOn, kwh, list, use: { users: 1, tokens: 0 } };
  }

  function renderMedia(root, H) {
    const S = H.S, c = cfg(S);
    if (!P) { root.innerHTML = '<div class="empty"><h3>Price data is missing</h3></div>'; return; }
    const r0 = computeMedia(H);
    root.innerHTML = `
      <div class="page-head"><h1>What would it cost?</h1>${ctxLine(H)}</div>
      ${modeSwitch(S)}
      ${S.mode === 'speech' ? `<div class="segmented segmented-sm" role="group" aria-label="Speech task" style="margin-bottom:var(--s-5)"><button type="button" data-csk="tts" aria-pressed="${(S.speechKind || 'tts') === 'tts'}">Text to speech</button><button type="button" data-csk="stt" aria-pressed="${S.speechKind === 'stt'}">Speech to text</button></div>` : ''}
      <div class="usefor"><label for="cMediaSel">For</label>
        <select class="select" id="cMediaSel">${r0.list.slice().sort((a, b) => a.name.localeCompare(b.name)).map(x => `<option value="${esc(x.id)}" ${x.id === r0.m.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
      <div class="asks"><div class="ask"><span class="ask-q">How much will you make?</span>
        <div class="segmented" role="group" aria-label="How much will you make?">${r0.profs.map(p => `<button type="button" data-mhow="${esc(p.id)}" aria-pressed="${r0.prof.id === p.id}">${esc(p.label)}</button>`).join('')}</div></div></div>
      <div id="costResult"></div>
      <details class="more" id="costAdjust"><summary>Change assumptions</summary><div class="more-body"><div class="assume-grid">
        <div class="field"><label for="aUnits">${r0.kind === 'image' ? 'Pictures' : r0.kind === 'video' ? 'Clips' : 'Hours of audio'} a month</label><input id="aUnits" type="number" min="1" max="10000000" step="1" value="${r0.units}"><span class="hint">Changing this overrides the choice above.</span></div>
        <div class="field"><label for="aYears">Years of use</label><select id="aYears">${[1, 2, 3, 4, 5].map(y => `<option value="${y}" ${c.years === y ? 'selected' : ''}>${yrs(y)}</option>`).join('')}</select><span class="hint">Hardware cost is spread over this time.</span></div>
        <div class="field"><label for="aRegion">Electricity price from</label><select id="aRegion">${((P.electricity || []).map(e => e.region)).map(r => `<option ${r === c.region ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select></div>
        <div class="field"><label class="switch"><input type="checkbox" id="aOwned" ${c.owned ? 'checked' : ''}><span>I already own suitable hardware</span></label><span class="hint">Then only power is counted for running it yourself.</span></div>
        <div class="field"><span class="field-label">Currency</span><div class="segmented segmented-sm" role="group" aria-label="Currency">${CURRENCIES.map(x => `<button type="button" data-cur="${x}" aria-pressed="${c.currency === x}">${x}</button>`).join('')}</div></div>
      </div></div></details>
      <p class="fine cost-foot" id="costFoot"></p>`;
    bindMode(root, H);
    $$('[data-csk]', root).forEach(b => b.addEventListener('click', () => { S.speechKind = b.dataset.csk; c.mediaId = null; H.save(); render(root, H); }));
    $('#cMediaSel', root).addEventListener('change', e => { c.mediaId = e.target.value; H.save(); render(root, H); });
    $$('[data-mhow]', root).forEach(b => b.addEventListener('click', () => { c.mediaHow = b.dataset.mhow; c.mediaUnits = null; H.save(); render(root, H); }));
    const rer = () => { H.save(); render(root, H); $('#costAdjust').open = true; };
    $('#aUnits', root).addEventListener('change', e => { c.mediaUnits = Math.max(1, +e.target.value || 1); rer(); });
    $('#aYears', root).addEventListener('change', e => { c.years = +e.target.value; rer(); });
    $('#aRegion', root).addEventListener('change', e => { c.region = e.target.value; rer(); });
    $('#aOwned', root).addEventListener('change', e => { c.owned = e.target.checked; rer(); });
    $$('[data-cur]', root).forEach(b => b.addEventListener('click', () => { c.currency = b.dataset.cur; H.save(); updateMedia(root, H); $$('[data-cur]', root).forEach(x => x.setAttribute('aria-pressed', x === b)); }));
    updateMedia(root, H);
  }

  function updateMedia(root, H) {
    const c = cfg(H.S), cur = c.currency;
    const r = computeMedia(H);
    const loc = r.local;
    const lowest = Math.min(...[loc && loc.monthly, r.api && r.api.monthly, r.rent && r.rent.monthly].filter(v => v != null));
    const word = unitWord(r.kind, 2);
    // the cost of one item, to make the monthly figure concrete
    const per = x => x == null ? '' : `${moneyFine(x, cur)} each`;
    const buyTile = loc
      ? tile('Buy and run it yourself', money(loc.monthly, cur), loc.usingOwn ? 'Power only, on your own machine' : `${money(loc.upfront, cur, { whole: true })} upfront, spread over ${yrs(c.years)}, plus power`, `${esc(loc.usingOwn ? 'Your machine' : loc.cand.label)}. About ${fmtDur(loc.sp)} per ${unitWord(r.kind, 1)}.`, loc.monthly === lowest, null)
      : tile('Buy and run it yourself', '–', 'No machine in our list does this comfortably', '', false);
    const apiTile = r.api
      ? tile('Hosted service', money(r.api.monthly, cur), `Cheapest of ${r.api.offers.length}: ${esc(r.api.best.provider)}`, `${per(r.api.per)} · ${esc(r.api.best.unit_detail || '')}`, r.api.monthly === lowest, 'A company that runs the model for you and charges for each picture, clip or minute of audio.')
      : tile('Hosted service', '–', 'No price found for this model', '', false, 'A company that runs the model for you and charges for each picture, clip or minute of audio.');
    const rentTile = r.rent
      ? tile('Rent a GPU', money(r.rent.monthly, cur), `1 × ${esc(r.rent.h.name.replace(/^NVIDIA /, ''))}, paid only while it works`, `${money(r.rent.offer.usd_per_gpu_hour, cur)} per hour at ${esc(r.rent.offer.provider)} · ${per(r.rent.perUnit)}`, r.rent.monthly === lowest, 'Hire a graphics card from a cloud company by the hour and run the model on it yourself. Here you pay only for the time it is busy, plus a quarter for starting up.')
      : tile('Rent a GPU', '–', 'No rentable GPU does this', '', false, 'Hire a graphics card from a cloud company by the hour and run the model on it yourself.');
    const hl = headline(Object.assign({}, r, { use: { users: 1, tokens: 0 } }), cur);
    const paid = r.closed.flag ? `<p class="paid-ref"><span class="label">For comparison, a paid service</span>${esc(r.closed.flag.vendor)} ${esc(r.closed.flag.model)}: ${money(r.closed.flag.monthly, cur)} a month for the same amount. It runs a different model with different features, so use it only as a rough reference.</p>` : '';
    $('#costResult', root).innerHTML = `<div class="cost-answer"><p class="cost-big">${esc(hl.big)}</p><p class="cost-sub">${esc(hl.sub)}</p></div>
      <div class="tiles">${buyTile}${apiTile}${rentTile}</div>
      ${chartHtml(r, cur, Math.min(760, (root.clientWidth || 760)))}
      ${paid}
      <p class="small reasons">That is ${r.units.toLocaleString('en-GB')} ${word} a month. Speed numbers are rough: they are scaled from a measured run on another graphics card.</p>`;
    $('#costFoot', root).innerHTML = `Prices are snapshots from ${esc((P.meta && P.meta.as_of) || '')} and change often. Hardware, rental and service prices are before VAT; household electricity includes it. 1 USD = ${fxOf('EUR')} EUR = ${fxOf('SEK')} SEK. Not included: staff time (unless set), software setup, and the quality difference between models.`;
  }
  function fmtDur(s) { return s < 90 ? Math.round(s) + ' seconds' : s < 5400 ? Math.round(s / 60) + ' minutes' : (Math.round(s / 360) / 10) + ' hours'; }

  window.CostsUI = { render };
  // the router ran before this script was loaded: draw the page now if we are on it
  if ((location.hash || '').startsWith('#/costs')) window.dispatchEvent(new Event('hashchange'));
})();
