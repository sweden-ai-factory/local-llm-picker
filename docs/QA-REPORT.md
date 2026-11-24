# QA report, Local LLM Picker (2026-11-19)

Test scripts (throwaway) are in the session scratchpad: calib.js, fit.js, sanity.js, grid.js, uimachine.js.

## A. Numbers

### A.1 Engine logic: bugs found and fixed

| File | Fix |
|---|---|
| src/engine.js | Speed for models with `params_resident_b` (Gemma 4 E2B/E4B, Qwen3.8 Flash Next, DeepSeek V4.1 Flash): active share was divided by `params_total_b` while the weights in memory use `params_resident_b`. Gemma E2B/E4B were treated as MoE and read only 45-56% of their weights per token (speed about 2x too high). Now active / resident. |
| src/engine.js | Efficiency constants recalibrated per class (see A.2). Per-token fixed cost now per class (GPU 1 ms, Mac/shared and CPU 2 ms) instead of 3 ms everywhere; MoE routing adds 2x that (was +1.5 ms flat). RAM efficiency is one named constant (CPU_RAM_EFF = 0.5) used for CPU-only and for spill-over. |
| src/engine.js | RAM spill-over capacity was `(RAM - 6) x 0.85`, CPU-only used `RAM x 0.85`. So adding a 2 GB graphics card *reduced* what fits (16 GB RAM: 10.4 GB vs 13.6 GB). Now `RAM x 0.85 - 1`. |
| src/app.js | Memory-type choices (no-graphics-card path, and the default for RAM spill-over) were about 75% of spec-sheet values while the engine already discounts spec-sheet values by 50%: CPU speed was counted twice too low. Now spec-sheet values (25/50/80/120/300 GB/s), default 80 (DDR5). Old saved values snap to the nearest option. Help text no longer says "keep the middle option" (there were 4 options). |
| src/app.js | Size guide: moving VRAM from "None" to 2 GB dropped the comfortable size from 7.5B to 1B. Comfortable now also counts what runs on the processor alone; headline speed taken at the unrounded limit. |
| src/app.js | Hardware dialog: processor-only entries showed a "Memory size of your card" select that had no effect (the RAM select is what counts). Hidden for processor entries. |
| src/media.js | Speed scaling mixed units: reference cards without a TFLOPs figure (all consumer cards) were scaled with a bandwidth proxy while the user's card used real TFLOPs (H100 came out about 20x faster than an RTX 4070 SUPER). Now both sides use the same basis. |
| src/media.js | Speech models that ship only an fp32 file (Piper voices, Supertonic 3) were silently dropped from the speech list. Now shown, labelled "Original (32-bit)". |

### A.2 Calibration (llama-bench, Llama 2 7B Q4_0, 78 entries, estimate / measured tokens per second)

| Group | n | Before median (range) | After median (range) |
|---|---|---|---|
| All | 78 | 0.69 (0.42-1.54) | 0.92 (0.61-2.03) |
| NVIDIA desktop | 19 | 0.65 (0.52-1.05) | 0.86 (0.80-1.38) |
| NVIDIA datacenter (P100, P40, V100, T4, A30, A40, L40) | 7 | 0.80 (0.65-1.43) | 1.15 (0.92-1.98) |
| AMD desktop (Vulkan) | 18 | 0.64 (0.42-0.82) | 0.85 (0.61-1.10) |
| Laptops (RX 6600M, RX 6800M, Arc A770M) | 3 | 0.89 / 1.48 | 1.12 / 1.95 |
| Apple | 22 | 0.72 (0.61-1.07) | 0.97 (0.83-1.47) |
| Other shared memory (Strix Halo, DGX Spark, Jetson) | 3 | 0.65 | 0.88 |
| Intel Arc (Vulkan) | 7 | 1.05 (0.68-1.54) | 1.34 (0.92-2.03) |
| CPU only | 0 | no benchmark data | unchanged (50% of spec-sheet RAM bandwidth) |

Entries off by more than 40%: before 10 (RTX 4090/5080/5090/5070 Ti, RX 7900 XTX/9070 XT/6500 XT, Arc A750/A770M, P100); after 5: Arc A750 (2.0x), A770 (1.8x), A770M (2.0x), Tesla P100 (2.0x), M1 Ultra (1.47x). M2/M3 Ultra 1.30/1.36x. These chips reach only 33-45% of their bandwidth in llama.cpp; the UI path keeps only class/bandwidth, so a per-chip factor would need a data field (not done).

Settings are about 10% below llama-bench on purpose (K-quants, Ollama and longer chats are slower than llama-bench tg128).

### A.3 Sanity cases (after fixes; 8k context, 1 user, 4-bit unless noted)

See final summary table in the agent report; full output from sanity.js:

| Case | Need / fast GB | Result | Est. t/s | Widely reported |
|---|---|---|---|---|
| RTX 4090 + Olmo 3.1 32B | 21.7 / 22.8 | fits | 36.8 | ~35-40 |
| RTX 3090 + Gemma 4 31B | 22.2 / 22.8 | fits (tight) | 35.1 | ~30-35 |
| RTX 4090 + 64 GB RAM + Apertus 70B | 49.6 / 22.8+53 | spills to RAM | 1.4 | ~1.5-3 |
| 2x RTX 3090 + Apertus 70B | 49.6 / 43.8 | spills to RAM | 4.9 | fits on GPUs, ~15 (see remaining issues) |
| RTX 3090 + 64 GB + gpt-oss-120b | 70.5 / 22.8+53 | spills | 17.7 | ~15-25 |
| RTX 4090 + gpt-oss-20b | 13.6 / 22.8 | fits | 170 | ~150-220 |
| RTX 3050 Laptop 4 GB + 16 GB + Granite 8B | 7.8 / 3.8+13 | spills | 8.7 | ~5-10 |
| RTX A500 Laptop 4 GB + 16 GB + Qwen3.5 9B | 8.3 / 3.8+13 | spills | 7.6 | ~4-8 |
| CPU DDR4 laptop 16 GB + Olmo 3 7B | 6.6 / 13.6 | fits | 5.1 | ~4-6 |
| CPU DDR5 laptop 16 GB + Olmo 3 7B | 6.6 / 13.6 | fits | 8.9 | ~7-10 |
| RTX 3060 12 GB + Qwen3.5 9B | 8.3 / 11.4 | fits | 43 | ~45-55 |
| M1 Max 64 GB + Apertus 70B | 49.6 / 48.0 | does not fit (4k ctx: 48.3, no) | – | runs, ~7-8 (tight) |
| M4 Max 128 GB + Qwen3.6 35B-A3B | 24.6 / 96 | fits | 97 | ~80-100 |
| M3 Ultra 512 GB + Qwen3.5 397B-A17B | 254 / 384 | fits | 46 | ~25-35 (Ultra over-estimate) |
| DGX Spark + gpt-oss-120b | 70.5 / 115 | fits | 50 | ~40-50 |
| Ryzen AI Max+ 395 128 GB + gpt-oss-120b | 70.5 / 96 | fits | 48 | ~40-50 |
| RTX 5090 + Qwen3.8 27B | 19.9 / 30.4 | fits | 73 | ~65-75 |
| 8x H100 box + GLM-5.3 FP8 (753B) | 797 / 584 | does not fit in GPU memory | (3.4 with 1 TB RAM) | does not fit 640 GB: correct |
| 8x H200 box + GLM-5.3 FP8 | 797 / 1029 | fits | 69 | ~50-80 single user |
| 1x H100 + Apertus 70B 8-bit | 83.5 / 76 | spills | 4.6 | FP8 (8.0 bit) fits tight; app has only Q8_0 (8.5 bit) |

### A.4 / A.5 Grid checks

- 629,370 text estimates (321 hardware entries x memory options x 1/2/4 cards x RAM 16/64/256 x 10 models incl. native FP4, resident-param and 2.8T MoE x 7 precisions x 3 context/user settings): no NaN/Infinity/negative values; max 983 t/s, min 0.08 t/s; no case where more VRAM or more RAM makes the best pick fit worse.
- 1,224 media estimates (34 models x 6 hardware x 2 RAM x 3 workloads): finite; only video on CPU gives absurd times (5 s Wan 2.2 clip: 10 days), shown as "Slow" with the time.
- Size guide in the page: VRAM 0..512 x RAM 4..2048 (336 combinations), shared memory 8..512, context/users/bandwidth extremes: no exceptions, no NaN; after the fix no case where more memory lowers any of the three numbers (before: 28 cases, all at VRAM None -> 2 GB).
- 8-GPU boxes: memory_gb is the box total and is not multiplied (UI passes memoryIsTotal; box shows no stepper, count = gpus_per_system only for TFLOPs and the multi-user boost). Tensor-parallel speed boost only with >= 4 users, as designed.

## B. Functional walk-through (browser, scripted clicks)

Tested: Size guide sliders (VRAM 0..512 incl. None, RAM, shared switch), headline, three numbers, ruler, class rows, Fine-tune (context, users, memory speed and reset); hardware dialog (search "A500" finds RTX A500 Laptop, all six category chips, select, card stepper 1->2, RAM select, memory option select on a Mac, DGX H100 box shows no stepper and is not multiplied: "640 GB graphics", custom form with 0 GB); Models (text/image/video/speech tabs, TTS/STT switch, all goal chips, all four sorts, row expand, Adjust: context 1M, quality ceiling, commercial switch, Open in calculator); Calculator (real model, precision buttons, MoE toggle and share, size 0.3B..1.5T, users 128, context 2M, KV precision); Learn (13 chapters render, 8 range demos and 53 toggle buttons respond, deep link #/learn/speed scrolls to the chapter and highlights it in the index); back/forward and reload keep route and state. No console errors, no NaN/undefined in page text.

Fixed:
- src/app.js: custom hardware with 0 GB on a graphics card used the card's bandwidth (default 500 GB/s) as RAM speed, so "no card, 64 GB RAM" claimed 49B comfortable. Now RAM speed applies (7.5B).
- src/engine.js: context lengths of 1,048,576 / 2,097,152 tokens were shown as "1.048576M" / "2.097152M". Now "1M" / "2M".
- src/app.js: headline read "That is the mid-size size class". Now "That is a mid-size model."

Not fixed / notes:
- "Only models you may use commercially" changes nothing in the text list: no LLM licence matches the non-commercial pattern (see E).
- Calculator: a real model's active share is stored as a whole percent (gpt-oss-120b shows 4.67B active instead of 5.1B). Low.
- Deep links scroll smoothly; the index highlight is right once scrolling ends (~1 s).

## C. Layout and design

Automated checks on every route at 1280x800 and 375x812: no horizontal overflow, no element past the right edge, both partner logos visible, in view and undistorted (0.0%) on every route at both sizes; top bar is sticky (65 px desktop, 107 px phone).

Fixed:
- src/styles.css: muted text colour (--ink-3 #7a7c88) had 4.15:1 contrast on white and 3.74:1 on lavender, used for all labels, help and fine print (about 330 text elements). Now #656775 (5.6:1 / 5.0:1). Footer "Method" label raised from 65% to 80% white.
- src/styles.css: phone tap targets: nav links, segmented buttons, chips, small buttons, "More" expanders and selects were 25-38 px tall. Now at least 44 px on screens up to 640 px.

Remaining:
- Learn chapter index links on phone are 35x30 px (learn.css, other agent's page). Medium.
- The phone top bar takes 107 px (logo + partners row, then nav row). Acceptable, but heavy. Low.
- Status colours always come with a text label (badges, ruler caption names "Green"/"Orange" in words). OK.
- Removed or hidden: the "Memory size of your card" select for processor-only entries (it had no effect). Nothing else removed.

## D. Copy review (partial, time-limited)

Scanned src/app.js, src/media.js, src/learn.html, src/learn.js and the good_for / weak_at / license_note / notes strings in both model files for hype words (revolutionary, seamless, powerful, unlock, supercharge, game-changing, cutting-edge, state-of-the-art, stunning, amazing), announcing phrases, "it's not about" and American spellings (color, optimize, behavior, analyze, center): no hits in visible text. A full read for rhetorical questions, triplet rhythm and restating summary lines was not done (time).

Fixed in src:
- app.js: "That is the mid-size size class" -> "That is a mid-size model."
- app.js: help text "keep the middle option" (there were four options) -> concrete advice (DDR5 for 2022 or later, DDR4 for older).
- app.js: model rows showed raw data ids as tags ("long-context", "multilingual", "agents"). Now plain labels (Long documents, Many languages, Agents and tools, Coding, Reasoning).
- app.js: the "MoE" tag on model rows had no explanation. Added a tooltip.
- media.js: "Check licence" tag now also appears for region bans and revenue caps (MiniMax H3 and H3-Image: not licensed in the EU/UK/USA/South Korea; HunyuanVideo 1.5: not in the EU/UK/South Korea; LTX-2.5 and Krea 2 Turbo: revenue caps). Before, only "non-commercial"/"research" licences were tagged; EU readers could pick a model they may not use.

Jargon still without an in-place explanation: "tokens per second" (explained only on Learn), "4-bit"/"Q4_K_M" in row details (the precision line explains it in words), "KV precision" aria-label (not visible). Low.

## E. Data integrity (report only, nothing edited)

| File | id | Problem |
|---|---|---|
| hardware.json | nvidia-h20 | bandwidth_gbs is null (H20 is about 4,000 GB/s). The UI then guesses 1,800 GB/s from the memory size. |
| hardware.json | (none) | No duplicate ids, no names with "undefined"/"null", all memory_gb present, all memory_gb values are in memory_options_gb, no bandwidth/memory outliers by ratio. |
| models-llm.json | gemma-4-e2b, gemma-4-e4b | arch "dense" with params_active_b < params_total_b; correct only together with the params_resident_b override (engine now uses resident params for the active share). |
| models-llm.json | mistral-medium-3.5-128b | Licence bars companies above US$20M monthly revenue, but commercialOk() lets it through the "Only models you may use commercially" filter. |
| models-llm.json | lfm3-1.7b | Free commercial use only under US$10M annual revenue; not caught by commercialOk(). |
| models-llm.json | qwen3.8-flash-next | Hosted API and coding/office-assistant products need a separate licence; not caught. |
| models-llm.json | (all) | No LLM licence matches the non-commercial pattern, so the commercial-use switch currently hides nothing. Consider a data field such as `commercial: "yes" / "limited" / "no"` instead of text matching. |
| models-llm.json | (all) | context_max >= 8,192 for every model; no duplicate ids; all hf_repo/gguf_repo look like owner/name. |
| models-media.json | minimax-h3, minimax-h3-image, hunyuanvideo-1.5 | Not licensed in the EU (and UK etc.). Shown in licence notes; now tagged "Check licence" in the list. Consider hiding or warning more strongly for an EU audience. |
| models-media.json | piper-voices, supertonic-3 | Only an fp32 size; were dropped from the list before the media.js fix. |
| models-media.json | wan2.2 on CPU | Not a data error: video on a processor gives multi-day estimates; consider marking video as "needs a graphics card". |

## Remaining issues (not fixed)

| Severity | Issue |
|---|---|
| Medium | Memory sizes are compared without converting GiB (how cards and RAM are sold) to GB (how model files are counted): about 7% too conservative, plus 0.95 driver reserve and 0.96 per extra card. Results: 2x 24 GB cards do not fit a 70-72B model at 4-bit with 8k context, a 64 GB Mac does not fit a 70B 4-bit model; both work in practice (tight). Fix would be x1.074 on capacities in buildMachine plus a note in the UI. |
| Medium | Intel Arc A-series (A750/A770/A770M) and Tesla P100 estimated about 2x too fast, M1-M3 Ultra about 1.3-1.5x too fast (MoE on Ultra too). Needs a per-chip efficiency field in hardware.json; the slider-based machine does not keep vendor or chip. |
| Medium | MoE speeds on Macs and shared-memory chips are based on reported figures, not a benchmark set; gpt-oss bf16 attention layers make real reads larger than active x 4.6 bits. |
| Low | No FP8 (8.0 bit) choice for models that are not released in FP8; 8-bit means Q8_0 (8.5 bit), so 70B at 8-bit on one 80 GB card shows "spills". |
| Low | Media: when nothing fits fully, the picker prefers a 2-bit GGUF fully on the card over an 8-bit file with offloading (e.g. Wan 2.2 A14B on a 24 GB card). |
| Low | FP4 media files are never chosen when the machine comes from the sliders (no fp4_support on the synthetic machine). |
| Low | Learn index links on phone are 35x30 px. |

## Follow-up fixes (2026-11-19, after the first QA pass)

- Memory sizes are now treated as binary gigabytes (spec sheets say "24 GB" but mean GiB): src/engine.js, constant GIB. Speed is unchanged; fit is about 7% less cautious.
- Per-chip speed correction (`eff_scale`) for chips where the estimate was more than 20% off the llama.cpp benchmarks: data/hardware-overrides.json, merged by build.mjs, applied in buildMachine. Intel Arc A-series without their own measurement use the family median (0.5), Apple Ultra chips 0.76. After the correction the median estimate/measured ratio on the 78 benchmarked entries is 0.98 and none is more than 40% off. Note: this is in-sample (the corrections were fitted to the same measurements); the family medians for unmeasured chips are estimates.
- Licence switch on the Models page now keeps only permissive licences (Apache-2.0, MIT, OpenMDW, NVIDIA Open Model Agreement); other licences may allow business use with conditions.
- Learn chapter links on phones are at least 44 x 44 px.

---

# Round 2 (2026-11-23)

Scope: the guided path (Machine, Sizes, Models, Costs, plus Calculator and Learn), the new Costs page (src/costs.js, data/pricing.json), Learn chapter 11 and the restructured media tab. Throwaway scripts are in the session scratchpad: harness.js loads src/engine.js and src/costs.js in a Node VM with the internals exposed; loop.js, scen.js, hand.js, data.js and copyscan.txt build on it. Browser checks ran on the built file at http://localhost:8766 at 1280x800 and 375x812. The browser pane was hidden for the whole session, so smooth scrolling and requestAnimationFrame did not run; Learn deep links were checked with an instant-scroll shim (see B).

## A. Cost engine

### A.1 Bugs found and fixed (src/costs.js)

| # | Problem | Effect before | Fix |
|---|---|---|---|
| 1 | `powerW` multiplied `power_w` of complete 8-GPU systems by 8 (hardware.json gives the whole-system draw, e.g. DGX B300 14,000 W) | DGX B300 counted at 112,000 W, DGX H100 at 81,600 W | complete systems use `power_w` as it is |
| 2 | 8-GPU systems built with `count: 1` | TFLOPs and multi-card speed of a single GPU (989 instead of 7,916 TFLOPs for a DGX H100); step 1 uses `count = gpus_per_system`, so the two pages disagreed | engine gets `count: gpus_per_system`; the price is still counted once |
| 3 | Prompt-reading (prefill) fallback `bw x 0.04` when TFLOPs are unknown, which is 259 of 321 entries (all GeForce, Radeon, Apple, Strix Halo); the card count was ignored | RTX 3090 about 1,100 and RTX 4090 about 1,150 tokens/s for an 8B model (llama.cpp users report roughly 5,000 and 12,000); 4 cards counted as 1. Bare GPUs needed too many machines, so Macs and rented T4s won by default | class-based ratio (discrete GPU 0.15, Apple or unknown shared memory 0.04, other shared memory 0.10, CPU 0.04) times the card count; now 3,500 / 3,800 tokens/s (still conservative); Macs and CPUs unchanged |
| 4 | Writing speed in the busy-time check taken at full batch (`cap.users`) even when only 1-2 people are active | busy time and power too low for single users and small teams | throughput at min(capacity, people active at once) |
| 5 | Processor-only machines priced as the RAM kit only (pricing.json notes: "RAM kit alone (no PC)", "RAM only ... no CPU or board"); host cost 0 | "desktop PC, 96 GB RAM" bought for $2,049, which is the RAM; EPYC server likewise | adds the rest of the computer: the host_system price minus the RAM it already contains (desktop $2,109 - $949, server $18,753 - $12,144) |
| 6 | Bare SXM/OAM modules (A100 SXM4, H100/H200 SXM, B200, MI300X, Gaudi 2) offered for purchase with a PCIe host; host_system says the 8-GPU chassis excludes the GPU board | "8 x A100 80GB SXM4, used" chosen in 11 of 576 cases | excluded from purchase (still rentable; complete 8-GPU systems still buyable) |
| 7 | More than four consumer or workstation cards put in a desktop or workstation host | "8 x RTX 3090" in a $12,386 workstation | more than 4 cards use the 8-GPU server chassis |
| 8 | `hwPrice` fell back to the single `usd` price for memory sizes without their own price | EPYC 3,072 GB priced at the 768 GB price ($30,732); same for Jetson Thor 64 GB, Snapdragon X2 Elite and multi-size entries priced only by approx_price_usd | sizes without a price are skipped |
| 9 | The user's own machine counted as "enough" even when the load needs several machines | 100 users on one owned card: electricity for N machines, no purchase | own machine counts only when one machine carries the load; the "I already own" switch now says when it cannot apply |
| 10 | Own machine had to hold the model fully in graphics memory at 4-bit | default machine plus the step 3 best pick: "Your current machine cannot run this model" right after step 3 recommended it | one person may use RAM spill-over on their own machine, as on step 3 (hardware to buy or rent must still fit fully) |
| 11 | The paid-assistant reference included Mistral Large 4 and Small 4, which are open-weight (Large 4 is in models-llm.json) | "Paid assistant" line was always Mistral Large 4 ($0.7/$2.1) | entries whose note says "Open weights" (or with `open_weights: true`) are left out; the flagship reference is now grok-4.7 |
| 12 | CPU label regex had lost its backslashes (`/s*([^)]*)s*$/`) | label " desktop PC, dual-channel DDR5 (5600-6400), 96 GB RAM" | "Desktop PC, dual-channel DDR5, 96 GB RAM" |
| 13 | "about 0 million tokens a month"; break-even note "This use is about 1 million" for 0.29 million; "words-worth of text in ... (in tokens)" | wrong or contradictory numbers in "How this is calculated" | token formatter (thousand / million / billion); usage line rewritten with tokens in and out, 22 working days and the cached share |
| 14 | "spread over 1 years", "Buying takes 1 years" | plural | `yrs()` helper |
| 15 | Chart ticks were round numbers in USD, then converted (EUR 1.1k / 2.3k / 3.4k / 4.5k); end labels could be pushed below the plot; text about 5 px tall on a phone (760 px viewBox shown at 343 px) | odd ticks, unreadable on phones | ticks round in the shown currency; labels kept inside; chart drawn at its real width (narrow layout under 520 px); the paid line is dropped and named in the caption when it would squash the three real options (e.g. grok-4.7 at EUR 99k for 10 coders) |
| 16 | Footer "Amounts are before VAT" (household electricity includes VAT); fx shown as 0.9099 / 10.2025; ISO date | | "Hardware, rental and API prices are before VAT; household electricity includes it", "1 USD = 0.91 EUR = 10.2 SEK", "23 November 2026" |
| 17 | No warning when a model's context is shorter than one request (EuroLLM 9B/22B 32k, Olmo 3 7B and 3.1 32B 64k, against the 50k-token coding profile) | | notice under the headline |
| 18 | The Costs default model used a different rule from step 3's best pick | | both use `PickerApp.pickBest` |
| 19 | "Google Google AI Plus" | | vendor not repeated |
| 20 | Used cards not marked as used | | label ends ", used" when the price kind is used |

### A.2 Hand-checked scenarios

Independent re-computation from pricing.json (hand.js, no costs.js code) against the page tiles after the fixes. Format: expected / page.

| Scenario | Tokens in / out a month | Hosted API | EU offer | Rent | Buy upfront | Buy a month (spread price + power) | Headline |
|---|---|---|---|---|---|---|---|
| Gemma 4 31B, 1 user, daily, EUR | 2.64 M / 0.40 M (30% cached) | CoreWeave €0.36 / €0.36 | NextBit €0.39 / €0.39 | RTX 3090 $0.265 x 88 h: €21 / €21 | €1,203 / €1,203 | 33.4 + 0.9 = €34 / €34 | hosted API cheaper |
| Qwen3.6 35B-A3B, 10 users, coding, EUR | 4.4 B / 26.4 M (90% cached) | CoreWeave €188 / €188 | OVHcloud €778 / €778 | 2 x RTX 4000 Ada $0.224 x 176 h: €72 / €72 | 2 x RX 9070 + desktop €3,282 / €3,282 | 91 + 5 = €96 / €96 | buying takes 4.1 years (3,607 / (79.1 - 5.8) = 49 months) |
| gpt-oss-120b, 100 users, documents, EUR | 550 M / 17.6 M | CoreWeave €18 / €18 | OVHcloud €51 / €51 | 2 x RTX A6000 $0.484 x 730 h: €643 / €643 | M4 Max 128 GB €3,184 / €3,184 | 88 + 2.3 = €91 / €91 | hosted API cheaper |
| Qwen3.5 9B, 1 user, occasional, SEK | 220 k / 66 k | SiliconFlow 0.33 kr / 0.33 kr | OVHcloud 0.36 kr / 0.36 kr | T4 $0.133 x 88 h: 119 kr / 119 kr | M4 16 GB 6,111 kr / 6,111 kr | 170 + 4 = 174 kr / 174 kr | hosted API cheaper |
| Gemma 4 12B (no offer: 5-15B band), 10 users, daily, EUR | 26.4 M / 3.96 M | band $0.15 / $0.47: €5.30 / €5.30 | none | T4 $0.133 x 176 h: €21 / €21 | M6 16 GB €818 / €818 | 23 + 0.7 = €23 / €23 | hosted API cheaper |
| Mistral Small 4, 100 users, coding, USD | 44 B / 264 M | Mistral $1,412 / $1,412 | Mistral EU $1,554 / $1,554 | 8 x T4 $0.133 x 730 h: $777 / $777 | 4 x Arc Pro B70 + workstation $19,730 / $19,730 | 548 + 44 = $592 / $592 | pays for itself after 27 months (19,730 / (776.7 - 44.0) = 26.9) |

Power checked by hand for scenario 1: 1.848 M uncached input tokens at 164 tokens/s (25.6 TFLOPs x 0.4 / (2 x 31.3 B)) = 3.1 h, 0.396 M output tokens at 10.6 tokens/s = 10.4 h, busy 15.4% of 88 h; 0.12 kW x 88 h x (0.15 + 0.65 x 0.154) x $0.3365 = $0.89 (page $0.89). Scenario 6: 1.07 kW x 730 h x (0.15 + 0.65 x 0.439) x $0.1294 (business) = $44.0.

### A.3 Grid and edge cases

- 48 chat models x 4 profiles x 3 groups x 3 currencies = 1,728 cases, run in Node (harness) and in the page through `CostsUI.render` (DOM text and chart SVG). After the fixes: no NaN, Infinity, undefined, null or negative amounts, no exceptions, no chart label outside the SVG; every model gets a buy, rent and API result. Headlines: hosted API cheaper 394, pays for itself within the period 78, takes N years 89, renting cheaper 15 (same counts in Node and in the page).
- "No single machine fits": forced with a fake 20T / 400B-active model in the page. Headline "No single machine fits", buy and rent tiles show "–", API from the size curve (marked as an estimate), no error. With the real data even Kimi K3.1 Pro (DGX B300) and DeepSeek V4.1 Flash (M3 Ultra 512 GB) fit one machine, so the page shows that hardware.
- Owned hardware, 1-5 years, hours all / office / few, regions, staff hours, user override and currency switch were exercised in the page. Break-even follows months = upfront / (cheapest alternative a month - local power and staff a month).
- Prefill after the fix (8B model, 4-bit): RTX 3090 3,500, RTX 4090 3,800, RTX 5090 6,700, M2 Ultra 800, M4 Max 550, Strix Halo 640, desktop DDR5 processor 90 tokens/s; T4 (65 TFLOPs in the data) 1,600. All at or below what llama.cpp users report (from memory, not measured here).

## B. Guided path and layout

Walked as a beginner at 1280x800 and 375x812: sliders and their extremes, the shared-memory switch, the six example chips, "Choose from a list" (search "A500" finds RTX A5000 Laptop, RTX A500 Laptop and RTX A5000; all six category chips; "8-GPU" finds the five NVIDIA boxes; DGX H100 shows no stepper and "complete system with 8 graphics cards"), card stepper 1 to 3 to 1 (44x44 px buttons), custom form with 0 GB (gives the RAM-only machine), Sizes (answer, ruler, "what to expect" card, "Compare all sizes", "Change assumptions" including the bandwidth reset), Models (four modes, TTS/STT switch, all seven "I want to use it for" values, four sorts, quality ceiling, licence switch: 31 of 39 fit with it on), "What would it cost?" from the best pick and from a row (model carried: qwen3.8-27b, muse-glimmer-30b), "Calculator" from a row, Costs, Calculator (all precisions, MoE, size extremes), Learn (deep links #/learn/costs, /speed, /team and /licences put the chapter 111 px below the top, under the two bars, and the index highlights 11, 04, 10 and 12; checked with an instant-scroll shim because the hidden pane does not run smooth scrolling), back and forward between Models and Costs, reload keeps the route, model, group and use. An unknown hash falls back to step 1. No console errors from the app (the only errors in the log came from my own test shims).

Fixed:
- src/styles.css: `.section { padding: 44px 0 }` overrode the `.wrap` side gutter on every step page (`class="wrap section"`), so phones had a 0 px side margin. Now top and bottom only.
- src/styles.css: the "For" model select on Costs widened the page to 385 px on a 375 px phone (horizontal scrolling). `max-width: 100%`.
- src/styles.css: segmented controls that wrap onto several lines turned into ovals on phones (Costs "How do they use it?"); rounded box below 640 px.
- src/styles.css: tap targets under 40 px on phones: "Change" (55x23), the "What would it cost?" text link (149x25), "count only the running cost" (175x22), Learn glossary items (343x25); now 44 px. Stacked tiles had 8 px between them; now 26 px.
- src/app.js and styles.css: step 1's only primary button was below the fold at 1280x800 (top at 900 px). The answer and "See what fits" now share a row; the button sits at 735-796 px. On phones it stays full width under the answer.
- src/app.js: the step 3 best pick on the default machine (24 GB + 32 GB) was Qwen3.8 Flash-Next at 2-bit ("Large quality loss"), with a "Copy start command" for the q4_K_M tag (about 76 GB, does not fit). The best pick now needs 4-bit or better when such a model is usable (default machine: Qwen3.8 27B, 33.6 tokens/s); the start command is hidden when only a 2- or 3-bit file fits; "Other good options" lists 4-bit-or-better models first.
- src/app.js: Sizes said "Very large: Doesn't fit. It does not fit here even as a mixture-of-experts model" and then listed Qwen3.8 Flash-Next (at 2-bit) as a model "of this size that fits". Examples now use 4-bit or better, like the size limits.
- src/media.js: the image best pick was MiniMax-H3-Image, which is not licensed in the EU (HunyuanVideo 1.5 and MiniMax H3 likewise for video). Region-banned models are left out of the best pick and the four alternatives and stay in "All models" with the licence tag. The best pick prefers a model with a known speed (speech to text showed "– speed unknown"). The best-pick card says "Licence limits business use (...)" when that applies. Text-to-speech speed reads "20 s per minute of speech" instead of "3.1x real time of speech".

Visible without interaction after the fixes: step 1 about 110 words and one primary button; step 2 one large answer, the ruler, one "what to expect" card, two expanders and one primary button at the end; step 3 mode tabs, one select, the best-pick card (one white primary and one outline button), four rows, one expander and one primary button; Costs one headline, three tiles, the chart, two short notes and two expanders, with no primary button (last step). Removed or hidden in this round: the start command when only a 2- or 3-bit file fits; region-banned media models from the suggestions; the paid-assistant line when it would flatten the chart (named in the caption instead); open-weight Mistral models from the "paid assistants" reference.

## C. Copy

All visible text was extracted per route, with every expander and row detail open and in all modes (text, image, video, TTS, STT), and scanned for hype words, announcing phrases, rhetorical questions, "not X but Y", American spellings and raw identifiers. The Costs page and Learn chapter 11 were read in full. Chapter 11 needed no changes: it is plain, explains token, API, amortisation, break-even and utilisation where they first appear, and its worked numbers are right (€0.0046 per summary, €83 a month, 70 kWh and €18, demo 32 months at 1 billion tokens).

Fixed in src:
- costs.js: "API" and "GPU" were not explained anywhere on the Costs page; the tiles "Hosted API, same model" and "Rent a GPU" now have a "?" explanation (also as aria-label).
- costs.js: "this is a reference, not a like-for-like price" -> "They run different models with different features, so use these figures only as a rough reference."
- costs.js: "The hardware shown is an example that is." -> "..., so the price is for the cheapest hardware in our list that is."; "14000 W" -> "14,000 W"; usage line rewritten (A.1 #13).
- app.js: "34B" on step 1 had no explanation of "B"; "?" tip added. "roughly 23.2 words per second" -> "23" (also on the best pick and in the calculator). Empty state "Add memory, or try a model under 1B" now names context length, people at once and memory.
- media.js: "3.1x real time / of speech" -> "20 s / per minute of speech".

Data strings (not edited; suggestions):

| File | id | Field | Current | Suggested |
|---|---|---|---|---|
| models-llm.json | qwen3.8-flash-next | good_for | "Early look at Qwen's next design: excellent at fixing code by itself while still replying quickly." | "An early version of Qwen's next design. Good at fixing code by itself, and it still replies quickly." |
| models-llm.json | qwen3.8-flash-next | name and size | name says "(125B-A6B)", the size line shows "180B · 6B active" | show 125B (params_resident_b) in the size line, or explain the 51B lookup table in plain words |
| models-llm.json | qwen3.8-flash-next | license_note | "above 100M MAU" | "above 100 million monthly users" |
| models-llm.json | qwen3.8-flash-next | notes | "params_total_b counts everything in the checkpoint ... (llama.cpp --ple, build b12233 or newer, PR #31185) ..." | "The 180B count includes a 51B lookup table that can stay on the SSD. Needs a recent llama.cpp and about 64 GB of RAM and graphics memory together at 4-bit." |
| models-llm.json | gemma-4-e2b, gemma-4-e4b, deepseek-v4.1-flash-1017 | notes | "params_active_b holds the effective count", "(params_active_b)", "(params_total_b counts both)" | drop the field names, e.g. "Speeds use the 2.3B parameters it computes with." |
| models-llm.json | qwen3.8-27b, mistral-small-4-119b, inkling-2-small, glm-5.3, kimi-k3.1-pro | notes | "reasoning_effort ...", "clear_thinking=true" | "Thinking can be set to low, high or max in the engine settings." |
| models-media.json | ideogram-4 | output_limits | "Best-in-class text and typography" | "Very clear lettering in images" |
| models-media.json | parakeet-tdt-0.6b-v3 | notes | "Superseded within the family? No: still NVIDIA's multilingual Parakeet" | "Still NVIDIA's current multilingual Parakeet model" |
| models-media.json | flux3-image-klein, hidream-o1-image, ideogram-4, qwen-image-edit-2511, minimax-h3, ltx-2.5, wan2.2-a14b, hunyuanvideo-1.5, piper-voices, qwen3-tts-1.7b, nemotron-3.5-transcribe-30b-a4b, kokoro-82m, voxcpm2 | notes, speed_scaling | raw field and file names shown under "Good to know": typical_workload, text_encoder_gb(_by_precision), weights_gb_by_precision, speed_reference.seconds, weights_resident_fraction, params_total_b, inference_timesteps, model_fp16.onnx | rewrite as plain sentences, or move maintainer notes to models-media-notes.md |
| models-media.json | qwen-image-2.1 (notes twice, license_note), hidream-o1-image (license_note), krea-2-turbo (license_note), qwen-image-edit-2511 (notes), kandinsky-6-pro (notes), parakeet-tdt-0.6b-v3 (license_note), nemotron-3.5-transcribe-30b-a4b (license_note), fish-drama-3 (notes) | | "license" as a noun ("a separate license", "permissive license", "keep the license") | "licence" (keep product names such as "Community License") |
| pricing.json | usage_profiles, coding | basis | "Assumes about 20 active days a month" | the page uses 22 for every profile; align one or the other |
| pricing.json | usage_profiles, documents | basis | "25,000 tokens is about a 10-page report or a 12,000-word text" | 25,000 tokens is about 18,000 English words; Learn chapter 11 says a 20-page report is about 13,000 tokens |

In general the "Good to know" (notes) field of most models is maintainer shorthand (GGUF, FP8, MTP, KV cache, SWE-bench, PR numbers). It sits behind a row expander, so it does not get in the way of the beginner path, but it is not beginner English.

## D. Data integrity of pricing.json

Checked with data.js. Fine: all 48 api_open model_ids exist, and every chat model has an entry; all gpu_rental and hardware_prices ids exist in hardware.json; no open-model price above $100 per million tokens; no GPU hour below $0.05 or above $100; every offer has a url and a checked date; regions are global, EU, US, CH and CN; fx matches the ECB note (EUR 0.9099 = 1/1.0990, SEK 10.2025 = 11.2125/1.0990); closed_api tiers are flagship, mid and small; subscription seat types are individual, team and enterprise. Null entries are handled: the >250B curve band falls back to the <=250B band as a floor and the page says so; enterprise subscriptions without a price are skipped; offers with null prices are filtered out.

Problems (not edited):

| Item | Problem |
|---|---|
| closed_api: Mistral Large 4, Mistral Small 4 | open-weight models listed as closed assistants (Mistral Large 4 is also in models-llm.json). The code now skips notes that contain "Open weights"; an `open_weights: true` field, or removing them, would be cleaner. |
| hardware_prices: cpu-ddr5-dual-channel, epyc-9005-turin | the price is the RAM only (stated in the notes). The code now adds the rest of the computer; an explicit field (e.g. `covers: "ram-only"`) would be safer than relying on the class. |
| hardware_prices: apple-m4 ($599 for 16 GB), apple-m3-ultra | no longer sold new; Feb-Mar 2026 Apple list prices; the note says Apple raised the M4 by $200 in Aug 2026. The M4 16 GB is the cheapest buy option in 32 of 576 cases. |
| hardware_prices: ryzen-ai-max-395 32 GB ($1,322) | Swedish ex-VAT price of a product shown as out of stock; it is the cheapest buy option in 72 of 576 cases. |
| hardware_prices: ryzen-ai-max-pro-495 | priced at 128 GB, but hardware.json has only memory_gb 192 and no memory_options_gb, so the 128 GB price is never used. |
| hardware_prices: nvidia-a100-80gb-sxm | used $5,050 against hardware.json approx $19,000 (more than 3x); it is an SXM module and is now excluded from purchase. |
| hardware.json: apple-m5-ultra | approx_price_usd 5,499 is for 96 GB while memory_gb is 512 (pricing.json: $22,299). |
| hardware.json | 259 of 321 entries have no fp16_tflops_dense (all GeForce, Radeon, Apple, Strix Halo, Jetson). The Costs page needs compute for reading prompts and now estimates it by class; real figures would make the long-prompt profiles (coding, documents) more accurate. |
| gpu_rental: rtx-pro-4000-blackwell-sff | only a reserved offer; the page falls back to it and labels it "reserved". |
| api_open: CoreWeave for gemma-4-31b, gpt-oss-20b, gpt-oss-120b | cached price equals the input price (no discount). Plausible, worth a second look. |

## Remaining issues (not fixed)

| Severity | Issue |
|---|---|
| Medium | The hardware choice is pure cost minimisation: a Jetson Orin Nano Super 8 GB developer board wins 59 of 576 cases, and a company can get "Strix Halo 32 GB x 24". Valid on paper, odd advice for a business; consider a cap on the number of machines or a server preference above some number of users. |
| Medium | Staff hours are added to buying only, while Learn says a rented GPU also leaves the software work to you. |
| Medium | "People at the same moment" is 15% of users for every profile; for the agentic coding profile (400 requests a day each) that is low, so machine counts for coding teams are optimistic. |
| Medium | The prefill ratios are calibrated against llama.cpp figures I recalled, not measured in this session; they are deliberately on the low side. |
| Medium | Image, video and speech end at step 3 (Costs covers text models only) while the step bar still shows step 4. |
| Low | Step 2's primary button sits at the end of a long page (about 1,380 px down at 1280x800). |
| Low | "?" tips use the title attribute, which touch screens do not show (aria-label added for screen readers). |
| Low | The subscription reference is the cheapest seat (Google AI Plus $4.99, Workspace Business Starter $8.40), which would not cover the coding profile. |
| Low | Staff time "Counted at 60 USD an hour" is not converted to the chosen currency. |
| Low | Range sliders are 28 px tall on phones (the thumb is the target). |
| Low | Learn 11 says "a working day of steady chat: 50,000-100,000 tokens"; the Costs "daily" profile is about 138,000 a day. |
| Not checked | Learn deep-link smooth scrolling and "Detect this computer" (WebGL/WebGPU) in a visible window: the pane stayed hidden. Prices were not re-verified against their sources. |

Files changed in this round: src/costs.js, src/app.js, src/media.js, src/styles.css. No data files were edited. `node build.mjs` ran after the last source change, so "Local LLM Picker.html" is current.
