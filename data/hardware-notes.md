# Hardware and runtime notes (checked 2026-11-19)

Companion to `hardware.json` (321 entries) and `runtimes.json` (43 entries). Prices are rough and change weekly. Every bandwidth and capacity number comes from a vendor page or datasheet, or from a Wikipedia spec table where the vendor page was not reachable; the per-entry source lists are in the appendices. TechPowerUp's database refused automated fetches (HTTP 403), so it was used only through search snippets as a cross-check.

## 1. How to read hardware.json

| Field | Meaning |
|---|---|
| `class` | `gpu-consumer`, `gpu-workstation`, `gpu-datacenter`, `unified-memory` (CPU and GPU share one fast pool: Apple, Strix Halo, DGX Spark, Jetson, MI300A), `cpu` (no dedicated VRAM: CPU-only setups, integrated graphics, server CPUs). |
| `form` | `desktop`, `laptop`, `workstation`, `server`, `mini-pc`. Apple base/Pro/Max chips are filed as `laptop` and Ultra chips as `desktop`; the notes list the Macs each chip ships in. |
| `memory_gb` | Dedicated VRAM, or the unified/system RAM size for the most common configuration. For 8-GPU boxes (entries with `gpus_per_system`) it is the total of the box. |
| `memory_options_gb` | Other sizes of the same product with the same bandwidth. Variants with a different bandwidth have their own entry. |
| `bandwidth_gbs` | Peak memory bandwidth per GPU (theoretical). For integrated graphics and CPU entries it is the system RAM bandwidth of the typical configuration; alternatives are in the notes. For 8-GPU boxes it is per GPU. |
| `fp16_tflops_dense` | Dense FP16/BF16 tensor throughput per GPU. Filled only where the vendor states it or where it is derived from a vendor figure (sparse / 2, or Blackwell FP4-sparse / 8); derived values say so in `notes`. Null for all GeForce and Apple entries. Use `bench_llama2_7b_q4_0.pp512` as the practical prompt-speed comparison instead. |
| `fp8_support`, `fp4_support` | Native hardware support (tensor/matrix units), by architecture: NVIDIA Ada/Hopper FP8; Blackwell FP8+FP4; AMD RDNA4 and CDNA3 FP8; CDNA4 FP8+FP4. Software can still run FP8 checkpoints on older cards through slower paths. |
| `approx_price_usd` | `value` is a rough US figure or null; `note` says what it is (Nov 2026 best listing, launch MSRP, used average, list price) and the date. Do not show these as quotes. |
| `usable_memory_fraction` | Share of `memory_gb` a model can realistically use. Discrete GPUs 0.95. Apple 0.70 (base chips) / 0.75 (Pro/Max/Ultra), the macOS default GPU limit. Strix Halo 0.75 (Windows limit of 96 of 128 GB). Gorgon Halo 0.83 (160 of 192 GB). DGX Spark 0.90. Jetson 0.85. Integrated graphics 0.5. CPU-only 0.85. See section 4. |
| `runtime_support` | Free text, ending in a line of the form `llama.cpp: yes. vLLM: yes. SGLang: no.` built from the rules in Appendix C. |
| `bench_llama2_7b_q4_0` (optional) | Community llama-bench result for Llama 2 7B Q4_0 (3.56 GiB): `pp512` = prompt tokens/s, `tg128` = generated tokens/s. From llama.cpp discussions #15013 (CUDA), #10879 (Vulkan), #4167 (Apple Metal); flash attention on where both were reported. Builds differ, so treat as rough. 78 entries have one. |
| `gpus_per_system` (optional) | Present only on 8-GPU box entries (DGX/HGX, AMD platforms). |

The UI lets users pick a card count, so multi-GPU setups are not separate entries except the vendor 8-GPU boxes. Section 5 lists common reference configurations.

## 2. The hardware landscape in Nov 2026 (what the builder should know)

- **Memory shortage, high prices.** DRAM, GDDR and HBM have been scarce since late 2025. On 3 Nov 2026 the cheapest US listings were about 3.5x MSRP for the RTX 5090 ($6,919), 3.1x for the RTX 4090 ($4,999), 2x for the RTX 5080 ($1,999) and 1.5-1.9x for most other current cards (Tom's Hardware tracker via tech-insider). Newegg relisted the RTX 5090 from $6,249.99 on 15 Nov. Used RTX 3090s averaged about $1,626 (14 Nov, up about 29% in 90 days). 32 GB DDR5 desktop kits cost about $480-555, 64 GB RDIMMs $1,000-2,000+. NVIDIA raised the DGX Spark from $3,999 (launch) to $4,699 (Feb 2026) and $6,950 (Oct 2026), and Apple added $300 to MacBook Pro prices in June 2026 (MacRumors). Price fields will go stale fast.
- **No RTX 50 Super.** The rumoured 18/24 GB Super cards had not launched by 19 Nov 2026; a 24 GB RTX 5080 was reportedly cancelled over GDDR7 cost. No RTX 60 consumer series yet.
- **New since 2025:** Apple M5 Pro/Max (Mar 2026, up to 128 GB, 614 GB/s), M5 Ultra Mac Studio (Aug 2026, up to 512 GB, 1.2 TB/s), M6 (Mac mini Aug 2026, MacBook Pro 14 Nov 2026, up to 32 GB, 170 GB/s). M5-generation GPUs have neural accelerators: prompt processing in llama.cpp is about 3x the M4 generation, while generation speed still follows bandwidth. AMD Gorgon Halo (Ryzen AI Max PRO 400, up to 192 GB, about 273 GB/s, systems from Q3 2026). Intel Arc Pro B70/B65 (32 GB, 608 GB/s, $949 at launch, Mar 2026). NVIDIA RTX PRO 5500 Blackwell (84 GB), RTX PRO 5000 72 GB, 64 GB DGX Spark (partners only, from $4,999), DGX Station GB300 (748 GB, about $95,000), Rubin in production for large cloud customers, AMD MI450X/MI455X (432 GB HBM4) shipping in Helios racks. NVIDIA's N1X laptop chip was announced as "RTX Spark" for fall 2026 laptops with up to 128 GB; final specs and shipping status were not confirmed, so there is no entry.
- **Old cards lose software support.** CUDA 13 dropped Maxwell, Pascal and Volta (GTX 10xx, P40, P100, V100, Titan V, M40). They still run llama.cpp through CUDA 12 builds or Vulkan, but not vLLM (needs compute capability 7.5+) or SGLang. AMD's current ROCm no longer supports gfx906 (MI50/MI60/Radeon VII); Vulkan still works.
- **B100 never shipped** (NVIDIA's HGX page lists only B200, B300 and Rubin). Google TPUs are cloud-only and are not in the file.
- **Server CPUs are no longer the cheap path.** A 12-channel EPYC with 768 GB still gives about 460-614 GB/s for huge MoE models, but at 2026 RDIMM prices the memory alone costs roughly $12,000-25,000.

## 3. Estimating tokens per second

**Generation (decode) is limited by memory bandwidth.** Each new token reads the active weights once, plus the KV cache.

`tokens/s ≈ efficiency × bandwidth_gbs ÷ GB read per token`

- GB read per token: dense model = size of the weight file in GB; MoE model = active parameters × bits per weight ÷ 8 (plus shared layers, which are counted in "active"). Add the KV cache size at the current context length (it is read every token too), which matters above about 16K tokens.
- Efficiency measured from the 78 benchmark entries in this file (tg128 × 3.82 GB ÷ peak bandwidth): CUDA median 68% (range 32-85%), Vulkan median 75% (33-91%), Apple Metal median 72% (40-84%). Low outliers: Apple Ultra chips 40-57% (two or more dies), Pascal/Volta datacenter cards 32-59%, Intel Arc Alchemist 33-36%. A small 7B model under-uses the biggest GPUs (RTX 5090 64%, H100 about 54% if the PCIe card), so these shares are conservative for large models. Sensible defaults: 0.7 for current discrete GPUs and single-die Apple chips, 0.5 for Apple Ultra, 0.6 for older cards, 0.5 for CPU-only (no CPU measurements were collected here; treat as an estimate).
- Example: a 70B dense model at Q4_K_M is about 70 × 4.89 ÷ 8 ≈ 43 GB. On an M4 Max (546 GB/s): 0.58 × 546 ÷ 43 ≈ 7 tokens/s. On one RTX PRO 6000 (1,792 GB/s, 96 GB): about 0.65 × 1792 ÷ 43 ≈ 27 tokens/s. These are estimates, not measurements.

**Prompt processing (prefill) is limited by compute.** It sets the wait before the first token and dominates with long documents, RAG and coding agents. Use `pp512` from the benchmark field as a relative scale: RTX 4090 about 14,800, RTX 3090 5,560, DGX Spark 3,660, M5 Max 3,220, RX 7900 XTX (Vulkan) 3,890, Strix Halo 1,700, M4 Max 890, Arc B580 420 tokens/s on a 7B model. For a model with N billion active parameters, divide roughly by N ÷ 7 (rough scaling; attention cost at long context makes it worse). Seconds to first token ≈ prompt tokens ÷ that rate.

**What the benchmarks show that bandwidth alone does not:** Macs before M5 and Strix Halo have good generation speed for their memory size but slow prompt processing; DGX Spark is the reverse (strong prefill, slow generation at 273 GB/s). Intel Arc B-series and Arc A-series prompt speeds in llama.cpp Vulkan are low.

Sources: https://github.com/ggml-org/llama.cpp/discussions/15013, https://github.com/ggml-org/llama.cpp/discussions/10879, https://github.com/ggml-org/llama.cpp/discussions/4167, https://developer.nvidia.com/blog/mastering-llm-techniques-inference-optimization/ (decode is memory-bound).

## 4. How much memory a model needs, and what each platform lets you use

`needed ≈ weights + KV cache + runtime buffers`

- Weights: parameters × bits per weight ÷ 8 (table of bits per weight in section 7; Q4_K_M ≈ 4.9, Q8_0 = 8.5, FP16 = 16).
- KV cache: formula and example in section 7 ("Context length and KV-cache memory"). It grows with context length and with the number of parallel users.
- Runtime buffers: llama.cpp compute buffers and the CUDA/ROCm context. Reserve about 1-2 GB (rule of thumb, not measured here). Then compare with `memory_gb × usable_memory_fraction`.

Platform specifics:
- **Discrete GPUs (0.95):** the driver and, on a card that drives the display, the desktop use a few hundred MB to over 1 GB. vLLM and SGLang grab a fixed share up front (`--gpu-memory-utilization`, now 0.92 by default or 1.0 with the extensible KV cache; SGLang `--mem-fraction-static`) and fill it with KV cache, so "fits in llama.cpp" does not mean "fits in vLLM".
- **Apple Silicon (0.70-0.75):** macOS lets the GPU wire about 75% of RAM on larger Macs (reported 48 GB of 64 GB, 96 GB of 128 GB) and somewhat less on small ones (one report: 11.8 GB of 16 GB). `sudo sysctl iogpu.wired_limit_mb=<MB>` raises it until reboot (macOS 14+; leave 8-16 GB for macOS). MLX servers set their own wired limit near 75%, and an mlx-lm issue links high limits to kernel panics. Sources: https://github.com/ivanopcode/devnote-override-macos-metal-vram-cap, https://github.com/ml-explore/mlx-lm/issues/883.
- **AMD Strix Halo (0.75):** Windows: Variable Graphics Memory gives the GPU up to 96 GB of 128 GB (AMD blog). Linux: keep the BIOS reservation small and raise the shared GTT limit (default about 50% of RAM) with `amd-ttm --set <GB>` or `ttm.pages_limit`; users run about 100-120 GB. Gorgon Halo: up to 160 of 192 GB. Sources: https://www.amd.com/en/blogs/2025/amd-ryzen-ai-max-upgraded-run-up-to-128-billion-parameter-llms-lm-studio.html, https://rocm.docs.amd.com/en/latest/how-to/system-optimization/strixhalo.html, https://servethehome.com/amd-reveals-ryzen-ai-max-pro-400-series-192gb-ram-for-ai-systems/.
- **DGX Spark (0.90):** the OS shares the 128 GB; a community report shows about 118 GiB available. `nvidia-smi` does not report memory on this platform; use `free -h`. Sources: https://docs.nvidia.com/dgx/dgx-spark/known-issues.html, https://community.start9.com/t/ollama-performance-report-cpu-only-on-dgx-spark-gb10/5381.
- **Integrated graphics (0.5):** no dedicated VRAM. On Windows the GPU can usually use up to about half of system RAM as shared memory; on AMD the BIOS "UMA frame buffer" or Variable Graphics Memory setting changes this. Speed is the system RAM bandwidth, so an iGPU mainly helps prompt processing, not generation, compared with the CPU alone.
- **CPU-only (0.85):** the OS and apps need RAM too. Bandwidth figures are theoretical peaks; real reads are lower. One RAM stick (single channel) halves bandwidth.

## 5. Multi-GPU, CPU offload and unified memory

**Splitting across GPUs.**
- llama.cpp's default layer split puts consecutive layers on different cards. Capacity adds up; speed for one user stays roughly that of one card (layers run one after another), and the link between cards carries little data, so plain PCIe is fine. Mixed cards work.
- Tensor parallelism (vLLM/SGLang `--tensor-parallel-size`, llama.cpp `--split-mode row`) splits each layer across cards, so bandwidth roughly adds up, but every layer needs an all-reduce. It needs identical cards, a count that divides the attention heads (2, 4, 8) and a fast link. NVLink/NVSwitch (600 GB/s A100, 900 GB/s H100/H200, 1.8 TB/s Blackwell per GPU) and AMD Infinity Fabric are built for this. Over PCIe it works but scales less; GeForce drivers do not enable peer-to-peer transfers. RTX 3090/3090 Ti and RTX A-series Ampere cards (A6000, A5000, A4500, A5500) support 2-way NVLink bridges (about 112 GB/s); Ada and Blackwell workstation and GeForce cards have no NVLink.
- Multi-user servers (vLLM, SGLang) gain far more total throughput from extra GPUs than a single chat user does.

**Reference configurations (for the card-count picker).** Totals are simple sums; check power and slots.

| Setup | Total memory | Link | Notes |
|---|---|---|---|
| 2x RTX 3090 | 48 GB | NVLink bridge or PCIe | Classic used build; about 700 W for the GPUs. |
| 4x RTX 3090 | 96 GB | PCIe | Needs a server/workstation board, 1,400 W for GPUs alone. |
| 2x RTX 5090 | 64 GB | PCIe 5.0 | 1,150 W for GPUs; cards are very hard to buy in Nov 2026. |
| 2x / 4x RTX PRO 6000 Max-Q | 192 / 384 GB | PCIe 5.0 | 300 W blower cards made for 4-card workstations. |
| 4x RTX 6000 Ada or A6000 | 192 GB | PCIe (A6000: NVLink pairs) | Common existing company workstations. |
| 2x / 4x Radeon AI PRO R9700 | 64 / 128 GB | PCIe | ROCm with vLLM and llama.cpp. |
| 4x Arc Pro B60 / B70 | 96 / 128 GB | PCIe | Cheapest new 96-128 GB of VRAM; slower software stack. |
| 8x L40S | 384 GB | PCIe only | Common 2U/4U inference server; no NVLink. |
| 8x H100 SXM (DGX/HGX H100) | 640 GB | NVSwitch 900 GB/s | Reference platform for vLLM, SGLang, TensorRT-LLM. |
| 8x H200 / 8x B200 / 8x B300 | 1,128 / 1,440 / about 2,100 GB | NVSwitch 900 GB/s / 1.8 TB/s | Hold the largest open MoE models at FP8. |
| 8x MI300X / MI325X / MI355X | 1,536 / 2,048 / 2,304 GB | Infinity Fabric | ROCm vLLM and SGLang images. |
| 2x DGX Spark | 2 x 128 GB | ConnectX-7 200 Gb/s networking | NVIDIA's supported two-unit setup. |
| Several Macs | sum of RAM | Thunderbolt 5 | MLX distributed / exo; the link is far slower than local memory. |

**CPU offload (llama.cpp `-ngl`, `--n-cpu-moe`, `-ot`).** Layers left on the CPU run at system-RAM speed, and for one user the time per token is the GPU part plus the CPU part. Offloading half of a dense model therefore runs close to CPU speed. MoE models are different: keep attention, shared layers and KV cache on the GPU and put the expert weights in RAM; each token reads only the few active experts, so speed depends on RAM bandwidth × active size. This is why a 24-32 GB GPU plus fast DDR5 (or an 8-12 channel server) can run 100B+ MoE models at usable speed. Prompt processing with offloaded experts is much slower than on the GPU.

**Unified memory.** Apple, Strix Halo/Gorgon Halo, DGX Spark and Jetson have no PCIe copy between CPU and GPU, so very large models load into one pool. Capacity per dollar is high, but bandwidth (153-1,200 GB/s) is below high-end GPUs, so large dense models generate slowly; MoE models with few active parameters suit these machines best. The OS shares the pool (section 4). DGX Station is a hybrid: 252 GB of fast HBM3e plus 496 GB of slower LPDDR5X.

## 6. Biggest uncertainties

- Prices of every entry (memory-shortage market; many are launch MSRPs or single dated listings).
- Laptop GPU bandwidth: NVIDIA does not publish it for GeForce laptop GPUs; values are computed from bus width and typical memory speed and vary by laptop. Laptop power (TGP) varies too.
- B300 per-GPU bandwidth (8 TB/s from secondary sources), GB300 NVL72 per-GPU memory (278 GB derived from the rack total), MI455X bandwidth (23.3 TB/s inferred from AMD's MI430X figure), Rubin (new).
- Huawei Ascend 910C memory, bandwidth and compute are analyst estimates; Ascend FP16 and power mostly null. NVIDIA H20 bandwidth null.
- Older GeForce 10/20 bandwidths, Titans, Tesla P4/M40, some RTX A-series and Ada workstation cards are from Wikipedia tables (which cite NVIDIA), not re-read from NVIDIA pages.
- Integrated-graphics entries use "typical" RAM size and speed; a given laptop may differ.
- Apple usable fraction for small Macs (0.70) is based on reports, not an Apple document.
- `fp16_tflops_dense` is derived for many workstation cards and null for consumer cards.
- RTX 5090 Laptop bandwidth (896 GB/s) is computed; RX 9070 XT board power (304 W) is the reference figure, not re-verified.

## 7. Common beginner confusions

### Model file formats: GGUF, safetensors, MLX, EXL3, AWQ/GPTQ, FP8/NVFP4
**GGUF** is a single file that holds the weights (often quantised), the tokenizer and the chat template. llama.cpp, Ollama, LM Studio, Jan and KoboldCpp use it. **safetensors** is the standard Hugging Face weight format, usually at full 16-bit precision. vLLM, SGLang, Transformers and Diffusers load it. **MLX** models are safetensors files converted and often quantised for Apple's MLX; the "mlx-community" organisation on Hugging Face hosts many. **EXL3** is ExLlamaV3's own quantised format (based on QTIP) and needs ExLlamaV3/TabbyAPI. **AWQ** and **GPTQ** are 4-bit GPU quantisation methods stored as safetensors, used mainly by vLLM, SGLang and LMDeploy. **FP8** and **NVFP4** are 8-bit and 4-bit floating-point checkpoints. NVFP4 stores one FP8 scale for every 16 values and is about 3.5x smaller than FP16. It needs NVIDIA Blackwell GPUs to run at full speed. Sources: https://huggingface.co/docs/hub/gguf, https://huggingface.co/docs/safetensors/index, https://github.com/turboderp-org/exllamav3, https://docs.vllm.ai/en/latest/features/quantization/, https://developer.nvidia.com/blog/introducing-nvfp4-for-efficient-and-accurate-low-precision-inference/

### Why Ollama is "built on llama.cpp", and what changed
Ollama started as an easy wrapper around llama.cpp, and its README still lists llama.cpp as a supported backend. In May 2025 it added its own engine, written directly on the GGML library (the library under llama.cpp), mainly to handle multimodal models more reliably. In March 2026 it added an MLX engine for Apple silicon, first as a preview for Macs with more than 32 GB of memory. Its November 2026 release notes still update llama.cpp and MLX side by side, so today Ollama picks between several engines depending on the model and the machine. Sources: https://ollama.com/blog/multimodal-models, https://ollama.com/blog/mlx, https://github.com/ollama/ollama

### What "Q4_K_M" means: K-quants and I-quants
The name gives the bits and the method. "Q4" means about 4 bits per weight. "K" means a k-quant: weights are stored in blocks with shared scales, grouped into super-blocks of 256. "_S/_M/_L" (small/medium/large) says how many sensitive tensors are kept at higher precision, so Q4_K_M is a bit larger and better than Q4_K_S. "IQ" types (IQ4_XS, IQ3_M, IQ2_XXS and so on) are i-quants. They use lookup tables to pack weights more tightly, so they work best below 4 bits and usually use an "importance matrix" (imatrix) made from sample text. Measured bits per weight for Llama-3.1-8B in the llama.cpp docs:

| Type | Bits/weight | Type | Bits/weight |
|---|---|---|---|
| F16 | 16.00 | IQ4_XS | 4.46 |
| Q8_0 | 8.50 | Q3_K_M | 4.00 |
| Q6_K | 6.56 | IQ3_M | 3.76 |
| Q5_K_M | 5.70 | Q2_K | 3.16 |
| Q4_K_M | 4.89 | IQ2_M | 2.93 |
| Q4_K_S | 4.67 | IQ2_XXS | 2.38 |

These include the output and embedding layers, so very large models come out slightly lower. Sources: https://github.com/ggml-org/llama.cpp/blob/master/tools/quantize/README.md, https://github.com/ggml-org/llama.cpp/pull/1684

### How much quality quantisation costs
The llama.cpp perplexity "scoreboard" for Llama 3 8B gives these perplexity increases over FP16 (6.233). Lower is better, and KLD (how far the output probabilities drift) is in brackets:

| Type | PPL increase (KLD) |
|---|---|
| Q8_0 | +0.02% (0.001) |
| Q6_K | +0.3% (0.005) |
| Q5_K_M | +0.9% (0.011) |
| Q4_K_M | +2.8% (0.031); +2.4% (0.028) with imatrix |
| IQ4_XS (imatrix) | +3.6% (0.036) |
| Q3_K_M (imatrix) | +8% (0.084) |
| IQ2_M | about +38% (0.33) |
| IQ1_S | about +830% (2.2) |

Q4_K_M is the usual starting point. Q5/Q6 cost very little, and below about 3 bits quality drops quickly. Small models suffer more than large ones. Source: https://github.com/ggml-org/llama.cpp/blob/master/tools/perplexity/README.md

### Why vLLM and SGLang want so much VRAM
These engines are built to serve many users at once. At start-up they load the whole model into GPU memory and then claim most of what is left as a pool of KV cache, which batching and PagedAttention (paging the cache in small blocks) divide between requests. vLLM's `--gpu-memory-utilization` used to default to 0.9. The current docs say it defaults to 1.0 with the new "extensible KV cache" (measured at start-up) and 0.92 otherwise. SGLang uses `--mem-fraction-static`. The vLLM team reported that older systems wasted 60-80% of KV memory and PagedAttention cuts that to under 4%. Sources: https://docs.vllm.ai/en/latest/configuration/engine_args.html, https://blog.vllm.ai/2023/06/20/vllm.html, https://docs.sglang.io/advanced_features/server_arguments.html

### Why vLLM/SGLang do not "just use system RAM" like llama.cpp
llama.cpp can run some layers on the CPU itself, so the CPU does that part of the work. vLLM has `--cpu-offload-gb`, but it only parks weights in RAM and copies them to the GPU on every forward pass. That needs a fast CPU-GPU link and is usually much slower. SGLang has a similar `--cpu-offload-gb`. In practice, plan for the model and its KV cache to fit in VRAM with these engines. Sources: https://docs.vllm.ai/en/latest/configuration/engine_args.html, https://docs.sglang.io/advanced_features/server_arguments.html

### Context length and KV-cache memory
During generation the model keeps a "KV cache" for every token in the context, and it grows linearly with context length and with the number of parallel users. Formula: **bytes per token = 2 × layers × KV heads × head size × bytes per value**. Multiply by context length and by the number of sequences. NVIDIA's version uses hidden size; for models with grouped-query attention use KV heads × head size. Example, Llama 3.1 8B (32 layers, 8 KV heads, head size 128) at FP16: 2×32×8×128×2 bytes = 128 KiB per token. That is 4 GiB at 32K tokens and 16 GiB at 128K, on top of the weights. Some newer designs (MLA, sliding-window or linear attention) need less, so check the model card. Source: https://developer.nvidia.com/blog/mastering-llm-techniques-inference-optimization/

### KV-cache quantisation
You can store the KV cache at lower precision to fit longer contexts. In llama.cpp use `-ctk` and `-ctv` (for example `q8_0`, which roughly halves cache memory with little quality loss; `q4_0` saves more but hurts quality more). vLLM uses `--kv-cache-dtype fp8` and newer 4-bit options. LMDeploy has int8/int4 KV options. Sources: https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md, https://docs.vllm.ai/en/latest/configuration/engine_args.html

### MoE: "total" vs "active" parameters, and why MoE runs well with CPU offload
A Mixture-of-Experts model has many "expert" blocks but uses only a few for each token. Mixtral 8x7B has about 47B parameters in total but runs about 12B per token, because the attention layers are shared. You still need memory for all of them, but each token only reads the active part. That is why you can keep the shared layers and KV cache on the GPU and put the expert weights in system RAM with llama.cpp's `--n-cpu-moe N` (experts of the first N layers on CPU), `--cpu-moe` (all experts on CPU) or `-ot` / `--override-tensor` patterns. Speed then depends mostly on RAM bandwidth and the active size. Sources: https://huggingface.co/blog/moe, https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md

### "Tokens per second": prompt processing vs generation
There are two different speeds. **Prompt processing** (pp, also called prefill) reads your whole input in big batches and is limited by compute. **Generation** (tg, also called decode) makes one token at a time and is limited by memory bandwidth. llama-bench reports them as `pp512` and `tg128`. In its own example a 7B Q4_K_M model on CUDA does about 7,340 tokens/s for pp512 but about 121 tokens/s for tg128. Long documents feel slow because of prompt processing; long answers feel slow because of generation. Sources: https://github.com/ggml-org/llama.cpp/blob/master/tools/llama-bench/README.md, https://developer.nvidia.com/blog/mastering-llm-techniques-inference-optimization/

### What "OpenAI-compatible API" means
The server accepts the same HTTP requests as OpenAI's API, for example `POST /v1/chat/completions`, `/v1/completions` and `/v1/models`. So any app or SDK written for OpenAI can use your local model by changing the base URL (for example `http://localhost:8000/v1`), often with a dummy API key. It does not mean every OpenAI feature works the same; tool calling, structured output and newer endpoints vary by server. Source: https://docs.vllm.ai/en/latest/serving/openai_compatible_server.html

### GPU offload layers (`-ngl`)
In llama.cpp, `-ngl` / `--n-gpu-layers` sets how many of the model's layers go into VRAM; the rest run on the CPU from system RAM. It now defaults to `auto`, and `--fit on` (the default) adjusts unset options such as context size to fit your GPU memory. If only part of the model fits, it still runs, but each CPU layer slows generation a lot. Desktop apps show this as a "GPU offload" slider. Sources: https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md, https://github.com/ggml-org/llama.cpp/blob/master/docs/development/token_generation_performance_tips.md

### Vulkan vs ROCm vs CUDA vs Metal (and SYCL)
These are the ways software talks to your GPU. **CUDA** is NVIDIA-only and the best supported. **ROCm** (also called HIP) is AMD's equivalent and works best on Linux with supported Radeon and Instinct cards. **Metal** is Apple's, used on Apple silicon Macs. **Vulkan** is a cross-vendor graphics API that works on NVIDIA, AMD and Intel GPUs with normal drivers, so it is often the easiest choice for AMD or Intel GPUs on Windows. **SYCL** (oneAPI) is Intel's route. Speed differs by backend, so if one is slow on your card, try another. Source: https://github.com/ggml-org/llama.cpp/blob/master/docs/build.md

### Why a model "fits" but still runs slowly
Fitting only means the files fit in memory. Generation speed depends on how fast that memory can be read. A rough rule: tokens/s is at most memory bandwidth (GB/s) divided by the size of the weights read per token (GB). So the same model is much slower in system RAM or on a low-bandwidth integrated GPU than in a gaming GPU's VRAM. Other common causes are partial offload (some layers on the CPU), a very long context, the OS swapping to disk, and too many CPU threads. Sources: https://developer.nvidia.com/blog/mastering-llm-techniques-inference-optimization/ (decode is memory-bound), https://github.com/ggml-org/llama.cpp/blob/master/docs/development/token_generation_performance_tips.md

### Chat templates
Chat models are trained on text with special markers for "system", "user" and "assistant" turns. The chat template is the rule (usually a Jinja template) that turns your messages into that exact text. GGUF files and Hugging Face repos include the template, and llama.cpp now uses it by default (`--jinja`). A wrong or missing template causes rambling, answers that never stop, leaked special tokens or broken tool calls, so this is the first thing to check when a model "acts weird". Sources: https://huggingface.co/docs/transformers/main/en/chat_templating, https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md

### LoRA vs full model
A full model contains all the weights. A LoRA is a small add-on file (often tens to hundreds of MB) that holds only the changes from fine-tuning. It must be loaded on top of the exact base model it was trained for. You can load it at run time (llama.cpp `--lora`; vLLM can serve several LoRAs on one base model) or merge it into the base to make a new full model. LoRAs are common for image models (styles, characters) and for cheap LLM fine-tuning. Sources: https://huggingface.co/docs/peft/main/en/conceptual_guides/lora, https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md

## 8. Runtime landscape (Nov 2026)

- ggml.ai (the llama.cpp/ggml team) joined Hugging Face on 2026-02-20. llama.cpp moved to semantic versioning with v1.0.0 (2026-11-13), and the team now ships the "Llama" desktop app for macOS and Windows plus a `llama` CLI installer (llama.app).
- Hugging Face TGI went into maintenance mode and was archived on 2026-03-21. HF points users to vLLM, SGLang, llama.cpp and MLX.
- Intel IPEX-LLM was archived on 2026-01-28 with a no-support notice.
- Chatterbox TTS was declared retired research in August 2026. rhasspy/piper was archived and continues as OHF-Voice/piper1-gpl under GPL-3.0 (previously MIT).
- Fooocus gets bug fixes only, and the original lllyasviel Forge has had no commits since 2025-07-31. The Forge Neo fork carries on.
- TensorRT-LLM removed its TensorRT engine backend (PyTorch backend only) and deprecated Windows in v0.18.
- LM Studio became free for work use in July 2025 and launched a separate agent app, LM Studio Bionic, in July 2026. Ollama added an MLX engine on Apple silicon (March 2026 preview).
- vLLM's default `gpu_memory_utilization` is no longer simply 0.9. It is 1.0 with the extensible KV cache and 0.92 otherwise.
- The Invoke company team joined Adobe in October 2025, and InvokeAI is now community-maintained. ComfyUI moved to the Comfy-Org GitHub organisation. text-generation-webui was renamed oobabooga/textgen.
- Open WebUI's licence (since v0.6.6) has a branding clause that applies above 50 users per 30 days. The project says it is no longer OSI open source.

## Appendix A. Sources for the core entries (Nov 2026 desktop GPUs, Apple, unified-memory systems, datacenter, CPUs)

Benchmarks for all files: https://github.com/ggml-org/llama.cpp/discussions/15013 (CUDA), https://github.com/ggml-org/llama.cpp/discussions/10879 (Vulkan), https://github.com/ggml-org/llama.cpp/discussions/4167 (Apple; its BW column also cross-checks Apple bandwidths).

**NVIDIA GeForce desktop (rtx-3060-12gb, rtx-3080-10gb, rtx-3090, rtx-3090-ti, rtx-4060-ti-16gb, rtx-4070-ti-super, rtx-4080-super, rtx-4090, rtx-5060, rtx-5060-ti-16gb, rtx-5070, rtx-5070-ti, rtx-5080, rtx-5090) and rtx-4090-laptop, rtx-5090-laptop**
- Memory, bus, power: https://www.nvidia.com/en-us/geforce/graphics-cards/compare/ and https://www.nvidia.com/en-us/geforce/laptops/compare/ (bandwidth listed only for RTX 50 desktop).
- Bandwidth for RTX 30/40, launch MSRPs and dates: https://en.wikipedia.org/wiki/GeForce_RTX_30_series, https://en.wikipedia.org/wiki/GeForce_RTX_40_series, https://en.wikipedia.org/wiki/GeForce_RTX_50_series (also the Oct-Nov 2026 RTX 5090/5080 supply notes and the cancelled 24 GB 5080).
- Prices: https://tech-insider.org/gpu-price-tracking-2026-rtx-5090-6919-tomshardware-lowest-prices/ (Tom's Hardware tracker, 3 Nov 2026), https://www.tweaktown.com/news/114681/nvidia-rtx-5090-returns-to-newegg-stock-but-prices-start-at-over-3x-msrp/index.html, https://openclawdc.com/gear/rtx-3090/ (used RTX 3090, 14 Nov 2026).
- RTX 50 Super status: https://www.tweaktown.com/news/108790/nvidia-told-aib-partners-it-has-not-canceled-rtx-50-super-plans-but-postponed-until-q3-2026/index.html, https://www.club386.com/?p=159687.
- Unverified: rtx-5090-laptop bandwidth (computed), 4070-family power values for variants, all used prices except the 3090.

**NVIDIA workstation (rtx-a6000, rtx-6000-ada, rtx-pro-5000/4500/4000/2000-blackwell)**
- https://www.nvidia.com/en-us/products/workstations/professional-desktop-gpus/rtx-pro-4500/, .../rtx-pro-4000/, .../rtx-pro-2000/, https://www.nvidia.com/en-us/products/workstations/rtx-6000/, RTX 6000 Ada datasheet (960 GB/s), https://www.nvidia.com/content/dam/en-zz/Solutions/products/workstations/nvidia-rtx-a6000-datasheet.pdf (768 GB/s).
- RTX PRO 5000 72 GB: https://www.cgchannel.com/2025/12/nvidia-launches-new-72gb-rtx-pro-5000-blackwell-gpu/.
- Prices: https://techspot.com/news/113460-nvidia-raises-rtx-pro-6000-blackwell-price-staggering.html, https://gpuprix.com/us/gpus/rtx-pro-4000-blackwell, https://www.thundercompute.com/blog/nvidia-rtx-a6000-pricing.
- Unverified: RTX PRO 5000/4500/2000 prices.

**NVIDIA unified-memory and deskside (dgx-spark, dgx-station-gb300, jetson-agx-thor)**
- DGX Spark price history and 64 GB model: https://www.implicator.ai/nvidia-adds-64gb-dgx-spark-at-4-999-as-128gb-model-climbs-to-6-950/; llama.cpp playbook https://build.nvidia.com/spark/llama-cpp; memory reporting https://docs.nvidia.com/dgx/dgx-spark/known-issues.html.
- DGX Station: https://www.tomshardware.com/desktops/nvidias-gb300-powered-dgx-station-desktop-tower-listed-for-nearly-usd100-000-online-enterprise-ai-powerhouse-now-available-to-buy-for-mere-mortals-with-lots-of-cash, https://www.guru3d.com/story/nvidia-dgx-station-for-windows-brings-748gb-unified-memory-to-the-desktop/, https://pi3g.com/?p=31780 (252 GB HBM3e at 7.1 TB/s + 496 GB LPDDR5X at 396 GB/s).
- Jetson Thor: https://www.nvidia.com/en-us/autonomous-machines/embedded-systems/jetson-thor/.
- Unverified: DGX Spark power (240 W PSU rating, from memory of NVIDIA's spec), DGX Station power, Thor price.

**NVIDIA datacenter (nvidia-l4, nvidia-l40s, nvidia-h100-pcie, -h100-nvl, -h100-sxm, -b200, -b300, -rubin)**
- https://www.nvidia.com/en-us/data-center/l4/, /l40s/, /h100/, /h200/, /dgx-b200/, /dgx-b300/, /hgx/ (HGX B200/B300/Rubin per-system figures; FP16 dense = sparse / 2).
- H100 PCIe 80 GB: NVIDIA datasheet copy https://www.pny.com/file%20library/company/support/product%20brochures/nvidia%20data%20center%20gpus/nvidia-h100-datasheet.pdf.
- B300 288 GB: https://developer.nvidia.com/blog/nvidia-blackwell-ultra-for-the-era-of-ai-reasoning; 8 TB/s from https://www.tomshardware.com/pc-components/gpus/nvidia-announces-blackwell-ultra-b300-1-5x-faster-than-b200-with-288gb-hbm3e-and-15-pflops-dense-fp4 (secondary).
- Rubin status: https://gcn.com/?p=20421.
- Prices: https://www.thundercompute.com/blog/nvidia-h100-pricing, /nvidia-b200-pricing (Nov 2026), https://modal.com/blog/nvidia-h100-price-article.

**AMD (rx-7600-xt, rx-7800-xt, rx-7900-xt, rx-7900-xtx, rx-9060-xt-16gb, rx-9070, rx-9070-xt, radeon-ai-pro-r9700, radeon-pro-w7800, radeon-pro-w7900, instinct-mi300x, -mi325x, -mi455x)**
- https://en.wikipedia.org/wiki/Radeon_RX_7000_series, https://en.wikipedia.org/wiki/Radeon_RX_9000_series, https://en.wikipedia.org/wiki/Radeon_Pro, https://en.wikipedia.org/wiki/AMD_Instinct (amd.com product pages timed out).
- R9700: https://www.tomshardware.com/pc-components/gpus/amd-launches-radeon-ai-pro-r9700-to-challenge-nvidias-ai-market-dominance, https://gpuprix.com/us/gpus/radeon-ai-pro-r9700.
- MI400: https://newsroom.amd.com/news/amd-advances-instinct-mi400-series-ai-scientific-computing (12 Nov 2026), https://www.jonpeddie.com/news/amd-widens-mi400-family-for-helios/.
- Unverified: RX 9070 XT 304 W, most RDNA3 prices, MI455X bandwidth.

**AMD unified memory (ryzen-ai-max-395, ryzen-ai-max-pro-495)**
- Bandwidth: 256-bit LPDDR5X-8000 = 256 GB/s (computed from AMD's memory spec); Gorgon Halo: https://servethehome.com/amd-reveals-ryzen-ai-max-pro-400-series-192gb-ram-for-ai-systems/.
- Memory limits: https://www.amd.com/en/blogs/2025/amd-ryzen-ai-max-upgraded-run-up-to-128-billion-parameter-llms-lm-studio.html, https://rocm.docs.amd.com/en/latest/how-to/system-optimization/strixhalo.html.
- Prices: https://www.techradar.com/pro/slowly-going-down-buy-a-128gb-ryzen-ai-max-395-mini-pc-with-1tb-ssd-for-usd3-299-chinese-startup-releases-ai-workstation-with-4-ssd-slots-10g-lan-wifi-7, https://www.digitalcitizen.life/gmktec-evo-x3-128gb-amazon-prime-deal/.

**Intel (arc-a770-16gb, arc-b580, arc-pro-b50, arc-pro-b60, arc-pro-b70)**
- https://en.wikipedia.org/wiki/Intel_Arc, https://phoronix.com/news/intel-arc-pro-b70-announced, B770 status https://www.tweaktown.com/news/109721/intels-partners-confirm-that-theres-still-no-arc-b770-big-battlemage-gpu/index.html.

**Apple (apple-m1 ... apple-m6)**
- Current models: https://support.apple.com/126319 (MacBook Pro M5 Pro/Max), https://support.apple.com/128107 (Mac Studio M5 Max/Ultra), https://support.apple.com/126320 (MacBook Air M5), https://apple.com/newsroom/2026/08/apple-introduces-m6-and-m5-ultra-for-a-big-leap-in-performance-and-ai-compute, https://www.macrumors.com/2026/10/27/m6-14-inch-macbook-pro-memory-bandwidth-split/.
- Prices: https://macrumors.com/2026/10/28/mac-studio-m5-ultra-512gb-ram/, https://www.techrepublic.com/article/news-apple-mac-studio-m5-ultra-5499-worth-it/, https://www.tomsguide.com/computing/macbooks/macbook-pro-m5-pro-and-m5-max-announced-price-release-date-specs-and-more, https://www.implicator.ai/apples-first-2nm-chip-lands-in-the-899-mac-mini-its-cheapest-desktop/.
- M1-M4 memory options and bandwidths: Apple technical specifications pages (support.apple.com/specs), cross-checked against the BW column of llama.cpp discussion #4167. Unverified this session: individual M1-M4 spec pages were not re-opened; prices for older Macs.

**CPU and server (cpu-*, threadripper-pro-9000wx, epyc-9004-genoa, epyc-9005-turin, xeon-6900p, xeon-4th-5th-gen)**
- Bandwidth = channels × 8 bytes × MT/s (theoretical). EPYC 9005: https://www.amd.com/content/dam/amd/en/documents/epyc-business-docs/datasheets/amd-epyc-9005-series-processor-datasheet.pdf, https://www.tomshardware.com/pc-components/cpus/amd-launches-epyc-turin-9005-series-our-benchmarks-of-fifth-gen-zen-5-chips-with-up-to-192-cores-500w-tdp. Xeon 6900P: https://www.theregister.com/2024/09/24/intel_xeon_6p/. Threadripper 9000: https://hothardware.com/reviews/amd-ryzen-threadripper-9000-and-radeon-ai-pro-9000-details. EPYC Venice: https://www.tomshardware.com/tech-industry/semiconductors/amd-begins-production-ramp-of-256-core-epyc-venice-on-tsmcs-2nm-node.
- RAM prices: https://tech-insider.org/ddr5-ram-prices-2026-pc-builders/, https://capitalandcompute.net/memory-prices/server/.
- Unverified: Genoa/Sapphire Rapids figures are computed from the JEDEC speeds, not re-read from AMD/Intel pages.

## Appendix B. Sources for the extended hardware entries

Written by the research passes for each hardware group; short names are defined at the top of each part.

### Sources for hw-nv-desktop.json

Shared sources (short names used below):
- NVCMP = https://www.nvidia.com/en-us/geforce/graphics-cards/compare/ (memory size, type, bus width, power for RTX 50/40/30/20 and GTX 16; bandwidth only for RTX 50)
- WIKI = https://en.wikipedia.org/wiki/List_of_Nvidia_graphics_processing_units (raw wikitext tables; per Wikipedia table: bandwidth, memory clock, launch date, launch MSRP, TDP)
- BENCH = https://github.com/ggml-org/llama.cpp/discussions/15013 (llama 7B Q4_0, FA=1 rows used, same as main file)
- CUDA 13 runtime note: https://docs.nvidia.com/cuda/archive/13.0.0/cuda-toolkit-release-notes/ ("Offline compilation and library support for these architectures have been removed in CUDA Toolkit 13.0"), https://docs.nvidia.com/cuda/archive/12.9.0/cuda-toolkit-release-notes/index.html (announcement), https://developer.nvidia.com/blog/navigating-gpu-architecture-support-a-guide-for-nvidia-cuda-developers (driver branch 580 is the last for CC < 7.5; stay on CUDA 12.9). CUDA 13.0 supports Turing through Blackwell.
- vLLM minimum: https://docs.vllm.ai/en/latest/getting_started/installation/gpu.html ("compute capability 7.5 or higher (e.g., T4, RTX20xx, ...)") - so Pascal and Volta (V100, Titan V) are not supported; Turing is.
- FlashAttention-2: https://github.com/Dao-AILab/flash-attention (Ampere, Ada, Hopper; Turing only via a separate flash-attention-turing repo).

Per id:
- gtx-1060-6gb: WIKI (6 GB/3 GB, 192-bit, 192.2 GB/s, 9 Gbps variant 216.7, 120 W, $249/$199). BENCH (row "GTX 1060", memory size not stated). No vendor page fetched.
- gtx-1070: WIKI (256-bit, 256.3 GB/s, 150 W, $379). No vendor page fetched.
- gtx-1070-ti: WIKI (GDDR5 256-bit, 180 W, FE $449; table MSRP column shows $399, so only the $449 FE price is quoted). BENCH.
- gtx-1080: WIKI (GDDR5X, 320.3 / 352.3 GB/s, 180 W, $599/$699).
- gtx-1080-ti: WIKI (11 GB, 352-bit, 484.4 GB/s, 250 W, $699). BENCH.
- gtx-1650: NVCMP (4 GB GDDR5/GDDR6, 128-bit, 75 W); WIKI (128.1 / 192.0 GB/s, $149, 2019-04).
- gtx-1660-super: NVCMP (6 GB GDDR6, 192-bit, 125 W); WIKI (336.0 GB/s, $229).
- gtx-1660-ti: NVCMP (6 GB GDDR6, 192-bit, 120 W); WIKI (288.0 GB/s, $279).
- rtx-2060: NVCMP (6 GB, 192-bit, 160 W); WIKI (336.0 GB/s, $349, 2019-01).
- rtx-2060-12gb: NVCMP (12 GB, 192-bit, 185 W); WIKI (336.0 GB/s, 2021-12, no MSRP).
- rtx-2060-super: NVCMP (8 GB, 256-bit, 175 W); WIKI (448.0 GB/s, $399). BENCH.
- rtx-2070: NVCMP (8 GB, 256-bit, 185 W); WIKI (448.0 GB/s, 175 W ref, $499/$599). NVLink "No" per WIKI RTX 20 page.
- rtx-2070-super: NVCMP (215 W); WIKI (448.0 GB/s, $499). NVLink per https://en.wikipedia.org/wiki/GeForce_RTX_20_series (only 2060/2060 12GB/2060 Super/2070 marked No). BENCH.
- rtx-2080: NVCMP (225 W); WIKI (448.0 GB/s, 215 W ref, $699/$799).
- rtx-2080-super: NVCMP (250 W); WIKI (495.9 GB/s, $699).
- rtx-2080-ti: NVCMP (11 GB, 352-bit, 260 W); WIKI (616.0 GB/s, 250 W ref, $999/$1,199). BENCH.
- titan-rtx: WIKI only (24 GB, 384-bit, 672.0 GB/s, 280 W, $2,499). No vendor page fetched.
- titan-v: WIKI only (12 GB HBM2, 3072-bit, 651.3 GB/s, 250 W, $2,999; CEO Edition 32 GB 868.4). BENCH.
- rtx-3050: NVCMP (8 GB, 128-bit, 130 W; 6 GB 96-bit 70 W); WIKI (224.0 GB/s, 14 Gbps, $249, 2022-01).
- rtx-3060-8gb: NVCMP (8 GB, 128-bit, 170 W); bandwidth 240 GB/s from TechPowerUp search snippet (https://www.techpowerup.com/gpu-specs/geforce-rtx-3060-8-gb.c3937, 15 Gbps). WIKI lists 15 Gbps but a 224.0 bandwidth cell (rowspan error), so TechPowerUp used. Release 2022-10 per WIKI.
- rtx-3060-ti: NVCMP (8 GB GDDR6/GDDR6X, 256-bit, 200 W); WIKI (448.0 / 608.3 GB/s, $399). BENCH (comment in thread, FA=1).
- rtx-3070: NVCMP (8 GB GDDR6, 256-bit, 220 W); WIKI (448.0 GB/s, $499).
- rtx-3070-ti: NVCMP (8 GB GDDR6X, 256-bit, 290 W); WIKI (19 Gbps, 608.3 GB/s, $599).
- rtx-3080-12gb: NVCMP (12 GB, 384-bit, 350 W); WIKI (912.4 GB/s, $799, 2022-01). $799 is WIKI only.
- rtx-3080-ti: NVCMP (12 GB, 384-bit, 350 W); WIKI (912.4 GB/s, $1,199).
- rtx-4060: NVCMP (8 GB GDDR6, 128-bit, 115 W); WIKI (272.0 GB/s, $299, 2023-06).
- rtx-4060-ti-8gb: NVCMP (8 GB, 128-bit, 160 W); WIKI (288.0 GB/s, $399, 2023-05). BENCH.
- rtx-4070: NVCMP (12 GB GDDR6X/GDDR6, 192-bit, 200 W); WIKI (504.2 / 480.0 GB/s, $599).
- rtx-4070-super: NVCMP (220 W); WIKI (504.2 GB/s, $599, 2024-01).
- rtx-4070-ti: NVCMP (285 W); WIKI (504.2 GB/s, $799, 2023-01).
- rtx-4080: NVCMP (16 GB, 256-bit, 320 W); WIKI (716.8 GB/s, $1,199, 2022-11). BENCH.
- rtx-5050: NVCMP (8 GB GDDR6, 128-bit, 320 GB/s, 130 W); WIKI ($249, 2025-07-01).
- rtx-5060-ti-8gb: NVCMP (8/16 GB GDDR7, 128-bit, 448 GB/s, 180 W); WIKI ($379, 2025-04-16).
- tesla-p4: Wikipedia table only (https://en.wikipedia.org/wiki/Nvidia_Tesla: 8 GB GDDR5, 256-bit, 192 GB/s, 50-75 W, 2016-09). Datasheet not fetched.
- tesla-p40: NVIDIA datasheet https://images.nvidia.com/content/pdf/tesla/184427-Tesla-P40-Datasheet-NV-Final-Letter-Web.pdf (24 GB, 346 GB/s, 250 W). BENCH. "Slow FP16" from general knowledge of GP102 (not re-checked).
- tesla-p100: NVIDIA datasheet https://images.nvidia.com/content/tesla/pdf/nvidia-tesla-p100-PCIe-datasheet.pdf (16 GB 732 GB/s or 12 GB 549 GB/s, 250 W, FP16 18.7). SXM2 300 W / 732 GB/s per Wikipedia Nvidia Tesla table. BENCH (16 GB).
- tesla-v100: NVIDIA datasheet https://images.nvidia.com/content/technologies/volta/pdf/volta-v100-datasheet-update-us-1165301-r5.pdf (16/32 GB, 900 GB/s, V100S 1134, tensor 112/125/130, 250/300 W). BENCH (32 GB).
- tesla-t4: https://www.nvidia.com/en-us/data-center/tesla-t4/ (16 GB, "320+ GB/s", 65 FP16 TFLOPS, 70 W). BENCH.
- nvidia-a2: https://www.nvidia.com/en-us/data-center/products/a2/ (16 GB, 200 GB/s, 18 TF dense, 40-60 W).
- nvidia-a10: https://www.nvidia.com/en-us/data-center/products/a10-gpu/ (24 GB, 600 GB/s, 125 TF dense, 150 W).
- nvidia-a16: https://www.nvidia.com/en-us/data-center/products/a16-gpu/ (4x 16 GB, 4x 200 GB/s, 250 W). FP16 TFLOPS not on page (null).
- nvidia-a30: https://www.nvidia.com/en-us/data-center/products/a30-gpu/ (24 GB HBM2, 933 GB/s, 165 TF dense, 165 W, NVLink 2 GPUs). BENCH.
- nvidia-a40: https://www.nvidia.com/en-us/data-center/a40/ (48 GB, 696 GB/s, 300 W, NVLink 2-way); BF16 dense 149.7 from datasheet via search snippet (https://images.nvidia.com/content/Solutions/data-center/a40/nvidia-a40-datasheet.pdf). BENCH.
- nvidia-l40: https://www.nvidia.com/en-us/data-center/l40/ (48 GB, 864 GB/s, 300 W); FP16 dense 181.05 from datasheet via search snippet (Lenovo Press lp1718 / NVIDIA L40 datasheet). BENCH.
- nvidia-l20: UNVERIFIED by vendor. Bandwidth computed from TechPowerUp snippet (https://techpowerup.com/gpu-specs/l20.c4206: 384-bit, 18 Gbps). 48 GB and 275 W from retailer listings. Release "2024" approximate.
- nvidia-h20: UNVERIFIED. 96 GB HBM3, 4.0 TB/s, 400 W only from press (https://www.tweaktown.com/news/95224/...). bandwidth_gbs left null on purpose. Release "2024" approximate.
- nvidia-gh200: NVIDIA GH200 datasheet (MAR25) https://dam-cdn.nvd.orangelogic.com/AssetLink/tkno03fa645gb7f33w60rf200d330420.pdf (96 GB HBM3 4 TB/s | 144 GB HBM3e 4.9 TB/s; LPDDR5X 120/240/480 GB up to 384/512 GB/s; FP16 990 dense; 450-1000 W). Release year from https://en.wikipedia.org/wiki/Hopper_(microarchitecture) (full production May 2023).
- jetson-agx-orin-64gb: https://www.nvidia.com/en-us/autonomous-machines/embedded-systems/jetson-orin/ (64 GB 256-bit LPDDR5, 204.8 GB/s, 15-60 W). BENCH. Release month not verified (year only).
- jetson-agx-orin-32gb: same page (32 GB, 204.8 GB/s); 15-40 W and 1792 cores from the AGX Orin technical brief via search snippet (https://nvidia.com/content/dam/en-zz/Solutions/gtcf21/jetson-orin/nvidia-jetson-agx-orin-technical-brief.pdf). Release month not verified.
- jetson-orin-nx-16gb: Jetson Orin page (16 GB 128-bit LPDDR5, 102.4 GB/s, 10-40 W in Super mode). Release year approximate (2023).
- jetson-orin-nano-super-8gb: https://www.nvidia.com/en-us/autonomous-machines/embedded-systems/jetson-orin/nano-super-developer-kit/ (8 GB 128-bit LPDDR5, 102 GB/s, up from 68; 7-25 W). $249 and Dec 2024 from https://www.cnx-software.com/2024/12/18/249-nvidia-jetson-orin-nano-super-developer-kit-targets-generative-ai-applications-at-the-edge/ and Tom's Hardware.

### Sources for hw-nv-laptop.json (NVIDIA laptop GPUs, 52 entries)

Short names used below:
- GFCMP = https://www.nvidia.com/en-us/geforce/laptops/compare/ (RTX 40/50 laptop: memory, bus width, power range)
- GF30 = https://www.nvidia.com/en-us/geforce/laptops/30-series/ (RTX 30 laptop memory sizes; no bus/power)
- WIKI = https://en.wikipedia.org/wiki/List_of_Nvidia_graphics_processing_units (mobile tables, read from raw wikitext; per Wikipedia table)
- WIKI50 = https://en.wikipedia.org/wiki/GeForce_RTX_50_series (laptop table)
- PROCMP = https://www.nvidia.com/en-gb/products/workstations/professional-laptops/compare/ (RTX PRO Blackwell + Ada laptop: memory, bandwidth, bus, TGP)
- LC24 = https://images.nvidia.com/aem-dam/en-zz/Solutions/design-visualization/documents/proviz-rtx-mobile-line-card.pdf (NVIDIA line card FEB24: Ada + Ampere laptop)
- LC22 = https://www.nvidia.com/content/dam/en-zz/Solutions/gtcs22/design-visualization/quadro-product-literature/quadro-ampere-linecard-us-nvidia-web.pdf (NVIDIA line card NOV22)
- LC21 = https://www.nvidia.com/content/dam/en-zz/ja/Solutions/design-visualization/documents/nvidia-rtx-line-card-for-mobile-workstation-jp.pdf (NVIDIA Japan mobile line card DEC21: A2000/A3000/A4000/A5000, T-series, Quadro RTX)

#### GeForce
- gtx-1650-laptop: WIKI (4 GB GDDR5, 128-bit, 128 GB/s, 30-50 W). GDDR6 refresh bandwidth (~192) NOT verified.
- gtx-1660-ti-laptop: WIKI (6 GB, 192-bit, 12 Gbps, 288 GB/s, 60-80 W).
- rtx-3050-laptop: GF30 (4 or 6 GB); WIKI (128-bit, 11-12 Gbps, 176-192 GB/s, 35-80 W). 192 = typical, computed.
- rtx-3050-6gb-laptop: GF30 (6 GB option); WIKI (96-bit, Jul 2022). Bandwidth 168 assumes 14 Gbps (LC24 gives 168 GB/s for A1000 6GB, same chip config); spec sites report 132-168. TGP NOT verified (null).
- rtx-3050-ti-laptop: GF30; TPU snippet techpowerup.com/gpu-specs/geforce-rtx-3050-ti-mobile.c3778 (12 Gbps, 192 GB/s); power WIKI.
- rtx-3060-laptop: GF30; WIKI (192-bit, 12/14 Gbps, 288/336 GB/s, 60-115 W).
- rtx-3070-laptop: GF30; WIKI (256-bit, 384/448 GB/s, 80-125 W).
- rtx-3070-ti-laptop: GF30; WIKI (256-bit, 14 Gbps, 448 GB/s; 80-125 W via table rowspan, moderately uncertain).
- rtx-3080-laptop: GF30 (8 or 16 GB); WIKI (256-bit, 384/448 GB/s, 80-150 W).
- rtx-3080-ti-laptop: GF30; TPU snippet techpowerup.com/gpu-specs/geforce-rtx-3080-ti-mobile.c3840 (16 Gbps, 512 GB/s); power WIKI (80-150 W via rowspan).
- rtx-4050-laptop: GFCMP (6 GB, 96-bit, 35-115 W); WIKI (14/16 Gbps, 168/192 GB/s).
- rtx-4060-laptop: GFCMP; TPU snippet techpowerup.com/gpu-specs/msi-rtx-4060-mobile.b10707 (16 Gbps, 256 GB/s).
- rtx-4070-laptop: GFCMP (8 GB, 128-bit, 35-115 W); WIKI (224/256 GB/s).
- rtx-4080-laptop: GFCMP (12 GB, 192-bit, 60-150 W); WIKI (18 Gbps, 432 GB/s).
- rtx-5050-laptop: GFCMP (8 GB GDDR7, 128-bit, 35-100 W); WIKI50 (24 Gbps, 384 GB/s); cross-check PROCMP RTX PRO 1000 (same GB207 config, 384).
- rtx-5060-laptop: GFCMP (45-100 W); WIKI50 (384 GB/s); cross-check PROCMP RTX PRO 2000 (same GB206 config, 384). TPU snippet memory clock unclear.
- rtx-5070-laptop: GFCMP (8 or 12 GB, 128-bit, 50-100 W); WIKI50 (384). 12 GB variant (Apr 2026): https://www.tomshardware.com/pc-components/gpus/nvidia-quietly-launches-12gb-rtx-5070-laptop-gpu-midrange-mobile-gaming-gets-more-vram-amid-the-rampocalypse , https://hothardware.com/news/nvidia-adds-12gb-rtx-5070-laptop-gpu
- rtx-5070-ti-laptop: GFCMP (12 GB, 192-bit, 60-115 W); WIKI50 (28 Gbps, 672); cross-check PROCMP RTX PRO 3000 (672).
- rtx-5080-laptop: GFCMP (16 GB, 256-bit, 80-150 W); WIKI50 (896); cross-check PROCMP RTX PRO 4000 (896).

#### Turing mobile workstation
- nvidia-t500-laptop: LC21 + LC22 (2 or 4 GB, 64-bit, 80 GB/s, 18-25 W TDP); date WIKI.
- nvidia-t550-laptop: LC21 + LC22 (4 GB, 64-bit, 112 GB/s, 20-60 W). Release month NOT verified (WIKI says May 2022; LC21 already lists it as new).
- nvidia-t600-laptop: LC22 (192 GB/s); LC21 says 160 GB/s and 25 W TDP (WIKI says 40 W). Bandwidth and power uncertain.
- quadro-t1000-laptop: LC21 (4 GB, 128-bit, 128 GB/s, 40-50 W); memory type GDDR5 per WIKI, GDDR6 per LC21.
- nvidia-t1200-laptop: LC21 + LC22 (4 GB, 128-bit, 192 GB/s; LC21 TGP 35-95 W, looks generous); WIKI says 224 GB/s.
- quadro-t2000-laptop: LC21 (4 GB, 128-bit, 128 GB/s, 40-60 W).
- quadro-rtx-3000-laptop / quadro-rtx-4000-laptop / quadro-rtx-5000-laptop: LC21 (6/8/16 GB; 336/448/448 GB/s; 60-80 / 80-110 / 80-110 W); dates WIKI.

#### Ampere mobile workstation
- rtx-a500-laptop: LC24 + LC22 (4 GB, 64-bit, 112 GB/s, 20-60 W); date WIKI.
- rtx-a1000-laptop: LC24 + LC22 (4 GB, 128-bit, 224 GB/s, 35-95 W).
- rtx-a1000-6gb-laptop: LC24 (6 GB, 96-bit, 168 GB/s, 35-95 W). Release date NOT verified.
- rtx-a2000-laptop: LC21 (4 GB, 128-bit, 192 GB/s, 35-95 W).
- rtx-a2000-8gb-laptop: LC24 + LC22 (8 GB, 128-bit, 224 GB/s, 35-95 W).
- rtx-a3000-laptop: LC21 (6 GB, 192-bit, 264 GB/s, 60-130 W).
- rtx-a3000-12gb-laptop: LC24 + LC22 (12 GB ECC, 192-bit, 336 GB/s, 60-130 W).
- rtx-a4000-laptop: LC21 + LC22 (8 GB, 256-bit, 384 GB/s, 80-140 W).
- rtx-a4500-laptop: LC24 + LC22 (16 GB ECC, 256-bit, 512 GB/s, 80-140 W).
- rtx-a5000-laptop: LC21 + LC22 (16 GB, 256-bit, 448 GB/s, 80-165 W).
- rtx-a5500-laptop: LC24 + LC22 (16 GB ECC, 256-bit, 512 GB/s, 80-165 W).

#### Ada mobile workstation (all: PROCMP + LC24; dates WIKI)
- rtx-500-ada-laptop: 4 GB, 64-bit, 128 GB/s, 35-60 W.
- rtx-1000-ada-laptop: 6 GB, 96-bit, 192 GB/s, 35-140 W.
- rtx-2000-ada-laptop: 8 GB, 128-bit, 256 GB/s, 35-140 W.
- rtx-3000-ada-laptop: 8 GB ECC, 128-bit, 256 GB/s, 35-140 W.
- rtx-3500-ada-laptop: 12 GB ECC, 192-bit, 432 GB/s, 60-140 W.
- rtx-4000-ada-laptop: 12 GB ECC, 192-bit, 432 GB/s, 60-175 W.
- rtx-5000-ada-laptop: 16 GB ECC, 256-bit, 576 GB/s, 80-175 W.

#### RTX PRO Blackwell mobile workstation (all: PROCMP; announcement https://nvidianews.nvidia.com/news/nvidia-blackwell-rtx-pro-workstations-servers-agentic-ai)
- rtx-pro-500-blackwell-laptop: 6 GB, 96-bit, 288 GB/s, 35-75 W. (WIKI says 336 GB/s; NVIDIA value used.)
- rtx-pro-1000-blackwell-laptop: 8 GB, 128-bit, 384 GB/s, 35-115 W. (WIKI says 448; NVIDIA value used.)
- rtx-pro-2000-blackwell-laptop: 8 GB, 128-bit, 384 GB/s, 45-115 W. (WIKI says 448; NVIDIA value used.)
- rtx-pro-3000-blackwell-laptop: 12 GB ECC, 192-bit, 672 GB/s, 60-140 W.
- rtx-pro-4000-blackwell-laptop: 16 GB ECC, 256-bit, 896 GB/s, 80-175 W.
- rtx-pro-5000-blackwell-laptop: 24 GB ECC, 256-bit, 896 GB/s, 95-175 W.

All entries: fp16_tflops_dense null (NVIDIA laptop pages give only sparse tensor figures); prices null; no llama.cpp benchmark added.

### Sources for hw-nv-enterprise.json (checked 2026-11-19)

Shared short names:
- NVWS = https://www.nvidia.com/en-us/products/workstations/professional-desktop-gpus/ (current workstation line-up: memory, max power, form factor for Blackwell, Ada, Ampere cards)
- WIKI = https://en.wikipedia.org/wiki/List_of_Nvidia_graphics_processing_units (raw wikitext, RTX A / RTX Ada workstation tables: bandwidth, bus, launch date, launch price, "Tensor compute (FP16) (sparse)"); WIKI-T = https://en.wikipedia.org/wiki/Template:Nvidia_Tesla (data center table)
- TC = Thunder Compute pricing articles, updated 2026-11-13 (https://www.thundercompute.com/blog/nvidia-h100-pricing, /nvidia-h200-pricing, /nvidia-b200-pricing, /nvidia-rtx-pro-6000-pricing, /nvidia-rtx-a6000-pricing)
- MODAL = https://modal.com/blog/nvidia-a100-price-article (2024-10-31), https://modal.com/blog/nvidia-h100-price-article (2024-08-15)
- Runtime lines: see runtime-rules.md in this folder.
- Datasheet PDFs were read with pdftotext from the copies WebFetch saved.
- WebSearch budget ran out early in this task, so a few fields rely on WIKI or on search snippets read before that point.

Per id:
- rtx-pro-6000-blackwell-workstation: https://www.nvidia.com/en-us/products/workstations/professional-desktop-gpus/rtx-pro-6000/ (96 GB, 1,792 GB/s, 600 W, 4,000 FP4 TOPS sparse, PCIe Gen 5). Price: main file band + TC (Nov 2026: $16,000 NVIDIA marketplace, $19,999 B&H). Unverified: none.
- rtx-pro-6000-blackwell-max-q: https://www.nvidia.com/en-us/products/workstations/professional-desktop-gpus/rtx-pro-6000-max-q/ (96 GB, 1,792 GB/s, 300 W, 3,511 FP4 TOPS sparse, MIG 4). Unverified: release month, price.
- rtx-pro-6000-blackwell-server: https://www.nvidia.com/en-us/data-center/rtx-pro-6000-blackwell-server-edition/ (96 GB, 1,597 GB/s, 512-bit, "Up to 600W (configurable)", FP4 4 / FP8 2 / FP16 1 PFLOPS without sparsity label, air dual-slot or liquid single-slot, MIG 4). Unverified: lower power limit (400 W not found on NVIDIA's page), "passive" (page says air-cooled), sparsity reading of the FP16 figure, release month, price.
- rtx-pro-5500-blackwell (new product, not in main file): https://www.nvidia.com/en-us/products/workstations/professional-desktop-gpus/rtx-pro-5500/ and datasheet https://www.nvidia.com/content/dam/en-zz/nvidiaweb/products/workstations/professional-desktop-gpus/rtx-pro-5500/workstation-datasheet-rtx-pro-5500-we-nvidia-us-5513311-web.pdf (84 GB, 448-bit, 1,398 GB/s, up to 600 W, 2,376 FP4 TOPS sparse, MIG 2 x 42 GB). Unverified: launch month (datasheet is (c) 2026), price.
- rtx-pro-4000-blackwell-sff: https://www.nvidia.com/en-us/products/workstations/professional-desktop-gpus/rtx-pro-4000-sff/ (24 GB, 432 GB/s, 70 W, 770 FP4 TOPS sparse). Unverified: PCIe lane count, release month, price.
- rtx-pro-5000-blackwell-72gb: NOT produced. https://www.nvidia.com/en-us/products/workstations/professional-desktop-gpus/rtx-pro-5000/ lists one bandwidth (1,344 GB/s) and 300 W for both 48 GB and 72 GB, so the main-file entry with memory_options [48,72] stays correct.
- rtx-5000-ada: https://www.nvidia.com/en-us/products/workstations/rtx-5000/ (32 GB, 250 W, 1,044.4 tensor TFLOPS); NVIDIA datasheet (HP-hosted copy) https://valuehub.hp.com/static/nvidia/docs/NVIDIA%20RTX%205000%20Ada%20Generation%20Datasheet.pdf (256-bit, 576 GB/s, sparsity footnote). Launch date/price: WIKI.
- rtx-4500-ada: https://www.nvidia.com/en-us/products/workstations/rtx-4500/ ; datasheet https://www.nvidia.com/content/dam/en-zz/Solutions/products/workstations/nvidia-rtx-4500-datasheet.pdf (192-bit, 432 GB/s, 634.0 FP8 TFLOPS sparse, 210 W). Launch date/price: WIKI.
- rtx-4000-ada: https://www.nvidia.com/en-us/products/workstations/rtx-4000/ (427.6 tensor TFLOPS, 130 W); datasheet https://www.nvidia.com/content/dam/en-zz/Solutions/products/workstations/nvidia-rtx-4000-datasheet.pdf (160-bit, 360 GB/s; prints 327.6 tensor TFLOPS, FP8 sparse). 427.6 used because it matches WIKI (213.8 FP16 sparse) and the SM count x clock. Launch date/price: WIKI.
- rtx-4000-sff-ada: https://www.nvidia.com/en-us/products/workstations/rtx-4000-sff/ ; datasheet https://www.nvidia.com/content/dam/en-zz/Solutions/products/workstations/nvidia-rtx-4000-sff-datasheet.pdf (160-bit, 280 GB/s, 306.8 FP8 TFLOPS sparse, 70 W). Some partner sheets (PNY power-limited) list 320 GB/s. Launch date/price: WIKI.
- rtx-2000-ada: https://www.nvidia.com/en-us/products/workstations/rtx-2000/ (191.9 FP8 sparse, 70 W, PCIe 4.0 x8); NVIDIA datasheet (HP-hosted) https://valuehub.hp.com/static/nvidia/docs/NVIDIA%20RTX%202000%20Ada%20Generation%20Datasheet.pdf (128-bit, 224 GB/s). Price: WIKI $649 vs HotHardware headline $625 (search snippet).
- rtx-5880-ada: WIKI only (48 GB, 384-bit, 960 GB/s, 285 W, 2024-01, $6,999). Not on NVWS. Unverified against NVIDIA; fp16 left null for that reason.
- rtx-a5500: https://www.nvidia.com/en-us/products/workstations/rtx-a5500/ (24 GB, 230 W, NVLink 112 GB/s); bandwidth, bus, 272.8 sparse tensor, date, price: WIKI (NVIDIA datasheet URL guessed and 404).
- rtx-a5000: https://www.nvidia.com/en-us/products/workstations/rtx-a5000/ (24 GB, 230 W, NVLink 112 GB/s); bandwidth, 222.2 sparse tensor, date, price: WIKI.
- rtx-a4500: https://www.nvidia.com/en-us/products/workstations/rtx-a4500/ ; datasheet https://www.nvidia.com/content/dam/en-zz/Solutions/design-visualization/rtx/nvidia-rtx-a4500-datasheet.pdf (20 GB, 640 GB/s, 189.2 TFLOPS sparse, NVLink 112.5 GB/s bidirectional, 200 W). Date: WIKI.
- rtx-a4000: https://www.nvidia.com/en-us/products/workstations/rtx-a4000/ ; datasheet https://www.nvidia.com/content/dam/en-zz/Solutions/gtcs21/rtx-a4000/nvidia-rtx-a4000-datasheet.pdf (256-bit, 448 GB/s, 153.4 TFLOPS sparse, 140 W). Date/price: WIKI.
- rtx-a2000: https://www.nvidia.com/en-us/products/workstations/rtx-a2000/ (6/12 GB, 70 W); datasheet https://www.nvidia.com/content/dam/en-zz/Solutions/design-visualization/rtx-a2000/nvidia-rtx-a2000-datasheet.pdf (192-bit, 288 GB/s, 63.9 TFLOPS sparse; 6 GB sheet). 12 GB bandwidth same per WIKI. Date/price: WIKI.
- rtx-a1000 (desktop; added, not in scope list): NVWS (8 GB, 50 W, single slot); bandwidth 192 GB/s, 53.8 sparse, date, price: WIKI.
- rtx-a400 (added, not in scope list): NVWS (4 GB, 50 W); bandwidth 96 GB/s, 21.7 sparse, date, price: WIKI.
- nvidia-a800-40gb-active: https://www.nvidia.com/en-us/products/workstations/a800/ (40 GB HBM2, 1,555.2 GB/s, 240 W, 623.8 TFLOPS / 1,247 INT8 TOPS sparse, NVLink 400 GB/s bidirectional, no display outputs). Unverified: release date (year only, from memory), price.
- tesla-m40-24gb: WIKI-T (12 or 24 GB GDDR5, 384-bit, 288 GB/s, 250 W, compute 5.2, 2015-11-10). NVIDIA product brief URLs tried (404). Unverified: PCIe 3.0 (from memory), launch date of the 24 GB version.
- nvidia-a100-40gb-pcie / -80gb-pcie / -40gb-sxm / -80gb-sxm: NVIDIA A100 datasheet https://www.nvidia.com/content/dam/en-zz/Solutions/Data-Center/a100/pdf/nvidia-a100-datasheet-us-nvidia-1758950-r4-web.pdf (40/80 GB; 1,555 / 1,935 / 1,555 / 2,039 GB/s; 250 / 300 / 400 / 400 W; FP16 312 dense; NVLink bridge 600 GB/s for 2 PCIe GPUs; SXM NVLink 600 GB/s; PCIe Gen4 64 GB/s; MIG 5 GB / 10 GB) and https://www.nvidia.com/en-us/data-center/a100/ (500 W custom-thermal SKU). Prices: MODAL. Unverified: release months (from memory of NVIDIA announcements).
- nvidia-h200-sxm / nvidia-h200-nvl: https://www.nvidia.com/en-us/data-center/h200/ (141 GB, 4.8 TB/s; FP16 1,979 / 1,671 TFLOPS with sparsity; 700 / 600 W configurable; NVLink 900 GB/s; NVL 2- or 4-way bridge 900 GB/s per GPU; PCIe Gen5 128 GB/s; MIG 18 / 16.5 GB). NVL release 2024-11 per WIKI-T. Prices: TC.
- nvidia-gb200-nvl72-gpu: https://www.nvidia.com/en-us/data-center/gb200-nvl72/ (72 GPUs / 36 CPUs; 13.4 TB HBM3E, 576 TB/s; superchip 372 GB, 16 TB/s per 2 GPUs; FP16/BF16 360 PFLOPS sparse, "Dense is one-half sparse"; NVLink 130 TB/s, 1.8 TB/s GPU-to-GPU; 17 TB LPDDR5X). Unverified: per-GPU power, release month, price.
- nvidia-gb300-nvl72-gpu: https://www.nvidia.com/en-us/data-center/gb300-nvl72/ (72 GPUs / 36 CPUs; 20 TB HBM3e, up to 576 TB/s; FP4 1,440 sparse / 1,080 dense PFLOPS; FP16/BF16 360 PFLOPS sparse; NVLink 130 TB/s; 37 TB fast memory; "1.5x HBM3E" vs Blackwell). Per-GPU memory 278 GB derived (20 TB / 72); the page has no "288". Unverified: per-GPU power, release month, price.
- dgx-hgx-a100-80gb: https://docs.nvidia.com/dgx/dgxa100-user-guide/introduction-to-dgxa100.html (8 x A100, 640 GB or 320 GB, 6 NVSwitch, 600 GB/s, 6.5 kW max); per-GPU values from the A100 datasheet. Unverified: release month, price.
- dgx-hgx-h100: https://docs.nvidia.com/dgx/dgxh100-user-guide/introduction-to-dgxh100.html (8 x H100, 640 GB, 900 GB/s, 10.2 kW max); per-GPU 3.35 TB/s and 989.5 TFLOPS from main-file nvidia-h100-sxm. Price: TC (HGX H100 servers). Unverified: release month.
- dgx-hgx-h200: same DGX H100/H200 user guide (8 x H200, 1,128 GB, 10.2 kW); per-GPU from the H200 page. Price: TC (conflicting $293,000 vs $350,000-450,000). Note https://www.nvidia.com/en-us/data-center/dgx-h200/ no longer shows a DGX H200 spec table.
- dgx-hgx-b200: https://www.nvidia.com/en-us/data-center/dgx-b200/ (8 GPUs, 1,440 GB, 64 TB/s, FP4 144/72 PFLOPS, ~14.3 kW, NVLink 14.4 TB/s, 2 NVSwitch); https://www.nvidia.com/en-us/data-center/hgx/ (HGX B200 FP16/BF16 36 PFLOPS sparse, 1.8 TB/s per GPU). Price: TC (HGX B200 estimate).
- dgx-hgx-b300: https://www.nvidia.com/en-us/data-center/dgx-b300/ (8 Blackwell Ultra, 2.1 TB, FP4 144/108 PFLOPS, ~14 kW, 14.4 TB/s NVLink); HGX page (FP16/BF16 36 PFLOPS sparse, 1.8 TB/s per GPU). Unverified: per-GPU bandwidth (8 TB/s taken from GB300 NVL72 rack figure), price.
- nvidia-b100: NOT produced. WIKI-T lists B100 as "Never Released", and NVIDIA's current HGX page lists only HGX B300, B200 and Rubin platforms. Could not confirm with a second source (search budget exhausted), so no entry.

#### Price bands for entries in the main file (applied to the core entries; all rough)
- nvidia-h100-pcie: value 36000. "Rough: one new 80 GB card listed at $35,989 on Newegg (Thunder Compute, Nov 2026)." Source TC h100.
- nvidia-h100-sxm: value null or ~37,000 per GPU inside servers. "Rough: not sold singly; 8-GPU HGX H100 servers listed $296,378 (Thinkmate) to $308,935 (SabreEDGE base config), Nov 2026 (Thunder Compute). Modal estimated about $25,000 per GPU (Aug 2024)." Source TC h100, MODAL.
- nvidia-h200 (replaced by the split): see nvidia-h200-sxm / -nvl above.
- nvidia-b200: value 50000. "Rough: $45,000-55,000 per GPU street (Thunder Compute, Nov 2026); 8-GPU volume deals about $30,000-40,000 per GPU; full 8-GPU HGX B200 system about $450,000-550,000." Source TC b200.
- nvidia-a100 (replaced by the split): 40 GB PCIe $8,000-10,000 and 80 GB SXM $18,000-20,000 (Modal, Oct 2024). No current used price found.
- rtx-pro-6000-blackwell (replaced by the split): see rtx-pro-6000-blackwell-workstation. TC gives no Max-Q or Server Edition price.
- rtx-a6000: value 6400. "Rough: $6,399 new on Newegg (Thunder Compute, Nov 2026); used prices vary and were not verified." Source TC rtx-a6000.
- rtx-6000-ada: not found (TC article lists only cloud rental, $0.63-1.57/GPU-hr, Nov 2026).
- nvidia-l40s: not found (TC lists only cloud rental, e.g. $1.09/GPU-hr on Runpod, Nov 2026).
- nvidia-l4, nvidia-a10 (hw-nv-desktop), tesla-v100 (hw-nv-desktop), tesla-p40 (hw-nv-desktop): not found. TC's V100 article (Oct 2026) lists only rental rates ($0.13-3.06/GPU-hr). bestvaluegpu.com price-history pages returned HTTP 429 three times, so used-card trackers were not read.
- DGX B200 / DGX H200 / DGX H100 boxes: no DGX prices found; HGX system bands are in the dgx-hgx-* entries above.

#### Not added, but seen
- HGX Rubin NVL8 and HGX Vera Rubin NVL8 (8 x Rubin, 2 TB HBM4, 130 TB/s total, shipping status not stated) are on https://www.nvidia.com/en-us/data-center/hgx/ ; the main file has nvidia-rubin.
- The main-file bench numbers on rtx-pro-6000-blackwell (pp512 16619 / tg128 281) do not say which edition was tested, so they were not copied to the split entries.

### hw-amd sources

Shared sources:
- ROCm Linux list: https://rocm.docs.amd.com/en/latest/compatibility/compatibility-matrix.html (the "ROCm 10.2.0 compatibility matrix", dated 2026-08-26); https://rocm.docs.amd.com/projects/install-on-linux/en/latest/reference/system-requirements.html (marks MI50/gfx906, Radeon VII, PRO VII unsupported; MI100 supported with OS limits); https://rocm.docs.amd.com/projects/radeon-ryzen/en/latest/docs/compatibility/compatibilityrad/native_linux/native_linux_compatibility.html (Radeon on Linux, ROCm 7.2.1)
- ROCm Windows: https://rocm.docs.amd.com/projects/install-on-windows/en/latest/reference/system-requirements.html (HIP SDK 7.2: RX 6000, W6800, W6600 unsupported; RX 7600 supported; gfx1100 lists only 7900 XTX/XT, W7900, W7800)
- gfx targets / VRAM: https://rocm.docs.amd.com/en/latest/reference/gpu-arch-specs.html (Instinct, RX 7600/7700 XT/7900 GRE, RX 9050/9060, R9600D/R9700S). RDNA1/RDNA2/mobile gfx names from general LLVM knowledge, not fetched.
- Vulkan benchmarks: https://github.com/ggml-org/llama.cpp/discussions/10879 (FA-on row used when present, else FA-off).
- "HSA_OVERRIDE_GFX_VERSION=10.3.0" workaround: from Ollama GPU docs, not fetched this session.
- No RX 9000 mobile GPUs found as of Nov 2026: only 2025 leaks (RX 9080M etc.) and AMD saying RDNA 4 is desktop first (tomshardware.com, notebookcheck.net, hothardware.com via WebSearch). None added.

Per id:
- rx-5500-xt: https://en.wikipedia.org/wiki/Radeon_RX_5000_series (per Wikipedia table; rowspan cells, 224 GB/s / 128-bit / 14 Gbps from shared row)
- rx-5600-xt: Wikipedia RX 5000 table (288/336 GB/s); 150 W from Tom's Hardware/AnandTech via WebSearch (Wikipedia shows 160 W)
- rx-5700: Wikipedia RX 5000 table
- rx-5700-xt: Wikipedia RX 5000 table (rowspan); bench #10879
- radeon-vii: tomshardware.com, anandtech.com/show/13923, pcgamer via WebSearch (16 GB HBM2, 4096-bit, ~1 TB/s, 300 W, $699); bench #10879
- rx-6500-xt: https://en.wikipedia.org/wiki/Radeon_RX_6000_series (per Wikipedia table); "PCIe 4.0 x4" not verified this session; bench #10879
- rx-6600, rx-6600-xt, rx-6650-xt, rx-6700-xt, rx-6750-xt, rx-6950-xt: Wikipedia RX 6000 table; bench #10879 (6600 XT FA-off)
- rx-6800: Wikipedia RX 6000 table; 250 W and 512 GB/s from TechPowerUp review snippet via WebSearch; bench #10879
- rx-6800-xt, rx-6900-xt: Wikipedia RX 6000 table (rowspan cells); 300 W also Tom's Hardware snippet; bench #10879
- rx-7600, rx-7700-xt, rx-7900-gre: https://en.wikipedia.org/wiki/Radeon_RX_7000_series (per Wikipedia table); bench #10879 (7600, 7900 GRE)
- rx-9060-xt-8gb: https://en.wikipedia.org/wiki/Radeon_RX_9000_series (garbled table) + gigabyte.com GV-R9060XTGAMING-8GD (20 Gbps) and pcgamer review via WebSearch (320 GB/s, 150 W, $299)
- rx-9070-gre: Wikipedia RX 9000 table; propakistani.pk, neowin.net, techno-edge.net via WebSearch (12 GB, 192-bit, 432 GB/s, 220 W, $549, worldwide June 2026; one source says July 1)
- rx-9060: Wikipedia RX 9000 table; igorslab.de, tomshardware.com, hothardware.com via WebSearch (28 CU, 8 GB, 18 Gbps, 288 GB/s, 132 W, Aug 2025)
- rx-9050: Wikipedia RX 9000 table; itwire.com, guru3d.com, pcgamer.com via WebSearch ($279, 92 W, 28 Jul 2026, APAC/JP/LATAM). 8 GB board power only from press; Sapphire card lists 100 W.
- rx-9050-4gb: https://www.driverscloud.com/en/news/2955/... (cites amd.com spec page: 64-bit, 18 Gbps, 144 GB/s, 92 W, OEM); ROCm matrix lists "RX 9050 (4GB)". Release month = article date (Aug 2026), approximate.
- rx-5500m, rx-5600m: Wikipedia RX 5000 mobile table (power 85 W from table, laptops vary)
- rx-6600m: Wikipedia RX 6000 mobile table (100 W); 224 GB/s from notebookcheck/technical.city via WebSearch; bench #10879 (FA-off)
- rx-6700m: Wikipedia RX 6000 mobile table (10 GB, 160-bit, 320 GB/s, 135 W); 80-135 W range from notebookcheck via WebSearch
- rx-6800m: Wikipedia RX 6000 mobile table (12 GB, 192-bit, 384 GB/s, 145+ W); 145-165 W from notebookcheck via WebSearch; bench #10879
- rx-6850m-xt: Wikipedia RX 6000 mobile table + AMD RX 6000M/6000S quick-reference PDF snippet via WebSearch (12 GB, 432 GB/s, up to 165 W)
- rx-7600s, rx-7600m, rx-7600m-xt, rx-7700s: Wikipedia RX 7000 mobile table + notebookcheck/pcgameshardware via WebSearch (TGP ranges). "Framework Laptop 16" mention not verified this session.
- rx-7800m: Wikipedia RX 7000 mobile table; guru3d, tomshardware via WebSearch (12 GB, 432 GB/s, 180 W)
- rx-7900m: Wikipedia RX 7000 mobile table; notebookcheck (160-180 W), techradar (Alienware m18) via WebSearch
- radeon-pro-w6600: https://en.wikipedia.org/wiki/Radeon_Pro (per Wikipedia table); 130 W also hothardware review via WebSearch
- radeon-pro-w6800: Wikipedia Radeon Pro table
- radeon-pro-w7500: storagereview.com and AnandTech via WebSearch (8 GB, 128-bit, 10.8 Gbps, ~173 GB/s per AMD datasheet, 70 W, $429). Bandwidth 172.8 is computed. amd.com datasheet timed out.
- radeon-pro-w7600: Wikipedia Radeon Pro table (130 W, $599); 288 GB/s from storagereview via WebSearch
- radeon-pro-w7700: Wikipedia Radeon Pro table
- radeon-ai-pro-r9600d: Wikipedia Radeon Pro table; notebookcheck.net/AMD-unveils-two-new-Radeon-Pro-GPUs-for-AI-workloads.1183454.0.html; TechPowerUp news 343977 snippet (32 GB, 256-bit, 640 GB/s, 150 W). Cooling type uncertain (reported passive). Price and ship date not verified.
- radeon-ai-pro-r9700s: same as R9600D (300 W, passive, server racks). Price and ship date not verified.
- instinct-mi50, instinct-mi60: https://en.wikipedia.org/wiki/AMD_Instinct (per Wikipedia table); MI60 1 TB/s and 300 W from tomshardware/hothardware via WebSearch. Infinity Fabric Link "up to 4 cards" not re-verified. Bench (MI50) #10879; MI60 bench row exists but looked like an outlier, left out.
- instinct-mi100, instinct-mi210: Wikipedia AMD Instinct table (FP16 matrix 184.6 / 181.0). Infinity Fabric Link bridge counts not re-verified.
- instinct-mi250, instinct-mi250x: Wikipedia AMD Instinct table; AMD MI200 datasheet snippet via WebSearch (383.0 TFLOPS FP16, 500 W / 560 W peak, 3.2 TB/s)
- instinct-mi300a: Wikipedia AMD Instinct table (128 GB HBM3, 5300 GB/s, 980.6 TFLOPS dense FP16, 550 W / 760 W liquid); AMD data sheet snippets via WebSearch. usable_memory_fraction 0.85 is a judgement (CPU and OS share the pool).

### hw-other-enterprise sources (2026-11-19)

Note: the shared WebSearch budget for this turn ran out early; later checks used WebFetch/curl on known pages only. amd.com product pages and the CDNA 4 white paper timed out; AMD figures come from rocm.docs.amd.com and ir.amd.com.

Shared runtime sources:
- vLLM ROCm list (MI200s gfx90a, MI300 gfx942, MI350 gfx950 with ROCm 7.0+, RX 7900 gfx1100/1101, RX 9000 gfx1200/1201, Ryzen AI MAX/300) and XPU ("Intel Data Center GPU, Intel ARC GPU"): https://docs.vllm.ai/en/latest/getting_started/installation/gpu.html
- SGLang AMD: https://docs.sglang.io/docs/hardware-platforms/amd_gpu.md (names MI300X, MI250 for one feature, Strix iGPUs); official ROCm images per https://raw.githubusercontent.com/sgl-project/sglang/main/docker/rocm.Dockerfile (gfx942 "mi30x", gfx950 "mi35x", gfx1250 "mi45x" bring-up). SGLang XPU: https://docs.sglang.io/docs/hardware-platforms/xpu.md (Arc Pro B-Series and Arc B-Series only). Platform index: https://docs.sglang.io/llms.txt (no Gaudi or Tenstorrent page).
- llama.cpp: https://github.com/ggml-org/llama.cpp/blob/master/docs/build.md (HIP, SYCL for Max/Flex/Arc, CANN, MUSA); gfx906, CDNA1-4 (gfx908/90a/942/950) and RDNA code paths in ggml/src/ggml-cuda/vendors/hip.h and common.cuh. gfx1250 (MI455X) not seen: "unverified".
- vLLM Gaudi plugin: https://docs.vllm.ai/projects/gaudi/en/latest/getting_started/quickstart/quickstart.html (Gaudi 2 or 3, Intel Gaudi software 1.24.2+); https://docs.habana.ai/en/latest/Support_Matrix/Support_Matrix.html (1.24.2 supports Gaudi 2 and 3).
- Prices: price tracker pages https://gpuprix.com/us/gpus/<slug> (2026-11-18/19), appraisal site https://www.amcompute.com/appraisals/..., rental trackers https://getdeploying.com/gpus/amd-mi355x; Gaudi kit prices https://servethehome.com/intel-gaudi-2-8x-oam-ubb-65k-gaudi-3-125k-and-includes-networking ; MI300X estimate https://www.tomshardware.com/tech-industry/artificial-intelligence/nvidias-h100-ai-gpus-cost-up-to-four-times-more-than-amds-competing-mi300x-amds-chips-cost-dollar10-to-dollar15k-apiece-nvidias-h100-has-peaked-beyond-dollar40000 . All labelled rough.

New entries:
- instinct-mi350x / instinct-mi355x: https://rocm.docs.amd.com/en/latest/reference/gpu-arch/mi350.html (288 GB HBM3E, 8 TB/s, 1000 W / 1400 W, FP16/BF16 2.3 / 2.5 PF dense, FP8 4.6 / 5.0 PF, MXFP4/6 9.2 / 10 PF, 7 IF links "over 1 TB/s aggregate", PCIe 5.0 x16); launch date 2025-06 from https://ir.amd.com/news-events/press-releases/detail/1255/... and Wikipedia AMD Instinct (Jun 12, 2025). FP16 uses AMD's rounded PF values. Price not found.
- instinct-mi300x-platform: https://ir.amd.com/news-events/press-releases/detail/1173/... (8 x 192 GB = 1.5 TB, 5.3 TB/s per GPU, 750 W); FP16 1307.4 from https://rocm.docs.amd.com/en/latest/reference/gpu-arch/mi300.html; 7 IF links from same page. 128 GB/s per link / 896 GB/s per GPU from AMD data sheet memory, not re-fetched. Totals are 8x arithmetic. power_w = 8 GPUs only.
- instinct-mi325x-platform: https://ir.amd.com/news-events/press-releases/detail/1220/... (256 GB, 6.0 TB/s, 1307.4 TFLOPS FP16, 2614.9 FP8, 1000 W, Q4 2024 shipments, Q1 2025 systems). Totals 8x arithmetic. IF bandwidth not re-fetched.
- instinct-mi355x-platform: mi350.html above; totals 8x arithmetic. MI350X air / MI355X liquid from same page.
- intel-gaudi-2: https://docs.habana.ai/en/latest/Gaudi_Overview/Gaudi_Architecture.html (96 GB HBM2E, 2.45 TB/s, 48 MB SRAM, 24x 100 GbE, FP8/BF16/FP16 MME); https://habana.ai/products/gaudi2/ (7 nm, 24 TPCs); HLS-Gaudi2 datasheet https://habana.ai/wp-content/uploads/2023/10/HLS-Gaudi2_Datasheet_10_23.pdf (21 ports all-to-all, PCIe 4.0 x16, 7.5 kW server). Unverified: power (600 W often reported, left null), FP16 TFLOPS (null), release month 2022-05 (from memory).
- huawei-ascend-910b, huawei-ascend-910c, huawei-atlas-300i-duo: see Huawei block below.
- tenstorrent-*, qualcomm-cloud-ai-100-ultra: see Tenstorrent/Qualcomm block below.

Skipped: radeon-pro-w7900-dual-slot (same 48 GB, gfx1100, 96 CUs per https://rocm.docs.amd.com/en/latest/reference/gpu-arch-specs.html; bandwidth assumed same, noted in the W7900 patch). Radeon PRO W6400 / W6900X: no vendor spec page reachable (amd.com timeouts, not on ROCm spec table), so no entry; W6400 tracker price $231-270 (2026-11) if someone adds it later.

Huawei block (written by a sub-task):
- Shared: vllm-ascend https://docs.vllm.ai/projects/ascend/en/latest/installation.html (v0.30.0; A2, A3, Atlas 300I Duo/200I Pro, 950DT); llama.cpp CANN https://raw.githubusercontent.com/ggml-org/llama.cpp/master/docs/backend/CANN.md (verified 910B and 310P; 310P FP16 only); SGLang Ascend https://docs.sglang.io/docs/hardware-platforms/ascend-npus/getting-started/installation.md (A3 and 950 tracks); MindIE https://www.hiascend.com/en/software/mindie (device list not read); BIS guidance 13 May 2025 https://www.bis.gov/media/documents/general-prohibition-10-guidance-may-13-2025.pdf (names 910B/910C/910D); Huawei Connect 2025 keynote https://www.huawei.com/en/news/2025/9/hc-xu-keynote-speech.
- huawei-ascend-910b: 64/32 GB and 1.6 TB/s / 800 GB/s per CSET https://cset.georgetown.edu/publication/pushing-the-limits-huaweis-ai-chip-tests-u-s-export-controls/ (secondary, cites Huawei docs). HCCS 392 GB/s from aggregator https://flopper.io/gpu/huawei-ascend-910b/spec-sheet (secondary, unverified). FP16 and power null. Released 2023 (secondary). Price not found.
- huawei-ascend-910c: 128 GB / 3.2 TB/s / ~750-800 TFLOPS BF16 are analyst estimates (SemiAnalysis via https://aiwiki.ai/wiki/huawei_ascend_910c/raw and flopper.io); per-die addressing and no FP8 from Huawei paper https://arxiv.org/html/2506.12708; ~0.8 TB/s interconnect derived from Huawei keynote. Power null. Released 2025 (press). Price not found.
- huawei-atlas-300i-duo: 48/96 GB LPDDR4X, 408 GB/s, 150 W, PCIe 4.0 from Huawei support page https://support.huawei.com/enterprise/en/doc/EDOC1100285916/181ae99a/specifications (search snippet; JS page). 140 TFLOPS FP16 and release 2022 from https://flopper.io/gpu/huawei-atlas-300i-duo-96gb/spec-sheet (cites e.huawei.com, 403). Price unverified.

Tenstorrent/Qualcomm block (written by a sub-task):
- Shared: tt-inference-server https://github.com/tenstorrent/tt-inference-server (tt-vllm-plugin, tt-sglang-plugin; docs/model_support/models_by_hardware.md). No Tenstorrent/Qualcomm backend in llama.cpp build.md, vLLM in-tree list or SGLang platform list. Release months not verified.
- tenstorrent-blackhole-p150a: https://tenstorrent.com/hardware/blackhole (32 GB, 512 GB/s, 664 TFLOPS BLOCKFP8, 300 W, 4x QSFP-DD 800G, PCIe 5.0 x16, $1,399); https://docs.tenstorrent.com/aibs/blackhole/. FP16 TFLOPS not published (null); released 2025 (year only).
- tenstorrent-blackhole-p100a: same pages (28 GB, 448 GB/s, 300 W, no QSFP-DD, $999). Released 2025 (year only).
- tenstorrent-wormhole-n300: https://docs.tenstorrent.com/docs-test/core/latest/_sources/aibs/wormhole/specifications.md.txt (24 GB, 576 GB/s, FP16 131 TFLOPS, FP8 466, 300 W, PCIe 4.0 x16, 2x QSFP-DD 400GbE); prices https://tenstorrent.com/hardware/wormhole. Released 2024 (year only).
- tenstorrent-wormhole-n150: same pages (12 GB, 288 GB/s, FP16 74, 160 W, $999/$1,099). Released 2024 (year only).
- qualcomm-cloud-ai-100-ultra: https://qualcomm.github.io/cloud-ai-sdk-pages/latest/Getting-Started/Architecture/index.html (4 SoCs, 128 GB, 548 GB/s, 290 TFLOPS FP16, 870 TOPS INT8, 150 W); vLLM container https://qualcomm.github.io/cloud-ai-sdk-pages/latest/Getting-Started/Model-Serving/vLLM-Serving/index.html; https://github.com/quic/efficient-transformers. Price not found; released 2023 (year only, from memory).

Patch file (hw-other-enterprise-patch.json):
- runtime lines from the shared runtime sources above; ROCm support status carried over from the existing entries (hw-amd-sources.md).
- MI100 IF: 3 links at 23 GT/s from https://rocm.docs.amd.com/en/latest/reference/gpu-arch/mi100.html (46 GB/s each way computed). MI250/MI250X IF: 50 GB/s per link, 200/400 GB/s die-to-die from https://rocm.docs.amd.com/en/latest/reference/gpu-arch/mi250.html. MI325X FP16 1307.4 from ir.amd.com release 1220. Gaudi 3 4.8 Tb/s computed from 24x 200 Gbps (docs.habana.ai).
- PCIe lane counts for W6600/W7500/W7600 (4.0 x8), W6800/W7700/W7800/W7900 (4.0 x16), Arc Pro B50/B60 (5.0 x8): general knowledge, not re-fetched. R9700 PCIe 5.0 x16 seen in a retailer listing title (slickdeals link in price notes).
- MI210 bridge bandwidth and MI50/MI60 bridge bandwidth: not verified, stated as such.
- The MI325X main-file note still says "(FP16 figure not re-verified)"; with this patch that phrase should be removed.

### Sources for hw-intel-igpu.json (checked 2026-11-19)

Intel spec page pattern: https://www.intel.com/content/www/us/en/products/sku/<SKU>/.../specifications.html. Arc A-series table: https://www.intel.com/content/www/us/en/ark/products/series/227957/intel-arc-a-series-graphics.html. Launch MSRPs for A380/A750/A770 come from 2022 news (Tom's Hardware, TechSpot, PCPer); A580 $179 from PC Gamer/AnandTech; B570 $219 from the Intel newsroom. Prices not re-checked. Benchmarks: https://github.com/ggml-org/llama.cpp/discussions/10879 (read via WebFetch; the page was truncated).

- arc-a310: intel.com SKU 227958 (4 GB, 64-bit, 15.5 Gbps, 124 GB/s, 75 W, 40-75 W low-power range, Q3'22). Release month not verified ("2022").
- arc-a380: intel.com SKU 227959 (6 GB, 96-bit, 15.5 Gbps, 186 GB/s, 75 W, Q2'22). TweakTown on the 16 to 15.5 Gbps change. June 2022 = China launch (Tom's/HotHardware).
- arc-a580: intel.com SKU 227961 (8 GB, 256-bit, 16 Gbps, 512 GB/s, 185 W, Q4'23).
- arc-a750: intel.com SKU 227954 (8 GB, 512 GB/s, 225 W). Bench from #10879 (FA on 303.37/43.96; FA off 1075.94/42.66).
- arc-a770-8gb: intel.com SKU 227955 (8 GB, 256-bit, 16 Gbps, 512 GB/s, 225 W).
- arc-b570: intel.com SKU 241676 (10 GB, 160-bit, 19 Gbps, 380 GB/s, 150 W, PCIe 4.0 x8); Intel newsroom (Jan 16 2025, from $219). Bench from #10879 (FA on 288.51/50.49; FA off 913.95/49.64).
- arc-a350m-laptop: intel.com SKU 228338 (4 GB, 64-bit, 14 Gbps, 112 GB/s, 25-35 W, Q1'22). March 2022 = launch announcement (not re-checked).
- arc-a370m-laptop: intel.com SKU 228342 (4 GB, 64-bit, 14 Gbps, 112 GB/s, 35-50 W, Q1'22).
- arc-a530m-laptop: intel.com SKU 232776 (4-8 GB, 128-bit, 224 GB/s, 65-95 W, Q3'23). Memory speed not listed by Intel.
- arc-a550m-laptop: intel.com SKU 228343 (8 GB, 128-bit, 14 Gbps, 224 GB/s, 60-80 W, Q2'22).
- arc-a570m-laptop: intel.com SKU 232777 (8 GB, 128-bit, 256 GB/s, 75-95 W, Q3'23). Memory speed not listed.
- arc-a730m-laptop: intel.com SKU 228340 (12 GB, 192-bit, 14 Gbps, 336 GB/s, 80-120 W, Q2'22); also Intel support article 000091109.
- arc-a770m-laptop: intel.com SKU 228341 (16 GB, 256-bit, 16 Gbps, 512 GB/s, 120-150 W, Q2'22). Bench #10879 (FA on 384.74/45.68; FA off 875.92/47.69). No Battlemage laptop dGPU: Notebookcheck/TweakTown reports (only rumours of a B770 mobile part).
- arc-pro-a40: intel.com SKU 230317 (6 GB, 96-bit, 16 Gbps, 192 GB/s, 50 W, Q3'22). "No power connector" from Intel quick-start guide text in search results. Aug 2022 = SIGGRAPH announcement (not re-checked).
- arc-pro-a50: intel.com SKU 230316 (6 GB, 96-bit, 16 Gbps, 192 GB/s, 75 W, Q3'22).
- arc-pro-a60: intel.com SKU 235979 (12 GB, 192-bit, 16 Gbps, 384 GB/s, 130 W, Q2'23, expected discontinuance July 2026); newsroom.intel.com A60/A60M announcement.
- arc-pro-a30m-laptop: intel.com SKU 216962 (4 GB, 64-bit, 14 Gbps, 112 GB/s, 35-50 W, Q3'22).
- arc-pro-a60m-laptop: intel.com SKU 232778 (8 GB, 128-bit, 16 Gbps, 256 GB/s, 75-95 W, Q2'23).
- intel-max-1100: intel.com SKU 232876 (48 GB HBM2e, 1024-bit, 1228.8 GB/s, 300 W, Q2'23, expected discontinuance Jan 2026); Max 1100 datasheet 817799 (3 of 4 stacks active); product brief PDF (300 W double-wide AIC, Xe Link bridges). FP16 TFLOPS not found: null.
- intel-max-1550: intel.com SKU 232873 (128 GB HBM2e, 3276.8 GB/s, 600 W, Q1'23, expected discontinuance Jan 2026); product brief (600 W OAM, Xe Link 16 ports). Phoronix: XPU Manager 1.3.3 deprecated Max/Flex (Oct 2025).
- intel-flex-170: intel.com SKU 230019 (16 GB GDDR6, 256-bit, 576 GB/s, 150 W, Q3'22); Lenovo Press LP1829 (passive, withdrawn). "Media/VDI" focus from Intel Flex product brief title; not re-read.
- intel-gaudi-3: Intel Gaudi 3 PCIe product brief cdrdv2-public.intel.com/817488 (128 GB HBM2e, 3.7 TB/s, 600 W, FP8 E4M3/E5M2); HL-325L OAM brief 817487 (up to 900 W); white paper 817486 (about 1.8 PFLOPS FP8/BF16; tables give 1678 or 1835, so fp16_tflops_dense left null). Successors from Tom's Hardware roadmap articles.
- intel-iris-xe-igpu: intel.com i7-1165G7 (SKU 208662: DDR4-3200, LPDDR4x-4267, 64 GB, 12-28 W, dual-channel needed for Iris Xe), i7-1260P (SKU 226254: DDR5-4800, LPDDR5-5200), i7-1360P (SKU 232155: DDR5-5200, LPDDR5/x-6400, 96 GB). Bandwidths computed (128-bit). "About half of RAM" is the usual Windows shared-memory rule, not an Intel spec line.
- intel-core-ultra-s1-igpu: intel.com Core Ultra 7 155H (SKU 236847: LPDDR5/X-7467, DDR5-5600, 96 GB, 28/115 W, Arc needs 16 GB dual-channel); Intel product brief (64 GB LP5 / 96 GB DDR5). Shared GPU Memory Override (default 57%, up to 87%, driver 32.0.101.6987): Tom's Hardware / KitGuru; Intel's own KB says Series 2 or later, release notes say Series 1 and 2 (conflict).
- intel-core-ultra-200v-igpu: intel.com Core Ultra 7 258V (SKU 240957: LPDDR5X-8533, 32 GB, Arc 140V 8 Xe-cores, 47 TOPS NPU, 17/37 W, Q3'24). Bandwidth computed. Arc 130V on Core Ultra 5 from Intel comparison chart (not re-read).
- intel-core-ultra-200h-igpu: intel.com Core Ultra 9 285H (SKU 241747: LPDDR5/X-8400, DDR5-6400, 128 GB, Arc 140T 8 Xe-cores, 45/115 W, Q1'25). Bandwidth computed.
- intel-core-ultra-s3-igpu: Intel Core Ultra Series 3 Quick Reference Guide cdrdv2-public.intel.com/871380 (B390 12 Xe-cores, LP5/X-9600, 96 GB; 338H B370 10 Xe-cores LP5/X-8533; 4-core SKUs DDR5-7200 / 128 GB; 25 W base, 80 W turbo); intel.com Core Ultra X9 388H (SKU 245526). Bandwidth computed. Scoreboard "Intel Core Ultra 300 Series" row (1380.07/24.45 FA off) not mapped to a specific SKU, so no bench key.
- intel-desktop-igpu: intel.com i7-14700K (SKU 236783: DDR5-5600, DDR4-3200, 192 GB, 89.6 GB/s, UHD 770 32 EUs); Core Ultra 9 285K (SKU 241060: DDR5-6400, 256 GB on ark / 192 GB in brief; 4 Xe-cores per launch deck); llama.cpp docs/backend/SYCL.md (under 80 EUs too slow). "2021-11" = UHD 770 with 12th Gen (not re-checked).
- amd-radeon-680m: amd.com Ryzen 7 6800U (via search snippets: DDR5-4800, LPDDR5-6400, 64 GB, 12 CUs, 15-28 W, launch 04/2022). ROCm 10.2 compatibility matrix (rocm.docs.amd.com, 2026-08-26): gfx1035 not listed. Release month left as "2022".
- amd-radeon-780m: amd.com Ryzen 7 7840U (search snippets: DDR5-5600, LPDDR5x-7500, 256 GB, 12 CUs) and Ryzen 7 8700G (DDR5-5200, 65 W). ROCm 10.2 matrix: gfx1103 listed for Ryzen 100/200-series only. HSA_OVERRIDE workaround: Framework community. amd.com fetch timed out; amd.com data come from search snippets. Release month not verified ("2023").
- amd-radeon-890m: amd.com Ryzen AI 9 HX 370 (LPDDR5x-8000, DDR5-5600, 256 GB, 16 CUs; cTDP 15-54 W from AMD launch material), Ryzen AI 9 HX 470 (LPDDR5x-8533, launch 2026-01-05). ROCm 10.2 matrix (gfx1150). VGM up to 75%: Neowin/KitGuru (Sept 2024). 880M = 12 CUs from AMD (Ryzen AI 9 365), not separately re-read. "Typical LPDDR5X-7500" is a judgement.
- amd-radeon-860m: amd.com Ryzen AI 7 350 (LPDDR5x-8000, DDR5-5600, 256 GB, 8 CUs, 15-54 W); ROCm 10.2 matrix (gfx1152). 840M = 4 CUs not re-checked. Release month not verified ("2025").
- snapdragon-x-elite: Qualcomm X Elite product brief 87-71417-1 Rev F (LPDDR5x-8448, 135 GB/s, 64 GB); qualcomm.com Snapdragon X Plus page (135 GB/s, Adreno X1-85/X1-45). llama.cpp docs/backend/OPENCL.md (Adreno X85 verified); Qualcomm developer blog (Nov 2024); Vulkan report from llama.cpp discussion #8336 (Dec 2024). Typical RAM sizes are a judgement.
- snapdragon-x2-elite: Qualcomm Snapdragon X2 Elite product brief PDF (X2E-78/80/84/88/90: LPDDR5x-9523, 128-bit, 152 GB/s, 128 GB; Vulkan 1.4, OpenCL 3.0; 80-85 TOPS). Ship date "first half of 2026" per Qualcomm via news; month not verified.
- snapdragon-x2-elite-extreme: same brief (X2E-94/96: 192-bit, 228 GB/s, 128+ GB max, X2E-96 configured 48 GB). memory_options_gb left null (not verified).

## Appendix C. Rules used for the "llama.cpp / vLLM / SGLang" line

All checked 2026-11-19. Versions at that date: llama.cpp v1.0.0 (2026-11-13; nightly b12540 2026-11-19), vLLM 0.34.0 (PyPI, 2026-11-16), SGLang 0.5.23 (PyPI, 2026-10-30). "Quote" means the words appear on the page; everything else is a plain summary.

### CUDA itself
- CUDA 13.0 removed offline compilation and library support for Maxwell, Pascal and Volta (compute capability below 7.5); quote: "CUDA 13.0 supports all NVIDIA architectures from Turing through Grace Blackwell." https://docs.nvidia.com/cuda/archive/13.0.0/cuda-toolkit-release-notes/index.html (page updated 2025-08-08)
- Programs built with CUDA 12.x keep running on those GPUs; driver branch 580 is "the final branch that supports GPUs before CC 7.5" (LTS until about mid-2028). https://developer.nvidia.com/blog/navigating-gpu-architecture-support-a-guide-for-nvidia-cuda-developers (2025-08-04)

### vLLM
- NVIDIA minimum: quote "compute capability 7.5 or higher (e.g., T4, RTX20xx, A100, L4, H100, B200, etc.)". So Turing and newer = yes; Maxwell, Pascal, Volta (M40, P4, P40, P100, GTX 10xx, V100, Titan V) = no. https://docs.vllm.ai/en/latest/getting_started/installation/gpu/ (page dated 2026-10-08)
- NVIDIA Blackwell: quote "NVIDIA Blackwell GPUs (B200, GB200) require a minimum of CUDA 12.8"; default wheels are built with CUDA 12.9, with CUDA 12.8 and 13.2 variants; for (G)B300 the page recommends CUDA 13. Same URL.
- AMD ROCm, the complete GPU list: quote "MI200s (gfx90a), MI300 (gfx942), MI350 (gfx950), Radeon RX 7900 series (gfx1100/1101), Radeon RX 9000 series (gfx1200/1201), Ryzen AI MAX / AI 300 Series (gfx1151/1150)". ROCm 6.3 or newer; MI350 needs ROCm 7.0+; Ryzen AI MAX / AI 300 needs ROCm 7.0.2+; current wheels and images use ROCm 10.0. Same URL.
  - Not on the list (so "vLLM: no" unless a later check says otherwise): MI50/MI60/Radeon VII (gfx906), MI100 (gfx908), RX 7600 / W7600 / W7500 (gfx1102), all RDNA1/RDNA2 Radeons, MI450-class (gfx1250).
  - gfx-to-product mapping (from AMD/LLVM processor lists, not from the vLLM page): gfx90a = MI210/MI250/MI250X; gfx942 = MI300X/MI300A/MI325X; gfx950 = MI350X/MI355X; gfx1100 = RX 7900 XTX/XT/GRE, Radeon PRO W7900/W7800; gfx1101 = RX 7800 XT/7700 XT, PRO W7700; gfx1200 = RX 9060 XT/9060; gfx1201 = RX 9070/9070 XT/9070 GRE, Radeon AI PRO R9700; gfx1151 = Ryzen AI Max (Strix Halo); gfx1150 = Ryzen AI 300 (Strix Point). Note: the page calls the gfx1100/1101 group "Radeon RX 7900 series", but gfx1101 is the RX 7800 XT / 7700 XT chip, so those cards are covered by the listed target.- Intel XPU (in-tree): quote "Supported Hardware: Intel Data Center GPU, Intel ARC GPU". The page names no series, so Arc A/B-series, Arc Pro, Data Center GPU Max/Flex = yes by its wording; integrated graphics are not named = partial/unverified. Same URL.
- Intel Gaudi: separate plugin `vllm-gaudi` (v0.30.0, 2026-10, built on vLLM 0.30.0); requires "Intel Gaudi 2 or 3 AI accelerator" and Intel Gaudi software 1.24.2 or later. https://github.com/vllm-project/vllm-gaudi , https://docs.vllm.ai/projects/gaudi/en/latest/getting_started/quickstart/quickstart.html -> "vLLM: plugin".
- Huawei Ascend: separate plugin `vllm-ascend` (v0.30.0, 2026-10); quote "Hardware: Atlas 800I A2 series, Atlas 800I A3 series, Atlas 300I Duo, 950PR&950DT Products"; CANN 9.2.1, Python 3.12, Linux. https://github.com/vllm-project/vllm-ascend -> "vLLM: plugin".
- Google TPU: separate plugin `tpu-inference` (being renamed vLLM JAX / `vllm-jax`; PyTorch-native TPU serving moved to `vllm-torchtpu`); quote "Recommended: v7x, v5e, v6e" and "Experimental: v3, v4, v5p". https://github.com/vllm-project/tpu-inference -> "vLLM: plugin".
- Other platforms listed on vllm.ai as separate repos: AWS Neuron (vllm-neuron), IBM Spyre (vllm-spyre), Apple Silicon (vllm-metal), Baidu Kunlun XPU, Cambricon MLU. https://vllm.ai/

### SGLang
- NVIDIA minimum: quote "SGLang requires CUDA 13." and "SGLang 0.5.19 is the last release with a CUDA 12 lane"; FlashInfer quote "It only supports sm75 and above". So compute capability 7.5+ (Turing and newer) = yes; Maxwell/Pascal/Volta = no. https://docs.sglang.io/docs/get-started/install.md
- NVIDIA Jetson: own page for Jetson AGX Orin (JetPack 6.1+, built through jetson-containers); treat as partial, since it is a container build and other Jetsons are not named. https://docs.sglang.io/docs/hardware-platforms/nvidia_jetson.md
- AMD Instinct: official ROCm Docker builds target gfx942 (MI300X/MI325X, tag "mi30x"), gfx950 (MI350X/MI355X, "mi35x") and gfx1250 (MI450-class, "mi45x"); MI250 is mentioned only for one FP4 path (petit_nvfp4). https://docs.sglang.io/docs/hardware-platforms/amd_gpu.md , https://github.com/sgl-project/sglang/blob/main/docker/rocm.Dockerfile -> MI300/MI325/MI355 = yes; MI250/MI210 = partial; MI100 and older = no (not documented).
- AMD Radeon / APU: a separate image covers Ryzen AI Max (Strix Halo, gfx1151) and Strix Point (gfx1150) iGPUs; discrete Radeon RX / PRO / AI PRO cards are not documented -> Strix Halo/Point = partial; discrete Radeon = no (unverified). Same amd_gpu.md URL.
- Intel GPU (XPU): quote "Intel® Arc™ Pro B-Series Graphics" and "Intel® Arc™ B-Series Graphics"; "Currently SGLang XPU only supports installation from source" -> Arc B / Arc Pro B = partial (source build); Arc A-series, Data Center Max, iGPUs = no (not documented). https://docs.sglang.io/docs/hardware-platforms/xpu.md
- Intel Xeon CPU: own "CPU Servers" page. https://docs.sglang.io/docs/hardware-platforms/cpu_server.md
- Huawei Ascend: quickstart supported devices "A3 Series Products"; the install guide also covers "950PR/DT Series" (CANN 9.1.0, Python 3.12); A2 appears only in kernel-package notes -> A3 and 950 = yes; A2 = partial. https://docs.sglang.io/docs/hardware-platforms/ascend-npus/getting-started/quick_start.md , .../installation.md
- Google TPU: SGL-JAX lists TPU v6e and TPU v7; SGLang-TorchTPU targets TPU7x (Ironwood). https://docs.sglang.io/docs/hardware-platforms/tpu.md
- Also documented: Moore Threads MUSA, Cambricon MLU, Apple Metal, T-HEAD SAIL, and a plugin system. https://docs.sglang.io/llms.txt

### llama.cpp
- CUDA minimum, current builds: the default arch list in ggml/src/ggml-cuda/CMakeLists.txt adds 50-virtual, 61-virtual, 70-virtual only when the CUDA toolkit is older than 13, then 75-virtual, 80-virtual, 86-real, 89-real, 90-virtual (11.8+), 120a-real (12.8+), 103-real and 121a-real (12.9+); the release workflow uses this default list. https://github.com/ggml-org/llama.cpp/blob/master/ggml/src/ggml-cuda/CMakeLists.txt , https://github.com/ggml-org/llama.cpp/blob/master/.github/workflows/release.yml
- So: CUDA 12 release builds (Windows cuda-12.4 x64, Ubuntu cuda-12.8 x64) run on compute capability 5.0 and newer (Maxwell onward, via PTX JIT for 5.x/6.x/7.0); CUDA 13.5 builds (Windows x64/arm64, Ubuntu x64/arm64) need compute 7.5+ (Turing onward). Release asset names from https://api.github.com/repos/ggml-org/llama.cpp/releases (b12540, 2026-11-19).
- HIP (AMD): release builds use ROCm 10.0. Windows targets: gfx1010-1012, gfx1030-1036, gfx1100-1103, gfx1150-1153, gfx1200/1201 (Radeon RDNA1-4 and RDNA3.5 iGPUs). Ubuntu targets: the same Radeon list (no gfx1153) plus gfx908 (MI100), gfx90a (MI200), gfx942 (MI300/MI325), gfx950 (MI350/MI355). Others (e.g. gfx906 MI50/MI60/Radeon VII, gfx1250) need a source build or Vulkan; build.md suggests HSA_OVERRIDE_GFX_VERSION on Linux for unlisted RDNA2/RDNA3 chips (not on Windows). release.yml URL above; https://github.com/ggml-org/llama.cpp/blob/master/docs/build.md
- SYCL (Intel): quote "Intel Data Center Max Series", "Intel Flex Series, Arc Series", "Intel Built-in Arc GPU", "Intel iGPU in Core CPU (11th Generation Core CPU and newer…)"; verified Max 1550/1100, Flex 170, Arc A770/A750/A730M, Arc B580, built-in Arc in Meteor Lake/Arrow Lake/Lunar Lake. SYCL support for NVIDIA/AMD GPUs was removed. Release builds: win-sycl-x64, ubuntu-sycl-fp16/fp32-x64. https://github.com/ggml-org/llama.cpp/blob/master/docs/backend/SYCL.md
- Vulkan: cross-vendor backend (NVIDIA, AMD, Intel, Qualcomm; macOS via MoltenVK or KosmicKrisp); release builds win-vulkan x64/arm64 and ubuntu-vulkan x64/arm64. It is the fallback for GPUs that the CUDA, HIP or SYCL builds do not cover. build.md URL above.
- CANN (Huawei Ascend): source build only (no release binary). Verified "Support": Atlas 300I A2 (910B) and Atlas 300I Duo (310P); Atlas A2/A3 Train/Infer (910B/910C) and Atlas Train (910) are listed without a verified status. On 310P only FP16/F32 models work (no quantized matmul); 910B runs FP16, BF16, Q4_0, Q8_0. https://github.com/ggml-org/llama.cpp/blob/master/docs/backend/CANN.md -> 910B = yes; 310P = partial; 910C = partial (unverified).
- MUSA (Moore Threads): source build; default targets MTT S4000 (compute 2.2) and MTT S5000 (3.1); MTT S70/S80/S3000 (2.1) are deprecated and must be enabled explicitly. build.md URL above.
- OpenCL (Qualcomm Adreno): verified Adreno 750 (8 Gen 3), 810 (7s Gen 3), 830 (8 Elite), 840 (8 Elite Gen 5), X1-85 (X Elite), X2-90 (X2 Elite); A6x GPUs in phones "likely not supported"; can also run on some Intel GPUs, slowly. Release build: win-opencl-adreno-arm64. https://github.com/ggml-org/llama.cpp/blob/master/docs/backend/OPENCL.md
- Hexagon (Qualcomm NPU): release builds android-arm64-snapdragon and linux-arm64-snapdragon; details in docs/backend/snapdragon/README.md (not read).
- OpenVINO (Intel CPU/GPU/NPU): release builds ubuntu and win x64 with OpenVINO 2026.4.1. build.md URL above.
- Others: Metal (on by default on macOS), zDNN (IBM Z), WebGPU, CPU builds for x64/arm64/s390x. build.md URL above.

### Suggested mapping to the line "llama.cpp: … vLLM: … SGLang: …"
- NVIDIA compute 7.5+ (Turing, Ampere, Ada, Hopper, Blackwell): llama.cpp: yes. vLLM: yes. SGLang: yes.
- NVIDIA compute 5.0-7.2 (Maxwell, Pascal, Volta): llama.cpp: yes (CUDA 12 builds or Vulkan). vLLM: no. SGLang: no.
- NVIDIA Jetson Orin (compute 8.7): llama.cpp: yes. vLLM: unverified (not on the vLLM GPU page). SGLang: partial (AGX Orin page).
- AMD MI300X/MI325X/MI350X/MI355X: llama.cpp: yes. vLLM: yes. SGLang: yes.
- AMD MI210/MI250/MI250X: llama.cpp: yes. vLLM: yes. SGLang: partial.
- AMD MI100: llama.cpp: yes (Linux ROCm build). vLLM: no. SGLang: no.
- AMD MI50/MI60/Radeon VII: llama.cpp: partial (Vulkan or own HIP build). vLLM: no. SGLang: no.
- Radeon RX 7900 / 7800 / 7700, PRO W7900/W7800/W7700, RX 9060/9070, AI PRO R9700: llama.cpp: yes. vLLM: yes. SGLang: no.
- Radeon RX 7600 / W7600 / W7500, RDNA2, RDNA1: llama.cpp: yes. vLLM: no. SGLang: no.
- Ryzen AI Max (Strix Halo) / Ryzen AI 300 (Strix Point): llama.cpp: yes. vLLM: yes. SGLang: partial.
- Intel Arc B / Arc Pro B: llama.cpp: yes. vLLM: yes. SGLang: partial.
- Intel Arc A / Arc Pro A / Data Center Max / Flex: llama.cpp: yes. vLLM: yes. SGLang: no.
- Intel iGPU (Core Ultra, Iris Xe): llama.cpp: yes (SYCL or Vulkan). vLLM: partial (not named). SGLang: no.
- Intel Gaudi 2/3: llama.cpp: no. vLLM: plugin. SGLang: no (not documented).
- Huawei Ascend 910B (A2) / 910C (A3) / 950: llama.cpp: yes or partial (CANN, source build). vLLM: plugin. SGLang: yes for A3/950, partial for A2.
- Qualcomm Snapdragon X / 8 Elite (Adreno): llama.cpp: yes (OpenCL, Vulkan, CPU). vLLM: no. SGLang: no.
- Apple silicon: llama.cpp: yes (Metal). vLLM: plugin (vllm-metal). SGLang: partial (Apple Metal page exists; not read in detail).

## Appendix D. Sources for runtimes.json

Checked 2026-11-19. Release versions and dates come from each repo's GitHub releases Atom feed (`https://github.com/<owner>/<repo>/releases.atom`) and the GitHub REST API (`archived`, `license`, `pushed_at`), unless a line says otherwise. "Unverified" lists fields filled from older knowledge or inference and not re-checked this time. `multi_user_throughput` and `install_difficulty` are editorial judgements for every entry.

- **llama-cpp**: https://github.com/ggml-org/llama.cpp (README, releases), https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md, https://huggingface.co/blog/ggml-org/llama-cpp-v1 (v1.0.0, 2026-11-13), https://github.com/ggml-org/llama.cpp/discussions/19759 (ggml.ai joins HF, 2026-02-20). Unverified: none.
- **llama-app**: https://llama.app, https://github.com/ggml-org/Llama-macOS, https://github.com/ggml-org/Llama-Windows (README v0.14.1, LICENSE). Unverified: which GPU backends the Windows app downloads; `hardware` is inferred from llama.cpp.
- **ollama**: https://github.com/ollama/ollama (README, releases), https://ollama.com/blog/multimodal-models, https://ollama.com/blog/mlx, https://ollama.com/blog/new-app. Unverified: Intel GPU support (inferred from Vulkan mentions in release notes). The claim that v0.40 makes MLX the default on Apple silicon comes from a third-party post only (https://jacar.es/en/ollama-0-40-mlx-default-apple-silicon/). Two sources disagreed on whether v0.40.17 is final: the Atom feed lists v0.40.17 on 2026-11-16 after v0.40.17-rc0 on 2026-11-10, but a fetch of the releases page called it a pre-release.
- **lm-studio**: https://lmstudio.ai/download (0.4.28), https://lmstudio.ai/docs/app/system-requirements, https://lmstudio.ai/blog/free-for-work, https://lmstudio.ai/app-terms (updated 2026-08-23), https://lmstudio.ai/blog/introducing-lm-studio-bionic, https://lmstudio.ai/changelog (Bionic 1.2.1). Unverified: release date of 0.4.28; Intel GPU support; whether it has an Anthropic-compatible endpoint.
- **jan**: https://github.com/janhq/jan. The GitHub API reports the licence as NOASSERTION, and the README says Apache 2.0. Unverified: none.
- **llamafile**: https://github.com/mozilla-ai/llamafile, the v0.10.5 and v0.10.6 release notes (CUDA graphs, HIP graphs, Vulkan backend docs), https://docs.mozilla.ai/llamafile/. Unverified: Apple Metal in 0.10.x; that the bundled server's web UI and OpenAI API work as in 0.9.x.
- **koboldcpp**: https://github.com/LostRuins/koboldcpp. Unverified: none.
- **textgen**: https://github.com/oobabooga/textgen (the old text-generation-webui URL redirects here). Unverified: Intel GPU support (inferred from the Vulkan portable builds).
- **open-webui**: https://github.com/open-webui/open-webui, https://docs.openwebui.com/license/, https://docs.openwebui.com/reference/api-endpoints (`/api/chat/completions`). Unverified: none. `hardware` means "runs anywhere" because it does no inference.
- **mlx-lm**: https://github.com/ml-explore/mlx-lm, https://github.com/ml-explore/mlx-lm/blob/main/mlx_lm/SERVER.md, https://pypi.org/project/mlx-lm/. Unverified: MLX's CUDA backend on Linux (left out of the entry).
- **vllm**: https://docs.vllm.ai/en/latest/configuration/engine_args.html, https://docs.vllm.ai/en/latest/getting_started/installation/index.html, https://docs.vllm.ai/en/latest/features/quantization/gguf/, https://pypi.org/project/vllm/. Unverified: Windows/WSL2 (the docs page does not mention Windows).
- **sglang**: https://docs.sglang.io/, https://docs.sglang.io/advanced_features/server_arguments.html, https://pypi.org/project/sglang/. Unverified: OS support beyond Linux.
- **tensorrt-llm**: https://github.com/NVIDIA/TensorRT-LLM, https://nvidia.github.io/TensorRT-LLM/commands/trtllm-serve/trtllm-serve.html (OpenAI-compatible; PyTorch backend only), https://nvidia.github.io/TensorRT-LLM/0.20.0rc0/release-notes.html (Windows deprecated since v0.18), https://pypi.org/project/tensorrt-llm/ (1.2.1). Unverified: GPTQ support.
- **tgi**: https://github.com/huggingface/text-generation-inference (maintenance notice; archived 2026-03-21). Unverified: none.
- **lmdeploy**: https://github.com/InternLM/lmdeploy. Unverified: `openai_compatible_api` (the README fetched does not say "OpenAI-compatible"; the value comes from older knowledge of `lmdeploy serve api_server`); quality of AMD ROCm support.
- **nvidia-dynamo**: https://github.com/ai-dynamo/dynamo. The GitHub API reports the licence as NOASSERTION, and the README badge says Apache 2.0. Unverified: OS (Linux is implied by the docs, not stated).
- **nvidia-nim**: https://developer.nvidia.com/blog/access-to-nvidia-nim-now-available-free-to-developer-program-members/ (2024-07-29), https://docs.api.nvidia.com/nim/docs/product (FAQ: production needs AI Enterprise), https://docs.nvidia.com/nim/large-language-models/3.0.0/about-nim-llm/release-notes.html (version index only). Unverified: release date of 3.0.0; `model_formats`; Windows via WSL2.
- **localai**: https://github.com/mudler/LocalAI, https://localai.io. Unverified: none.
- **docker-model-runner**: https://docs.docker.com/ai/model-runner/, https://github.com/docker/model-runner, https://docs.docker.com/subscription/desktop-license/. Unverified: none.
- **exllamav3-tabbyapi**: https://github.com/turboderp-org/exllamav3, https://github.com/theroyallab/tabbyAPI, https://pypi.org/project/exllamav3/. Unverified: AMD ROCm (TabbyAPI documents a ROCm Docker image, but ExLlamaV3's README covers only CUDA, so AMD is left out).
- **llama-swap**: https://github.com/mostlygeek/llama-swap. Unverified: none.
- **lemonade**: https://github.com/lemonade-sdk/lemonade. Unverified: none.
- **openvino-genai**: https://github.com/openvinotoolkit/openvino.genai, https://pypi.org/project/openvino-genai/. Unverified: macOS support; ONNX input.
- **openvino-model-server**: https://github.com/openvinotoolkit/model_server. Unverified: how complete its GGUF support is (the README only lists it).
- **ipex-llm**: https://github.com/intel/ipex-llm (archived 2026-01-28, no-support notice, security flag). Unverified: none. Replacements are my suggestion, based on vLLM's Intel XPU support and llama.cpp's SYCL/Vulkan builds.
- **onnxruntime-genai**: https://onnxruntime.ai/docs/genai/, https://pypi.org/project/onnxruntime-genai/ (0.20.0), https://www.nuget.org/packages/Microsoft.ML.OnnxRuntimeGenAI.DirectML/. The GitHub repo (and microsoft/onnxruntime itself) returned HTTP 404 on 2026-11-19, so its repo state is unverified. Unverified: the per-vendor `hardware` list; `platforms`.
- **foundry-local**: https://learn.microsoft.com/en-us/azure/foundry-local/what-is-foundry-local, https://devblogs.microsoft.com/foundry/foundry-local-ga/ (GA 2026-04-09), https://pypi.org/project/foundry-local-sdk/ (2.5.0). The GitHub repo returned 404. Unverified: the per-vendor `hardware` list (the docs only say "GPUs and NPUs").
- **comfyui**: https://github.com/Comfy-Org/ComfyUI. Unverified: GGUF (it needs the community ComfyUI-GGUF node, which the README does not mention).
- **diffusers**: https://huggingface.co/docs/diffusers/main/en/index, https://pypi.org/project/diffusers/. Unverified: the `hardware` list (general PyTorch backends); GGUF loading.
- **stable-diffusion-cpp**: https://github.com/leejet/stable-diffusion.cpp. Unverified: ROCm (not in the README; AMD is covered through Vulkan); an OpenAI-style images API.
- **invokeai**: https://github.com/invoke-ai/InvokeAI, https://news.adobe.com/news/2025/10/adobe-max-2025-firefly-foundry (team joined Adobe), https://pypi.org/project/invokeai/. Unverified: `hardware` (NVIDIA, AMD on Linux, Apple from older docs); GGUF.
- **forge-neo**: https://github.com/Haoming02/sd-webui-forge-classic (Neo branch), https://github.com/lllyasviel/stable-diffusion-webui-forge (last push 2025-07-31), https://github.com/AUTOMATIC1111/stable-diffusion-webui (last release 1.10.1 on 2025-02-09; last push 2026-03-02). Unverified: macOS usability.
- **fooocus**: https://github.com/lllyasviel/Fooocus ("Limited Long-Term Support with Bug Fixes Only"). Unverified: AMD and Apple support (not re-checked).
- **sdnext**: https://github.com/vladmandic/sdnext. Unverified: none.
- **wangp**: https://github.com/deepbeepmeep/WanGP, https://raw.githubusercontent.com/deepbeepmeep/WanGP/main/LICENSE.txt. Unverified: the main app version number (GitHub releases only cover "WanGP Manager").
- **whisper-cpp**: https://github.com/ggml-org/whisper.cpp. Unverified: none.
- **faster-whisper**: https://github.com/SYSTRAN/faster-whisper, https://pypi.org/project/faster-whisper/. Unverified: none.
- **whisperx**: https://github.com/m-bain/whisperX, https://pypi.org/project/whisperx/. Unverified: `platforms` and `hardware`; the Hugging Face token needed for pyannote (from older knowledge).
- **speaches**: https://github.com/speaches-ai/speaches. Unverified: GUI (set to false); `platforms` other than Linux/Docker.
- **kokoro-fastapi**: https://github.com/remsky/Kokoro-FastAPI, https://huggingface.co/hexgrad/Kokoro-82M (Apache-2.0 tag). Unverified: none.
- **coqui-tts**: https://github.com/idiap/coqui-ai-TTS, https://pypi.org/project/coqui-tts/, https://huggingface.co/coqui/XTTS-v2 (licence: coqui-public-model-license). Unverified: `hardware`; the 2024 shutdown of the coqui-ai company (from older knowledge).
- **chatterbox**: https://github.com/resemble-ai/chatterbox ("As of August 2026, Chatterbox is retired research"), https://pypi.org/project/chatterbox-tts/. Unverified: none.
- **piper**: https://github.com/rhasspy/piper (archived), https://github.com/OHF-Voice/piper1-gpl, https://pypi.org/project/piper-tts/. Unverified: Windows and macOS wheels; the reason for the move and licence change.

**Dropped:**
- **Aphrodite Engine**: https://github.com/aphrodite-engine/aphrodite-engine now redirects to https://github.com/dphnAI/sonar, a vLLM-based AGPL-3.0 server. It is niche and I found no rename announcement.
- **AUTOMATIC1111 WebUI** and **original Forge**: little or no development since 2025. They are mentioned in the forge-neo entry.
- **TabbyAPI**: merged into the ExLlamaV3 entry.
