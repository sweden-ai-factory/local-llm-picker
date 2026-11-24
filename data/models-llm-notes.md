# models-llm.json: sources, method and caveats

Checked on 2026-11-19. 52 entries: 48 chat/vision models and 4 embedding/reranker models.

## How the data was checked

- **Parameters, layers, KV heads, head dims, context.** Read from each repo's `config.json` and the Hugging Face API safetensors count (`https://huggingface.co/api/models/<repo>`), then cross-checked against the model card. Gated repos (Apertus 1.5, Muse Spark Open) were checked through the model card, through an ungated mirror (unsloth) or through the previous version's config (see the uncertain-fields table).
- **Licences.** Read from the repo's `LICENSE` file, not the HF licence tag. Several "MIT-like" licences now carry revenue or model-as-a-service (MaaS) clauses (see the licence table).
- **Ollama tags.** Each tag was fetched on ollama.com and returned HTTP 200. Tags marked "cloud" only run on Ollama's servers, so those entries have `ollama_tag: null`.
- **GGUF repos.** Each repo exists and contains `.gguf` files (checked through the HF API).
- **Ranking context.** I used the Artificial Analysis Intelligence Index v5.0.1 (open-weights page), LMArena text (arena.ai), benchmark tables in the model cards, and cross-model tables in competitors' cards (Inkling 2 Small, MiniMax M3.1 Flash, DeepSeek V4.1, Muse Glimmer). Vendor numbers are marked as vendor numbers in `good_for` where it matters.

## Field conventions the builder should know

- **`params_total_b`** is the parameter count of the released checkpoint (HF safetensors count, rounded). It includes vision/audio encoders, MTP heads, per-layer embeddings (Gemma E-models) and n-gram/Engram tables (Qwen3.8 Flash-Next, DeepSeek V4.1). That makes it a cautious figure for memory. Model-card headline numbers are often smaller; `notes` gives them. For checkpoints where HF miscounts packed FP4 (MiniMax M3.1 Flash: HF shows 220B; Inkling 2 Small) or shows no count (Mistral Large 4), I used the card or Ollama figure.
- **Lookup tables that can live on SSD.** These are Qwen3.8 Flash-Next (51B n-gram), DeepSeek V4.1 Flash (~196B Engram) and the Gemma 4 E2B/E4B per-layer embeddings. llama.cpp can keep the first two on SSD through mmap with `--ple` (build b12233 or newer, PR #31185). If the picker wants to model this, subtract them from resident memory. Values: Flash-Next 51B; DeepSeek V4.1 about 196-211B (card says 196B; 763-552 = 211 incl. vision/MTP); Gemma E2B about 2.8B and E4B about 3.5B.
- **`params_active_b`.** For MoE models this is the active count per token from the card. For Gemma 4 E2B/E4B it is Google's "effective" count (2.3B / 4.5B). For EmbeddingGemma 2 it is the 270M text-only path.
- **Natively low-precision checkpoints.** For these the original files are already about 1 byte/param (FP8) or about 0.5 byte/param (FP4/INT4), and GGUF quants below that cost quality without saving much:
  - FP8: Ministral 3, Devstral Small 2, Mistral Small 4, Mistral Medium 3.5, GLM-5.3, GLM-5.3-Flash, Ling 3.1.
  - FP4/INT4: gpt-oss (MXFP4), Kimi K2.7 Code (INT4 QAT), Kimi K3.1 Pro (MXFP4 QAT), MiniMax M3.1 Flash (NVFP4 QAT experts), Inkling 2 Small (trained in NVFP4), DeepSeek V4.1 (FP4 experts), MiMo V2.6 (FP4 experts).
  - Nemotron 3.5 Bolt "24GB" is natively 2-bit (IQ2 QAT).
  - Gemma 4 has official QAT Q4_0 GGUFs.
- **`kv_bytes_per_token_fp16`.** This is how much the KV cache grows for each extra token of context at FP16 (K and V both counted). It covers only layers whose cache grows with context:
  - Sliding-window layers add a fixed amount once the context is longer than the window. That amount is in `arch_detail.kv_note`, for example Gemma 4 31B about 840 MB and Olmo 3 7B about 1.6 GB.
  - Linear-attention, Mamba and conv layers have a fixed-size state and are not counted.
  - Indexer keys of sparse-attention models (DSA/MSA) are small and not counted; `kv_note` says so.
  - Embedding models have `null` because they keep no cache.
  - Always use this field rather than recomputing it from `arch_detail`. For MLA models `kv_heads`/`head_dim` are `null` because the GQA formula does not apply.
- **`modalities`.** Some models take all four inputs, so I used 4-element arrays such as `["text","image","audio","video"]` (Nemotron 3 Nano Omni, MiMo V2.6 Flash, Muse Spark Open, EmbeddingGemma 2). The brief's example list did not include this combination.
- **`released`.** Year and month of public release. Where only the HF repo creation date was available I used it. Repo creation can be weeks earlier than the announcement: Mistral Large 4's repo dates from 30 Sep but its open weights came out on 29 Oct; Gemma 4's repo dates from early March but the launch was 2 Apr. Where I found the announcement date I used it (Gemma 4, Qwen3.5 small, Mistral Medium 3.5, Mistral Large 4, Muse Spark Open).
- **`thinking`.**
  - `optional`: the chat template can switch thinking off.
  - `always`: only the effort level can be changed (low/medium/high etc.), so expect thinking tokens.
  - `none`: no thinking mode in this checkpoint.
- **`tier`.**
  - `frontier-class`: within about 20% of the best open model on the AA index (score 27 or more).
  - `strong`: capable, not frontier.
  - `efficient`: the usual pick per GB of memory in its size class.
  - `tiny`: 4B or fewer active parameters (Gemma E4B counts as tiny).
- **`good_for` / `weak_at`.** Plain-language lines for beginners, with no benchmark names or scores. The evidence behind each claim is listed in "Evidence behind good_for / weak_at" below. `weak_at` is never null in this file.
- **`quality_index` / `quality_index_source`.** A single 0-100 capability number (Artificial Analysis Intelligence Index v5.0.1, or an estimate on that scale), with `null` for embedding models. See the section "Quality index" below; it also explains why values under about 8 should not be used to rank models against each other.

## KV cache formulas

GQA: `bytes/token = layers_with_growing_cache × 2 (K,V) × kv_heads × head_dim × 2 bytes`.
MLA: `bytes/token = layers_with_own_cache × (kv_lora_rank + rope_dim) × 2 bytes`.

| id | formula | bytes/token |
|---|---|---|
| qwen3.5-2b | 6 full of 24 × 2 × 2 × 256 × 2 | 12,288 |
| qwen3.5-4b, qwen3.5-9b | 8 of 32 × 2 × 4 × 256 × 2 | 32,768 |
| qwen3.8-27b | 16 of 64 × 2 × 4 × 256 × 2 | 65,536 |
| qwen3.6-35b-a3b | 10 of 40 × 2 × 2 × 256 × 2 | 20,480 |
| qwen3.8-flash-next | 12 of 48 × 2 × 2 × 256 × 2 (+~0.8 KB indexer, not counted) | 24,576 |
| qwen3.5-122b-a10b | 12 of 48 × 2 × 2 × 256 × 2 | 24,576 |
| qwen3.5-397b-a17b | 15 of 60 × 2 × 2 × 256 × 2 | 30,720 |
| gemma-4-e2b | 3 own-cache global layers × 2 × 1 × 512 × 2 (7 global, last 20 layers share KV) | 6,144 |
| gemma-4-e4b | 4 own-cache global × 2 × 2 × 512 × 2 (last 18 layers share KV) | 16,384 |
| gemma-4-12b | 8 global × 2 × 1 × 512 × 2 | 16,384 |
| gemma-4-26b-a4b | 5 global × 2 × 2 × 512 × 2 | 20,480 |
| gemma-4-31b | 10 global × 2 × 4 × 512 × 2 | 81,920 |
| lfm3-1.7b | 6 full × 2 × 4 × 128 × 2 | 12,288 |
| granite-4.2-3b | 40 × 2 × 8 × 64 × 2 | 81,920 |
| granite-4.2-8b | 40 × 2 × 8 × 128 × 2 | 163,840 |
| granite-4.2-30b | 64 × 2 × 8 × 128 × 2 | 262,144 |
| ministral-3-3b | 26 × 2 × 8 × 128 × 2 | 106,496 |
| ministral-3-14b, devstral-small-2-24b | 40 × 2 × 8 × 128 × 2 | 163,840 |
| olmo-3-7b | 8 full × 2 × 32 × 128 × 2 | 131,072 |
| olmo-3.1-32b | 16 full × 2 × 8 × 128 × 2 | 65,536 |
| eurollm-9b | 42 × 2 × 8 × 128 × 2 | 172,032 |
| eurollm-22b | 54 × 2 × 8 × 128 × 2 | 221,184 |
| apertus-1.5-8b | 32 × 2 × 8 × 128 × 2 | 131,072 |
| apertus-1.5-70b | 80 × 2 × 8 × 128 × 2 | 327,680 |
| nemotron-3.5-lightning, nemotron-3-nano-omni | 6 attention blocks × 2 × 2 × 128 × 2 | 6,144 |
| nemotron-3.5-super-vl, nemotron-3.5-bolt | 8 attention × 2 × 2 × 128 × 2 | 8,192 |
| nemotron-3-ultra | 12 attention × 2 × 2 × 128 × 2 | 12,288 |
| muse-glimmer-30b | 13 global × 2 × 2 × 128 × 2 | 13,312 |
| muse-spark-open | 16 global × 2 × 16 × 64 × 2 | 65,536 |
| gpt-oss-20b | 12 full × 2 × 8 × 64 × 2 | 24,576 |
| gpt-oss-120b | 18 full × 2 × 8 × 64 × 2 | 36,864 |
| mistral-medium-3.5-128b | 88 × 2 × 8 × 128 × 2 | 360,448 |
| step-3.7-flash | 12 full × 2 × 8 × 128 × 2 | 49,152 |
| minimax-m3.1-flash | 60 × 2 × 4 × 128 × 2 (sparse attention reads blocks; cache is full) | 122,880 |
| inkling-2-small | 8 global × 2 × 8 × 128 × 2 | 32,768 |
| mimo-v2.6-flash | 9 full × 4 heads × (192 K + 128 V) × 2 | 23,040 |
| mistral-small-4-119b | MLA 36 × (256 + 64) × 2 | 23,040 |
| glm-5.3 | MLA 78 × (512 + 64) × 2 | 89,856 |
| glm-5.3-flash | MLA 11 DSA layers × (512 + 0 RoPE) × 2; 34 KDA layers fixed | 11,264 |
| ling-3.1-flash-1019 | MLA 9 × (512 + 64) × 2; 63 KDA layers fixed | 10,368 |
| mistral-large-4 | MLA 63 own-cache layers (of 72) × (512 + 64) × 2 | 72,576 |
| kimi-k2.7-code | MLA 61 × (512 + 64) × 2 | 70,272 |
| kimi-k3.1-pro | MLA 24 DSA layers × (512 + 64) × 2; 69 KDA layers fixed (upper bound; `mla_use_nope` may drop the 64) | 27,648 |
| deepseek-v4.1-flash-1017 | DeepSeek reports 890 B/token with FP4 (E2M1 + E4M3 scale per 16 = 4.5 bits); FP16 equivalent = 890 × 16 / 4.5 | 3,164 |

Gemma 4 global layers set `attention_k_eq_v` (K reused as V). I counted K and V separately, which is what most runtimes allocate. A runtime that stores only one could halve those Gemma numbers. Treat the DeepSeek V4.1 figure as approximate: the llama.cpp PR implementation may not reach the lab's compression.

## Sources and uncertain fields per model

All HF links are `https://huggingface.co/<hf_repo>` (model card, `config.json`, `LICENSE`). Extra sources are listed where used.

| id | extra sources | uncertain or estimated |
|---|---|---|
| qwen3.5-2b / 4b / 9b | Qwen announcement 2 Mar 2026 (via Artificial Analysis article 5 Mar 2026) | none |
| qwen3.8-27b | eweek / datanorth coverage of the Aug 2026 release | release day (5 vs 14 Aug) |
| qwen3.6-35b-a3b | model card | active params given as "3B" (not more precise) |
| qwen3.8-flash-next | unsloth.ai/docs/models/qwen3.8-flash-next | Ollama tag naming (no `latest`); runtime memory with tables on SSD |
| qwen3.5-122b-a10b, qwen3.5-397b-a17b | model cards | none |
| gemma-4-e2b / e4b / 26b-a4b / 31b | Gemma 4 launch coverage (2 Apr 2026); model card property table | KV with k_eq_v (see above) |
| gemma-4-12b | model card (12B Unified added 23 May) | whether llama.cpp/Ollama pass audio input to the encoder-free 12B; not tested |
| lfm3-1.7b | model card, LICENSE | none |
| granite-4.2-3b / 8b / 30b | model cards (release date 25 Aug 2026) | none |
| ministral-3-3b / 14b | model cards | none |
| olmo-3-7b, olmo-3.1-32b | model cards | none |
| eurollm-9b, eurollm-22b | model cards | 9B-2512 repo is dated Jan 2026, so `released` is 2026-01 |
| apertus-1.5-8b / 70b | model card (config gated); arch from swiss-ai/Apertus-8B-Instruct-2509 and -70B-Instruct-2509 | layers/KV heads inferred from 1.0 ("same architecture" per card); llama.cpp support unknown |
| nemotron-3.5-lightning-30b-a3b | model card (release 11 Aug 2026) | context 1M (card) vs 262K (config default) |
| nemotron-3-nano-omni-30b-a3b | model card; nvidia.com NVIDIA Open Model Agreement | audio/video support in llama.cpp not verified |
| nemotron-3.5-super-vl / bolt-74b | model cards | Bolt 2-bit quality not independently measured |
| nemotron-3-ultra-550b-a55b | model card (release 4 Jun 2026) | none |
| muse-glimmer-30b | model card (release Aug 2026) | none |
| muse-spark-open-816b-a42b | model card (license text and overview are in the README; config via unsloth mirror) | none |
| gpt-oss-20b / 120b | model cards | none |
| devstral-small-2-24b | model card | context (256K card vs 393K config) |
| mistral-small-4-119b | model card | none |
| mistral-medium-3.5-128b | model card; release 29 Apr 2026 per press coverage | none |
| mistral-large-4 | model card; open-weights release 29 Oct 2026 per TNW / letsdatascience; Ollama page (1.05T) | total params (card "~1T", Ollama/AA 1.05-1.1T) |
| step-3.7-flash | model card | active "approximately 11B"; thinking classed `always` because the template only offers effort levels |
| minimax-m3.1-flash | model card; unsloth.ai/docs/models/minimax-m3.1-flash | llama.cpp PR #31192 merge status may change |
| glm-5.3-flash | model card; llama.cpp PR #27754 (closed, superseded by merged #27773) | none |
| glm-5.3 | model card; active 40B from AA and Inkling 2 comparison table (not in Z.ai card) | active params |
| mimo-v2.6-flash | model card, chat template | which of -RL / -MOPD is the better default (I chose -RL) |
| qwen3-embedding-0.6b / 8b, qwen3-reranker-0.6b | model cards | "first on MTEB multilingual at release" refers to June 2025 |
| embeddinggemma-2 | model card | none |
| inkling-2-small | model card; unsloth.ai/docs/models/inkling-2 | `thinking` (numeric effort 0-0.99; no documented off switch); release day (repo 4 Nov, public listing 12 Nov) |
| deepseek-v4.1-flash-1017 | model card of DeepSeek-V4.1-Flash (architecture, 890 B/token); unsloth.ai/docs/models/deepseek-v4.1-flash | FP16 KV figure is derived; llama.cpp needs PR #30817 |
| ling-3.1-flash-1019 | model card; AA open-weights page | llama.cpp support (only bartowski GGUFs as evidence); context 1M (card) vs 262K (config) |
| kimi-k2.7-code | model card; Ollama page (30% fewer thinking tokens) | none |
| kimi-k3.1-pro | model card, LICENSE; AA open-weights page (index 46) | KV (NoPE flag); no GGUF yet |

## Evidence behind `good_for` / `weak_at`

The two fields use plain words. The table gives the measurement behind each claim; "card" means the lab's own model card.

| id | plain claim | evidence |
|---|---|---|
| qwen3.5-9b | "one of the smartest models that runs on an ordinary laptop" | Artificial Analysis Intelligence Index (v4 at the time) 32 for the 9B in reasoning mode, top of its size in March 2026 |
| qwen3.8-27b | "strongest model that fits on one 24 GB graphics card, very good at fixing real code by itself" | AA v5.0.1 20.1, the highest open model under 40B; SWE-bench Pro 61.7%, Terminal-Bench 2.1 73.0 (card) |
| qwen3.6-35b-a3b | "quick coding helper" | 3B active parameters; SWE-bench Verified 73.4% (card) |
| qwen3.8-flash-next | "excellent at fixing code by itself while still replying quickly" | SWE-bench Pro 62.5%, SWE-bench Multilingual 81.0 (card); 6B active parameters; AA v5.0.1 28.6 |
| gemma-4-31b | "text that people rate highly in blind comparisons; strong at maths and science" | third among open models on LMArena text at launch (Google, press); MMLU-Pro 85.2, AIME 2026 89.2, GPQA 84.3 (card) |
| gemma-4-31b weak_at | "clearly weaker than Qwen at programming tasks it does on its own" | SWE-bench Pro 36.9 vs 50.2 for Qwen3.6-27B, MCP Atlas 54.2 vs 62.5 (Meta's Muse Glimmer card) |
| gemma-4-26b-a4b | "replies about as quick as a small model" | 3.8B active parameters; Google says it "runs almost as fast as a 4B" |
| muse-glimmer-30b | "uses many tools, recovers from its own mistakes, reads long documents" | MCP Atlas 75.5, tau3-Banking 23.5, AA-LCR 80.0, highest of the three in Meta's table |
| muse-glimmer-30b weak_at | "weaker than Qwen at terminal commands and operating a computer" | Terminal-Bench 2.1 51.7 vs 60.7, OSWorld-Verified 65.9 vs 75.6 (same table) |
| gpt-oss-20b / 120b | "careful step-by-step reasoning for maths"; "contest-style maths and programming puzzles" | 120B: Codeforces Elo 2622; AIME 2025 0.93 and LiveCodeBench 0.88 in AA sub-scores |
| gpt-oss-120b weak_at | "weak at fixing bugs in large real-world codebases" | SWE-bench Pro 16.2% |
| nemotron-3.5-super-vl weak_at | "scores lower on general intelligence tests than others of its size" | AA v5.0.1 13.6 vs 28.6 for Qwen3.8 Flash-Next (similar memory class) |
| nemotron-3.5-lightning | "memory use stays low in very long conversations" | 6 of 52 blocks keep a growing cache (6 KB/token) |
| minimax-m3.1-flash | "operating a computer, long tool-using jobs and security work" | OSWorld 2.0 61.7, BankerToolBench 76.2, CyberGym 82.2 (card) |
| glm-5.3-flash | "close to Z.ai's flagship at programming and tool use" | AA v5.0.1 27.8 vs 31.7 for GLM-5.3; Z.ai: beats GLM-5.2 at a tenth of the price |
| glm-5.3 | "among the best open models at terminal work" | Z.ai reports open-model best on Terminal-Bench 3.0 and Agents' Last Exam |
| mimo-v2.6-flash | "people rate its chat answers highly for the cost" | arena.ai text price/score frontier, 1448 |
| inkling-2-small | "close to the best open models, especially strong at hard programming problems" | AA v5.0.1 30.6; FrontierCode v2.0 25.4%, DeepSWE 72.1% (card) |
| deepseek-v4.1-flash-1017 | "one of the best open models for long solo programming sessions" | DeepSWE v1.1 77.0, Terminal-Bench 4.0 42.3, the highest open scores in the cross-model tables of MiniMax and Thinking Machines |
| ling-3.1-flash-1019 | "science problems and office-style jobs" | SciCode 57%, CritPt 26%, AutomationBench-AA 68%, AA-Briefcase 1524 (card); AA v5.0.1 29.6 |
| kimi-k3.1-pro | "the most capable open model at present" | AA v5.0.1 46.5, highest open-weights score on 19 Nov 2026 |
| kimi-k2.7-code | "thinks more briefly than the Kimi model it is built on" | about 30% fewer thinking tokens than K2.6 (Moonshot, via Ollama page) |
| nemotron-3-ultra weak_at | "weaker at programming than the top Chinese models" | SWE-bench Verified 70.7%, Terminal-Bench 2.1 56.4 vs 80%+ and 88 for the leaders |
| step-3.7-flash | "searching with pictures, reading dense reports and app screens" | first on SimpleVQA (Search) 79.2, V* (Python) 95.3 (card) |
| eurollm-22b | "translates well between all official EU languages" | the lab reports translation on par with or above Gemma-3-27B, Qwen-3-32B and Apertus-70B |
| qwen3-embedding-8b | "was the top multilingual search model when released" | first on the MTEB multilingual leaderboard, June 2025 |

**Claims that rest on anecdote, not benchmarks:**
- **gemma-4-12b**, "often recommended for writing and chat": third-party local-LLM guides (e.g. PromptQuorum's 2026 creative-writing guides).
- **gemma-4-26b-a4b**, "a good chat model": extends the Gemma 4 31B LMArena result to the smaller sibling.
- **gpt-oss-20b**, "users often find its creative writing flat": community experience on r/LocalLLaMA since 2025.
- **gemma-4-12b** weak_at, "less capable than Qwen at programming on its own": measured for the 31B (above) and assumed for the 12B.
- **nemotron-3.5-bolt-74b-a9b** weak_at: states that no independent 2-bit vs BF16 comparison was found.

## Quality index

**What it is.**
- Artificial Analysis Intelligence Index **v5.0.1**, read on **19 Nov 2026** from artificialanalysis.ai/leaderboards/models (data embedded in the page) and the per-model pages.
- v5.0.1 combines nine evaluations: AA-Briefcase v1.1, AutomationBench-AA, Terminal-Bench 4.0, FrontierCode-AA 2.0, AA-Omniscience v1.1, GDP.pdf, HLE-Diamond, CritPt v2 (hard), Terminal-Bench-Science 0.1.
- The scale runs to 100. The best model overall scores 65 (Claude Fable 5.2 at max effort) and the best open model 46.5 (Kimi K3.1 Pro).

**Mode.** Each value is for the mode people normally run: thinking on at the model's default effort.
- DeepSeek V4.1 uses "high" (its template default), not "max", which would give 32.6.
- GLM-5.3 uses "max" (its default), Mistral Large 4 "high" (its default) and Qwen3.8 "xhigh" (its default).
- Ministral 3 is the Instruct model without thinking.
- Where AA lists only one variant (Gemma 4 reasoning, gpt-oss "high", Muse Spark "xhigh", Muse Glimmer "high"), that variant is used even if the local default differs.

**Coverage.** 39 of 48 chat models have a value.

| source | count | method |
|---|---|---|
| `artificial-analysis` | 25 | AA's published v5.0.1 score |
| `estimated-from-aa-subscores` | 10 | AA has run some, but not all, of the nine evaluations. I fitted a linear regression of the v5.0.1 index on the sub-scores it has (usually AA-Briefcase, AutomationBench-AA, HLE-Diamond, GDP.pdf and Terminal-Bench 4.0) across all 125 models AA has scored. Leave-one-out error is about ±1.8 points with five sub-scores, ±2.8 with three (Gemma 4 26B-A4B) and ±3.8 with four (Nemotron 3.5 Bolt). This is a fourth source value, added because it is better evidence than a sibling guess. |
| `estimated-from-sibling` | 4 | Qwen3.5 4B and 2B are anchored on the Qwen3.5 9B estimate, Nemotron 3 Nano Omni on Nemotron 3.5 Lightning. Each is adjusted by the difference in their AA HLE, long-context and CritPt sub-scores. Gemma 4 12B is the mean of its scored siblings E4B (4.8) and 31B (4.4). |
| `null` | 9 | No AA data, or too little to estimate (see below) |

**Left null.**
- Gemma 4 E2B: the sibling estimate came out above E4B, which is implausible.
- Olmo 3 7B and Olmo 3.1 32B: only older sub-scores, and no scored Olmo sibling.
- EuroLLM 9B and 22B: no AA record.
- Apertus 1.5 8B and 70B: AA has only unscored Apertus 1.0 records.
- Devstral Small 2 and Step 3.7 Flash: AA model pages exist but show "N/A" with no sub-scores.

**Read this before ranking with it.**
- v5.0.1 is built to separate frontier models. Everything older or smaller is squeezed into roughly 2-8 points.
- At that level the order is noisy. LFM3 1.7B (6.0) scores above Gemma 4 31B (4.4) and Mistral Medium 3.5 (4.6), partly because the AA-Omniscience part rewards declining to answer.
- Suggested use in the picker: rank by `quality_index` only when the gap is more than about 3 points. Below about 8, treat models as "similar" and fall back to `tier`, size and the `good_for` text.
- Estimates carry at least ±2 points of error.

| id | quality_index | source |
|---|---|---|
| kimi-k3.1-pro | 46.5 | AA |
| glm-5.3 | 31.7 | AA (max) |
| inkling-2-small | 30.6 | AA |
| ling-3.1-flash-1019 | 29.6 | AA |
| minimax-m3.1-flash | 29.1 | AA |
| qwen3.8-flash-next | 28.6 | AA (xhigh) |
| deepseek-v4.1-flash-1017 | 28.6 | AA (high) |
| glm-5.3-flash | 27.8 | AA |
| mimo-v2.6-flash | 26.7 | AA |
| mistral-large-4 | 26.1 | AA (high) |
| muse-spark-open-816b-a42b | 24.9 | AA (xhigh) |
| qwen3.8-27b | 20.1 | AA (xhigh) |
| kimi-k2.7-code | 15.2 | AA sub-scores |
| nemotron-3.5-super-vl-120b-a12b | 13.6 | AA |
| nemotron-3-ultra-550b-a55b | 11.8 | AA (reasoning) |
| qwen3.5-397b-a17b | 11.7 | AA sub-scores |
| qwen3.6-35b-a3b | 9.5 | AA sub-scores |
| nemotron-3.5-bolt-74b-a9b | 8.6 | AA sub-scores |
| qwen3.5-122b-a10b | 7.6 | AA sub-scores |
| muse-glimmer-30b | 6.3 | AA (high) |
| qwen3.5-9b | 6.2 | AA sub-scores |
| lfm3-1.7b | 6.0 | AA |
| nemotron-3.5-lightning-30b-a3b | 5.5 | AA |
| granite-4.2-30b | 5.5 | AA |
| gemma-4-26b-a4b | 5.3 | AA sub-scores |
| granite-4.2-8b | 5.1 | AA |
| gemma-4-e4b | 4.8 | AA (reasoning) |
| granite-4.2-3b | 4.7 | AA |
| gemma-4-12b | 4.6 | sibling |
| mistral-medium-3.5-128b | 4.6 | AA |
| qwen3.5-4b | 4.4 | sibling |
| gemma-4-31b | 4.4 | AA (reasoning) |
| nemotron-3-nano-omni-30b-a3b | 4.3 | sibling |
| mistral-small-4-119b | 4.3 | AA (reasoning) |
| gpt-oss-120b | 3.8 | AA (high) |
| qwen3.5-2b | 3.5 | sibling |
| ministral-3-14b | 3.5 | AA sub-scores |
| gpt-oss-20b | 2.9 | AA sub-scores (high) |
| ministral-3-3b | 2.7 | AA sub-scores |

## Selection rationale

**Rule applied.** Official releases only, from labs with a track record. One entry per downloadable size people actually run. A model is dropped when the same lab shipped a newer one in the same size class. Fine-tunes, merges and abliterated or "uncensored" repos are excluded. These dominate HF trending in Nov 2026: Qwen3.8-27B-Uncensored, Heretic, OBLITERATED, DavidAU merges, Arete-27B (Nous), DaisyRose-27B (RadixArk).

- **Tiny (≤4B).** Qwen3.5 2B/4B (best general small VLMs), Gemma 4 E2B/E4B (audio input, on-device), LFM3 1.7B (fast agent/tool model), Granite 4.2 3B (enterprise, Apache), Ministral 3 3B (EU, vision).
- **Small (7-14B).**
  - General: Qwen3.5 9B, Gemma 4 12B.
  - EU and enterprise: Ministral 3 14B, Granite 4.2 8B.
  - Fully open: Olmo 3 7B.
  - German/Swedish: EuroLLM 9B, Apertus 1.5 8B.
- **Mid (20-40B).**
  - Best single-GPU: Qwen3.8 27B.
  - Fast MoE: Qwen3.6 35B-A3B, Gemma 4 26B-A4B, Nemotron 3.5 Lightning.
  - Conversation and knowledge: Gemma 4 31B.
  - Agents: Muse Glimmer 30B.
  - Reasoning: gpt-oss 20B.
  - Coding: Devstral Small 2.
  - Enterprise: Granite 4.2 30B.
  - Fully open: Olmo 3.1 32B.
  - EU languages: EuroLLM 22B.
  - Video and audio: Nemotron 3 Nano Omni.
- **Large (70-130B backbone).**
  - Qwen3.8 Flash-Next (best coding per active parameter, restrictive licence) and Qwen3.5 122B (Apache alternative).
  - gpt-oss 120B.
  - Nemotron 3.5 Super VL and Bolt (Bolt is the only 74B that fits 24 GB).
  - Mistral Small 4 (Apache) and Medium 3.5 (revenue-capped).
  - Apertus 1.5 70B (fully open EU).
- **Very large MoE (200B-2.8T).** Every model at or near the top of the Artificial Analysis open-weights list as of 19 Nov 2026:
  - Kimi K3.1 Pro 46, DeepSeek V4.1 Flash 33, GLM-5.3 32, Inkling 2 Small 31, Ling 3.1 Flash 30.
  - MiniMax M3.1 Flash and GLM-5.3-Flash (about 28-29 in Inkling's AA v5 table).
  - The main Western/EU flagships: Mistral Large 4, Muse Spark Open, Nemotron 3 Ultra.
  - Kimi K2.7 Code as the coding specialist.
  - Smaller "flash" models that a 256-512 GB workstation can hold: Step 3.7 Flash, MiMo V2.6 Flash, Qwen3.5 397B.
- **Embeddings (4).** Qwen3-Embedding 0.6B and 8B (standard text embedders, Apache, in Ollama), EmbeddingGemma 2 (new multimodal embedder, Apache) and Qwen3-Reranker 0.6B (reranking for RAG).

**German and Swedish.**
- Swedish appears in the official language lists of EuroLLM 9B/22B (all 24 EU languages), Mistral Large 4 (all EU languages) and Apertus 1.5 (broad multilingual coverage).
- Qwen3.5/3.8 (201 languages) and Gemma 4 (140+) also cover both.
- German is in the tested lists of Granite 4.2, Ministral 3, Mistral Small 4, LFM3 and the Nemotron models. Nemotron 3.5 Lightning officially supports only six languages, without Swedish.

## Licence quick reference for enterprises

| Licence | Models | What a large company must check |
|---|---|---|
| Apache-2.0 / MIT / OpenMDW-1.1 / NVIDIA Open Model Agreement | Qwen3.5, Qwen3.6, Qwen3.8-27B, Gemma 4, Granite, Ministral, Devstral Small 2, Mistral Small 4, Olmo, EuroLLM, Apertus, gpt-oss, Muse Glimmer, Step 3.7, Inkling 2, GLM-5.3-Flash, MiMo, DeepSeek V4.1, Ling, all Nemotron, all embeddings | Nothing beyond notices (and NVIDIA's litigation clause) |
| GLM-5.3 License | GLM-5.3 | Only MaaS providers above US$10B revenue |
| Kimi K3.1 Pro License, Muse Model License, Qwen3.8-Max License (not included) | Kimi K3.1 Pro, Muse Spark Open | MaaS businesses above US$20M revenue need a deal; attribution in the UI |
| Kimi K2.7 Code modified MIT | Kimi K2.7 Code | UI attribution above 100M MAU or US$20M/month |
| Qwen Community License 1.0 | Qwen3.8 Flash-Next | Any MaaS or AI coding/office-assistant business needs a licence, regardless of size |
| Mistral Ecosystem Open-Weight | Mistral Large 4 | Any MaaS business needs a commercial licence |
| MiniMax Community | MiniMax M3.1 Flash | Notice required for any commercial use; written authorisation above US$20M/yr |
| Mistral modified MIT | Mistral Medium 3.5 (and Devstral 2 123B, excluded) | Banned for companies above US$20M **monthly** revenue |
| LFM Open License v1.0 | LFM3 1.7B | Banned for commercial use above US$10M annual revenue |

## Notable models left out, and why

- **Superseded in the same size class.**
  - Qwen3.6-27B and Qwen3.5-27B were replaced by Qwen3.8-27B (same architecture).
  - Kimi K3 was replaced by K3.1 Pro (same size, newer post-training). Note that K3 still has a working GGUF (unsloth/Kimi-K3-GGUF).
  - Kimi K2.6 was replaced by K2.7 Code (coding) and K3. DeepSeek V4-Flash was replaced by V4.1-Flash.
  - GLM-5.2 and GLM-5.1 were replaced by GLM-5.3. GLM-4.7-Flash (30B-A3B) was replaced in its class by Qwen3.6 35B-A3B and Nemotron 3.5 Lightning.
  - MiniMax M3, M2.7 and M2.5 were replaced by M3.1 Flash. Mistral Large 3 was replaced by Large 4.
  - Devstral 2 123B was replaced by Mistral Medium 3.5, which has the same architecture and licence and merges coding into it.
  - Nemotron 3 Super and Nano were replaced by 3.5 Super VL and Lightning. Nemotron 3 Nano 4B was replaced by Bolt E4B and Gemma 4 E4B.
  - Step 3.5 Flash was replaced by 3.7 Flash. MiMo V2.5 was replaced by V2.6. Inkling (952B) and Inkling-Small (266B, Jul 2026) were replaced in practice by Inkling 2 Small.
  - Apertus 1.0 was replaced by 1.5. Granite 4.0/4.1 were replaced by 4.2. Gemma 3 was replaced by Gemma 4.
- **Too big or impractical, or excluded to stay within 55 entries.**
  - DeepSeek V4-Pro-0813 (1.6T/49B, MIT): V4.1-Flash scores higher on agentic benchmarks with a third of the backbone.
  - Qwen3.8-2.4T-A95B: custom Qwen3.8-Max licence, 2.4T weights, no local Ollama tag.
  - MiMo V2.6 Pro (1T, MIT).
  - Tencent Hy4-preview (780B, Apache).
- **Too new or no confirmed local runtime.**
  - Tencent Hy4-flash (220B/12B incl. 64B Engram, released 17 Nov 2026, Tencent Hy License with MaaS clauses above US$50M). Its only GGUF is AngelSlim's "for end-to-end testing"; it is worth adding once llama.cpp support lands.
  - Microsoft Aion 1.0 Instruct 2.3B (18 Nov 2026, MIT): a Windows on-device preview with custom code, 32K context and no quantized builds yet.
  - OVHcloud Olala mini (7B-A1B, announced for 19 Nov).
  - Baidu ERNIE 5.5 Flash: only a base model has been posted.
  - Step 5 Preview (604B): a preview under the StepFun licence.
- **New lab, little track record.** Reflection Beam 1.0 (501B/23B, Apache, Oct 2026, AA index 18, text only) is a credible candidate later. Ricursive Ripple-65B preview and Nex-N2.6 were also left out.
- **Non-commercial licences, which fail the enterprise use case.** Cohere Command A Plus, North and tiny-aya (CC-BY-NC), and jina-embeddings-v5 / jina-reranker-v3.5 (CC-BY-NC).
- **Derivatives of included models.** NVIDIA Nemotron 3.5 Bolt E4B (post-trained Gemma 4 E4B for voice assistants), MiMo-V2.6-Distill-Qwen-9B and the tencent DSpine variants.
- **Obsolete families.** Meta Llama has had no release since Llama 4 (Apr 2025); Meta's open line is now Muse (meta-models org). Microsoft Phi's last release was Phi-4-reasoning-vision-15B (Jan 2026), and it has seen little uptake (about 9K downloads). SmolLM3 (Jul 2025) is old. AI Sweden's Hugging Face org shows no widely used release since 2024, so for Swedish use EuroLLM or Mistral Large 4.
- **Other embedders.** BGE-M3 (MIT, `ollama bge-m3`) is still a widely used multilingual default and a fine substitute. Nemotron 3.5 Embed/Rerank 8B (Oct 2026) is newer, but its runtime support is less clear.

## GGUF sources

- **unsloth** is the usual first stop: dynamic "UD" quants, fast coverage of new architectures, and run guides at unsloth.ai/docs that state required llama.cpp PRs and memory per quant.
- **bartowski** offers imatrix quants with a wide range of sizes.
- **ggml-org** is the llama.cpp maintainers' org. A ggml-org GGUF is a good sign that mainline llama.cpp supports the architecture.
- **lmstudio-community** provides LM Studio's curated quants.
- **mradermacher** covers niche models (used here for EuroLLM 9B).
- **Labs' own GGUFs** come from Google (QAT), IBM, Mistral, Liquid, NVIDIA, Meta (Muse Glimmer), Qwen (embeddings) and StepFun. Prefer these when they exist, especially QAT builds.

## The landscape in November 2026, in short

**Dominant families per tier.**
- Tiny and small: Qwen3.5 and Gemma 4, with Granite 4.2 and LFM3 as enterprise/agent niches.
- Mid: Qwen3.8-27B leads single-GPU use. Gemma 4, Nemotron 3.5 Lightning and Meta's new Muse Glimmer are the alternatives.
- Large: NVIDIA Nemotron 3.5, Mistral Small 4 / Medium 3.5, Qwen3.5 122B and Qwen3.8 Flash-Next.
- Very large: Chinese labs hold most of the top AA positions (Moonshot, DeepSeek, Z.ai, inclusionAI, MiniMax, Xiaomi). Thinking Machines' Inkling 2 Small is the top Apache-licensed entrant.

**Architecture trend.** Almost every 2026 model limits KV growth: linear-attention hybrids (Qwen, Kimi, GLM-5.3-Flash, Ling), Mamba hybrids (Nemotron), sliding-window hybrids (Gemma, Muse, Inkling), MLA/sparse attention (GLM, Mistral, DeepSeek). As a result, model weights rather than the KV cache usually decide whether a model fits, even at 128K+ context. Native FP4/FP8 and QAT weights are now common.

**Released in the last three weeks (29 Oct to 19 Nov 2026).**
- Mistral Large 4 open weights (29 Oct).
- Kimi K3.1 Pro weights (2 Nov).
- Inkling 2 Small (4-12 Nov).
- Tencent Hy4-flash (17 Nov).
- Microsoft Aion 1.0 2.3B preview (18 Nov).
- Shortly before that: DeepSeek V4.1-Flash-1017 and MiniMax M3.1 Flash (17 Oct), LFM3 (23 Oct) and Ling-3.1-flash-1019 (27 Oct).

**Runtime caveat.** Several frontier models need an unmerged llama.cpp PR: DeepSeek V4.1 (#30817), MiniMax M3.1 Flash (#31192) and Inkling 2 (#32187). Kimi K3.1 Pro has no GGUF at all. Ollama offers most models above about 200B only as "cloud" tags. llama.cpp builds are numbered around b12xxx and the project has started tagging vX.Y.Z releases.

## Maintainer details moved out of the UI notes (2026-11-23)

On 2026-11-23 the user-visible text fields of models-llm.json were rewritten in plain English for beginners (`notes`, `good_for`, `weak_at`, `license_note`).
The previous wording held maintainer detail that no longer appears in the UI: llama.cpp PR and build numbers, exact field semantics,
repo names and per-file quant sizes (Unsloth, ggml-org, Comfy-Org and others), benchmark names and scores, and source attributions.
It is kept below verbatim, per model id, so nothing is lost. Only fields whose content changed beyond spelling or a final full stop are listed.

### `qwen3.5-2b` (Qwen3.5 2B)

- Previous `license_note`: Permissive: commercial use is allowed for companies of any size; keep the licence and notices.
- Previous `notes`: Native vision-language model (vision encoder is in the checkpoint). Hybrid Gated DeltaNet architecture: use a 2026 llama.cpp/Ollama build with Qwen3.5 support. Ships a multi-token-prediction head; unsloth also publishes -MTP-GGUF files for speculative decoding.

### `qwen3.5-4b` (Qwen3.5 4B)

- Previous `good_for`: Small model meant for simple assistants that use tools, read images and work through long documents.
- Previous `license_note`: Permissive: commercial use is allowed for companies of any size; keep the licence and notices.
- Previous `notes`: Thinking is on by default; disable it per request for quick answers. 262K native context, extensible to about 1M with YaRN. Needs a llama.cpp/Ollama build with Qwen3.5 support.

### `gemma-4-e2b` (Gemma 4 E2B)

- Previous `license_note`: Permissive: commercial use is allowed for companies of any size; keep the licence and notices.
- Previous `notes`: 5.1B stored weights include per-layer embeddings (PLE); compute per token is about 2.3B ("effective"). params_active_b holds the effective count. Google publishes QAT Q4_0 GGUFs (google/gemma-4-E2B-it-qat-q4_0-gguf); Ollama has gemma4:e2b-it-qat. First Gemma under Apache 2.0.

### `gemma-4-e4b` (Gemma 4 E4B)

- Previous `good_for`: Offline assistant for laptops and phones that takes voice, pictures and text; NVIDIA built a voice assistant on it.
- Previous `license_note`: Permissive: commercial use is allowed for companies of any size; keep the licence and notices.
- Previous `notes`: 8B stored weights include per-layer embeddings; about 4.5B effective compute (params_active_b). Official QAT Q4_0 GGUF: google/gemma-4-E4B-it-qat-q4_0-gguf; Ollama gemma4:e4b-it-qat. NVIDIA-Nemotron-3.5-Bolt-E4B is an NVIDIA post-train of this model.

### `lfm3-1.7b` (LFM3 1.7B)

- Previous `weak_at`: Companies earning over $10M a year must pay for a licence
- Previous `license_note`: Free commercial use only for organisations under US$10M annual revenue; larger companies need a paid licence from Liquid AI.
- Previous `notes`: Official GGUF from Liquid AI; works in llama.cpp, Ollama and LM Studio. Reasoning is on by default and Liquid says disabling it can be inconsistent. Liquid does not recommend it for agentic coding; use retrieval for knowledge questions. 16 listed languages including German (Swedish not listed).

### `granite-4.2-3b` (Granite 4.2 3B)

- Previous `good_for`: Small business model for answering questions from your own documents and producing tidy structured output.
- Previous `license_note`: Permissive: commercial use is allowed for companies of any size; keep the licence and notices.
- Previous `notes`: IBM ships official GGUF, FP8, MXFP4 and NVFP4 builds. 128K native context (IBM states long-context extension to 512K). Thinking modes: full, off and low-effort.

### `ministral-3-3b` (Ministral 3 3B Instruct)

- Previous `good_for`: Tiny European model that reads images and writes well in the main European languages.
- Previous `license_note`: Permissive: commercial use is allowed for companies of any size; keep the licence and notices.
- Previous `notes`: Official checkpoint is FP8 (about 1 byte per parameter); official GGUF from Mistral. A separate Ministral-3-3B-Reasoning-2512 adds thinking.

### `qwen3.5-9b` (Qwen3.5 9B)

- Previous `good_for`: One of the smartest models that runs on an ordinary laptop, and it also reads images and video.
- Previous `license_note`: Permissive: commercial use is allowed for companies of any size; keep the licence and notices.
- Previous `notes`: Thinking on by default; disable it for chat. Needs a llama.cpp/Ollama build with Qwen3.5 support. MTP GGUFs available from unsloth for faster decoding.

### `gemma-4-12b` (Gemma 4 12B Unified)

- Previous `license_note`: Permissive: commercial use is allowed for companies of any size; keep the licence and notices.
- Previous `notes`: Encoder-free ("unified") design: image patches and audio go straight into the decoder. Added a month after the first Gemma 4 sizes. Official QAT builds: google/gemma-4-12B-it-qat-q4_0-gguf and Ollama gemma4:12b-it-qat.

### `ministral-3-14b` (Ministral 3 14B Instruct)

- Previous `good_for`: Good at European languages and at reading images, from France's Mistral; a separate reasoning version exists.
- Previous `license_note`: Permissive: commercial use is allowed for companies of any size; keep the licence and notices.
- Previous `notes`: Official checkpoint is FP8; official GGUF from Mistral. Ministral-3-14B-Reasoning-2512 is the thinking variant. Listed languages include German, French, Dutch, Italian, Spanish, Portuguese.

### `granite-4.2-8b` (Granite 4.2 8B)

- Previous `good_for`: Dependable business assistant for searching your documents and using tools, tested in German and eleven other languages.
- Previous `license_note`: Permissive: commercial use is allowed for companies of any size; keep the licence and notices.
- Previous `notes`: Official GGUF, FP8, MXFP4 and NVFP4 builds from IBM. Granite 4.2 is a plain dense transformer (Granite 4.0 was a Mamba hybrid). Release date on the card: 25 Aug 2026.

### `olmo-3-7b` (Olmo 3 7B Instruct)

- Previous `license_note`: Permissive: commercial use is allowed for companies of any size; keep the licence and notices.
- Previous `notes`: Olmo-3-7B-Think is the reasoning variant. No GQA means a larger KV cache than most 7B models.

### `eurollm-9b` (EuroLLM 9B Instruct (2512))

- Previous `license_note`: Permissive: commercial use is allowed for companies of any size; keep the licence and notices.
- Previous `notes`: Standard Llama architecture, so any llama.cpp build runs it. No official GGUF; mradermacher (community quantizer) has one. Not in the Ollama library; import the GGUF.

### `apertus-1.5-8b` (Apertus 1.5 8B)

- Previous `good_for`: Swiss fully open model trained only on data whose owners did not opt out, covering very many languages.
- Previous `license_note`: Permissive: commercial use is allowed for companies of any size; keep the licence and notices.
- Previous `notes`: Gated repo (automatic approval after accepting terms). 1.5 adds image and audio input via a new apertus1p5 architecture; llama.cpp support for 1.5 is unconfirmed. Apertus 1.0 (text only, 65K context) has unsloth GGUFs: unsloth/Apertus-8B-Instruct-2509-GGUF.

### `qwen3.8-27b` (Qwen3.8 27B)

- Previous `good_for`: Strongest model that fits on one 24 GB graphics card, and very good at fixing real code by itself.
- Previous `license_note`: Permissive: commercial use is allowed for companies of any size; keep the licence and notices.
- Previous `notes`: Same architecture as Qwen3.5/3.6 27B, so existing Qwen3.5 support in llama.cpp applies. Thinking on by default (reasoning_effort, preserve_thinking). 262K native, about 1M with YaRN. Official FP8 at Qwen/Qwen3.8-27B-FP8. Supersedes Qwen3.6-27B. The many "Qwen3.8-27B uncensored/abliterated" repos are community edits, not Qwen releases.

### `qwen3.6-35b-a3b` (Qwen3.6 35B-A3B)

- Previous `good_for`: Quick coding helper that stays fast even when part of it has to run on the main processor.
- Previous `weak_at`: Needs memory for its full size, and is behind Qwen3.8 27B
- Previous `license_note`: Permissive: commercial use is allowed for companies of any size; keep the licence and notices.
- Previous `notes`: Still the newest Qwen in the 35B-A3B slot (no Qwen3.8 at this size). Reported 73.4% SWE-bench Verified. Qwen advises keeping at least 128K context to preserve thinking quality. Ollama also has a 35b-a3b-coding tag.

### `gemma-4-31b` (Gemma 4 31B)

- Previous `license_note`: Permissive: commercial use is allowed for companies of any size; keep the licence and notices.
- Previous `notes`: Official QAT Q4_0 GGUF: google/gemma-4-31B-it-qat-q4_0-gguf (QAT keeps quality close to BF16 at 4-bit); Ollama gemma4:31b-it-qat. The 50 sliding layers make the KV cache front-loaded: about 0.84 GB is needed even for short chats.

### `gemma-4-26b-a4b` (Gemma 4 26B-A4B)

- Previous `license_note`: Permissive: commercial use is allowed for companies of any size; keep the licence and notices.
- Previous `notes`: Official QAT GGUF: google/gemma-4-26B-A4B-it-qat-q4_0-gguf; Ollama gemma4:26b-a4b-it-qat. Card total 25.2B for the language model plus ~0.55B vision encoder.

### `nemotron-3.5-lightning-30b-a3b` (Nemotron 3.5 Lightning 30B-A3B)

- Previous `weak_at`: Officially supports only six languages, Swedish not among them
- Previous `license_note`: Permissive NVIDIA licence: commercial use allowed with no revenue or user caps; keep the licence and notices.
- Previous `notes`: NVIDIA also ships an NVFP4 checkpoint for Blackwell GPUs. Config default is 262K; the card states up to 1M. ggml-org publishes a GGUF too, which indicates mainline llama.cpp support. Supported languages: English, Spanish, French, German, Italian, Japanese.

### `muse-glimmer-30b` (Muse Glimmer 30B)

- Previous `license_note`: Permissive: commercial use is allowed for companies of any size; keep the licence and notices.
- Previous `notes`: Meta's new open line after Llama (Meta now publishes under the meta-models org). Distilled from Muse Spark. Reasoning strength low/medium/high/xhigh is set in the system prompt; there is no documented off switch. Official GGUF at meta-models/Muse-Glimmer-30B-GGUF; ~1.8B perception encoder included.

### `gpt-oss-20b` (gpt-oss 20B)

- Previous `weak_at`: Always thinks before answering; users often find its creative writing flat
- Previous `license_note`: Permissive: commercial use is allowed for companies of any size; keep the licence and notices.
- Previous `notes`: Experts ship natively in MXFP4 (about 4.25 bits per weight), so the original checkpoint is ~13 GB and GGUF quants barely shrink it. Reasoning effort low/medium/high; uses the "harmony" chat format. No newer OpenAI open-weight LLM as of Nov 2026.

### `devstral-small-2-24b` (Devstral Small 2 24B)

- Previous `license_note`: Permissive: commercial use is allowed for companies of any size; keep the licence and notices.
- Previous `notes`: Official checkpoint is FP8. Card states 256K context (config allows 393K; Ollama lists 384K). Apache 2.0, unlike the larger Devstral 2 123B (revenue-capped licence).

### `granite-4.2-30b` (Granite 4.2 30B)

- Previous `good_for`: IBM's largest Granite: reliable at using tools and answering from company documents, with IBM support on offer.
- Previous `license_note`: Permissive: commercial use is allowed for companies of any size; keep the licence and notices.
- Previous `notes`: Official GGUF, FP8, MXFP4 and NVFP4 builds. Full-attention KV cache is the largest in this tier (256 KB per token).

### `olmo-3.1-32b` (Olmo 3.1 32B Instruct)

- Previous `license_note`: Permissive: commercial use is allowed for companies of any size; keep the licence and notices.
- Previous `notes`: Olmo-3.1-32B-Think is the reasoning variant (Ollama olmo-3.1:32b-think).

### `eurollm-22b` (EuroLLM 22B Instruct (2512))

- Previous `good_for`: EU-funded model that translates well between all official EU languages, including Swedish and German.
- Previous `license_note`: Permissive: commercial use is allowed for companies of any size; keep the licence and notices.
- Previous `notes`: Llama architecture; any llama.cpp build works. The lab reports translation on par with or above Gemma-3-27B, Qwen-3-32B and Apertus-70B (older rivals). Not in the Ollama library.

### `nemotron-3-nano-omni-30b-a3b` (Nemotron 3 Nano Omni 30B-A3B)

- Previous `license_note`: Commercial use allowed with no revenue caps; keep NVIDIA notices; rights end if you sue claiming the model infringes.
- Previous `notes`: Total includes vision and audio encoders (31B language model). FP8 (33 GB) and NVFP4 checkpoints exist. Ollama nemotron-3-nano:30b is the text-only Nano, not this Omni model. Check that your runtime handles audio/video input; text and images are the safest path.

### `qwen3.8-flash-next` (Qwen3.8 Flash-Next (125B-A6B))

- Previous `good_for`: Early look at Qwen's next design: excellent at fixing code by itself while still replying quickly.
- Previous `weak_at`: Licence needs a separate deal for companies selling AI access or coding assistants
- Previous `license_note`: Commercial use allowed, but any company running a hosted model API or an AI coding/office-assistant product needs a separate licence from Qwen; show the model name above 100M MAU or US$20M monthly revenue.
- Previous `notes`: params_total_b counts everything in the checkpoint: 125B backbone + 51B n-gram embedding table + 4B MTP. The n-gram table is a lookup and can stay on SSD via mmap (llama.cpp --ple, build b12233 or newer, PR #31185); Unsloth lists about 64 GB RAM+VRAM for 4-bit when doing so. MTP speculative decoding needs Unsloth's llama.cpp fork. Ollama has no "latest" tag; use the explicit tag. Experimental qwen4_exp architecture.

### `qwen3.5-122b-a10b` (Qwen3.5 122B-A10B)

- Previous `good_for`: Largest freely licensed Qwen that fits a 128 GB computer, balanced across images, code and many languages.
- Previous `license_note`: Permissive: commercial use is allowed for companies of any size; keep the licence and notices.
- Previous `notes`: Official GPTQ-Int4 checkpoint exists (Qwen/Qwen3.5-122B-A10B-GPTQ-Int4) for vLLM/SGLang. For enterprises that cannot accept the Qwen Community licence of Flash-Next, this is the Apache alternative in the same memory class.

### `gpt-oss-120b` (gpt-oss 120B)

- Previous `weak_at`: Weak at fixing bugs in large real-world codebases by itself
- Previous `license_note`: Permissive: commercial use is allowed for companies of any size; keep the licence and notices.
- Previous `notes`: Native MXFP4 experts: the original checkpoint is ~61 GB and fits a single 80 GB GPU or a 96-128 GB Mac/Strix Halo. Reasoning effort low/medium/high; harmony chat format.

### `nemotron-3.5-super-vl-120b-a12b` (Nemotron 3.5 Super VL 120B-A12B)

- Previous `weak_at`: Scores lower on general intelligence tests than others of its size
- Previous `license_note`: Permissive NVIDIA licence: commercial use allowed with no revenue or user caps; keep the licence and notices.
- Previous `notes`: NVFP4 checkpoint targets DGX Spark and Blackwell GPUs. Native MTP head for speculative decoding. ggml-org also publishes a GGUF (mainline llama.cpp support).

### `nemotron-3.5-bolt-74b-a9b` (Nemotron 3.5 Bolt 74B-A9B)

- Previous `license_note`: Permissive NVIDIA licence: commercial use allowed with no revenue or user caps; keep the licence and notices.
- Previous `notes`: QAT-native: the "24GB" release uses IQ2 2-bit weights trained for that precision (~24.6 GB). Use the official 24GB GGUF or Ollama tag (25 GB); do not apply your own 2-bit quant to the BF16 weights. BF16 reference weights are ~150 GB. LiLiCorr DFlash drafter available for speculative decoding.

### `mistral-small-4-119b` (Mistral Small 4 119B)

- Previous `good_for`: Freely licensed European all-rounder that can answer instantly or reason first, with quick replies for its size.
- Previous `license_note`: Permissive: commercial use is allowed for companies of any size; keep the licence and notices.
- Previous `notes`: Official checkpoint is FP8 (~119 GB); NVFP4 version also published. Merges Mistral's Instruct, Magistral (reasoning) and Devstral lines into one model. reasoning_effort "none" or "high". Despite the name it is a large model.

### `mistral-medium-3.5-128b` (Mistral Medium 3.5 128B)

- Previous `weak_at`: Licence forbids use by companies earning over $20M a month
- Previous `license_note`: Not usable by companies (or employees of companies) with more than US$20M global monthly revenue without a commercial licence from Mistral. Check before enterprise use.
- Previous `notes`: Official checkpoint is FP8. Dense 128B is slow on unified-memory machines (all 128B weights are read per token). Mistral fixed a config entry that hurt long-context quality after release; re-download older copies. Supersedes Devstral 2 123B (same architecture, same licence).

### `apertus-1.5-70b` (Apertus 1.5 70B)

- Previous `good_for`: Largest fully open European model, with public training data, many languages, and image and audio input.
- Previous `license_note`: Permissive: commercial use is allowed for companies of any size; keep the licence and notices.
- Previous `notes`: Gated repo (automatic approval). llama.cpp support for the 1.5 multimodal architecture is unconfirmed; Apertus-70B-Instruct-2509 (1.0, text-only) has community GGUFs. Mainly useful where data provenance and EU AI Act transparency matter.

### `step-3.7-flash` (Step 3.7 Flash)

- Previous `license_note`: Permissive: commercial use is allowed for companies of any size; keep the licence and notices.
- Previous `notes`: Card: 196B language model + 1.8B vision encoder (HF total includes 3 MTP layers). StepFun publishes its own GGUF (stepfun-ai/Step-3.7-Flash-GGUF), FP8 and NVFP4. llama.cpp named as a supported backend. Step 5 Preview (604B) exists but is a preview under a custom StepFun licence.

### `minimax-m3.1-flash` (MiniMax M3.1 Flash)

- Previous `license_note`: Commercial use needs a one-time notice to MiniMax and a "Built with MiniMax M3.1-Flash" credit; products above US$20M yearly revenue need prior written authorisation.
- Previous `notes`: Quantization-aware trained: NVFP4 routed experts, MXFP8 elsewhere (HF's 220B parameter count reflects packed FP4 storage; card says ~428B). llama.cpp needs PR #31192 (not mainline at time of writing); Unsloth: ~249 GB for UD-Q4_K_XL, ~129 GB for 1-bit. Ollama has only a cloud tag. Supersedes MiniMax M3.

### `glm-5.3-flash` (GLM-5.3-Flash)

- Previous `license_note`: Permissive: commercial use is allowed for companies of any size; keep the copyright notice.
- Previous `notes`: Main repo is FP8 (~321 GB); BF16 in zai-org/GLM-5.3-Flash-BF16. llama.cpp support (glm5next) merged upstream around 1 Oct 2026 via PR #27773. Very small KV cache makes long agent sessions cheap. Ollama has only a cloud tag.

### `mimo-v2.6-flash` (MiMo-V2.6-Flash)

- Previous `license_note`: Permissive: commercial use is allowed for companies of any size; keep the copyright notice.
- Previous `notes`: Two post-trained variants: -RL (main) and -MOPD. FP4-packed experts with FP8 elsewhere in the official checkpoint. ggml-org GGUF indicates mainline llama.cpp support. Bigger sibling MiMo-V2.6-Pro (1T/42B) left out to save space.

### `qwen3.5-397b-a17b` (Qwen3.5 397B-A17B)

- Previous `good_for`: Largest freely licensed Qwen, with wide general knowledge and about 200 languages, for very large computers.
- Previous `license_note`: Permissive: commercial use is allowed for companies of any size; keep the licence and notices.
- Previous `notes`: Official GPTQ-Int4 checkpoint available. The newer Qwen3.8-2.4T-A95B is left out (custom Qwen3.8-Max licence, 2.4T weights).

### `inkling-2-small` (Inkling 2 Small)

- Previous `good_for`: Freely licensed model close to the best open models, and especially strong at hard programming problems.
- Previous `weak_at`: Mainly English, and needs a test build of the usual local software
- Previous `license_note`: Permissive: commercial use is allowed for companies of any size; keep the licence and notices.
- Previous `notes`: Pre-trained and post-trained natively in NVFP4 (~394 GB checkpoint); an MXFP8 copy exists. llama.cpp needs PR #32187 (inkling2 architecture), per Unsloth; UD-IQ1_S is ~172 GB, UD-Q4_K_XL ~354 GB. Numeric reasoning_effort 0.0-0.99 (default 0.9); whether 0.0 fully disables thinking is not documented. "Small" is relative: the first Inkling is 952B. Released 4-12 Nov 2026.

### `inkling-2-mini` (Inkling 2 Mini)

- Previous `good_for`: Small model built for coding agents and tool use that also reads images, and fits on a single 32 GB machine.
- Previous `weak_at`: Behind Qwen3.8 27B at following long, detailed instructions, and it can get stuck in long reasoning loops
- Previous `license_note`: Permissive: commercial use is allowed for companies of any size; keep the licence and notices. The lab also publishes an acceptable-use policy (for example no automated decisions about people's rights), which is worth reading.
- Previous `notes`: Released 20 Nov 2026 and listed in Ollama. The checkpoint is already compressed (mixed NVFP4 and MXFP8, about 20 GB), so higher precision settings add nothing. The 3.4B "active" figure on the card understates the work: the looped middle layers run three times, so the card gives 5.4B effective parameters per token, which is what the speed estimate uses. The card says the lab's quality index is 20.1 (version 5.0, lab-reported). Limit the output length: the card warns of long reasoning loops, and reasoning cannot be switched off completely. Apple silicon with 32 GB or more, a DGX Spark, or a GPU with 32 GB are the lab's suggested hardware. It is the smaller sibling of Inkling 2 Small and less capable on most of the lab's tests.

### `deepseek-v4.1-flash-1017` (DeepSeek-V4.1-Flash (1017))

- Previous `good_for`: One of the best open models for long solo programming sessions, using very little memory for long chats.
- Previous `weak_at`: Needs a test build of the usual local software
- Previous `license_note`: Permissive: commercial use is allowed for companies of any size; keep the copyright notice.
- Previous `notes`: 552B backbone + ~196B Engram lookup tables (params_total_b counts both). Active 8B in prefill, 16B in decode. Weights are FP8 with FP4 experts. Unsloth: run with llama.cpp PR #30817 (deepseek41 branch); Engram tables can sit on SSD; about 305 GB RAM+VRAM for 4-bit, ~122 GB for 1-bit. No Jinja chat template; DeepSeek ships a Python encoder. Ollama is cloud-only. Reasoning effort 1-100.

### `ling-3.1-flash-1019` (Ling-3.1-flash (1019))

- Previous `license_note`: Permissive: commercial use is allowed for companies of any size; keep the copyright notice.
- Previous `notes`: Card: 560B total, 25B active (HF count includes the MTP layer). Official checkpoint is FP8. Config default context is 262K; the card states 1M. llama.cpp support status not confirmed beyond the existence of bartowski GGUFs.

### `glm-5.3` (GLM-5.3)

- Previous `good_for`: Z.ai's flagship for long, multi-step programming jobs, and among the best open models at terminal work.
- Previous `license_note`: Commercial use allowed; only model-as-a-service businesses with more than US$10B annual revenue must pass a Z.ai security review first.
- Previous `notes`: Main repo is FP8 (~753 GB); BF16 in zai-org/GLM-5.3-BF16. reasoning_effort low/high/max (default max); pass clear_thinking=true for plain chat. Licence changed from MIT (GLM-5.2) to the GLM-5.3 License, which only restricts MaaS firms above US$10B revenue. Ollama is cloud-only.

### `muse-spark-open-816b-a42b` (Muse Spark Open 816B-A42B)

- Previous `weak_at`: Licence requires showing a "Built with Muse Spark Open" credit
- Previous `license_note`: Commercial use allowed; you must show "Built with Muse Spark Open" and follow Meta's usage policy; model-as-a-service providers above US$20M revenue need a separate agreement.
- Previous `notes`: Gated: manual approval on Hugging Face. Card says 816B (HF safetensors total 822B incl. the 1.8B perception encoder and embeddings). BF16 and NVFP4 checkpoints; Meta quotes 700 GB VRAM for NVFP4. ggml-org also has a GGUF (mainline llama.cpp support). Ollama is cloud-only. AA index about 25, below the Chinese flagships.

### `nemotron-3-ultra-550b-a55b` (Nemotron 3 Ultra 550B-A55B)

- Previous `good_for`: The most transparent very large model: its weights, training data and methods are all public.
- Previous `license_note`: Permissive NVIDIA licence: commercial use allowed with no revenue or user caps; keep the licence and notices.
- Previous `notes`: NVFP4 checkpoint available. Tiny KV cache for its size. Default deployment 256K context, up to 1M. Languages: English, French, Spanish, Italian, German, Japanese, Hindi, Korean, Brazilian Portuguese, Chinese. Ollama is cloud-only.

### `mistral-large-4` (Mistral Large 4 (1T-A52B))

- Previous `good_for`: European flagship fluent in over 160 languages, all EU ones included; Mistral highlights law, finance and security.
- Previous `license_note`: Commercial use allowed, including inside products; any company that runs a model-as-a-service business needs a separate commercial licence (no revenue threshold). Internal use is exempt.
- Previous `notes`: Open weights published 29 Oct 2026 (HF repo created 30 Sep; preview earlier). About 1.05T total, 49B active excluding embeddings. Trained in Mistral's EU datacentres. NVFP4 checkpoint for Blackwell; ggml-org GGUFs exist (mainline llama.cpp). Embedded DSpark draft head. Reasoning effort low/medium/high. AA index 26.

### `kimi-k2.7-code` (Kimi K2.7 Code)

- Previous `license_note`: Commercial use allowed; products above 100M monthly users or US$20M monthly revenue must display "Kimi K2.7 Code" in the UI.
- Previous `notes`: Native INT4 weights (quantization-aware training, group size 32), so a Q4 GGUF is close to lossless: Unsloth says UD-Q8_K_XL is 595 GB, only 10 GB more than UD-Q4_K_XL. Kimi K2 architecture is supported in mainline llama.cpp. Ollama is cloud-only.

### `kimi-k3.1-pro` (Kimi K3.1 Pro)

- Previous `good_for`: The most capable open model at present, best for complex multi-step tasks, programming and pictures.
- Previous `license_note`: Commercial use allowed; model-as-a-service businesses above US$20M revenue per 12 months need a separate agreement; products above 100M MAU or US$20M monthly revenue must show the model name. Internal use exempt.
- Previous `notes`: Weights released 2 Nov 2026 (API 23 Oct). MXFP4 weights from quantization-aware training (~1.5 TB). Replaces the full-attention MLA layers of Kimi K3 with sparse-attention layers, so existing Kimi K3 llama.cpp support does not cover it. For local use today, Kimi K3 has unsloth/Kimi-K3-GGUF. reasoning_effort low/high/max. Ollama is cloud-only.

### `qwen3-embedding-0.6b` (Qwen3 Embedding 0.6B)

- Previous `good_for`: Small, fast way to make documents searchable by meaning in many languages; runs fine without a graphics card.
- Previous `license_note`: Permissive: commercial use is allowed for companies of any size; keep the licence and notices.
- Previous `notes`: Supports instruction-prefixed queries and Matryoshka output sizes (up to 1024 dims). Official GGUF from Qwen.

### `qwen3-embedding-8b` (Qwen3 Embedding 8B)

- Previous `weak_at`: Slow and heavy for indexing large document collections
- Previous `license_note`: Permissive: commercial use is allowed for companies of any size; keep the licence and notices.
- Previous `notes`: Up to 4096-dim output with Matryoshka truncation. Pair with Qwen3-Reranker for best RAG quality. Newer multimodal siblings exist (Qwen3-VL-Embedding-2B/8B, Jan 2026).

### `embeddinggemma-2` (EmbeddingGemma 2)

- Previous `weak_at`: Each item you index can be at most about 6,000 words
- Previous `license_note`: Permissive: commercial use is allowed for companies of any size; keep the licence and notices.
- Previous `notes`: 740M total = 270M text backbone + 170M vision + 300M audio encoders that load only when needed (params_active_b = text-only). 768-dim output, Matryoshka 128-768. Ollama also has embeddinggemma-2:270m (text only). 100+ languages.

### `qwen3-reranker-0.6b` (Qwen3 Reranker 0.6B)

- Previous `license_note`: Permissive: commercial use is allowed for companies of any size; keep the licence and notices.
- Previous `notes`: This is a reranker, not an embedder: it scores query-passage pairs. llama-server supports it with --reranking. 4B and 8B versions exist for higher accuracy.
