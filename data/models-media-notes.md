# Image, video and speech models: notes for models-media.json

Checked 2026-11-19. 34 entries: 10 image (8 `image`, 2 `image-edit`), 7 video, 12 text-to-speech, 5 speech-to-text.
Every repo was checked with the Hugging Face API (licence tag, creation date, 30-day downloads, safetensors parameter
count, file sizes). Each kind was researched separately and then merged; the per-kind sections below keep the
original sources. Licence texts for MiniMax H3, MiniMax-H3-Image, Qwen-Image-2.1 and Fish Audio Drama 3 were re-read
from the repos during the merge.

## How to read the file

**Units.** GB = 10^9 bytes, as Hugging Face lists file sizes. Graphics cards are sold in GiB: a "16 GB" card holds
17.2 GB in these units, a "24 GB" card 25.8 GB, a "32 GB" card 34.4 GB. Convert one side before comparing. Example:
HiDream-O1's 16.4 GB bf16 file fits a 16 GB RTX 4060 Ti only because the card holds 17.2 GB.

**Fields added for the calculator**

- `typical_workload` and `speed_reference.seconds` belong together. `seconds` is the wall-clock time measured for
  exactly that workload on `speed_reference.gpu_id_hint` (for Ideogram 4 it is a measured per-step time x 48 steps).
  Where the measurement used fewer steps than recommended (HiDream-O1: 12 steps; Qwen-Image-Edit-2511: 4 steps with
  the community Lightning LoRA), the workload says so and `typical_output` keeps the recommended settings. Time scales
  linearly with steps.
- `speed_reference.precision` and `speed_reference.offloaded` (extra fields): the weight format of the measured run and
  whether weights were streamed from system RAM during it (`true`, `false`, or `null` when the source does not say).
  Runs marked `offloaded: true` already include the offload slowdown: MiniMax-H3-Image (12 GB card), MiniMax H3 video
  (layer-wise offload), Wan 2.2 5B, Kandinsky 6 Lite and Pro. Do not apply an offload penalty twice.
- `text_encoder_gb`: the largest required non-main component, at the precision the official repo ships it (as
  briefed). `text_encoder_gb_by_precision` (extra field) lists the formats local runtimes actually load, mostly the
  Comfy-Org repackaged files. **Use the smallest one that fits.** This matters most for MiniMax H3 and H3-Image: the
  official encoder is 66.7 GB, Comfy's int8 file 27.1 GB and nvfp4 15.7 GB. A calculator that uses only
  `text_encoder_gb` will say H3 fits no consumer setup, which contradicts ComfyUI's own RTX 3060 demo.
- Optional prompt-rewriting language models (FLUX 3 klein "prompt upsampler", H3-Image "prompt expander",
  Qwen-Image-2.1 "prompt enhancer", HiDream "prompt agent") are not counted in `text_encoder_gb`. They run before
  sampling and can be unloaded; their sizes are in `components` and `notes`.
- `can_offload_text_encoder`: `true` for every image and video entry (ComfyUI and Diffusers unload or CPU-offload the
  encoder after the prompt is encoded). `false` for speech entries: their extra part (codec, decoder) is used for the
  whole generation, or there is none. HiDream-O1 has no separate encoder (`text_encoder_gb: 0`).
- `activation_gb_at_typical`: extra memory beyond the weights during sampling at `typical_workload`, for a
  ComfyUI-style runtime (memory-efficient attention, one model on the GPU at a time, tiled VAE decode). For speech
  models it is everything beyond the weight files (cache, codec buffers, runtime overhead); for CPU models read it as
  system RAM. How each number was obtained is in the table further down; most are estimates.
- `weights_resident_fraction` (extra field): share of `weights_gb_by_precision` that must be on the GPU at the same
  time. 1 for all entries except Wan 2.2 A14B (0.5: its two 14B experts run one after the other).
- `also_edits` (extra field): `true` when one checkpoint both generates and edits images (`kind` holds one value only).
- Precision keys beyond the builder's current list: `int8` (ComfyUI int8 "ConvRot"; runs on RTX 30 cards and AMD, and
  Comfy-Org now ships it for most 2026 models), `w4a8`, `mxfp8`, `nf4`, `fp32`, `fp16`, `int4`, `q2_gguf`, `q5_gguf`,
  `int8_onnx`, `mlx_8bit`, `gguf`. Rough bytes per parameter: bf16/fp16 2.0, fp8/int8 1.0-1.05, Q8_0 1.1-1.2,
  nvfp4 0.6-1.0 (many layers kept at higher precision), Q4_K_M 0.6-0.65, w4a8 about 0.6.
- Ideogram 4: `params_total_b` and `weights_gb_by_precision` count both 9.3B transformers, since both run at every step.

**`gpu_id_hint` values used:** GeForce RTX 4090, GeForce RTX 5090, GeForce RTX 5080, GeForce RTX 5070 Ti,
GeForce RTX 4070 SUPER, GeForce RTX 4060 Ti 16GB, NVIDIA A100, NVIDIA H200, Apple M3 (CPU), Apple M4 Max,
Raspberry Pi 4, CPU 8 vCPU (cloud server) (= Hugging Face Jobs "cpu-upgrade"). The CPU-measured references (Piper,
Kokoro, Phonon, Pocket TTS, Supertonic 3, ZONOS3-Mini, Moonshine) should be matched to a CPU entry; "Apple M3 (CPU)"
is the M3's CPU cores, not its GPU.

**Speech speed references.** TTS `seconds` = time to make 10 s of speech; STT `seconds` = time to transcribe 60 s of
audio; batch 1 where a source exists. Datacenter-only references: Chatterbox Multilingual V3 and Fish Drama 3 (H200,
batch 1), OmniVoice and Fish S2 Pro (A100, batch 1). Nemotron 3.5 Transcribe has only a batched H200 throughput figure,
so a time scaled from it to a home GPU will be far too optimistic; treat its speed as unknown on consumer hardware.

## The landscape in November 2026, in short

- **Image.** Top open models on the Artificial Analysis open-weights boards: MiniMax-H3-Image (33B, Nov 2026; licence
  excludes the EU, UK, South Korea and USA), Qwen-Image-2.1 (7B + 8B encoder, Sep 2026; non-commercial, unlike earlier
  Apache Qwen-Image releases) and FLUX 3 Image Klein (5.6B, Oct 2026; commercial use under US$5M revenue). The local
  mainstream on 8-16 GB cards is Z-Image-Turbo, FLUX.2 [klein] 4B and Krea 2 Turbo, with Qwen-Image-Edit-2511 as the
  Apache-licensed editor. Most 2026 models generate and edit in one checkpoint, use a Qwen3-VL text encoder, and
  recommend an extra language model that rewrites the prompt. FLUX.1 and FLUX.2 [dev] are superseded. ComfyUI's int8,
  nvfp4 and "dynamic VRAM" (weights streamed from system RAM) are why 20-33B models now run on 12 GB cards.
- **Video.** MiniMax H3 (Aug 2026) dominates downloads (Comfy-Org repo: 33M in 30 days) but grants no rights at all in
  the EU, UK, South Korea or USA. LTX-2.5 (Aug 2026, 22B) is the fast option with sound, free under US$10M revenue.
  Wan 2.2 (Jul 2025) is still the newest open Wan: Wan 2.5 to 3.0 are API-only. HunyuanVideo 1.5 excludes the EU, UK
  and South Korea. Kandinsky 6 (Oct 2026, MIT) is the only permissive family with sound. New models now make sound
  with the video. PAN 2 (MBZUAI, 29B, Apache) appeared mid-November and is a candidate for the next update.
- **Text-to-speech.** Fish Audio Drama 3 (Oct 2026, 35B mixture-of-experts) is the highest-rated open model on
  Artificial Analysis. New this autumn: ZONOS3-Mini (9 Nov 2026, Apache, 43 languages) and Gradium Phonon (Oct 2026,
  31M). Kokoro is still the most downloaded TTS model. llama.cpp and the new audio.cpp now run most TTS models; Ollama
  added speech in October 2026 (Phonon only). German and Swedish with commercial use allowed: Chatterbox Multilingual
  V3 (MIT), ZONOS3-Mini (Apache), VoxCPM2 (Apache), Supertonic 3 (OpenRAIL-M), Piper (per voice); OmniVoice and Fish
  S2 Pro cover both but are non-commercial.
- **Speech-to-text.** The Open ASR Leaderboard changed its average on 2 Nov 2026 (LibriSpeech dropped, noisy and
  private sets added), so blog numbers from before then are not comparable. NVIDIA Nemotron 3.5 Transcribe (Oct 2026)
  is the best open model on the multilingual and long-form tables; Qwen3-ASR-1.7B is level with it on English.
  Whisper large-v3-turbo is still the most used; OpenAI has released no newer open weights. For Swedish: Nemotron
  (7.3% WER) > Whisper turbo (8.7%) > Parakeet v3 (15.3%) > Qwen3-ASR (19.7%).

## `good_for` and `weak_at`: what each line rests on

| Entry | Evidence |
|---|---|
| MiniMax-H3-Image | #1 open model on Artificial Analysis (AA) text-to-image (Elo 1066) and editing (1135); card: up to 16 MP. |
| Qwen-Image-2.1 | AA #2 T2I; card and ComfyUI docs: RGBA output, up to 10-16 references, native 2K, text rendering. |
| FLUX 3 Image Klein | AA #3 T2I, #4 editing; card: instruction editing, 10 references. weak_at: mixed face/anatomy feedback in HF discussions (anecdotal). |
| HiDream-O1-Image | Card: unified model, long text rendering, no VAE or text encoder; AA 979 (below leaders). |
| Krea 2 Turbo | **Softened ("often praised")**: style and aesthetics praise comes from HF discussions and Comfy usage; no AA rating yet. |
| Ideogram 4 | Lab positioning ("best-in-class text and typography", JSON layout, hex palettes); AA #5. |
| Z-Image-Turbo | 811k HF downloads in 30 days (highest of the efficient models); card: 8 steps. weak_at (seed variety): community reports. |
| FLUX.2 [klein] 4B | ComfyUI docs 1.2 s; AA T2I 840 / editing 941; Apache-2.0. |
| Qwen-Image-Edit-2511 | Card: person and product consistency, text editing; 1.9M Comfy downloads in 30 days. |
| SDXL | Size of the add-on ecosystem (common knowledge, HF downloads); 2024 ComfyUI benchmarks for low-end GPUs. |
| MiniMax H3 | HF downloads (most used); card: audio with dialogue in 11 languages. |
| LTX-2.5 | "Fastest large model here" is derived from the speed references in this file (49 s for a 10 s clip on an RTX 5090). |
| Wan 2.2 A14B | Download counts and the number of LoRAs/workflows built on it (Comfy-Org, Kijai, lightx2v). |
| Wan 2.2 TI2V-5B | ComfyUI docs (8 GB with offload); vendor speed table. |
| HunyuanVideo 1.5 | Card: glyph encoder for in-scene text; step-distilled 480p I2V. |
| Kandinsky 6 Lite / Pro | Card: audio incl. lip-sync, MIT. **Softened**: Pro "beats LTX-2.5" is the lab's own comparison. |
| Piper | Voice list (de_DE, sv_SE and ~50 languages); sherpa-onnx Pi 4 timing. |
| Kokoro | Open TTS Leaderboard: top UTMOS naturalness (4.51); 54 voices per card. |
| Phonon 31M | Open TTS Leaderboard CPU tab (16x real time); AA Elo 1110, above Fish S2 Pro and Kokoro. |
| Pocket TTS | Kyutai README (CPU cloning); language list. |
| Supertonic 3 | Card: 31 languages incl. de, sv; ONNX/browser runtimes. |
| Chatterbox Multilingual V3 | Card: 23 languages, 10 s cloning, exaggeration control. **Softened weak_at**: the poor German WER may have been V2. |
| ZONOS3-Mini | Open TTS Leaderboard German set: 2nd-lowest WER (1.22), lowest among commercially usable models; audio.cpp M3 CPU timing. |
| OmniVoice | Card: 600+ languages; authors tested a 4 GB Intel Arc A310. |
| Qwen3-TTS 1.7B | Card: VoiceDesign and 3 s cloning; faster-qwen3-tts table for the stock-code speed. |
| VoxCPM2 | Card: 48 kHz, 30 languages, voice design. weak_at: one independent test (Open TTS Leaderboard, A100) vs vendor figure. |
| Fish S2 Pro | Card: inline tags and multi-speaker dialogue. |
| Fish Drama 3 | AA: highest-rated open-weight model (Elo 1279, #7 overall); card: up to 16 speakers. |
| Moonshine | Paper: 0.15 s delay on an Apple M3 CPU; streaming design. |
| Parakeet v3 | Leaderboard RTFx and onnx-asr CPU timings; FLEURS Swedish 15.1% (card). |
| Whisper turbo | Most downloaded ASR model; transcribe.cpp FLEURS Swedish 8.7%. |
| Qwen3-ASR-1.7B | Leaderboard English 6.15%, German 3.88%; card: singing/songs. Swedish 19.7% (transcribe.cpp, community). |
| Nemotron 3.5 Transcribe | Leaderboard: best open multilingual (4.50%) and long-form; card: speaker labels, 1 h per pass, 40 languages. |

## `activation_gb_at_typical`: how each number was obtained

"Derived" = a measured peak minus the weight files that were loaded at the time. "Estimate" = my judgement from token
counts and from what is reported to fit on which card; treat these as +/- 50%.

| Entry | GB | Basis |
|---|---|---|
| minimax-h3-image | 3 | Estimate. 4 MP is only about 4,100 tokens (32x32 px per token); no measurement. |
| qwen-image-2.1 | 4.7 | Derived: Diffusers fp8 peak 21.3 GB minus 16.6 GB of weights (HF discussion #32). Includes the text encoder kept resident and the CUDA context, so ComfyUI is likely lower. 4 MP: 6.0 GB. |
| flux3-image-klein | 2 | Estimate: BFL says the 5.8 GB int8 build runs on 8 GB cards. BFL's own B200 Diffusers peaks are about 11 GB above weights (no memory saving). |
| hidream-o1-image | 3 | Estimate (pixel-space model at 4 MP). |
| krea-2-turbo | 1.5 | Estimate. |
| ideogram-4 | 2.5 | Estimate (2.2 MP). |
| z-image-turbo | 1.5 | Estimate. |
| flux2-klein-4b | 0.6 | Derived: ComfyUI docs peak 8.4 GB minus 7.8 GB bf16 model (text encoder unloaded). |
| qwen-image-edit-2511 | 3 | Estimate (output plus one reference image, about 8,000 tokens). |
| sdxl-base-1.0 | 1.5 | Estimate (fits 8 GB with a 5.1 GB UNet). |
| minimax-h3 | 5 | Estimate (about 31,000 tokens at 1344x768, 4.5 s). |
| ltx-2.5 | 3 | Estimate (int8 21.5 GB model runs on 24 GB cards in ComfyUI). |
| wan2.2-a14b | 4 | Estimate (480p, about 33,000 tokens, one 14B expert; fp8 runs 720p on 24 GB cards). |
| wan2.2-ti2v-5b | 3 | Estimate. Alibaba's 22.9 GB peak (10 GB of weights) includes an untiled VAE decode. |
| hunyuanvideo-1.5 | 3 | Estimate (480p, about 49,000 tokens, hidden size 2048). |
| kandinsky-6-lite | 2.5 | Estimate; the vendor ran it on a 16 GB card with a 4-bit text encoder. |
| kandinsky-6-pro | 5 | Estimate. |
| piper-voices | 0.2 | Estimate (system RAM). |
| kokoro-82m | 0.5 | Estimate. |
| phonon-31m-en | 0.2 | Estimate. |
| pocket-tts | 0.5 | Estimate (system RAM; audio.cpp measured about 2 GB GPU peak including the CUDA context). |
| supertonic-3 | 0.3 | Estimate. |
| chatterbox-multilingual-v3 | 1 | Estimate (NVIDIA ACE card: about 3.5 GB for the TTS part in total). |
| zonos3-mini | 0.7 | Derived: audio.cpp peak RSS 2.06 GiB on Apple M3 minus about 1.5 GB of files. |
| omnivoice | 1.5 | Derived: audio.cpp peak 3.1-3.3 GB minus 1.64 GB. |
| qwen3-tts-1.7b | 3.4 | Derived: audio.cpp peak 7.9 GB minus 3.86 GB model and 0.68 GB codec. |
| voxcpm2 | 3 | Derived: vendor "about 8 GB" minus 4.96 GB of files. |
| fish-s2-pro | 1 | Derived: audio.cpp peak 12.1 GB minus 9.13 GB model and 2.05 GB decoder file. |
| fish-drama-3 | 3 | Estimate. MLX 4-bit peaks at 28.7 GB with about 22.5 GB of files, so Macs may need up to 6 GB. |
| moonshine-streaming-small | 0.2 | Estimate. |
| parakeet-tdt-0.6b-v3 | 1 | Estimate for 60 s; grows faster than linearly with file length (full attention over the file). |
| whisper-large-v3-turbo | 1 | Estimate; faster-whisper's large-v2 fp16 run used about 1.4 GB beyond its weights. Constant per 30 s window. |
| qwen3-asr-1.7b | 1 | Estimate (about 1,100 tokens for 60 s). |
| nemotron-3.5-transcribe-30b-a4b | 1 | Estimate; NVIDIA gives about 0.5 GB of cache per hour of audio. |

## Image generation and image editing

### Landscape details

- Ranking used: Artificial Analysis, open-weights filter, text-to-image (AA-Image-T2I v2.1) and image editing pages.
  Top open text-to-image: MiniMax H3-Image 1066, Qwen-Image-2.1 1047, FLUX 3 Image Klein 1041, Fibo 2.0 1037,
  Ideogram 4.0 (Quality) 1026. FLUX.2 [dev] is the fixed 1000 anchor. Top open editing: H3-Image 1135, Fibo 2.0 1086,
  Qwen-Image-2.1 1082, FLUX 3 Image Klein 1069, HunyuanImage 3.0 Instruct 1064.
  Sources: https://artificialanalysis.ai/image/leaderboard/text-to-image/open-weights ,
  https://artificialanalysis.ai/image/leaderboard/editing (the page shows no "last updated" date).
  The best open model sits around overall rank 27 (T2I) and 14 (editing); closed models still lead.
- Most new models do generation and editing in one checkpoint (H3-Image, Qwen-Image-2.1, FLUX 3 Image Klein,
  HiDream-O1, FLUX.2 klein). The schema has one `kind`, so I used "image-edit" only where the model card leads with
  editing (FLUX 3 Image Klein) or the model only edits (Qwen-Image-Edit-2511). Entries that also edit say
  "Also edits images" in `output_limits`. The merged file has a boolean `also_edits`, true for
  minimax-h3-image, qwen-image-2.1, flux3-image-klein, hidream-o1-image, flux2-klein-4b, qwen-image-edit-2511.
- Licenses got more restrictive. Qwen-Image-2.1 moved from Apache-2.0 (earlier Qwen-Image) to a non-commercial
  research license. MiniMax-H3-Image excludes the EU, UK, South Korea and the USA. FLUX 3 Image Klein and Krea 2 allow
  commercial use only under a revenue cap ($5M and $1M). Fully permissive picks: HiDream-O1 (MIT), Z-Image-Turbo,
  FLUX.2 klein 4B, Qwen-Image-Edit-2511 (Apache-2.0), SDXL (OpenRAIL++).
- ComfyUI now ships its own quant formats in Comfy-Org repos: int8 "ConvRot" (rotation before int8, works on RTX 30
  cards), w4a8, nvfp4 (RTX 50 only), mxfp8, fp8_scaled. Its "dynamic VRAM" streams weights from system RAM, which is
  why a 33B model ran on a 12 GB card. Many models also require or recommend an LLM "prompt upsampler/enhancer"
  (FLUX 3 klein: required, 9B; H3-Image: recommended, 27B; Qwen-Image-2.1, HiDream-O1: optional).
- Extra keys in `weights_gb_by_precision` beyond the schema example: `int8` (ComfyUI int8 ConvRot files), `w4a8`,
  `mxfp8`, `nf4`, `fp16`, `fp32`. Sizes are the main model only, GB = 1e9 bytes.

### Selection rationale and tier spread

10 entries, ordered from largest to smallest.

| VRAM tier | Entries |
|---|---|
| 48-80 GB (or 12 GB + 64-96 GB RAM) | MiniMax-H3-Image |
| 24-32 GB | Qwen-Image-Edit-2511 (fp8), Ideogram 4, Qwen-Image-2.1 / HiDream-O1 / Krea 2 / FLUX 3 klein at bf16 |
| 16 GB | Qwen-Image-2.1 int8, HiDream-O1 fp8, Z-Image-Turbo, Krea 2 fp8 |
| 8 GB | FLUX 3 Image Klein int8, Z-Image-Turbo fp8/GGUF, FLUX.2 klein 4B, Krea 2 (with RAM offload) |
| 4-6 GB | SDXL, FLUX.2 klein 4B (GGUF, estimate) |

- MiniMax-H3-Image, Qwen-Image-2.1, FLUX 3 Image Klein: the three highest-ranked open models, each from a lab with a
  track record, and all with native ComfyUI templates.
- Ideogram 4: #5, the text and typography specialist (non-commercial).
- HiDream-O1-Image: the strongest model with a fully permissive license (MIT) in the 16-24 GB range.
- Krea 2 Turbo: very popular in ComfyUI (Comfy-Org/Krea-2: 4.5M downloads/30 d, though that repo also hosts a shared
  text encoder), commercial use for small businesses; not yet ranked by AA.
- Z-Image-Turbo: the most-used efficient model (811k HF downloads/30 d), Apache-2.0.
- FLUX.2 klein 4B: smallest modern Apache-2.0 model that also edits.
- Qwen-Image-Edit-2511: the standard Apache-2.0 editor; still 1.9M Comfy downloads/30 d.
- SDXL: lowest tier and add-on ecosystem; clearly older.
- Distilled variants are folded into their base entries (Qwen-Image-2.1-Turbo, Krea 2 Raw vs Turbo, FLUX 3 klein base vs
  distilled, HiDream-O1 Dev) rather than given separate entries.

### Per-model sources and uncertain fields

#### MiniMax-H3-Image (MiniMaxAI/MiniMax-H3-Image)
- Card: https://huggingface.co/MiniMaxAI/MiniMax-H3-Image (33.1B DiT, 6 steps, 16 MP, up to 16 references, runtimes).
- License: https://huggingface.co/MiniMaxAI/MiniMax-H3-Image/blob/main/LICENSE (Excluded Territories = EU, UK, Republic
  of Korea, USA; Section IV: >$1M revenue or hosted service needs written authorization).
- ComfyUI: https://docs.comfy.org/tutorials/image/minimax/minimax-h3-image , https://huggingface.co/Comfy-Org/MiniMax-H3-Image
- Speed/VRAM: https://huggingface.co/Comfy-Org/MiniMax-H3-Image/discussions/12 (RTX 4070 SUPER 12 GB, 96 GB RAM).
  int8 vs w4a8 advice: https://huggingface.co/Comfy-Org/MiniMax-H3-Image/discussions/20
- GGUF: unsloth/MiniMax-H3-Image-GGUF.
- Uncertain: what Comfy's "pruned" DiT removes (40.2 GB bf16, about 20B stored params vs 33.1B official) and why its
  text encoder files are smaller than the official one (int8 27.1 GB; Comfy's bf16 copy 51.5 GB vs 66.7 GB official; probably layers the DiT does not read are dropped);
  comfortable VRAM (estimate); speed is one report; no RTX 4090/5090 figure found.

#### Qwen-Image-2.1 (Qwen/Qwen-Image-2.1)
- Card: https://huggingface.co/Qwen/Qwen-Image-2.1 ; Turbo: https://huggingface.co/Qwen/Qwen-Image-2.1-Turbo
- License: https://huggingface.co/Qwen/Qwen-Image-2.1/blob/main/LICENSE ("Non-Commercial shall mean for research or
  evaluation purposes only"). The lead was right: non-commercial.
- ComfyUI: https://docs.comfy.org/tutorials/image/qwen/qwen-image-2-1 (0.3 s/it at 1 MP vs 6 s/it at 12 MP on RTX 5090;
  2K native; 25-step template, 8-step Turbo), https://huggingface.co/Comfy-Org/Qwen-Image-2.1
- Speed/VRAM: https://huggingface.co/Qwen/Qwen-Image-2.1/discussions/32 (RTX 5090, Diffusers, fp8/NF4 peaks and times);
  https://huggingface.co/Qwen/Qwen-Image-2.1/discussions/35 (RTX 4060 Ti 16 GB, int8, no offload).
- GGUF: unsloth/Qwen-Image-2.1-GGUF, unsloth/Qwen-Image-2.1-Turbo-GGUF; sd.cpp: leejet/Qwen-Image-2.1-GGUF; MLX:
  mflux README lists Qwen Image 2.1.
- Uncertain: 8 GB minimum (estimate). Reference image limit: card says 10, ComfyUI docs say 16.

#### FLUX 3 Image Klein (black-forest-labs/flux-3-image-klein)
- Card: https://huggingface.co/black-forest-labs/flux-3-image-klein (5.6B label, 16-step distilled, peak memory on B200,
  upsampler "always run").
- Blog: https://bfl.ai/blog/flux-3-image-klein (dated 15 Oct 2026; ~4 s on RTX 5090 int8 1 MP, under 9 s on RTX 4070;
  8 GB VRAM claim; "free commercial use ... under $5M").
- License: https://huggingface.co/black-forest-labs/flux-3-image-klein/blob/main/LICENSE.md (FLUX Kommunity License v1.0;
  Qualifying User < US$5M gross annualized revenue incl. affiliates; content filter or output review required).
- ComfyUI: https://huggingface.co/black-forest-labs/flux-3-image-klein-comfy ("int8 files run on 8 GB GPUs such as the
  RTX 3070, and on GPUs without FP8 support ... NVFP4 needs a Blackwell GPU"), https://docs.comfy.org/tutorials/flux/flux-3-klein
- GGUF: unsloth/flux-3-image-klein-GGUF; sd.cpp: leejet/flux-3-image-klein-GGUF; mflux README lists it.
- Uncertain: no independent speed report found (vendor figures only); time added by the prompt upsampler; maximum output
  resolution not stated; user feedback on faces is mixed (HF discussions #8, #15, #35, #37).

#### HiDream-O1-Image (HiDream-ai/HiDream-O1-Image)
- Card: https://huggingface.co/HiDream-ai/HiDream-O1-Image (MIT, pixel-level, 2048x2048, 50/28 steps).
- ComfyUI: https://docs.comfy.org/tutorials/image/hidream/hidream-o1 , https://huggingface.co/Comfy-Org/HiDream-O1-Image
- Speed/VRAM: https://huggingface.co/Comfy-Org/HiDream-O1-Image/discussions/10 (RTX 4060 Ti 16 GB, 2048x2048, 12 steps).
- Uncertain: 12 GB minimum (estimate); speed at official step counts (extrapolated); GGUF loader support.
- The lead claim that it was "#1 on Artificial Analysis in July 2026" may reflect an older board version; on the
  current board the Dev-2604 variant is absent and the full model scores 979.

#### Krea 2 Turbo (krea/Krea-2-Turbo)
- Card: https://huggingface.co/krea/Krea-2-Turbo (12B, 8 steps, release 22 Jun 2026, Diffusers Krea2Pipeline, SGLang).
- License PDF (extracted text): https://cdn.jsdelivr.net/gh/krea-ai/krea-2@db3984fbc6e13b34c0064990fc2d95ac64d00058/assets/hf_samples/LICENSE.pdf
  Section 2.3: commercial use only if total annual revenue < US$1,000,000. No territory clause found.
- ComfyUI: https://docs.comfy.org/tutorials/image/krea/krea-2 , https://huggingface.co/Comfy-Org/Krea-2
- Speed/VRAM: https://huggingface.co/Comfy-Org/Krea-2/discussions/25 (RTX 5080), https://huggingface.co/krea/Krea-2-Turbo/discussions/2
  (8 GB cards, 3060 Ti 3.9 s/step, M1 Pro 146 s, RX 9070 XT 9 s).
- GGUF: vantagewithai/Krea-2-Turbo-GGUF. mflux README lists Krea 2.
- Uncertain: no AA ranking; comfortable VRAM (estimate).

#### Ideogram 4 (ideogram-ai/ideogram-4-fp8)
- Card: https://huggingface.co/ideogram-ai/ideogram-4-fp8 (9.3B, fp8 and nf4 only, Qwen3-VL-8B encoder, 256-2048 px).
- Inference presets: https://github.com/ideogram-oss/ideogram4/blob/main/docs/inference.md (48 / 20 / 12 steps).
- License: https://huggingface.co/ideogram-ai/ideogram-4-fp8/blob/main/LICENSE.md (generating output for revenue-generating
  products is not a Non-Commercial Purpose).
- ComfyUI: https://docs.comfy.org/tutorials/image/ideogram/ideogram-v4 , https://huggingface.co/Comfy-Org/Ideogram-4
- Speed: https://huggingface.co/Comfy-Org/Ideogram-4/discussions/6 (RTX 5090, 2048x1088, fp8, 1.7-2.6 s/step).
- Uncertain: 16 GB minimum (estimate from users mentioning 4060 Ti 16 GB); ComfyUI docs list the diffusion model as about
  13.8 GB, which does not match the 9.3 GB fp8 file on HF (docs may refer to an older file).

#### Z-Image-Turbo (Tongyi-MAI/Z-Image-Turbo)
- Card: https://huggingface.co/Tongyi-MAI/Z-Image-Turbo (6B, 8 NFEs, "fits comfortably within 16G VRAM", Edit and Omni-Base
  "to be released").
- ComfyUI: https://docs.comfy.org/tutorials/image/z-image/z-image-turbo , https://huggingface.co/Comfy-Org/z_image_turbo
- Speed: https://comfyui-wiki.com/en/news/2025-11-27-alibaba-z-image-turbo-release (2.3 s RTX 4090; origin not traceable;
  other sites give 2-4 s). 8 GB report: runaihome / dev.to guides (low trust). Mac: https://huggingface.co/Tongyi-MAI/Z-Image-Turbo/discussions/169
- GGUF: unsloth/Z-Image-Turbo-GGUF; sd.cpp: leejet/Z-Image-Turbo-GGUF; mflux README lists Z-Image; SGLang cookbook exists
  (lmsysorg docs, not opened).
- Uncertain: speed source quality; 8 GB minimum (community, not verified first-hand).

#### FLUX.2 [klein] 4B (black-forest-labs/FLUX.2-klein-4B)
- Card: https://huggingface.co/black-forest-labs/FLUX.2-klein-4B (Apache-2.0, ~13 GB VRAM, 4 steps, Flux2KleinPipeline).
- ComfyUI: https://docs.comfy.org/tutorials/flux/flux-2-klein ("distilled ~1.2s (5090) · 8.4GB VRAM; base ~17s (5090) · 9.2GB VRAM").
- Quant repos: black-forest-labs/FLUX.2-klein-4b-fp8, black-forest-labs/FLUX.2-klein-4b-nvfp4, unsloth/FLUX.2-klein-4B-GGUF,
  leejet/FLUX.2-klein-4B-GGUF. Mac: https://huggingface.co/black-forest-labs/FLUX.2-klein-4B/discussions/19
- Uncertain: 6 GB minimum (estimate); resolution behind the 1.2 s figure.

#### Qwen-Image-Edit-2511 (Qwen/Qwen-Image-Edit-2511)
- Card: https://huggingface.co/Qwen/Qwen-Image-Edit-2511 (Apache-2.0, QwenImageEditPlusPipeline, 40 steps, true_cfg 4).
- ComfyUI: https://docs.comfy.org/tutorials/image/qwen/qwen-image-edit-2511 , https://huggingface.co/Comfy-Org/Qwen-Image-Edit_ComfyUI
- Speed: https://huggingface.co/ANXS1/Qwen-Image-Edit-2511-NVFP4 (RTX 5090, 832x1280, 4 steps).
- GGUF: unsloth/Qwen-Image-Edit-2511-GGUF; MLX: mflux-community/qwen-image-edit-2511-mflux-q8/q4.
- Uncertain: both VRAM figures are estimates; 40-step timing is extrapolated.

#### Stable Diffusion XL 1.0 (stabilityai/stable-diffusion-xl-base-1.0)
- Repo sizes via HF API; license openrail++ (CreativeML Open RAIL++-M).
- Speed: https://github.com/comfyanonymous/ComfyUI/discussions/2970 (SDXL 1024x1024, 20 steps, second run).
- Uncertain: 4 GB minimum (common practice, not verified here).

### Notable models left out, and why

- FLUX.2 [dev] (32B + 24B Mistral text encoder, 64 GB bf16, non-commercial): superseded by FLUX 3 Image Klein, which scores
  higher on both AA boards at about 1/6 the size. Still 286k downloads/30 d, so the builder may want it as a footnote.
- FLUX.2 [klein] 9B: non-commercial, below FLUX 3 klein. FLUX.1 [dev]/[schnell]/Kontext [dev]/Krea [dev]: superseded
  (AA T2I 816/743/-/870; Kontext editing 883).
- Fibo 2.0 (Bria, 8.1B, CC BY-NC 4.0): strong (#4 T2I, #2 editing) but non-commercial and in the same size class as
  Qwen-Image-2.1, which already covers that slot. Worth adding if a 12th entry is wanted (Comfy-Org/Fibo-2.0 has
  int8 8.4 GB files and an edit-turbo checkpoint).
- Qwen-Image-2512 (20B, Apache-2.0): permissive but older and large; HiDream-O1 and Z-Image cover permissive generation
  better per GB. AA lists only the original Qwen Image (908).
- HunyuanImage 3.0 / 3.0-Instruct (Tencent, 83B total MoE, 168.5 GB bf16): multi-GPU only; custom Tencent license (lead
  says it excludes the EU/UK/South Korea; I did not re-read it).
- NVIDIA Cosmos3-Super-Text2Image (64.6B, 128 GB bf16, OpenMDW-1.1 license): too large for the target hardware, low
  adoption (1.8k downloads/30 d), no ComfyUI template found.
- Ming-Image-0.1-Design (inclusionAI, MIT, AA 1001): specialised for design layouts with RGBA; 34 GB repo with a custom
  library; not checked in depth.
- ERNIE-Image / Turbo (Baidu, 8B, Apache-2.0): AA 909-915, below Z-Image-Turbo, low downloads (under 3k/30 d).
- MOSS-Image (OpenMOSS, 5B, Apache-2.0, Oct 2026), Boogu-Image-0.1 (10B, Apache-2.0), Microsoft Lens (3.8B), Microsoft
  Mage-Flow (4B): new, have ComfyUI templates, but not yet on the AA board, so quality is unverified. MOSS-Image is the one
  to re-check next (users in the FLUX 3 klein discussions praise it).
- P-H3-Image (Pruna AI's 8-step derivative of MiniMax H3): third-party derivative.
- Z-Image-Edit and Z-Image-Omni-Base: announced in the Z-Image card, still not released (HF repos return 401).
- SD 3.5 Medium/Large: Stability Community License (free under $1M revenue), quality surpassed by Z-Image-Turbo and
  FLUX.2 klein at similar size. NVIDIA Sana / Sana-Sprint: not on the current AA board; the NVIDIA lab (Efficient-Large-Model)
  has moved on to video models.
- API-only models (GPT Image 2.x, Nano Banana, Seedream, MAI-Image, Kling Image) are not open weights.

### How memory and speed really scale (rules of thumb for the calculator)

#### Memory
1. **Total ≈ DiT weights + text encoder + VAE + prompt LLM (if used) + activations.** The text encoder and the prompt
   LLM run before sampling, so ComfyUI can unload them; then peak ≈ max(encoder, DiT + activations).
   Source: ComfyUI docs and Comfy repo notes (e.g. H3 "expander fits beside the 21 GB diffusion model").
2. **Bytes per parameter (measured from the files above):** bf16 2.0; fp8 / int8 ConvRot about 1.0-1.05;
   Q8_0 GGUF about 1.1-1.2; nvfp4 0.6-1.0 (many layers kept at higher precision; FLUX.2 klein 4B 0.63, FLUX 3 klein
   0.95); Q4_K_M GGUF about 0.6-0.65; w4a8 about 0.6. Sources: HF file listings via the HF API.
3. **Activations grow with pixel count and reference images.** Measured: Qwen-Image-2.1 fp8 with 16.6 GB of weights
   peaked at 21.3 GB at 1 MP, 22.6 GB at 4 MP, and 25.6 GB with two reference images.
   Source: https://huggingface.co/Qwen/Qwen-Image-2.1/discussions/32 . FLUX 3 klein peaked at 31 GB in bf16 at 1 MP with
   about 20 GB of weights resident (BFL card). Rule: add 3-6 GB at 1-4 MP, more for edits with several references.
4. **Offloading saves VRAM but needs system RAM.** ComfyUI "dynamic VRAM" streamed a 21 GB DiT on a 12 GB
   card using about 41 GB of system RAM (H3-Image report). Rule: system RAM ≥ total model files + about 8 GB. With fast
   async offload, smaller weight formats save RAM more than time (Kijai, H3 discussion #20).
5. **Format support by GPU generation:** fp8 compute needs RTX 40 or newer; int8 ConvRot works on RTX 30 and on AMD;
   nvfp4 needs RTX 50 (Blackwell). Source: FLUX 3 klein Comfy card; AMD notes in the Krea 2 discussion.
6. **Apple Silicon** uses unified memory, so "VRAM" = a share of system RAM. Supported via mflux (Z-Image, Krea 2, FLUX.2,
   FLUX 3 klein, Ideogram 4, Qwen Image / 2.1; README https://github.com/filipstrand/mflux) and Draw Things.

#### Speed
1. **Time ≈ steps x per-step cost + text encoding + VAE decode + prompt-LLM time.** Distilled models use 4-16 steps,
   base models 25-50. Sources: model cards (steps per checkpoint).
2. **Guidance (CFG) doubles per-step cost** because the model runs twice per step (Qwen-Image-Edit-2511 at true_cfg 4,
   Ideogram 4 with a separate unconditional transformer, SDXL). Distilled models run at CFG 1 (one pass).
   Source: model cards; Ideogram discussion #6.
3. **Per-step cost grows at least in line with pixel count, often faster.** Qwen-Image-2.1: 4x pixels → 6x time
   (19.3 s → 115.7 s), and 12x pixels → 20x per-step time (ComfyUI docs). H3-Image: 4x pixels → about 4x time (its
   coarse 32x32-pixel tokens keep attention small). Rule: time ∝ (pixels)^1.0-1.3; use 1.3 for 1-4 MP models above
   2 MP, 1.0 for H3-Image.
4. **Reference images in edits add tokens like extra output pixels.** H3-Image: one 4 MP reference raised the step
   time from 1.1 s to 1.7 s. Qwen-Image-2.1: shrinking references from 12 MP to 1 MP cut step time from 6 s to 0.3 s
   (ComfyUI docs).
5. **Precision affects speed less than you might think** unless the GPU has native support: on an RTX 4060 Ti, fp8
   was 18% faster than bf16 and mxfp8 was 16% slower (HiDream-O1 discussion #10); on Blackwell, nvfp4 can be 2.5x faster
   when the file is set up correctly (Krea 2 discussion #25).
6. **GPU scaling reference (same model, measured):** SDXL 20 steps 1024x1024: RTX 4090 3.1-3.6 s, RTX 3090 6.2 s,
   RTX 4070 7.1 s, RTX 4060 15.9 s (ComfyUI GitHub #2970). So RTX 3090 ≈ 0.5x, RTX 4070 ≈ 0.45x, RTX 4060 ≈ 0.2x the
   RTX 4090. An M6 Mac mini ran Z-Image-Turbo about 15x slower than an RTX 4090 (37-40 s vs 2.3 s).
7. **First run is slower** (model loading): about 2x for H3-Image on a 12 GB card.

## Video generation

All sizes in GB = 1e9 bytes, from the hfinfo helper or the HF tree API, unless marked otherwise.

### Sources per model

#### MiniMax H3 (`minimax-h3`)
- Model card: https://huggingface.co/MiniMaxAI/MiniMax-H3 (33B dense, ~13B in precomputable AdaLN branches; CFG-distilled checkpoints; f16t4 VAE + 1x2x2 patch; 768p, 24 fps, 4-15 s, 32 kHz stereo, 11 dialogue languages; H3-Context-IR and Regenerate-2K are API-only)
- License: https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/LICENSE ("Excluded Territories" = EU, UK, Republic of Korea, USA; $20M yearly revenue threshold; must display "MiniMax H3") and https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/docs/QA-about-License.md
- Paid licence for excluded territories: https://comfy.org/minimax/license , https://support.comfy.org/articles/6065098425-minimax-commercial-licensing-who-needs-a-license-and-how-to-get-one (Comfy is reseller; Professional tier "from $5,000 / month", per search summary of Comfy's pricing page)
- ComfyUI: https://docs.comfy.org/tutorials/video/minimax/minimax-h3 , https://docs.comfy.org/tutorials/video/minimax/minimax-h3-native (files, 1344x768 native, 20-25 steps, turbo 8/4 steps, 17k+5 frames), blog https://blog.comfy.org/p/minimax-h3-day-0-support-in-comfyui (2026-08-03; "can run locally on a 3060"; 123.6 GB full precision -> 42.5 GB smallest variants)
- Weight files: Comfy-Org/MiniMax-H3, unsloth/MiniMax-H3-GGUF, leejet/MiniMax-H3-GGUF, Abiray/Minimax-H3-nvfp4-INT4-INT8-Convrot, lightx2v/Minimax-h3-Turbo
- Speed + VRAM: SGLang cookbook https://docs.sglang.io/cookbook/diffusion/MiniMax/MiniMax-H3 (RTX 4090: 1344x768, 107 frames, 20 steps: bf16+FA 405.6 s, int8+sage 174.9 s, GPU peak ~18 GB with layerwise offload; RTX 5090 single card, 60 GB host RAM: 864x480, 124 frames, 20 steps, unpruned bf16, 112 s, ComfyUI on same machine ~146 s; FastH3 on 4x GB300: 5/10/15 s = 5.20/10.74/18.24 s)
- Community VRAM tiers: https://comfyui-wiki.com/en/news/2026-08-03-minimax-h3-community-quants (16 GB = GGUF Q3/Q4 or pruned int4; 24 GB = GGUF Q5 or pruned int8)
- WanGP 8 GB claim: https://github.com/deepbeepmeep/Wan2GP (v20.00 notes, 12 Nov 2026)

#### LTX-2.5 (`ltx-2.5`)
- Model card (gated): https://huggingface.co/Lightricks/LTX-2.5 (file list, distilled 8-step CFG=1, frames 8k+1, sides /32, low-VRAM flags `--quantization fp8-cast --offload cpu`)
- License: https://github.com/Lightricks/LTX-2/blob/main/LICENSE-2_x ($10,000,000 annual revenue threshold, whole entity; no territory clause found)
- Official system requirements: https://docs.ltx.io/open-source-model/getting-started/system-requirements.md (min 32 GB+ VRAM, 32 GB RAM; recommended A100 80 GB/H100, 64 GB+ RAM)
- GitHub: https://github.com/Lightricks/LTX-2 (DistilledPipeline 8 + 4 steps; DFR default 1024x1536)
- ComfyUI: https://docs.comfy.org/tutorials/video/ltx/ltx-2-5 , blog https://blog.comfy.org/p/ltx-25-day-0-support-in-comfyui (2026-08-12; API Fast 2-20 s, Pro 2-10 s)
- Release date 2026-08-11 (several news sources, e.g. https://comfyui-wiki.com/en/news/2026-08-11-ltx-2-5-open-weights-release); HF repo created 2026-07-23 (gated before launch)
- Speed: https://cosmo-edge.com/ltx-2-5-rtx-5090-benchmark-comfyui/ (RTX 5090, distilled int8, 1280x736, 10 s, 5 runs avg 48.75 s); https://huggingface.co/Lightricks/LTX-2.5/discussions/106 (RTX 3060 12 GB, 32 GB RAM, ComfyUI low-VRAM, distilled int8, 121 frames: 720p 3:14 int8 / 4:06 bf16; 480p 4 steps 1:39, 8 steps 2:26)
- Weight files: Lightricks/LTX-2.5, unsloth/LTX-2.5-GGUF, unsloth/LTX-2.5-FP8

#### Wan 2.2 A14B (`wan2.2-a14b`) and TI2V-5B (`wan2.2-ti2v-5b`)
- Model cards: https://huggingface.co/Wan-AI/Wan2.2-T2V-A14B , https://huggingface.co/Wan-AI/Wan2.2-I2V-A14B , https://huggingface.co/Wan-AI/Wan2.2-TI2V-5B (Apache 2.0)
- Defaults from code: https://github.com/Wan-Video/Wan2.2/tree/main/wan/configs (A14B: 40 steps, guide scale 3/4, VAE stride 4x8x8, patch 1x2x2, 81 frames @16 fps; 5B: 50 steps, 121 frames @24 fps, VAE 4x16x16)
- Official speed/memory table (image): https://github.com/Wan-Video/Wan2.2/blob/main/assets/comp_effic.png (RTX 4090 TI2V-5B 720p: 534.7 s / 22.9 GB; H100 A14B 480p 326.9 s / 41.3 GB, 720p 1041.5 s / 59.8 GB; H20 and A100 rows too)
- ComfyUI: https://docs.comfy.org/tutorials/video/wan/wan2_2.md ("5B should fit well on 8GB vram with the ComfyUI native offloading")
- RTX 5090 timings: https://huggingface.co/lightx2v/LightWan2.2-A14B (baseline 40 steps: T2V 480p 734 s, 720p 2668 s; I2V 787 / 2685 s; 4-step NVFP4 sparse 9.1-26.7 s)
- 8 GB community reports: https://lilting.ch/en/articles/wan22-comfyui-rtx4060-i2v (RTX 4060 8 GB, distilled 14B, 111 s/clip), guides citing Q4 GGUF on 8 GB (runflow.io, aistudynow.com; SEO-ish, consistent)
- Apple: https://lilting.ch/en/articles/ltx2-wan22-mac-local-video-gen (M1 Max 64 GB, Wan 2.2 GGUF, 82 min per 2 s clip), https://github.com/Blaizzy/mlx-video (Wan 2.2 T2V-14B, TI2V-5B, I2V-14B), Draw Things App Store listing (Wan 2.2, LTX-2.3)
- Weight files: Comfy-Org/Wan-2.2, QuantStack/Wan2.2-*-GGUF, Kijai/WanVideo_comfy_fp8_scaled (5B fp8)

#### HunyuanVideo 1.5 (`hunyuanvideo-1.5`)
- Model card: https://huggingface.co/tencent/HunyuanVideo-1.5 (8.3B; 16x spatial / 4x temporal VAE; 14 GB min with offload; step-distilled 480p I2V "within 75 seconds" on a single RTX 4090; CFG-distilled 2x; sparse attention 1.5-2x on H-series; WanGP "as low 6 GB")
- Transformer config (patch_size 1): https://huggingface.co/hunyuanvideo-community/HunyuanVideo-1.5-Diffusers-480p_t2v/blob/main/transformer/config.json
- License: https://github.com/Tencent-Hunyuan/HunyuanVideo-1.5/blob/master/LICENSE (Territory excludes EU, UK, South Korea; >100M MAU needs licence)
- ComfyUI: https://docs.comfy.org/tutorials/video/hunyuan/hunyuan-video-1-5.md (24 GB target, 720p native, 5-10 s)
- Weight files: Comfy-Org/Hunyuan-Video-1.5, jayn7/HunyuanVideo-1.5_I2V_720p-GGUF

#### Kandinsky 6.0 Video Lite / Pro (`kandinsky-6-lite`, `kandinsky-6-pro`)
- Model cards: https://huggingface.co/kandinskylab/Kandinsky-6.0-Lite-5s-Diffusers (MIT; 3B Lite / 29B Pro; 5 s with 44 kHz audio; Diffusers example 480x864, 121 frames, 50 steps, fps 24), https://huggingface.co/kandinskylab/Kandinsky-6.0-Pro-5s-Diffusers (gated auto)
- GitHub with per-GPU timing table and offload settings: https://github.com/kandinskylab/kandinsky-6 (RTX 4090 / 5060 Ti / 5090 / A100 / H100; Lite Distill SD 68.0 s on 4090; Pro Distill SD 235.0 s; etc.)
- VAE config (8x spatial, 4x temporal) https://huggingface.co/kandinskylab/Kandinsky-6.0-Lite-5s-Diffusers/blob/main/vae/config.json ; transformer patch 1x2x2
- Release: announced 2026-10-06 (Russian press, e.g. https://3dnews.ru/1149527); HF repos created 2026-09-09
- Weight files: kandinskylab/*, kabachuha/Kandinsky-6.0-*-int8-convrot, coolthor/Kandinsky-6.0-Pro-distill-5s-NVFP4, realrebelai/Kandinsky-6.0-Pro-5s_GGUFs, DeepBeepMeep/Kandinsky6

### Selection rationale

- **What people actually run (HF 30-day downloads, Nov 2026):** Comfy-Org/MiniMax-H3 33.1M, Comfy-Org/Wan-2.2 9.8M, Lightricks/LTX-2.5 2.9M (plus unsloth GGUF 0.4M), Comfy-Org/Hunyuan-Video-1.5 0.75M. These four families are the mainstream; all have native ComfyUI templates.
- **New in 2026: sound.** H3, LTX-2.5 and Kandinsky 6 all generate synchronized audio (speech, effects, music). Wan 2.2 and HunyuanVideo 1.5 are silent.
- **Licence spread matters for the picker.** Only Wan 2.2 (Apache) and Kandinsky 6 (MIT) are free everywhere for any use. LTX-2.5 is free below $10M revenue. HunyuanVideo 1.5 excludes EU/UK/South Korea. MiniMax H3 excludes EU, UK, South Korea and the USA entirely. That is why both Kandinsky models are in despite low adoption: they are the only permissive models with sound, and Pro covers the 48-80 GB tier.
- **Tier spread:**
  - 8 GB with offload: Wan 2.2 5B (ComfyUI doc), Wan 2.2 A14B GGUF Q4 (community), Kandinsky 6 Lite (estimate).
  - 12-16 GB: LTX-2.5 int8 (one user report on 12 GB), MiniMax H3 (Comfy says RTX 3060; community 16 GB tier), HunyuanVideo 1.5 (14 GB official), Kandinsky 6 Pro with block offload (vendor, slow).
  - 24-32 GB comfortable: LTX-2.5, Wan 2.2 A14B, Wan 2.2 5B, HunyuanVideo 1.5, MiniMax H3 (32).
  - 48-80 GB: Kandinsky 6 Pro bf16; also bf16 H3 (40 GB DiT + 51 GB encoder) and bf16 LTX-2.5 (42 + 26 GB) to run without offload.
- **One entry per family for dev + distilled** where the vendor ships both in one repo with identical memory (LTX-2.5; HunyuanVideo 1.5 step-distilled; Kandinsky distill). Speed fields cite the distilled path where that is the default in ComfyUI.
- Wan 2.2 T2V-A14B and I2V-A14B are merged into one entry (same size and speed); I2V repo named in notes.

### Uncertain fields per model

- **MiniMax H3:** `vram_gb.comfortable` 32 is an estimate (24 GB works with int8/Q5 per community tier guide and SGLang's offload recipe). `minimum_with_offload` 12 rests on ComfyUI's launch claim ("RTX 3060"); no independent 12 GB timing found. System RAM need (64 GB) is an estimate from the 42.5 GB smallest file set. NVFP4 size is a community file. ComfyUI's own docs also say "Commercial use of locally generated outputs requires a license from Comfy" — this matches the territory exclusions for US/EU/UK/KR users; outside those, MiniMax's licence is royalty-free under $20M. Speed reference is from SGLang (not ComfyUI); ComfyUI was ~30% slower on the same 5090 machine.
- **LTX-2.5:** Speed from one blog (5 runs, steps/frames not reported) and one HF user report. 12 GB minimum is one user report (32 GB RAM, low-VRAM mode). fp8 19.1 GB file is community (unsloth); variant (dev/distilled) not confirmed. Max local clip length unknown. 22B is the vendor name; single-file transformer is 42.0 GB bf16 (≈21B).
- **Wan 2.2 A14B:** 8 GB minimum is from community guides (several, consistent, partly SEO). RTX 5090 timings are LightX2V's (third party), baseline offload settings not detailed. Alibaba's own figures are for datacenter GPUs only.
- **Wan 2.2 5B:** comfortable 24 = Alibaba's measured peak with offload (22.9 GB); with ComfyUI fp8 it is lower (not measured). System RAM advice is an estimate.
- **HunyuanVideo 1.5:** speed (75 s) is Tencent's claim, no independent check. The 6 GB WanGP figure is not verified.
- **Kandinsky 6 Lite:** `minimum_with_offload` 8 is an estimate (no 8 GB report). Component params for CLIP/VAE/audio parts assume fp32 storage. Prompt languages not stated by the vendor.
- **Kandinsky 6 Pro:** comfortable 80 follows the vendor's choice to offload even on A100 80 GB; system RAM for offload (96-128 GB) is an estimate. Quality claims vs LTX-2.5 are self-reported.
- **All:** Apple Silicon speeds are essentially unknown except one Wan 2.2 report (very slow). No AMD numbers collected (WanGP and ComfyUI support RDNA2-4 in general).

### Notable models left out

- **API-only:** Wan 2.5, 2.6, 2.7 and Wan 3.0 (only ComfyUI partner/API nodes; no weights). HappyHorse 1.0/1.1 (API). MiniMax H3's 2K regenerate and Context-IR stages (API). Kling, Seedance, Veo, Pika 2.5 etc. (closed).
- **Superseded:** LTX-2.3 (Mar 2026, 22B; replaced by LTX-2.5, LoRAs mostly carry over; still 0.9M downloads/month), LTX-2 (Jan 2026, 19B), LTX-Video 0.9.x (13B / 2B distilled, 2025), HunyuanVideo (2024), Wan 2.1 (1.3B/14B; 1.3B still 0.4M downloads/month in Diffusers, mostly research), Kandinsky 5.0 (replaced by 6.0), SkyReels V2/V3, Mochi 1, CogVideoX 1.5, Step-Video (old or barely used).
- **Too big for this tool:** MAGI-2-preview (sand-ai, 114B MoE / 6B active, 307 GB checkpoint, needs 8 Hopper GPUs; Apache 2.0).
- **Specialised, not general text/image-to-video:** Wan2.2-Animate / Wan-Animate-2 and Wan-Dancer (motion transfer, dance from music), Wan2.2-S2V (audio-driven talking video), LongCat-Video-Avatar 1.5/1.6, SCAIL-2 (character animation), ByteDance Bernini-R (video/image editing on Wan 2.2), NVIDIA Cosmos3 / Cosmos-Predict2.5 (physical-AI and robotics world models, incl. surgical), LingBot-Video (robbyant, 30B-A3B MoE + 1.3B dense, Apache; aimed at embodied AI, needs a 27B prompt-rewriter model, no ComfyUI template), Tencent Hy-Nomas and other interactive "world" models.
- **Third-party distills / fine-tunes (curation rule):** Pika H3 Flex (Pika Labs' 6-step fine-tune of H3, same territory licence), FastH3 / FastH3-Omni / FastH3 Trim (FastVideo; Trim targets 8 GB), MiniMax-H3 Turbo LoRA and Wan 2.2 Lightning / Distill LoRAs (lightx2v / ModelTC), LightWan2.2 NVFP4 sparse, FastWan 5B, HyperFlow-H3, Sulphur, many uncensored merges.
- **Too new / unclear role:** PAN 2 (MBZUAI IFM, 29B MMDiT world model, Apache 2.0, 704x1248 @24 fps up to 20 s, 67.4 GB bf16 / 26.7 GB int8 in Comfy-Org/PAN2, released mid-Nov 2026). A candidate for the 48-80 GB tier in the next update once usage is clear. Apple FastFrames-S/L (Nov 2026, Wan distills for interactive latency; Apple research licence, not for commercial use).
- **LongCat-Video** (Meituan, 13.6B, MIT, Oct 2025): permissive and good at long videos, but no native ComfyUI template, low use (3.8k downloads/month) and the lab has moved on to the avatar line. Covered for permissive-licence users by Wan 2.2 and Kandinsky.

### How memory and speed really scale (rules for the calculator)

#### 1. Count tokens first
Video diffusion transformers work on latent "tokens". For each model:

`tokens ≈ (1 + (frames - 1) / t) × (height / (s × p)) × (width / (s × p))`

where t = VAE time compression, s = VAE spatial compression, p = transformer patch size. Values (from configs/model cards above):

| Model | t | s | p | pixels per token side | 5 s example | tokens |
|---|---|---|---|---|---|---|
| Wan 2.2 A14B | 4 | 8 | 2 | 16 | 832x480, 81 f | ≈ 32,800 |
| Wan 2.2 A14B | 4 | 8 | 2 | 16 | 1280x720, 81 f | ≈ 75,600 |
| Wan 2.2 5B | 4 | 16 | 2 | 32 | 1280x704, 121 f | ≈ 27,300 |
| MiniMax H3 | 4 | 16 | 2 | 32 | 1344x768, 124 f | ≈ 31,000 (+ audio) |
| MiniMax H3 | 4 | 16 | 2 | 32 | 864x480, 124 f | ≈ 12,500 |
| LTX-2.x | 8 | 32 | 1 | 32 | 960x544, 121 f (stage 1) | ≈ 8,200 |
| HunyuanVideo 1.5 | 4 | 16 | 1 | 16 | 1280x720, 121 f | ≈ 111,600 |
| HunyuanVideo 1.5 | 4 | 16 | 1 | 16 | 848x480, 121 f | ≈ 49,300 |
| Kandinsky 6 | 4 | 8 | 2 | 16 | 864x480, 121 f | ≈ 50,200 (+ audio) |

Sources: Wan configs (vae_stride, patch_size); H3 card ("f16t4d24", "patch size 1x2x2"); LTX-2 paper/card (32x32x8 latent); HunyuanVideo 1.5 card (16x/4x) + Diffusers config patch_size 1; Kandinsky 6 VAE config (8x/4x) + transformer patch_size [1,2,2].

#### 2. Time per clip
`time ≈ steps × passes_per_step × per_step_cost(tokens) + text_encode + vae_decode (+ offload transfer overhead)`

- **passes_per_step:** 2 when the model uses classifier-free guidance (Wan 2.2, HunyuanVideo 1.5 non-distilled, Kandinsky base, LTX dev); 1 for CFG-distilled checkpoints (MiniMax H3 release, LTX distilled, HunyuanVideo CFG-distilled, Kandinsky distill, most turbo LoRAs).
- **Typical steps:** H3 20-50 (turbo LoRA 4-8); LTX-2.5 distilled 8 + 4 refine, dev 20-40; Wan 2.2 A14B 40 (4 with community LoRAs); Wan 5B 50; HunyuanVideo 1.5 50 (8-12 step-distilled 480p I2V); Kandinsky 50 (distill 10).
- **per_step_cost grows faster than linearly with tokens.** Linear layers cost ∝ tokens; self-attention costs ∝ tokens². A useful rule: `per_step_cost ∝ tokens × (1 + tokens / (6 × hidden_size))` — attention equals the rest of the layer at about 6 × hidden size tokens (≈ 30k for Wan 14B with hidden size 5120; ≈ 12k for HunyuanVideo 1.5 with 2048; ≈ 11k for Kandinsky 6 Lite with 1792). This is a derivation from standard transformer FLOP counts (estimate), and it matches the measured data:
  - Wan 2.2 A14B, 480p → 720p (2.31x tokens): 3.19x time on H100 (Alibaba table), 3.63x on RTX 5090 (LightX2V card). Fitted break-even ≈ 40-80k tokens.
  - FastH3 on 4x GB300 (SGLang): 5 s → 10 s → 15 s (1 : 1.96 : 2.92 tokens) took 1 : 2.07 : 3.51 time.
  - HunyuanVideo 1.5 at 720p (~112k tokens) is attention-dominated, which is why Tencent added sparse attention (1.5-2x).
- **Practical rule for the UI:** doubling clip length or going from 480p to 720p costs about 2.2-3.6x the time. Going from 720p to 1080p (2.25x pixels) should cost roughly 3-4x (estimate from the same rule). Many models (LTX-2.5, HunyuanVideo, Kandinsky, H3 API) avoid this by generating low and upscaling.
- **Offload overhead:** when weights stream from system RAM each step, PCIe bandwidth adds a lot: Kandinsky 6 Pro distilled took 88 s on H100 vs 235 s on RTX 4090 (block offload) vs 718 s on a 16 GB RTX 5060 Ti (vendor table). Plan on 2-4x slower when the model does not fit.
- **Attention kernels and int8/fp8 matter:** on RTX 4090, H3 at 20 steps went 406 s (bf16 + FlashAttention) → 303 s (int8) → 175 s (int8 + SageAttention) (SGLang). Step-caching tricks (TeaCache/MagCache/Spectrum) give another 1.5-3.5x at some quality cost.
- **Decode can dominate at high resolution:** LTX-2.5's diffusion decoder at 1080p (HF discussion, per search summary) and H3's 2.6B ViT decoder; SGLang warns against offloading H3's VAE on a 4090 because it re-streams ~9 GiB per decode tile.

#### 3. Memory
`VRAM_peak ≈ max(text-encoder stage, denoise stage, decode stage)`; runtimes load these one after another and swap the others to system RAM.

- **Denoise stage:** DiT weights at chosen precision (bf16 = 2 bytes/param, fp8/int8 = 1, Q4 GGUF ≈ 0.55-0.6, NVFP4 ≈ 0.6) + activations. With flash/sage attention, activations grow roughly linearly with tokens (no tokens² matrix is stored). MoE (Wan 2.2 A14B): only one 14B expert needs to be on the GPU at a time.
- **Text encoders are big in 2026 and must be counted separately:** H3 Qwen3-VL-32B-derived encoder 15.7 GB (nvfp4) to 51.5 GB (bf16); LTX-2.5 Gemma 4 12B 15.4 GB (int8) / 26.3 GB (bf16); Kandinsky and HunyuanVideo Qwen2.5-VL-7B 16.6 GB bf16 (9.4 GB fp8); Wan UMT5-XXL 11.4 GB (6.7 GB fp8). They run once per prompt and can be offloaded or quantized with little speed cost.
- **Decode stage:** VAE weights (0.25-5 GB) + decode activations; all runtimes tile the decode to cap memory.
- **Offloading lets a model run on a card smaller than its weights**, but system RAM must then hold everything: `system RAM ≳ sum of all weights at chosen precision + ~8-16 GB` (estimate). Examples: H3 smallest ComfyUI set 42.5 GB (Comfy blog) → 64 GB RAM; one LTX-2.5 user ran int8 (≈ 40 GB of files) on 32 GB RAM, Lightricks recommends 64 GB; SGLang's 2x RTX 5090 bf16 H3 recipe needed a 384 GiB-class host; single 5090 with 60 GB RAM + swap worked for H3 bf16 (SGLang).
- **Measured peaks for calibration:** Wan 2.2 5B 720p on RTX 4090 with offload: 22.9 GB (Alibaba). Wan 2.2 A14B with offload: 41 GB at 480p, 60 GB at 720p (Alibaba, native code, bf16). H3 int8 with layerwise offload on RTX 4090: ~18 GB at 1344x768 (SGLang).

#### 4. Apple Silicon
Video generation on Macs is possible but slow. Known paths: Draw Things (Wan 2.2, LTX-2.3; vendor claims 5 s 480p Wan 2.2 A14B runs on an M5 iPad with 16 GB), mlx-video (LTX-2, LTX-2.3, Wan 2.1/2.2), stable-diffusion.cpp Metal backend (lists Wan 2.x, MiniMax H3, LTX-2.3/2.5, HunyuanVideo 1.5). One measured report: M1 Max 64 GB, Wan 2.2 GGUF in ComfyUI, 82 minutes for a 2 s clip (https://lilting.ch/en/articles/ltx2-wan22-mac-local-video-gen). For the calculator: treat video on Apple Silicon as "possible for small models, expect 10-50x slower than an RTX 4090" (estimate) and flag H3, Kandinsky and HunyuanVideo as untested on Mac.

## Text-to-speech

Survey date: 2026-11-19. All repo existence, licence tags, dates, downloads and file sizes checked with the HF API helper (`tools/hfinfo.mjs`) or the raw HF API. Param counts marked "safetensors" were read from the file headers.

Cross-model sources used for many entries:
- **Open TTS Leaderboard** (hf-audio, last updated 16 Nov 2026): https://huggingface.co/spaces/hf-audio/open_tts_leaderboard — objective WER, UTMOS, RTFx. Leaderboard tab: H200, batch 32 where supported. Streaming tab: batch 1 on A100 (`a100-large`), CPU (`cpu-upgrade`, 8 vCPU) or H200, 497 CV3-Eval English samples. Read in a browser (data is loaded at runtime). German results come from the Leaderboard tab with only German selected. No Swedish test set exists there.
- **Artificial Analysis Speech Arena**, provider-voice board: https://artificialanalysis.ai/text-to-speech/leaderboard (read 19 Nov 2026). Open-weight Elo: Drama 3 1279 (#7 overall), Drama 3 Preview 1237, Breeze TTS 2 1229, Ming-3.0-tts 1182, Phonon 31M 1110, Step Audio EditX 1101, Fish S2 Pro 1101, Voxtral TTS 1094, Magpie-Multilingual 1063, Kokoro 1060, Maya1 1047, OpenAudio S1 Mini 1043, Higgs Audio V3 1035, Chatterbox 1020, Zonos v0.1 1000 (anchor), VibeVoice 1.5B 954, XTTS v2 915. Qwen3-TTS, VoxCPM2, OmniVoice, ZONOS3-Mini, Pocket TTS, Supertonic 3 are not on this board.
- **TTS Arena V2** (https://huggingface.co/spaces/TTS-AGI/TTS-Arena-V2, JSON at `/api/models`): mostly proprietary models now; open ones listed: Kokoro v1.0 (Elo 1477, #28), Chatterbox (1490, #26, not flagged open), CosyVoice 2.0. Not useful for ranking the 2026 open models.
- **audio.cpp** (ggml runtime, https://github.com/0xShug0/audio.cpp; GGUFs at `audio-cpp/audio.cpp-gguf`): model support table and Q8 report https://github.com/0xShug0/audio.cpp/blob/main/docs/reports/gguf_q8_performance.md (peak VRAM per model; GPU model not named in the report).
- **llama.cpp TTS docs**: https://github.com/ggml-org/llama.cpp/blob/master/docs/multimodal/tts.md — supported: Qwen3-TTS, Pocket TTS, Soprano, LFM3-Audio, Chatterbox (Turbo, Multilingual V3), Drama 3, ZONOS3, Fish S2 Pro, Kokoro, tiny-voca, VoxCPM2 (plus two music models). Official GGUFs under `ggml-org/*-GGUF`.
- **MLX-Audio** README (https://github.com/Blaizzy/mlx-audio) for Apple Silicon support.
- **ComfyUI**: no core TTS; the main custom node is TTS-Audio-Suite (https://github.com/diodiogod/TTS-Audio-Suite), which lists ChatterBox 23L (V1-V3), Qwen3-TTS, Fish S2 Pro, OmniVoice, Higgs Audio 2/v3, IndexTTS 2/2.5, VibeVoice, CosyVoice3, MOSS-TTS, F5-TTS and others. Pocket TTS has its own node (ComfyUI-Pocket-TTS).
- **Ollama**: speech since Oct 2026, only Gradium Phonon (https://docs.ollama.com/capabilities/speech.md, https://ollama.com/blog/speech-models).

### Per-model sources

| Model | Model card / licence | Speed source | VRAM / memory source |
|---|---|---|---|
| Piper | https://huggingface.co/rhasspy/piper-voices (per-voice MODEL_CARD); https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/LICENSING.md and COMMERCIAL_USE.md | sherpa-onnx docs, Pi 4 table: https://k2-fsa.github.io/sherpa/onnx/tts/pretrained_models/vits.html | file sizes (HF API) |
| Kokoro 82M | https://huggingface.co/hexgrad/Kokoro-82M | Open TTS Leaderboard CPU/A100; Kokoro-FastAPI README (RTX 4060 Ti, 35-100x): https://github.com/remsky/Kokoro-FastAPI; Pi 4: https://k2-fsa.github.io/sherpa/onnx/tts/pretrained_models/kokoro.html | estimate |
| Phonon 31M | https://huggingface.co/gradium/phonon-31m-en | Open TTS Leaderboard CPU | card (64.5 MB q8) |
| Pocket TTS | https://huggingface.co/kyutai/pocket-tts (gated); https://github.com/kyutai-labs/pocket-tts | Open TTS Leaderboard CPU; README (6x on MacBook Air M4) | audio.cpp Q8 report (GPU peak) |
| Supertonic 3 | https://huggingface.co/Supertone/supertonic-3 (licence file: BigScience OpenRAIL-M); archive notice https://github.com/supertone-inc/supertonic | Open TTS Leaderboard | file sizes |
| Chatterbox Multilingual V3 | https://huggingface.co/ResembleAI/chatterbox; https://github.com/resemble-ai/chatterbox | Open TTS Leaderboard (H200, German board); audio.cpp Q8 report | NVIDIA ACE model card https://docs.nvidia.com/ace-for-games/chatterbox-tts/nvigi-chatterbox-model-card.html (≈3.5 GB TTS-only); audio.cpp report |
| ZONOS3-Mini | https://huggingface.co/Zyphra/ZONOS3-Mini; https://github.com/Zyphra/ZONOS3-Mini | https://github.com/0xShug0/audio.cpp/blob/main/docs/models/zonos3.md (Apple M3); Open TTS Leaderboard | same audio.cpp doc (peak RSS 2.06 GiB); Zyphra README (≈9 GB PyTorch weights for CUDA server) |
| OmniVoice | https://huggingface.co/k2-fsa/OmniVoice; https://github.com/k2-fsa/OmniVoice | Open TTS Leaderboard A100; vendor H100 table in GitHub README; audio.cpp omnivoice.md (RTX 4090) | GitHub README (Arc A310 4 GB tested); audio.cpp report |
| Qwen3-TTS 1.7B | https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-Base; https://github.com/QwenLM/Qwen3-TTS | https://pypi.org/project/faster-qwen3-tts/ (v0.5.4, 5 Oct 2026: RTX 4090, RTX 4060, H100, T4, Jetson) | audio.cpp Q8 report |
| VoxCPM2 | https://huggingface.co/openbmb/VoxCPM2; https://github.com/OpenBMB/VoxCPM | model card (vendor, RTX 4090); Open TTS Leaderboard A100 | model card (~8 GB) |
| Fish S2 Pro | https://huggingface.co/fishaudio/s2-pro (LICENSE.md = Fish Audio Research License, 7 Mar 2026) | Open TTS Leaderboard A100; card (H200 RTF 0.195) | audio.cpp Q8 report; https://github.com/0xShug0/audio.cpp/blob/main/docs/models/fish_audio.md |
| Fish Drama 3 | https://huggingface.co/fishaudio/drama-3 (LICENSE = Fish Audio Community License v1.0, 13 Oct 2026) | card (H200, SGLang-Omni) | https://sgl-project.github.io/sglang-omni/cookbook/fishaudio_drama3.html; https://github.com/0xShug0/audio.cpp/blob/main/docs/models/fish_drama3.md |

Community quant / GGUF repos used for sizes: `onnx-community/Kokoro-82M-v1.0-ONNX`, `ggml-org/Kokoro-82M-GGUF`, `ggml-org/chatterbox-GGUF`, `ggml-org/ZONOS3-Mini-GGUF`, `ggml-org/Qwen3-TTS-12Hz-1.7B-Base-GGUF`, `ggml-org/s2-pro-GGUF`, `ggml-org/drama-3-GGUF`, `fishaudio/drama-3-int4` (official), `Jmica/Drama-3-GGUF`, `DennisHuang648/VoxCPM2-GGUF`, `audio-cpp/audio.cpp-gguf` (Pocket TTS, Supertonic 3, OmniVoice, VoxCPM2, Voxtral, Qwen3-TTS, S2 Pro).

### Selection rationale

- 12 entries across four tiers: 5 tiny CPU models (Piper, Kokoro, Phonon 31M, Pocket TTS, Supertonic 3), 4 efficient models for 4-8 GB GPUs (Chatterbox Multilingual V3, ZONOS3-Mini, OmniVoice, Qwen3-TTS 1.7B), 2 strong models for 8-16 GB (VoxCPM2, Fish S2 Pro) and 1 frontier model for 24-48 GB (Fish Audio Drama 3).
- TTS models are small: nothing worth running locally needs 80 GB. The largest sensible local model is Drama 3 (35B MoE, 37 GB weights in FP8, 20.8 GB in int4). Everything else fits 16 GB.
- German **and** Swedish (required): verified on the model cards for Piper (de_DE and sv_SE voices), Supertonic 3 (31 languages), Chatterbox Multilingual V3 (23), ZONOS3-Mini (43), OmniVoice (600+), VoxCPM2 (30), Fish S2 Pro and Drama 3 (80+). German only: Pocket TTS, Qwen3-TTS (and left-out Voxtral, Ming). Neither: Kokoro, Phonon 31M.
- Commercially usable with German + Swedish: Piper (per voice), Supertonic 3 (OpenRAIL-M), Chatterbox Multilingual V3 (MIT), ZONOS3-Mini (Apache), VoxCPM2 (Apache); Drama 3 only for organisations under US$500k revenue.
- Non-commercial flags: OmniVoice (CC BY-NC weights), Fish S2 Pro (Fish Audio Research License). Drama 3 is limited-commercial (Fish Audio Community License). No licence among the 12 excludes the EU, UK or South Korea.
- Each pick covers a distinct need: Piper = Raspberry Pi and widest small-language coverage; Kokoro = default English, most used; Phonon = best-rated tiny English and the only Ollama TTS; Pocket TTS = CPU voice cloning; Supertonic 3 = tiny 31-language reader; Chatterbox = MIT cloning in 23 languages; ZONOS3-Mini = Apache cloning in 43 languages that also runs on CPU; OmniVoice = any language on 4 GB; Qwen3-TTS = voice design + cloning, best tool support; VoxCPM2 = Apache, 48 kHz, 30 languages; S2 Pro = expressive tags on 12-16 GB; Drama 3 = top quality.

### Uncertain fields per model

- **Piper**: params (estimated from file size); RAM use (estimate); no desktop-CPU speed number.
- **Kokoro**: VRAM (estimate, no official number). Speed on GPU varies 35-100x with text length.
- **Phonon 31M**: one month old; codec decoder size not stated; llama.cpp support unconfirmed (Gradium repo exists, not in llama.cpp docs).
- **Pocket TTS**: dtype "bf16" taken from audio.cpp's GGUF naming; whether the 100M count includes the Mimi decoder is not stated. Gated repo, so the card body was not readable via raw README; facts come from the GitHub README.
- **Supertonic 3**: CPU speed number is in streaming mode, which penalises a non-streaming model; offline speed is likely much higher (no current source). Project archived.
- **Chatterbox Multilingual V3**: no consumer-GPU speed; H200 reference number and audio.cpp "6-9x on CUDA" (GPU unnamed) differ by ~5x. German WER result may be V2. Voice-encoder param count null. Maximum length per call not stated.
- **ZONOS3-Mini**: brand new; VRAM "comfortable 4" is an estimate for the GGUF path; CUDA-server VRAM not stated (only "about 9 GB" of weights); codec/encoder param counts null. Language count: card says 43, Open TTS Leaderboard metadata says 22, audio.cpp lists 9 normalisation languages.
- **OmniVoice**: exact CC BY-NC version not stated; vendor speed is at 32 steps on H100.
- **Qwen3-TTS**: VRAM for the PyTorch path not stated officially (audio.cpp peaks used); max audio length per call not stated (eval used max_new_tokens=2048 ≈ 2.7 min at ~12.5 tokens/s, estimate).
- **VoxCPM2**: vendor RTF (0.30 on 4090) vs independent ~1.0x real time on A100 streaming; minimum VRAM with Q8 is an estimate; AudioVAE param count null.
- **Fish S2 Pro**: codec param count null; GPU of the audio.cpp report unnamed.
- **Drama 3**: no consumer-GPU speed; 16-24 GB offload configs untested on real cards; licence metadata tag (research licence) contradicts the LICENSE file (Community License) — LICENSE file used.

### Notable models left out, and why

- **Voxtral 4B TTS 2603** (Mistral, Mar 2026, `mistralai/Voxtral-4B-TTS-2603`): verified, but CC BY-NC 4.0 (inherited from the bundled voice references); 9 languages (en, fr, es, de, it, pt, nl, ar, hi), no Swedish; 20 preset voices and no voice cloning in the open release (audio.cpp and the Open TTS Leaderboard both list no cloning; the card points to Mistral AI Studio for custom voices); needs ≥ 16 GB VRAM per card (bf16 8.0 GB; audio.cpp Q8 GGUF 4.72 GB); German WER 8.34 (21st of 23); Artificial Analysis Elo 1094, below S2 Pro and Phonon. Speed: card RTF 0.103 on H200 (vLLM-Omni, concurrency 1); Open TTS Leaderboard A100 streaming 5.6x real time. Runtimes: vLLM-Omni, MLX-Audio, audio.cpp. Easy to add back if a Mistral entry is wanted. Mistral's newer "Voxtral 3 TTS" on Artificial Analysis appears API-only.
- **Breeze TTS 2** (BreezeBlue, Aug 2026): #2 open model on Artificial Analysis (1229) but English and Chinese only, research/non-commercial licence, 3.5B (~7.7 GiB eager). Good for an English-only NC slot.
- **Ming-3.0-tts-0.5B** (inclusionAI/Ant, Sep 2026, MIT): #3 open on Artificial Analysis (1182), cloning, 7 languages incl. German (no Swedish), German WER 1.48. Left out because inference needs the GitHub repo (tested only on H800/H20) and it streamed slower than real time on A100 (0.66x). Strongest runner-up for a 13th slot.
- **Higgs TTS 3 4B** (Boson AI, Jun 2026, `bosonai/higgs-tts-3-4b`, old name higgs-audio-v3-tts-4b): 100+ languages, cloning, research/non-commercial licence with a free "creator use" grant (monetised videos/podcasts with credit). AA 1035, German WER 6.03. Vendor H100 RTF 0.147; audio.cpp peak 9.3 GB (16-bit) / 6.0 GB (Q8).
- **Chatterbox Turbo (350M) / Nano (110M) / Flash**: English-only variants of the included family. Nano claims 3x real time on 8 CPU cores (vendor).
- **MOSS-TTS v1.5** (OpenMOSS, Apache 2.0, 8.5B, 31 languages, German WER 1.49): viable large Apache option, left out on count and weaker ecosystem; MOSS-TTS-Nano-100M (Apache, 20 languages) also exists.
- **IndexTTS-2.5** (bilibili model licence, Aug 2026): mainly zh/en; custom licence.
- **VibeVoice** (Microsoft, MIT tag): long-form 1.5B rated low (AA 954); Realtime-0.5B German WER 20.4. The 1.5B card limits use to research and shows VibeVoice-Large as "Disabled". The reported Sep 2025 removal of the long-form code was not re-checked.
- **Superseded or NC-only older models**: XTTS-v2 (CPML non-commercial, company closed, 17 languages, no Swedish, AA 915), F5-TTS (CC BY-NC), Spark-TTS (CC BY-NC-SA), OpenAudio/Fish S1-mini (CC BY-NC-SA, superseded by S2/Drama 3), Zonos v0.1 and ZONOS2 (superseded by ZONOS3-Mini), Kyutai TTS 1.6B (en/fr; Pocket TTS is the local pick), CosyVoice 3 (Apache, mostly Asian languages), Orpheus 3B, Dia/Dia2, Sesame CSM-1B (English only), MeloTTS (old), NeuTTS Air/Nano/2E (custom NeuTTS Open License), KittenTTS 2 (Stellon Labs Community License, English), Magpie TTS Multilingual 357M (NVIDIA Open Model License, 9 languages), Phonon 40M (CC BY-NC).
- **Too new or unknown labs**: Audio8-TTS, sanoTTS, tiny-voca, Inflect, Paradee, etc. appear on the Open TTS Leaderboard but are community releases.

### How memory and speed really scale (TTS)

1. **Real-time factor.** RTF = generation time ÷ audio duration (lower is better). "Nx real time" = 1/RTF. Time for a job ≈ RTF × audio length + fixed start-up (model load, first-audio latency of ~20-900 ms). Sources: definitions on the Open TTS Leaderboard About tab and in vendor tables.
2. **Text to audio length.** Rule of thumb: 10 s of speech ≈ 25 English words ≈ 150 characters (≈ 15 characters per second). ZONOS3 uses 15 UTF-8 bytes per second as its neutral speaking rate (llama.cpp TTS docs). Kokoro's README: about 1,000 characters ≈ 1 minute. Use ~1 min of audio per 900-1,000 characters for the calculator.
3. **Memory = weights + codec/vocoder + speaker encoder + small cache.** For autoregressive LLM-style TTS, the cache grows with text + generated audio tokens, but audio token rates are low: VoxCPM2 6.25/s, Qwen3-TTS ~12.5/s, ZONOS3 15/s, Fish S2/Drama 3 ~21.5/s, Higgs 25/s (model cards, llama.cpp docs). One minute of speech is ~400-1,500 tokens, so for 0.5-5B models the cache is well under 1 GB per stream. Weights dominate. Concurrency multiplies the cache.
4. **Quantization.** Q8 GGUF cut peak VRAM by up to ~37% and was 1.0-1.5x faster on the larger autoregressive models (Fish S2 Pro 12.1 → 7.7 GB, Higgs 9.3 → 6.0 GB); little gain for small models (audio.cpp Q8 report). Weight size by precision: bf16 = 2 bytes/param, fp8/q8 ≈ 1, q4 ≈ 0.5-0.6.
5. **Mixture-of-experts.** Memory follows total parameters, speed follows active parameters (Drama 3: 35B total / 3B active; ZONOS3-Mini: 800M / 100M). Experts can be kept on CPU to fit smaller GPUs at a speed cost (audio.cpp Drama 3 doc).
6. **Runtime matters more than the GPU.** Qwen3-TTS 1.7B on an RTX 4090: 0.82x real time with the stock code vs 4.2x with CUDA graphs; RTX 4060: 0.23x vs 1.83x (faster-qwen3-tts table). VoxCPM2: RTF 0.30 vs 0.13 with Nano-vLLM (vendor). S2 Pro and Drama 3 are fastest on SGLang-Omni/vLLM-Omni. The calculator should show a range (stock vs optimised runtime).
7. **GPU class scaling (rough).** From the faster-qwen3-tts table, an RTX 4060 is about 2.3-3.6x slower than an RTX 4090 for the same model and runtime; an H100 is not faster than a 4090 at batch 1 (0.44x vs 0.82x stock). Single-stream TTS speed depends mostly on per-step overhead and memory bandwidth. Estimate.
8. **CPU.** Models of ≤ 100M parameters run 3-16x real time on an 8-vCPU server (Open TTS Leaderboard CPU tab: Phonon 16x, Kokoro 5.5x, Pocket TTS 3.2x, ZONOS3-Mini 3.1x, Supertonic 3 3.0x streaming). On a Raspberry Pi 4, Piper medium runs 2.8x real time but Kokoro runs slower than real time (RTF 2.8) (sherpa-onnx docs). Models of 0.5B+ on CPU are usually slower than real time, except MoE ZONOS3-Mini (RTF 0.30 on Apple M3 CPU).
9. **Batching and concurrency.** Throughput rises with parallel requests but each stream slows: Drama 3 on H200 RTF 0.13 at 1 stream, 0.37 at 16, 0.80 at 64; Higgs TTS 3 on H100 0.147 → 0.262 at 16 (vendor cards). For a single home user, use the batch-1 numbers.
10. **Non-autoregressive models** (Piper, Kokoro, Supertonic, OmniVoice) make a whole chunk at once: high throughput, but first audio waits for the chunk (Supertonic 1.5-1.9 s, OmniVoice ~0.4 s median in the streaming test). OmniVoice cost scales with diffusion steps (16-32).
11. **Voice cloning cost.** Encoding a reference clip is a one-time cost per voice (ZONOS3-Mini on M3 CPU: RTF 0.30 plain vs 0.84 including encoding a 10 s clip; cached voices skip it). Pocket TTS recommends exporting a voice embedding once.

## Speech-to-text

Checked 2026-11-19. All repos were checked with the hfinfo helper (license tag, dates, safetensors params, file sizes).

### Open ASR Leaderboard snapshot used

- Source: https://huggingface.co/spaces/hf-audio/open_asr_leaderboard, version 1.16.1 dated 18 Nov 2026. The result datasets are private, so the numbers were read from the running app's table (Gradio `/config`), which is what visitors see.
- English short-form "Average WER" is now the mean of 9 sets: AMI-Cleaned, Earnings22-Cleaned-AA-chunked, Gigaspeech-Cleaned, SPGISpeech, URGENT24, Voice Arena Monsoon (Indian English), Voxpopuli-AA-Cleaned, Private (scripted), Private (conversational). LibriSpeech was dropped from the average on 2 Nov 2026 (v1.14.0) and URGENT24 was added on 9 Oct 2026. Older blog numbers (5.3-5.8%) and model-card numbers come from older mixes and are lower; do not mix them with current values.
- RTFx = seconds of audio per second of compute, measured in the same run as WER, on 1x NVIDIA H200 (Hugging Face Jobs; per the leaderboard GitHub README). These are batched throughput numbers, far higher than a single user gets on a consumer GPU.
- Overall #1 is an API service (zoom/scribe_v2.1_pro, 4.87%). Top open-weight rows: Musci-research/Musci-ASR-qwen-1019-hf 5.70% (fine-tune of Qwen3-ASR), salesforce-sovereign-intelligence/SOV-Transcribe-1 5.96%, oruk/orukqwen-asr-1.7b 5.97% (fine-tune), FluidVoice-Labs/fluid-speech-pro 6.06% (Parakeet fine-tune), nvidia Nemotron-3.5-Transcribe FP8 6.12% / BF16 6.13%, Qwen/Qwen3-ASR-1.7B-hf 6.15%.

| Model (entry) | English avg WER | RTFx (H200) | Multilingual avg (8 langs) | German | Long-form WER |
|---|---|---|---|---|---|
| Nemotron 3.5 Transcribe BF16 | 6.13 | 472.6 | 4.50 (best open) | 2.79 | 10.52 |
| Qwen3-ASR-1.7B (-hf) | 6.15 | 835.6 | 5.94 | 3.88 | — |
| Parakeet TDT 0.6B v3 | 7.04 | 6321.9 | n/a (6/8 covered) | 4.12 | 12.60 |
| Whisper large-v3-turbo | 8.75 | 808.9 | 9.94 | 6.12 | 12.82 |
| Moonshine Streaming Small | not listed | — | — | — | — |

The leaderboard has no Swedish. Swedish comparison (FLEURS WER): Nemotron 7.27% (NVIDIA card); Whisper large-v3-turbo 8.72%, Parakeet v3 15.25%, Qwen3-ASR-1.7B 19.68% (all three measured with the same tool, transcribe.cpp Q8_0, community). Parakeet's own card agrees: 15.08%.

### Per model: sources

#### Moonshine Streaming Small (moonshine-ai/moonshine-streaming-small)
- Model card: https://huggingface.co/moonshine-ai/moonshine-streaming-small (MIT, English; Tiny/Small/Medium sizes and WER table)
- Paper (speed, params, CPU/ONNX runtime): https://arxiv.org/html/2602.12241 — Table 2, Apple M3, ONNX Runtime on CPU: Small 148 ms latency, compute load 17.97% (=> about 5.6x real time); Tiny 8.03%, Medium 28.95%.
- License and language list: https://github.com/moonshine-ai/moonshine (LICENSE: all streaming models MIT); model list incl. German/Spanish/Japanese Small: https://moonshine-voice.readthedocs.io/en/latest/models/available-models/
- Community speed and GGUF: https://github.com/handy-computer/transcribe.cpp/blob/main/docs/models/moonshine-streaming-small.md ; https://huggingface.co/handy-computer/moonshine-streaming-small-gguf
- VRAM source: paper (sub-1 GB design target); no measurement.

#### Parakeet TDT 0.6B v3 (nvidia/parakeet-tdt-0.6b-v3)
- Model card (languages, 24 min / 3 h limits, timestamps, FLEURS table, 2 GB RAM note, NeMo-Speech.cpp GGUF): https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3
- Speed: leaderboard (above); onnx-asr benchmarks https://istupakov.github.io/onnx-asr/benchmarks/ (author-run, community); transcribe.cpp https://github.com/handy-computer/transcribe.cpp/blob/main/docs/models/parakeet-tdt-0.6b-v3.md
- Runtime list: NeMo-Speech.cpp README https://github.com/NVIDIA/NeMo-Speech.cpp ; sherpa-onnx int8 csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8; onnx-asr istupakov/parakeet-tdt-0.6b-v3-onnx; MLX mlx-community/parakeet-tdt-0.6b-v3; vLLM only via third-party plugin (vLLM supported-models doc).

#### Whisper large-v3-turbo (openai/whisper-large-v3-turbo)
- Model card: https://huggingface.co/openai/whisper-large-v3-turbo (MIT tag)
- VRAM table (turbo ~6 GB, reference PyTorch): https://github.com/openai/whisper (README)
- faster-whisper memory benchmarks (large-v2, RTX 3070 Ti: fp16 4.5 GB, int8 2.9 GB): https://github.com/SYSTRAN/faster-whisper
- whisper.cpp memory table and ggml files: https://github.com/ggml-org/whisper.cpp ; https://huggingface.co/ggerganov/whisper.cpp
- Speed: leaderboard; onnx-asr benchmarks; transcribe.cpp https://github.com/handy-computer/transcribe.cpp/blob/main/docs/models/whisper-large-v3-turbo.md
- vLLM support: https://github.com/vllm-project/vllm/blob/main/docs/models/supported_models.md (WhisperForConditionalGeneration)

#### Qwen3-ASR 1.7B (Qwen/Qwen3-ASR-1.7B)
- Model card (languages, streaming via vLLM, ForcedAligner limits): https://huggingface.co/Qwen/Qwen3-ASR-1.7B ; GitHub https://github.com/QwenLM/Qwen3-ASR
- Technical report (20-minute single-pass limit, 12.5 Hz audio tokens, vLLM throughput): https://arxiv.org/html/2601.21337
- llama.cpp support: https://github.com/ggml-org/llama.cpp/blob/master/docs/multimodal.md (ggml-org/Qwen3-ASR-1.7B-GGUF); vLLM: supported-models doc
- Community speed and Swedish/German WER: https://github.com/handy-computer/transcribe.cpp/blob/main/docs/models/qwen3-asr-1.7b.md ; https://huggingface.co/handy-computer/Qwen3-ASR-1.7B-gguf
- VRAM: no official or measured figure found (only calculator estimates on third-party sites). Ours is an estimate.

#### Nemotron 3.5 Transcribe 30B-A4B (nvidia/NVIDIA-Nemotron-3.5-Transcribe-30B-A4B)
- Model card (40 languages, 1 hour / 65,536 tokens, hardware table, H100 RTFx by decoding mode, FLEURS table, license): https://huggingface.co/nvidia/NVIDIA-Nemotron-3.5-Transcribe-30B-A4B ; FP8 and NVFP4 cards (same org)
- License text: https://openmdw.ai/license/1-1/
- VRAM by GPU size (official): https://github.com/NVIDIA/NeMo-Speech.cpp/blob/main/docs/salm/configuration.md ; precision per platform: https://github.com/NVIDIA/NeMo-Speech.cpp/blob/main/docs/salm/models.md
- Community GGUF (sizes, quality vs BF16, 16 GB recipe): https://huggingface.co/AtomicChat/NVIDIA-Nemotron-3.5-Transcribe-30B-A4B-GGUF
- Tech report (not read in full): https://research.nvidia.com/labs/nemotron/files/NVIDIA-Nemotron-3.5-Transcribe-Technical-Report.pdf

### Selection rationale

- Five entries spread from "no GPU" to "32-80 GB": Moonshine Streaming Small (tiny, CPU/phone/Pi), Parakeet v3 (efficient, 25 EU languages, very fast), Whisper large-v3-turbo (efficient, the standard with 99 languages and the most tools), Qwen3-ASR-1.7B (strong, 8 GB GPU), Nemotron 3.5 Transcribe (frontier-class open model, 24-80 GB).
- All five have commercial-friendly licenses (MIT, CC-BY-4.0, MIT, Apache-2.0, OpenMDW-1.1). None excludes the EU/UK.
- "Top of the leaderboard among commercial-friendly open models": Nemotron 3.5 Transcribe. It is the best open model on the multilingual and long-form tabs and within 0.2 points of the best open English rows, which are fine-tunes (excluded by the curation rule) or SOV-Transcribe-1 (9 days old, 7 languages, no Swedish).
- "Best multilingual European model with German and Swedish": Parakeet v3 is the purpose-built European model (25 EU languages incl. sv). For Swedish accuracy specifically, the ranking is Nemotron (7.3%) > Whisper turbo (8.7%) > Parakeet v3 (15.3%) > Qwen3-ASR (19.7%), so the picker should not recommend Qwen3-ASR or (if accuracy matters) Parakeet for Swedish.
- Moonshine Small chosen over Tiny/Medium because it has an English and a German model; Medium is English-only, Tiny is less accurate.

### Uncertain fields per model

- Moonshine: speed is a vendor number in streaming mode on one Mac; max audio length and timestamps not documented; params 0.14B (safetensors) vs 123M (paper); German model accuracy is a vendor quick check.
- Parakeet v3: vram comfortable 4 GB is an estimate; how long a file fits on a given small GPU is not documented (only 24 min on 80 GB with full attention).
- Whisper turbo: "minimum ~2 GB" for whisper.cpp/faster-whisper int8 is an estimate extrapolated from large-v2 measurements; the 99-language count is OpenAI's; quality per language varies widely.
- Qwen3-ASR: all VRAM numbers are estimates; params 2.35B from safetensors may include an untied copy of the output head (the transcribe.cpp BF16 single file is only 4.08 GB, about 2.0B params); the transcribe.cpp Q8_0/Q4 sizes are single-file (encoder included) while llama.cpp splits the encoder into a separate mmproj file.
- Nemotron: no consumer-GPU speed measurement; the system-RAM requirement for the 8-16 GB offload mode is our estimate; MLX ports unverified; GGUF sizes are community files (AtomicChat), NVIDIA's own converter output is about the same size (NVFP4 21.79 GB, IQ4_NL 20.35 GB per AtomicChat's comparison).

### Notable models left out and why

- salesforce-sovereign-intelligence/SOV-Transcribe-1 (Apache-2.0, 26.6B MoE, 4.6B active, 53 GB BF16): best English WER of any lab-official open model (5.96%), but released 10 Nov 2026, 7 languages only (no Swedish), up to 30 min audio, no official quantized builds. Worth adding later if quants appear.
- Musci-research/Musci-ASR-qwen-1019-hf (5.70%, top open row), oruk/orukqwen-asr-1.7b, FluidVoice-Labs/fluid-speech-pro, freetranscribe/parakeet-ft-v1: community fine-tunes of Qwen3-ASR or Parakeet.
- CohereLabs/cohere-transcribe-03-2026 (Apache-2.0, 2B, gated with auto-approval): 6.72% English, 14 languages without Swedish, needs the language set by hand (no auto-detect).
- IBM Granite Speech 5.0 2B (Apache-2.0, 6.68%) and 4.1 2B (7.03%): good, but fewer languages (7) and no Swedish. Granite Speech 5.0 470M TurboCTC (Apache-2.0, 7.41%, RTFx 21,434, 7 languages incl. German) is a strong CPU/edge alternative; its "-nc" variant (6.98%) is CC-BY-NC-SA-4.0, non-commercial.
- Reson8/Rumble-2-Flash (Apache-2.0, 0.5B, 6.60%, RTFx 6,338): new lab without a track record yet.
- NVIDIA Canary-1B-v2 (8.43%, CC-BY-4.0): same 25 languages as Parakeet v3 plus translation, but slower and less accurate for plain transcription. Canary-Qwen-2.5B (6.92%): English only. Nemotron 3.5 ASR Streaming 0.6B (OpenMDW, 40 languages, true streaming): weak accuracy (11.09% English, 10.89% multilingual). Nemotron Speech Streaming EN 0.6B (7.47%): English only. parakeet-unified-en-0.6b: English only.
- Mistral Voxtral Mini 3B (8.32%), Small 24B (7.44%), Mini 4B Realtime (9.72%, streaming), all Apache-2.0: no Swedish (8-13 languages) and behind Qwen3-ASR/Nemotron on accuracy.
- Whisper large-v3 (8.24%, slightly better than turbo but 2x the memory and slower); distil-large-v3.5 (English only); Whisper tiny/base/small: superseded for English by Moonshine, still an option for tiny multilingual use.
- Qwen3-ASR-0.6B (7.07% English, 9.37% multilingual): smaller sibling; mention as an option.
- Microsoft VibeVoice-ASR (MIT, 8.7B): 9.54% English, 14.77% multilingual. Meta omniASR (7B LLM v2, 9.45%): good for rare languages (1,600+), not needed here; HF repo gated for the helper. Kyutai STT 1B en/fr and 2.6B en (CC-BY-4.0): English/French only and no longer on the leaderboard. Gemma 4 E4B: general model, 13.2%.
- KBLab kb-whisper (Swedish fine-tunes of Whisper by the Swedish national library): a fine-tune, so excluded, but likely the best Swedish-only choice; worth a note in the UI. (Not checked with the helper.)

### How memory and speed really scale for STT

1. **Memory = weights + working memory.** There is no text encoder or VAE. Weights at the chosen precision dominate for anything over 1B parameters (bf16 = 2 bytes/param, 8-bit ≈ 1.06-1.1 bytes/param in GGUF Q8_0, 4-bit ≈ 0.55-0.6). Source: file sizes from the helper.
2. **Working memory depends on the architecture:**
   - Whisper-style (fixed 30-second windows): constant per window, independent of file length; batching windows multiplies it. Source: Whisper/transcribe.cpp docs; faster-whisper table (batch 8 raised VRAM from 4.5 to 6.1 GB).
   - Conformer/Parakeet with full attention over the whole file: grows faster than linearly with file length; Parakeet v3 reaches about 24 minutes on an 80 GB A100 with full attention and needs local attention beyond that (up to 3 h). Source: Parakeet v3 card.
   - Audio-LLMs (Qwen3-ASR, Nemotron Transcribe): audio becomes 12.5 tokens per second (both models, 80 ms per token), plus the transcript (up to about 6 tokens per second of audio). One hour ≈ 45,000 audio tokens + transcript ≈ 65,000-74,000 tokens. KV cache grows linearly with that; Nemotron's Mamba-hybrid keeps it near 0.5 GB per hour of audio. Sources: Qwen3-ASR technical report; NeMo-Speech.cpp configuration doc.
   - Several files at once (servers) multiply working memory by the number of parallel requests (NeMo-Speech.cpp `max_sequences`).
3. **Mixture-of-experts (Nemotron):** speed per token follows the active parameters (about 4.3B), memory follows the total (about 34B). Keeping experts in system RAM makes an 8-16 GB GPU usable but much slower. Source: Nemotron card; NeMo-Speech.cpp configuration doc.
4. **Speed is a real-time factor.** RTFx = audio seconds / compute seconds; time for a file = audio length / RTFx. For CTC/TDT models (Parakeet) RTFx is nearly constant in length. For Whisper and audio-LLMs, time also grows with the number of words, since text is generated token by token. Source: leaderboard About tab; Nemotron card ("not a single-request latency estimate").
5. **Leaderboard RTFx is batched server throughput on an H200.** A single file on a consumer device is 5-100x slower than that number. Consumer figures we have (all community, single stream): Parakeet v3 35x on a desktop CPU, 91x on an RTX 5070 Ti (CUDA), 318x with TensorRT; Whisper turbo 4-6x on CPU, 51-76x on M4 Max Metal / RTX 5070 Ti; Qwen3-ASR-1.7B 2.3x (laptop CPU) to 37x (M4 Max Metal); Moonshine Small 9x (laptop CPU) to 49x (M4 Max CPU). Rule of thumb for the calculator: "real time or better" is reached by every model here on a recent CPU except Nemotron; Nemotron needs a GPU with the weights mostly in VRAM.
6. **Streaming vs file transcription.** Streaming models (Moonshine, Voxtral Realtime, Nemotron ASR Streaming, Qwen3-ASR via vLLM) are judged by delay after you stop talking (Moonshine Small about 0.15 s on an M3) and compute load (fraction of real time). Offline models (Whisper, Parakeet, Nemotron Transcribe) are judged by RTFx.

## How memory and speed really scale: summary for the calculator

This pulls the per-kind rules above into one place. Sources are given in the per-kind sections; anything marked
"estimate" is my own derivation.

### Memory (image and video)

1. **Stages.** A run has three stages: text encoding, sampling (denoising), decoding (VAE). ComfyUI and Diffusers with
   offload hooks keep only one stage's models on the GPU, so
   `peak VRAM ≈ max(text_encoder, weights × weights_resident_fraction + activation, VAE + decode buffers)`.
   Without offloading, everything adds up: `weights + text_encoder + VAE + activation`.
2. **Activations grow in proportion to the number of tokens** when memory-efficient attention is used (all current
   runtimes). Use `activation_gb_at_typical × (workload tokens / typical tokens)`, which for images is the megapixel
   ratio and for video the ratio of `megapixels × seconds × fps`. This is what the builder's `workloadScale().mem`
   already does. For editing, add the megapixels of the reference images to the output megapixels (the ComfyUI
   templates shrink each reference to about 1 MP).
3. **Tokens per image or clip** (for comparing models): image tokens ≈ pixels / (16 × 16) for most models (8x VAE plus
   2x2 patches: Qwen-Image, FLUX, Z-Image, Krea) and pixels / (32 × 32) for MiniMax-H3-Image. Video tokens: see the
   formula and table in the video section (one token covers 16 or 32 pixels square and 4 or 8 frames).
4. **Decode.** VAE decoding of large images or long clips can need more memory than sampling (Alibaba's Wan 2.2 5B
   script peaked at 22.9 GB with 10 GB of weights). ComfyUI tiles the decode automatically when memory runs short,
   so for a ComfyUI-style estimate the sampling stage sets the peak. If the target runtime cannot tile, add 2-10 GB
   for video (estimate).
5. **System RAM for offloading.** Offloading saves VRAM but needs system RAM and costs speed:
   `system RAM ≳ all model files at the chosen precision + 8-16 GB` (estimate from the H3-Image report: 41 GB of RAM
   in use for a 21 GB model plus a 27 GB encoder streamed in turn). Plan on 2-4x slower when the sampling model does
   not fit (Kandinsky 6 Pro vendor table: H100 88 s, RTX 4090 with block offload 235 s, 16 GB RTX 5060 Ti 718 s).
6. **Runtime choice changes the numbers.** Diffusers without offload hooks keeps every component on the GPU:
   Qwen-Image-2.1 fp8 peaked at 21.3 GB with 16.6 GB of weights; BFL measured FLUX 3 klein at 31 GB in bf16 with about
   20 GB of weights. The `vram_gb` and activation figures in this file assume ComfyUI-style behaviour.
7. **Format support by GPU generation.** fp8 compute needs RTX 40 or newer (older cards can load fp8 files but run
   them at bf16 speed); int8 ConvRot works on RTX 30 and AMD; nvfp4 needs RTX 50 (Blackwell).
8. **Apple Silicon** has unified memory: usable "VRAM" is roughly 65-75% of system RAM by default (macOS limit,
   estimate). Image models run through mflux and Draw Things; video is possible but 10-50x slower than an RTX 4090
   (estimate from one Wan 2.2 report).

### Speed (image and video)

1. `time ≈ steps × passes_per_step × per_step_cost(tokens) + text encoding + decode (+ offload overhead)`.
   `passes_per_step` is 2 with classifier-free guidance (Wan 2.2, HunyuanVideo non-distilled, Ideogram 4,
   Qwen-Image-Edit-2511 at full quality, SDXL) and 1 for distilled checkpoints. Time is linear in steps.
2. **Images:** per-step cost grows with pixel count to the power 1.0-1.3. Measured: Qwen-Image-2.1 4x pixels →
   6x time (exponent 1.3); MiniMax-H3-Image 4x pixels → about 4x (exponent 1.0, coarse tokens). The builder's 1.15
   is a reasonable default.
3. **Video:** `per_step_cost ∝ tokens × (1 + tokens / (6 × hidden_size))` (estimate from transformer FLOP counts).
   As a single exponent on tokens: Wan 2.2 A14B 480p → 720p measured 1.39-1.54; MiniMax H3 5 s → 10 s → 15 s measured
   1.05-1.14. The builder's 1.35 sits in the middle; use about 1.5 for HunyuanVideo 1.5 at 720p (attention-dominated)
   and about 1.1 for LTX-2.5 and H3 (few tokens).
4. **GPU-to-GPU scaling:** fp16 tensor throughput is a fair proxy for diffusion models. Measured SDXL ratios versus an
   RTX 4090: RTX 3090 0.5x, RTX 4070 0.45x, RTX 4060 0.2x (ComfyUI GitHub #2970). Attention kernels add up to 2x
   (SageAttention, flash attention); fp8 or int8 weights add 10-70% on cards that support them.
5. **First run** after loading is about 2x slower (weights loading, compilation).

### Speech (TTS and STT)

1. **Memory ≈ weight files + a small extra part** (`activation_gb_at_typical`). No text encoder, no resolution.
   Autoregressive TTS and audio-LLM ASR keep a cache that grows linearly with audio length but stays small:
   12.5 audio tokens per second for Qwen3-ASR, Nemotron Transcribe and Qwen3-TTS; 6-25 tokens per second for other TTS
   models. Exceptions: Parakeet's encoder attends over the whole file, so memory grows faster than linearly with file
   length (about 24 minutes per pass on an 80 GB A100 with full attention; local attention beyond that). Whisper
   works in 30 s windows, so its memory is constant per window.
2. **Speed is a real-time factor.** TTS: `RTF = generation time / audio length` (lower is better); STT:
   `RTFx = audio length / processing time` (higher is better). Time is close to linear in audio length for all models
   here. For one user (batch 1) speech models are limited by memory bandwidth and per-step overhead more than by
   compute, so scale between GPUs by memory bandwidth (estimate; consistent with faster-qwen3-tts: an RTX 4060 is
   2.3-3.6x slower than an RTX 4090, close to their 3.7x bandwidth ratio and far from their compute ratio).
3. **The runtime often matters more than the GPU.** Qwen3-TTS 1.7B on an RTX 4090: 0.82x real time with Qwen's own
   code, 4.2x with faster-qwen3-tts (CUDA graphs). The file uses the stock-code figure; show the optimised runtime as
   a hint. Q8 GGUF builds (llama.cpp, audio.cpp) cut memory by up to 37% with similar or better speed.
4. **Leaderboard RTFx (H200, batched) is server throughput.** A single file on a consumer device is 5-100x slower
   than that. The STT references in this file therefore use single-file measurements on consumer hardware where they
   exist (Parakeet, Whisper, Qwen3-ASR, Moonshine).
5. **Mixture-of-experts** (Fish Drama 3 35B with about 3B active, Nemotron Transcribe 34B with 4.3B active,
   ZONOS3-Mini 0.8B with 0.1B active): memory follows the total parameters, speed follows the active ones. Experts
   can be kept in system RAM to fit a smaller GPU, at a large speed cost.
6. **Text length to audio length:** about 15 characters (2.5 English words) per second of speech; 1 minute of audio
   per 900-1,000 characters.

## Maintainer details moved out of the UI notes (2026-11-23)

On 2026-11-23 the user-visible text fields of models-media.json were rewritten in plain English for beginners (`notes`, `good_for`, `weak_at`, `license_note`, `output_limits`, `speed_scaling`).
The previous wording held maintainer detail that no longer appears in the UI: llama.cpp PR and build numbers, exact field semantics,
repo names and per-file quant sizes (Unsloth, ggml-org, Comfy-Org and others), benchmark names and scores, and source attributions.
It is kept below verbatim, per model id, so nothing is lost. Only fields whose content changed beyond spelling or a final full stop are listed.

### `minimax-h3-image` (MiniMax-H3-Image)

- Previous `good_for`: Top-rated open model for both new images and edits; makes very large, detailed images up to 16 MP.
- Previous `license_note`: Not licensed for use in the EU, UK, South Korea or USA. Elsewhere it is free to use, including commercially, unless your company earns over US$1M a year or you offer it as a hosted service; then you need written permission. Commercial products must display "MiniMax-H3-Image".
- Previous `output_limits`: About 4-20 MP, best near 16 MP (4096x4096 up to 6272x2688), any aspect ratio, edges in multiples of 32 px. Text-to-image and editing with up to 16 reference images in one checkpoint. Works best with long, detailed English prompts (prompt expander recommended). No negative prompt.
- Previous `speed_scaling`: Always 6 steps. In the reported tests time grew about in line with pixel count (4x the pixels took about 4x as long). Each reference image adds work: one 4 MP reference raised step time from 1.1 s to 1.7 s. The first image after starting is about 2x slower while weights load.
- Previous `notes`: Ranked #1 among open-weight models on Artificial Analysis text-to-image (Elo 1066) and image editing (Elo 1135) in Nov 2026. 33.1B DiT per the model card; text encoder is loaded from MiniMaxAI/MiniMax-H3 (66.7 GB bf16). bf16 size = official transformer folder (66.3 GB). int8 and w4a8 sizes are Comfy-Org/MiniMax-H3-Image 'pruned' DiT files (about 20B stored parameters; what was pruned is not documented). Comfy's text encoder files are 27.1 GB int8 or 15.7 GB nvfp4 (Comfy-Org/MiniMax-H3-Image, checked 2026-11-19). GGUF sizes from unsloth/MiniMax-H3-Image-GGUF (pruned DiT). Kijai (Comfy) recommends int8 over w4a8 for quality. Speed and the 12 GB minimum come from one community report; the comfortable figure is my estimate from file sizes. Officially supported runtimes per the model card.

### `qwen-image-2.1` (Qwen-Image-2.1)

- Previous `good_for`: Readable text in images, transparent PNGs, and edits that combine many reference images, at native 2K.
- Previous `output_limits`: Native 2K (2048x2048, presets up to 2752x1536); above 2K prompt following drops (ComfyUI docs). Text-to-image, editing with up to 10 reference images (ComfyUI docs say 16), local edits marked by circles or masks, transparent (RGBA) output, strong text rendering. Also edits images.
- Previous `speed_scaling`: Time = steps x per-step cost. Per-step cost grows faster than pixel count: 4x the pixels took 6x as long in one test, and the ComfyUI docs give about 0.3 s per step at 1 MP versus 6 s per step at 12 MP on an RTX 5090. The Turbo checkpoint (8 steps) is roughly 3-5x faster than 25-40 steps. In edits, large reference images drive the cost; scaling them to about 1 MP speeds things up.
- Previous `notes`: Artificial Analysis open-weights #2 for text-to-image (Elo 1047) and #3 for editing (Elo 1082), Nov 2026. Official 8-step Qwen/Qwen-Image-2.1-Turbo has the same size and license. The HF parameter count (7.1B) is the DiT only; the repo totals 33.1 GB in bf16 (DiT 14.2 + text encoder 17.5 + VAE 1.35 GB stored fp32). int8 = Comfy-Org/Qwen-Image-2.1 int8 ConvRot file; GGUF = unsloth/Qwen-Image-2.1-GGUF. Comfy also ships the text encoder as int8 (9.4 GB) and w4a8 (6.3 GB). The license is dated 20 Sep 2026; earlier Qwen-Image releases were Apache-2.0, this one is not.

### `flux3-image-klein` (FLUX 3 Image Klein)

- Previous `good_for`: Editing photos by plain instructions with up to 10 reference images; ranked third among open models despite its small size.
- Previous `weak_at`: Mixed feedback on faces; commercial use only under US$5M revenue
- Previous `license_note`: Free for non-commercial use. Commercial use of the images is allowed only if your organisation's annual revenue is under US$5M, and you must filter or review outputs. No country exclusions found. The text encoder and prompt upsampler are Apache-2.0.
- Previous `output_limits`: Instruction editing, text-to-image, up to 10 reference images, bounding-box layout in the prompt. BFL does not state a maximum output size (templates default to 1 MP). Text rendering works but can be distorted. Short prompts give generic results unless the prompt upsampler is on.
- Previous `speed_scaling`: Time = steps x per-step cost. The distilled checkpoint runs 4-16 steps; the base checkpoint runs 50 steps with CFG and is several times slower. Per-step cost grows with output pixels plus reference-image pixels (ComfyUI templates shrink each reference to about 1 MP). The required prompt upsampler is a 9B language model that writes a long caption first; its time is not in BFL's figures.
- Previous `notes`: Artificial Analysis open-weights #3 for text-to-image (Elo 1041) and #4 for editing (Elo 1069), Nov 2026. BFL labels it 5.6B; the safetensors count is 5.55B. bf16, fp8 and nvfp4 sizes from the official repo (variants/fp8r, variants/nvfp4); int8 from black-forest-labs/flux-3-image-klein-comfy; GGUF from unsloth/flux-3-image-klein-GGUF. Prompt upsampler files: bf16 18.8, int8 9.8, w4a8 6.7 GB. int8 also works on RTX 30-series cards without FP8; nvfp4 needs an RTX 50 (Blackwell) card. Base checkpoint black-forest-labs/flux-3-image-klein-base is for fine-tuning. Early user feedback in the HF discussions is mixed (complaints about faces and anatomy), so portraits may not match the arena score. The 4 s vendor figure does not state the step count; typical_workload assumes the 16-step default. text_encoder_gb counts the Qwen3-VL-4B encoder only; the prompt upsampler (18.8 GB bf16, 9.8 GB int8, 6.7 GB w4a8) also runs before sampling when enabled and can be unloaded afterwards.

### `hidream-o1-image` (HiDream-O1-Image)

- Previous `good_for`: MIT-licensed all-in-one model: images, edits, personalisation and long text at 2K, with no separate text encoder.
- Previous `weak_at`: Slow at the official 28-50 steps; ranks below the 2026 leaders
- Previous `license_note`: Permissive: commercial use allowed. The optional Gemma-based prompt agent has its own license.
- Previous `output_limits`: Up to 2048x2048. Text-to-image, long text rendering, instruction editing (one reference image), subject-driven personalisation and storyboards in one model. Also edits images.
- Previous `speed_scaling`: About 2-2.5 s per step at 2048x2048 on an RTX 4060 Ti, so the official 50-step full model takes roughly 2 minutes there and the 28-step Dev roughly 1 minute (estimate from the measured step time). The model works directly on pixels, so cost rises quickly with resolution.
- Previous `notes`: Artificial Analysis open-weights text-to-image Elo 979, editing Elo 952 (Nov 2026). Pixel-level unified transformer: no VAE and no separate text encoder. Variants: HiDream-O1-Image-Dev (28 steps, Elo 810) and HiDream-O1-Image-Dev-2604. bf16, fp8_scaled and mxfp8 sizes from Comfy-Org/HiDream-O1-Image; GGUF from moonbox-dev/HiDream-O1-Image-GGUF (few downloads; loader support not verified). The reference code needs flash-attn or a one-line edit. On RTX 40 cards with enough VRAM, mxfp8 ran slower than bf16 (same community report). Speed test used 12 steps, fewer than the official 28/50. text_encoder_gb is 0 because the model reads the prompt itself; the optional Gemma-based prompt agent is not counted.

### `krea-2-turbo` (Krea 2 Turbo)

- Previous `good_for`: Often praised for attractive, stylised looks across a wide range of styles; official style LoRAs.
- Previous `weak_at`: No editing; quality not yet independently ranked
- Previous `license_note`: Commercial use of the model and its images is allowed only if your company's total annual revenue is under US$1M; above that you need an enterprise license. Deployers must add content filtering. No country exclusions found.
- Previous `output_limits`: Text-to-image only, 1K to 2K output. Strong aesthetics and wide style range; official style LoRAs. No official editing.
- Previous `speed_scaling`: Turbo uses a fixed 8 steps; Raw uses 52 steps with CFG and is roughly 10x slower. Per-step cost grows with pixel count, so a 2 MP image takes at least twice as long as 1 MP (estimate).
- Previous `notes`: Not on the Artificial Analysis open-weights board as of Nov 2026, so quality ranking is unverified. Model card says 12 billion parameters; the safetensors count is 12.8B (12.5B bf16 + 0.3B fp32); BFL's blog cites 12.9B. Release date on the card: 22 Jun 2026. Sizes from Comfy-Org/Krea-2 (bf16, fp8_scaled, int8 ConvRot, nvfp4); GGUF from vantagewithai/Krea-2-Turbo-GGUF (its Q4_K_M and Q4_0 files are the same size). Base checkpoint: krea/Krea-2-Raw. Single reports: about 146 s per 1024x1024 image on a 16 GB M1 Pro MacBook (third-party Siliconed app) and about 9 s per 1 MP image on an AMD RX 9070 XT (ROCm, int8).

### `ideogram-4` (Ideogram 4)

- Previous `good_for`: Built for typography: posters, logos and layouts with lots of readable text, exact colours and placement.
- Previous `weak_at`: Non-commercial licence; two transformers make it heavy
- Previous `license_note`: Non-commercial only. Using the images in, or to promote, revenue-generating products is not allowed.
- Previous `output_limits`: Text-to-image only. Any size from 256 to 2048 px per side (multiples of 16), aspect ratios up to 6:1. Best-in-class text and typography, JSON prompts, bounding-box layout, hex colour palettes, multilingual text.
- Previous `speed_scaling`: Every step runs both transformers (guidance), so a step costs about twice a single pass. The default is 48 steps; the 20- and 12-step presets are about 2.4x and 4x faster with some quality loss. Per-step cost grows with pixel count.
- Previous `notes`: Artificial Analysis open-weights #5 (Ideogram 4.0 Quality preset, Elo 1026) and #6 (default, Elo 1003), Nov 2026. HF repo created 30 May 2026; Artificial Analysis lists June 2026. Per-file sizes: fp8 9.3, int8 9.6, nvfp4 5.5, nf4 5.2, GGUF Q4_0 5.6 GB; two files are needed. fp8 and nf4 sizes are official (ideogram-ai/ideogram-4-fp8, -nf4); int8 and nvfp4 from Comfy-Org/Ideogram-4; GGUF Q4_0 from leejet/ideogram-4-GGUF. The nf4 repo is CUDA-only. SageAttention does not work (head size 256); flash-attn gives about 1.5x on an RTX 5090 (Kijai). params_total_b and weights_gb_by_precision count both 9.3B transformers (with and without the prompt), because both are used at every step; each single file is half the listed size. speed_reference.seconds = measured seconds per step x 48.

### `z-image-turbo` (Z-Image-Turbo)

- Previous `good_for`: Fast photorealistic images in 8 steps on mid-range cards; the most downloaded efficient image model.
- Previous `weak_at`: Little variety between seeds; no editing yet
- Previous `output_limits`: Text-to-image only (Z-Image-Edit is announced but not released). 1024x1024 typical, up to about 2K. Good photorealism and English and Chinese text. Little variety between seeds (a side effect of distillation).
- Previous `speed_scaling`: Fixed 8 steps. Per-step cost grows with pixel count; one report gives about 4.8 s for a 2K image on an RTX Pro 6000. On an M6 Mac mini a 1024x1024 image takes about 37-40 s with mflux or Draw Things, about 15x the RTX 4090 time.
- Previous `notes`: Artificial Analysis open-weights text-to-image Elo 937 (Nov 2026). Most downloaded model in this list (811k HF downloads in 30 days). The 2.3 s figure is repeated by several sites (comfyui-wiki, runaihome, thundercompute) but the original measurement is not traceable; others report 2-4 s on an RTX 4090. Z-Image (base, 50 steps, Jan 2026) exists for fine-tuning; Z-Image-Omni-Base and Z-Image-Edit are still marked 'to be released' and their HF repos are not public (checked 2026-11-19). Sizes: Comfy-Org/z_image_turbo (bf16, int8 ConvRot, nvfp4) and unsloth/Z-Image-Turbo-GGUF. Mac timing from one third-party benchmark (h3metal author) on an M6 Mac mini.

### `flux2-klein-4b` (FLUX.2 [klein] 4B)

- Previous `good_for`: Near-instant 4-step drafts and simple multi-image edits on 8 GB cards, free for any use.
- Previous `weak_at`: Weaker text rendering and prompt following than larger models
- Previous `output_limits`: Text-to-image and multi-reference editing in one model. 1024x1024 typical. Text rendering and prompt following are weaker than larger models. Also edits images.
- Previous `speed_scaling`: The distilled model uses 4 steps; the base model uses 50 steps with CFG and is about 15x slower (ComfyUI docs: about 17 s vs 1.2 s on an RTX 5090). Per-step cost grows with output and reference pixels. On an M6 Mac mini a 1024x1024 image takes about 17 s in Draw Things.
- Previous `notes`: Artificial Analysis open-weights text-to-image Elo 840, editing Elo 941 (Nov 2026): below Z-Image-Turbo for generation, but it also edits. Quality is superseded by FLUX 3 Image Klein; kept because it is Apache-2.0 and smaller. The 9B sibling is non-commercial. Sizes: bf16 from the official repo; fp8 and nvfp4 from official repos black-forest-labs/FLUX.2-klein-4b-fp8 and -nvfp4; GGUF from unsloth/FLUX.2-klein-4B-GGUF. Base checkpoint black-forest-labs/FLUX.2-klein-base-4B is for fine-tuning. Resolution of the ComfyUI speed figure is not stated (likely 1024x1024). Mac timing from one third-party benchmark.

### `qwen-image-edit-2511` (Qwen-Image-Edit-2511)

- Previous `good_for`: Keeps faces and products consistent across edits and can rewrite text in photos; full commercial rights.
- Previous `weak_at`: Large: needs 24-32 GB, or slow offloading
- Previous `output_limits`: Instruction editing with one or more input images (the official example uses two): people and product consistency, text editing, new viewpoints, lighting changes. Output size follows the input. Chinese and English text.
- Previous `speed_scaling`: Full quality uses 40 steps with true CFG, so each step runs the model twice: roughly 20x the 4-step Lightning time, about 1-2 minutes per edit on an RTX 5090 (estimate). Cost grows with the size and number of input images.
- Previous `notes`: Artificial Analysis open-weights editing Elo 996 (listed as Qwen Image Edit Plus 2511), Nov 2026: below Qwen-Image-2.1 and FLUX 3 Image Klein, but the best-rated editor here with a fully permissive license. Still heavily used: Comfy-Org/Qwen-Image-Edit_ComfyUI had 1.9M downloads in 30 days. The 4-step Lightning LoRA is from lightx2v (community, used in the official ComfyUI template). Sizes: bf16, fp8mixed and int8 ConvRot from Comfy-Org/Qwen-Image-Edit_ComfyUI; GGUF from unsloth/Qwen-Image-Edit-2511-GGUF. A community nvfp4 (ANXS1) is 19.8 GB because it keeps many layers in higher precision. Speed is one community report. The speed reference uses the community 4-step Lightning LoRA (lightx2v), as in the official ComfyUI template; the official 40-step setting with CFG is roughly 20x slower. typical_workload megapixels counts the output only; one input image of similar size adds about as many tokens again.

### `sdxl-base-1.0` (Stable Diffusion XL 1.0)

- Previous `good_for`: Runs on old 4-8 GB GPUs and has the largest library of community styles, LoRAs and ControlNets.
- Previous `weak_at`: Older quality: weak text and prompt following
- Previous `license_note`: Commercial use allowed, with use-based restrictions (no illegal or harmful uses).
- Previous `output_limits`: Text-to-image, 1024x1024 native. Short prompts (77-token CLIP encoders), weak text rendering, weaker prompt following than 2025-26 models. Very large library of community add-ons (LoRAs, ControlNets, fine-tunes).
- Previous `speed_scaling`: Time = steps x per-step cost; per-step cost grows about with pixel count. CFG runs two passes per step (included in the figures). Community-distilled Turbo/Lightning variants cut steps to 1-8.
- Previous `notes`: Not on Artificial Analysis's 2026 board; quality is well below Z-Image-Turbo and FLUX.2 [klein] 4B. Kept as the lowest tier and for its add-on ecosystem (4.8M HF downloads in 30 days, some of it automated). Sizes from the official repo (unet fp16 and fp32 files). Speed figures are from a 2024 ComfyUI GitHub benchmark thread (SDXL base, 20 steps, second run). The 4 GB minimum is common community practice, not verified here.

### `minimax-h3` (MiniMax H3 (Base, pruned for local use))

- Previous `license_note`: No rights at all in the EU, UK, South Korea or USA (not even hobby use) unless you buy a paid licence (Comfy is the official reseller). Elsewhere free, also commercially, under $20M yearly revenue; commercial products must show 'MiniMax H3'.
- Previous `output_limits`: 4-15 s per clip at 24 fps; 768 px short side locally (2K needs MiniMax's hosted Regenerate-2K step, not open-sourced); many aspect ratios from 21:9 to 9:16; 32 kHz stereo audio with dialogue in 11 languages (Arabic, Chinese, English, French, German, Italian, Japanese, Korean, Portuguese, Russian, Spanish); inputs: text, first and/or last frame, or up to 9 reference images + 3 videos + 3 audio clips (voice reference supported).
- Previous `speed_scaling`: Time = steps x per-step cost (released weights are CFG-distilled, so one model pass per step). One token covers 32x32 pixels x 4 frames, so 5 s at 768p is about 31k tokens and 480p about 12.5k. Cost grows faster than the token count: in SGLang's tests 10 s took 2.1x and 15 s took 3.5x the time of 5 s. The turbo LoRA (4 or 8 steps instead of 20-50) is the biggest speed lever.
- Previous `notes`: Two checkpoints: FL2VA (text-to-video, first/last frame) and Ref2VA (multi-reference); each is 66.3 GB bf16 unpruned. Weight sizes: bf16/fp8/int8 from Comfy-Org/MiniMax-H3 (pruned files, also w6a8 16.0 GB); GGUF from unsloth/MiniMax-H3-GGUF (Q8_0 21.4, Q4_K 11.4, Q2_K 6.7; also leejet/MiniMax-H3-GGUF for stable-diffusion.cpp); NVFP4 12.5 GB is community (Abiray/Minimax-H3-nvfp4-INT4-INT8-Convrot), Blackwell GPUs only. Text encoder: ComfyUI ships it as bf16 51.5 / int8 27.1 / nvfp4 15.7 GB, GGUF Q4_K_M 18.2 GB; WanGP offers a distilled 4B encoder of about 5 GB. MiniMax's prompt-rewriting stage (H3-Context-IR) is API-only; quality depends on long structured prompts (official prompt guide, or community rewriter models from lightx2v). Sparse attention is announced but not in the first open release. Turbo LoRA is from lightx2v (third party) but ships in Comfy-Org's repo and official templates. Most downloaded open video model in Nov 2026 (Comfy-Org repo 33M downloads in 30 days). Speed numbers are SGLang project measurements, not MiniMax claims. Apple Silicon: listed by stable-diffusion.cpp (Metal backend) but no speed reports; expect it to be impractical (estimate). text_encoder_gb is the official bf16 encoder in MiniMaxAI/MiniMax-H3 (about 66.7 GB); text_encoder_gb_by_precision lists the ComfyUI files, whose bf16 copy is already trimmed to 51.5 GB. The speed reference is a 4.5 s clip (107 frames) with layer-wise offload.

### `ltx-2.5` (LTX-2.5 (22B, distilled and dev))

- Previous `good_for`: The fastest large model here: sharp clips with sound in about a minute on a 32 GB card.
- Previous `weak_at`: Paid licence above US$10M revenue; gated download
- Previous `license_note`: Free, including commercial use, for organisations under $10M yearly revenue (counted across the whole group); above that a paid licence is needed. No country exclusions.
- Previous `output_limits`: Frame count must be 8k+1 (e.g. 121) and sides multiples of 32; up to 4K and 50 fps with the upscalers per Lightricks; the hosted API caps clips at 20 s (10 s for most settings), local length is limited by memory. Multi-shot scenes in one pass; synchronized speech, effects and music; also audio-to-video and video-to-audio. Card lists English, German, Spanish, French, Japanese, Korean, Chinese, Italian, Portuguese.
- Previous `speed_scaling`: Very compact latents (one token per 32x32 pixels x 8 frames), so token counts stay low and it is the fastest large model here. Time = steps x frames x pixels and grows faster than linear for long or high-resolution clips. The distilled model needs 8 steps plus 4 refine steps; the dev model needs 20-40 steps with guidance (several times slower). At 1080p the new diffusion decoder can take a large share of the total time; the conv decoder is faster.
- Previous `notes`: Repo is gated (click-through that also asks consent to marketing); Diffusers copy at Lightricks/LTX-2.5-Diffusers (also gated). One repo holds both dev and distilled transformers; the distilled one is what the ComfyUI templates use. 22B is Lightricks' figure; the single-file bf16 transformer is 42.0 GB. Official files: bf16 42.0, ComfyUI int8 21.5 (ComfyUI only), NVFP4 18.7 (distilled only, Blackwell). Community: fp8 19.1 GB (unsloth/LTX-2.5-FP8), GGUF from unsloth/LTX-2.5-GGUF (Q8_0 22.8, Q4_K_M 13.6, Q2_K 8.5). Text encoder: bf16 26.3 GB, official int8 15.4 GB; optional prompt enhancer about 5 GB. Most LTX-2.3 LoRAs work on 2.5. Speed: one blog benchmark (5 runs) and one user report; no official consumer-GPU timings. Apple Silicon: LTX-2.3 runs in Draw Things and mlx-video; LTX-2.5 on Mac only via stable-diffusion.cpp (Metal) with no speed reports. The benchmark blog does not report steps or the two-stage settings; typical_workload assumes the distilled default (8 steps plus 4 refine steps).

### `wan2.2-a14b` (Wan 2.2 A14B (text-to-video / image-to-video))

- Previous `good_for`: Good motion and the largest ecosystem of LoRAs, control and first/last-frame workflows, under Apache 2.0.
- Previous `weak_at`: No sound; slow at the full 40 steps without speed-up LoRAs
- Previous `output_limits`: 480p and 720p; trained on 81 frames at 16 fps (5 s), longer clips need extension workflows; no audio. Separate checkpoints for text-to-video and image-to-video; first/last-frame works with the image-to-video model.
- Previous `speed_scaling`: Time = steps x 2 (guidance) x per-step cost. One token covers 16x16 pixels x 4 frames, so 720p has 2.3x the tokens of 480p, but it took 3.2x (H100, Alibaba) to 3.6x (RTX 5090, LightX2V) as long because attention cost grows faster than the token count. Longer clips scale the same way. Community 4-step distillation LoRAs (no guidance) cut time about 10-20x.
- Previous `notes`: Image-to-video sibling: Wan-AI/Wan2.2-I2V-A14B (same size; more used). Alibaba calls the pair 27B total / 14B active; file sizes give 14.3B per expert. Sizes: fp16 and fp8_scaled from Comfy-Org/Wan-2.2 (28.6 / 14.3 GB per expert); GGUF from QuantStack/Wan2.2-T2V-A14B-GGUF and -I2V- (Q8_0 15.4, Q4_K_M 9.65, Q2_K 5.3 GB per expert). Text encoder 11.4 GB fp16 / 6.7 GB fp8. The popular 4-step LoRAs (lightx2v, ModelTC) are third-party, but Comfy-Org repackages them. NVFP4 exists only as LightX2V's distilled sparse variant (8.4 GB per expert). Wan 2.5, 2.6, 2.7 and 3.0 are API-only; 2.2 is the latest open Wan. Apple Silicon: supported by Draw Things and mlx-video but very slow (one M1 Max 64 GB report: 82 min for a 2 s clip in ComfyUI GGUF). weights_resident_fraction 0.5: the two 14B experts run one after the other, so only half of the listed weights must be on the GPU at once; the other half waits in system RAM.

### `wan2.2-ti2v-5b` (Wan 2.2 TI2V-5B)

- Previous `weak_at`: Clearly lower quality than the 14B and newer audio models
- Previous `output_limits`: Trained for 720p (1280x704 or 704x1280) at 24 fps, 121 frames (5 s); text-to-video and image-to-video in one model; no audio.
- Previous `speed_scaling`: Its VAE packs 32x32 pixels x 4 frames into one token, so 5 s at 720p is about 27k tokens (the 14B models need about 76k for the same clip). Time = steps x 2 (guidance) x per-step cost and grows faster than linear with resolution and length. Community step-distilled versions (e.g. FastWan, Turbo GGUFs) cut 50 steps to 3-8.
- Previous `notes`: Sizes: fp16 10.0 GB from Comfy-Org/Wan-2.2; fp8 5.3 GB from Kijai/WanVideo_comfy_fp8_scaled; GGUF from QuantStack/Wan2.2-TI2V-5B-GGUF (Q8_0 5.4, Q4_K_M 3.4, Q2_K 1.9 GB). The official repo stores the VAE as a 2.8 GB .pth; ComfyUI's copy is 1.4 GB. Quality is clearly below the 14B models and the newer audio models, but it is the lightest current official model from a major lab. Speed and memory numbers are Alibaba's own (single RTX 4090, offload on, 50 steps).

### `hunyuanvideo-1.5` (HunyuanVideo 1.5)

- Previous `good_for`: Renders readable text inside the scene; quick 480p image-to-video with the step-distilled model.
- Previous `weak_at`: Not licensed in the EU, UK or South Korea; no sound
- Previous `license_note`: Not licensed in the EU, UK or South Korea. Elsewhere free, also commercially; services with over 100M monthly users need a separate licence.
- Previous `output_limits`: 480p and 720p; 121 frames by default, 5-10 s per ComfyUI's guide; 1080p via a separate super-resolution model; can render readable text in the scene; Chinese and English prompts; no audio.
- Previous `speed_scaling`: One token per 16x16 pixels x 4 frames with no further patching, so 5 s at 720p is about 112k tokens versus 49k at 480p; attention dominates and 720p is much more than 2x slower. Tencent offers CFG-distilled models (about 2x, still 50 steps), a step-distilled 480p model (8-12 steps, 75% less time on a 4090) and sparse attention for 720p (1.5-2x, H-series GPUs only).
- Previous `notes`: Separate checkpoints for 480p/720p and text/image-to-video, plus CFG-distilled and step-distilled variants and 720p/1080p upscalers. Official files are fp32 (33.3 GB each); sizes: fp16 16.7 / fp8_scaled 8.3 GB from Comfy-Org/Hunyuan-Video-1.5; GGUF from jayn7/HunyuanVideo-1.5_I2V_720p-GGUF (Q8_0 9.0, Q4_K_M 5.1 GB). Text encoder 16.6 GB bf16 / 9.4 GB fp8. Still well used a year on (Comfy-Org repo 748k downloads in 30 days). Speed figure is Tencent's claim; no independent consumer-GPU timing found. No known Apple Silicon path except stable-diffusion.cpp (Metal), untested. Tencent gives 8-12 steps for the step-distilled model; typical_workload uses 8.

### `kandinsky-6-lite` (Kandinsky 6.0 Video Lite)

- Previous `good_for`: The smallest model that makes video with matching sound, including lip-synced speech, under the MIT licence.
- Previous `weak_at`: Fixed 5-second clips; little community testing
- Previous `output_limits`: 5 s clips only (all released checkpoints are 5 s); 864x480 base, Full HD via a separate upscaler; synchronized 44 kHz audio including lip-synced speech; text-to-video and image-to-video. Prompt languages not stated.
- Previous `speed_scaling`: Clips are fixed at 5 s, so time mainly depends on steps: the distilled model needs 10 steps instead of 50 (about 4x faster in Kandinsky Lab's tests). About 50k video tokens per clip (16x16 pixels x 4 frames each), so attention is a large share of the cost despite the small model. Upscaling to Full HD with the separate super-resolution model roughly triples the total time (68 s to 209 s on a 4090).
- Previous `notes`: Distilled 10-step checkpoint: kandinskylab/Kandinsky-6.0-Lite-distill-5s-Diffusers (the more downloaded one, 6.4 GB bf16). The base checkpoint is 7.5 GB because some layers are fp32. int8 3.3 GB is community (kabachuha/Kandinsky-6.0-Lite-distill-5s-int8-convrot; WanGP's author also hosts one). Text encoder 16.6 GB bf16. ComfyUI support is a custom node from Kandinsky Lab; a native ComfyUI pull request was still open. Low adoption so far (about 2k downloads a month across Lite repos). Timings are Kandinsky Lab's own table (weight loading and MP4 encoding excluded). Apple Silicon: only an unofficial MLX conversion with no reports. Component params assume fp32 storage for CLIP, VAE, audio VAE and vocoder (estimate from file sizes).

### `kandinsky-6-pro` (Kandinsky 6.0 Video Pro)

- Previous `good_for`: Higher-quality video with sound under the MIT licence; its lab reports it beats LTX-2.5 in its own side-by-side tests.
- Previous `weak_at`: Very heavy (60 GB at 16-bit) and few users so far
- Previous `output_limits`: 5 s clips only; 864x480 base, Full HD via a separate upscaler; synchronized 44 kHz audio including lip-synced speech; text-to-video and image-to-video. Prompt languages not stated.
- Previous `speed_scaling`: Same clip format as Lite (fixed 5 s, about 50k video tokens). Time follows steps: distilled 10 steps versus 50 (about 4x faster). On cards that must stream weights from system RAM, transfer speed adds a lot: the 4090 is 2.7x slower than an H100 here, the 16 GB 5060 Ti about 3x slower than the 4090.
- Previous `notes`: Kandinsky Lab calls it 29B; the safetensors hold 30.1B. Base repo is gated (automatic click-through); the distilled 10-step repo kandinskylab/Kandinsky-6.0-Pro-distill-5s-Diffusers is open (60.3 GB bf16; base 69.7 GB with fp32 layers). Community quants: int8 30.5 GB (kabachuha/Kandinsky-6.0-Pro-distill-5s-int8-convrot), NVFP4 20.1 GB (coolthor/Kandinsky-6.0-Pro-distill-5s-NVFP4, Blackwell only), GGUF Q4_K_S 23.7 GB (realrebelai/Kandinsky-6.0-Pro-5s_GGUFs, low use). Kandinsky Lab claims Pro beats LTX-2.5 in its own side-by-side tests (unverified). Low adoption (about 1.6k downloads a month). Included because it is the only large audio-video model under a fully permissive license.

### `piper-voices` (Piper (voice collection))

- Previous `good_for`: Reads German, Swedish and about 50 other languages offline on any CPU, even a Raspberry Pi.
- Previous `weak_at`: Sounds robotic; no voice cloning
- Previous `license_note`: Commercial use depends on the voice: Piper's COMMERCIAL_USE page lists voices whose whole training chain allows it (re-download voices retrained in late 2026). The GPL only matters if you ship the engine itself.
- Previous `output_limits`: One language per voice file. About 50 language folders, including German (de_DE: thorsten, thorsten_emotional, kerstin, karlsson, eva_k, mls, pavoque, ramona) and Swedish (sv_SE: nst, alma, lisa). No voice cloning (a new voice must be trained). No practical length limit; text is read sentence by sentence.
- Previous `speed_scaling`: Time grows in a straight line with text length; the real-time factor stays about the same. On a Pi 4, going from 1 to 4 threads more than halves the time. A desktop CPU is many times faster than a Pi (no measured number found). x_low/low voices are faster, high voices slower.
- Previous `notes`: params_total_b is an estimate from the 63 MB fp32 ONNX file of a medium voice. Voice files and sizes verified with the HF API. Licence facts from the Piper LICENSING.md and COMMERCIAL_USE.md docs: Piper grants no licence over voices itself; a voice can inherit obligations from the voice it was fine-tuned from. Speed from the sherpa-onnx docs (measured on Pi 4). Older sources disagree on Pi 4 speed; the sherpa-onnx table is the only controlled one found. Not on the arenas (quality is clearly below modern neural TTS).

### `kokoro-82m` (Kokoro 82M v1.0)

- Previous `good_for`: Natural English from 54 preset voices, fast on a laptop CPU; top naturalness score on the Open TTS Leaderboard.
- Previous `weak_at`: No German or Swedish; no voice cloning
- Previous `output_limits`: 8 languages: American and British English, Spanish, French, Italian, Brazilian Portuguese, Hindi, Japanese, Mandarin. No German, no Swedish. 54 preset voices, no voice cloning. Long text is split into chunks automatically.
- Previous `speed_scaling`: Time grows in a straight line with text length. GPU: 35-100x real time on an RTX 4060 Ti (Kokoro-FastAPI benchmark); 39x real time on A100 (Open TTS Leaderboard). Raspberry Pi 4 with 4 threads: RTF 2.77, i.e. slower than real time (sherpa-onnx docs).
- Previous `notes`: Still the most downloaded TTS model on HF (13.1M downloads in 30 days, Nov 2026). Quality: Artificial Analysis Elo 1060 (#67); Open TTS Leaderboard English WER 0.69 (2nd) and top UTMOS naturalness 4.51. fp16/q8 sizes are the onnx-community ONNX files (model_fp16.onnx 0.16 GB, model_quantized.onnx 0.09 GB). VRAM is an estimate. Kokoro v1.1-zh (Chinese) exists separately.

### `phonon-31m-en` (Phonon 31M (English))

- Previous `good_for`: The fastest small English model here (16x real time on CPU), rated above many larger models; runs in Ollama.
- Previous `weak_at`: English only; no local voice cloning
- Previous `license_note`: Free for commercial use. The sibling Phonon 40M models (including German and a 5-language model) are CC BY-NC 4.0, non-commercial only.
- Previous `output_limits`: English only. About 100 preset voices (gradium/phonon-voices). No local voice cloning: cloning and voice design are only offered in Gradium's hosted studio. Ollama takes up to 4,096 characters per request and splits longer text.
- Previous `speed_scaling`: Streams one 80 ms frame at a time, so time grows in a straight line with audio length and the first sound arrives almost at once.
- Previous `notes`: Builds on Kyutai's Pocket TTS and the Mimi codec. Artificial Analysis Elo 1110 (#44 overall, above Fish S2 Pro, Voxtral and Kokoro), Open TTS Leaderboard English WER 0.73. Ollama added speech in Oct 2026 with Phonon as the only TTS model (docs: Ollama v0.40.9+). Gradium also hosts a llama.cpp GGUF repo (gradium/phonon-31m-en-llamacpp), but llama.cpp's TTS docs do not list Phonon, so it is left out of tools. Sibling phonon-40m-de had the lowest German WER (1.17) on the Open TTS Leaderboard but is non-commercial. One month old: little independent testing yet. The repo safetensors hold 41M parameters: 30.8M bf16 (the 31M model) plus 10.3M fp32 (the Mimi decoder).

### `pocket-tts` (Pocket TTS)

- Previous `good_for`: Clones a voice from a short clip on an ordinary laptop CPU, in English and six other European languages.
- Previous `weak_at`: No Swedish; German less accurate than larger models
- Previous `license_note`: Commercial use allowed with attribution. No cloning of people without consent (use policy).
- Previous `output_limits`: English, French, German, Portuguese, Italian, Spanish, Dutch (one model per language; slower 24-layer higher-quality variants for non-English). No Swedish. Voice cloning yes, from a short WAV. Tiny English models (18M, 7M, 2M) also exist.
- Previous `speed_scaling`: Streams audio frame by frame; time grows in a straight line with audio length. Kyutai says ≈ 6x real time on a MacBook Air M4 CPU and about 200 ms to first audio. Turning a WAV into a voice is slow; export it once as a voice embedding and reuse it.
- Previous `notes`: Sizes: per-language model.safetensors 0.22 GB (24-layer variants 0.67 GB); q8 GGUF 0.13 GB from audio.cpp-gguf. params from the GitHub README. German WER on the Open TTS Leaderboard was 6.16 (19th of 23), so German is understandable but less accurate than ZONOS3-Mini or Supertonic 3. The repo keeps adding checkpoints (english_2026-10, Dutch); pick the language with --language.

### `supertonic-3` (Supertonic 3)

- Previous `good_for`: A tiny reader for 31 languages, including German and Swedish, that runs on CPU or in a browser.
- Previous `weak_at`: Preset voices only; project archived in July 2026
- Previous `license_note`: Commercial use allowed, with use restrictions (no harmful uses, pass the restrictions on).
- Previous `output_limits`: 31 languages: en, ko, ja, ar, bg, cs, da, de, el, es, et, fi, fr, hi, hr, hu, id, it, lt, lv, nl, pl, pt, ro, ru, sk, sl, sv, tr, uk, vi (German and Swedish yes). Fixed preset voices only: no voice cloning in the open release. Simple expression tags such as <laugh>, <breath>, <sigh>.
- Previous `speed_scaling`: Not a streaming model: it makes a whole sentence at once, so first audio comes late (1.5-1.9 s in streaming tests) but total time is short. Time grows roughly in a straight line with text length.
- Previous `notes`: The project is archived: Supertone announced on 23 Jul 2026 that open-source development ends; the code and weights were moved to the supertone-oss-archive org (supertone-oss-archive/supertonic-3, same files). Voice Builder (paid custom voices) closed 31 Aug 2026. Still 84k downloads in 30 days. German WER 1.44 on the Open TTS Leaderboard (5th of 23). No vendor speed table remains in the archived README; numbers above are from the Open TTS Leaderboard.

### `chatterbox-multilingual-v3` (Chatterbox Multilingual V3)

- Previous `good_for`: Voice cloning from a 10-second clip in 23 languages, with a control for emotional intensity; MIT licence.
- Previous `weak_at`: Worst German accuracy in one independent test (version unclear)
- Previous `output_limits`: 23 languages: ar, da, de, el, en, es, fi, fr, he, hi, it, ja, ko, ms, nl, no, pl, pt, ru, sv, sw, tr, zh (German and Swedish yes). Voice cloning yes, from a ~10 s reference clip. Emotion 'exaggeration' control. Every output carries an inaudible Perth watermark.
- Previous `speed_scaling`: Autoregressive: time grows in a straight line with audio length. The runtime matters a lot: audio.cpp's GGUF build reports 6-9x real time on a CUDA GPU it does not name.
- Previous `notes`: V3 lives in the main ResembleAI/chatterbox repo (t3_mtl23ls_v3.safetensors, T3 weights added 22 Apr 2026; S3Gen v3 and model card 10 Jun 2026); pass t3_model="v3", the default is still V2. There is no separate chatterbox-multilingual repo. Param counts read from the safetensors headers (T3 535,989,248 fp32; S3Gen v3 264,015,943 fp32). bf16/q8 sizes are the ggml-org GGUF talker files; the separate mmproj file (decoder) adds 0.60 GB. Caution: on the Open TTS Leaderboard German set, ChatterboxMultilingualTTS had the worst word error rate of 23 models (13.1); it does not say whether V2 or V3 was tested. Artificial Analysis rates the original English Chatterbox at Elo 1020. English-only siblings: Chatterbox Turbo (350M), Nano (110M, vendor: 3x real time on 8 CPU cores), Flash (block diffusion, vendor: ~9x real time). In llama-server the multilingual model's CFG is not supported yet (llama-tts works).

### `zonos3-mini` (ZONOS3-Mini)

- Previous `good_for`: The most accurate commercially usable German in independent tests; clones voices in 43 languages, even on a laptop CPU.
- Previous `weak_at`: Brand new (Nov 2026); little community testing
- Previous `output_limits`: 43 languages, including German, Swedish, Danish, Norwegian and Finnish. 27 default voices. Voice cloning yes (reference clip up to 60 s, no transcript needed, or a speaker embedding). Voice design by age, accent and vocal texture; speaking-rate and loudness controls. Up to 10 minutes of audio per generation (vendor).
- Previous `speed_scaling`: Mixture-of-experts: 800M weights in memory but only ~100M used per step, so it runs like a small model. Streams 15 frames per second of audio; time grows in a straight line with length. Cloning from a fresh 10 s clip adds the encoding time once (RTF 0.84 on M3 CPU including it); cached voices skip it. Open TTS Leaderboard: 3.1x real time on an 8-vCPU CPU, 14x on A100 with 12 ms to first audio.
- Previous `notes`: Released 9 Nov 2026, ten days before this survey: no arena ratings yet and little community testing. On the Open TTS Leaderboard German set it had the 2nd-lowest word error rate (1.22) and the best of any commercially usable model. Weight sizes from ggml-org/ZONOS3-Mini-GGUF (BF16 1.61 GB, Q8_0 0.85 GB; the separate mmproj with codec and voices is 1.14 GB F32); Zyphra's own default GGUF package is 1.16 GB. Text normalization (numbers, dates) only covers 9 languages; for others, including Swedish, write numbers out. Successor of Zonos v0.1 and ZONOS2.

### `omnivoice` (OmniVoice)

- Previous `good_for`: Voice cloning in more than 600 languages, including rare ones, on a 4 GB GPU.
- Previous `license_note`: Non-commercial use only for the model weights.
- Previous `output_limits`: 600+ languages (646 per the Open TTS Leaderboard), including German and Swedish. Voice cloning yes (short reference clip with transcript). Voice design by gender, age, pitch, accent, whisper. Non-verbal tags like [laughter] and pronunciation fixes. Long text is split into chunks.
- Previous `speed_scaling`: Diffusion-language-model style: works on the whole utterance in a fixed number of steps (16-32), so cost depends on steps × length. Batching helps a lot (vendor H100: RTF 0.09 at batch 1, 0.012 at batch 8 with FlashInfer). Not truly streaming: first audio comes after the whole chunk (≈ 0.4 s median on A100). RTX 4090 with audio.cpp: 0.15 s for one 9-word cloned sentence.
- Previous `notes`: Second most downloaded TTS repo on HF (4.2M in 30 days). Param counts from safetensors headers (model 612,577,280 F32; audio tokenizer 201,400,553 F32). bf16/q8 GGUF sizes from audio-cpp/audio.cpp-gguf and include the tokenizer. German WER 1.37 on the Open TTS Leaderboard (4th of 23). Licence version (BY-NC 4.0 vs other) is not stated on the card. Not on Artificial Analysis or TTS Arena. llama.cpp's TTS docs do not list it.

### `qwen3-tts-1.7b` (Qwen3-TTS 1.7B (Base / CustomVoice / VoiceDesign))

- Previous `good_for`: Design a new voice from a text description, or clone one from 3 seconds of audio, in 10 major languages.
- Previous `weak_at`: No Swedish; slower than real time with the stock code
- Previous `output_limits`: 10 languages: Chinese, English, Japanese, Korean, German, French, Russian, Portuguese, Spanish, Italian (German yes, Swedish no). Base: voice cloning from a 3 s clip. CustomVoice: 9 preset voices plus spoken style instructions. VoiceDesign: a new voice from a text description. Streaming output.
- Previous `speed_scaling`: Autoregressive at about 12 audio tokens per second of speech, so time grows in a straight line with length. On an RTX 4060 the same table shows 0.23x real time stock and 1.83x with CUDA graphs, so the runtime matters more than the GPU. Open TTS Leaderboard: 6.1x real time on A100 with audio.cpp, 2.7x with faster-qwen3-tts.
- Previous `notes`: Five official repos: 1.7B-Base, 1.7B-CustomVoice, 1.7B-VoiceDesign, 0.6B-Base, 0.6B-CustomVoice (all Apache 2.0, created 21 Jan 2026); no newer Qwen TTS weights found as of Nov 2026. params_total_b is the safetensors count of the 1.7B checkpoint (1,928,677,440 BF16). q8/q4 sizes are ggml-org GGUFs; the mmproj file adds 0.45-0.67 GB. German WER 3.50 on the Open TTS Leaderboard (16th of 23). Artificial Analysis 'Qwen3 TTS' (Jan 2026, Elo 929) is probably Alibaba's hosted version; not confirmed to be the same weights.

### `voxcpm2` (VoxCPM2)

- Previous `good_for`: 48 kHz studio-quality output with voice cloning and voice design in 30 languages, including German and Swedish.
- Previous `weak_at`: An independent test ran about 3x slower than the vendor figure
- Previous `output_limits`: 30 languages: Arabic, Burmese, Chinese, Danish, Dutch, English, Finnish, French, German, Greek, Hebrew, Hindi, Indonesian, Italian, Japanese, Khmer, Korean, Lao, Malay, Norwegian, Polish, Portuguese, Russian, Spanish, Swahili, Swedish, Tagalog, Thai, Turkish, Vietnamese, plus 9 Chinese dialects (German and Swedish yes; no language tag needed). Voice cloning yes (short clip; better with transcript). Voice design from a description. 48 kHz output. Max sequence 8,192 tokens.
- Previous `speed_scaling`: Autoregressive at 6.25 tokens per second of audio plus a small diffusion step per token (10 steps by default); time grows in a straight line with length and with inference_timesteps. Independent test (Open TTS Leaderboard, A100, streaming) measured only ≈ 1.0x real time with the reference code and 4.6x with audio.cpp.
- Previous `notes`: Params from the safetensors header (2,290,004,544 BF16). q8_gguf 2.96 GB is the single audio.cpp package; the llama.cpp-omni split is BaseLM Q8_0 1.73 GB + Acoustic F16 1.83 GB. Speed: the vendor 4090 figure and the independent A100 streaming figure disagree by about 3x; treat 0.3 as best case. German WER 2.39 on the Open TTS Leaderboard (12th of 23). Not on Artificial Analysis. 971k downloads in 30 days.

### `fish-s2-pro` (Fish Audio S2 Pro)

- Previous `good_for`: Very expressive speech steered by inline tags such as [whisper] or [laughing], including multi-speaker dialogue.
- Previous `output_limits`: 80+ languages: tier 1 Japanese, English, Chinese; tier 2 Korean, Spanish, Portuguese, Arabic, Russian, French, German; Swedish among the 'other supported' languages. Voice cloning yes. Free-form inline tags such as [whisper], [laughing], [pitch up]. Multi-speaker, multi-turn dialogue.
- Previous `speed_scaling`: Two-stage autoregressive model (4B slow model + 0.4B fast model, ~21 frames per second of audio); time grows in a straight line with length. Vendor: RTF 0.195 on one H200 with SGLang. audio.cpp report: 2.5x (16-bit) to 3.4x (Q8) real time on an unnamed CUDA GPU.
- Previous `notes`: Params from safetensors (4,561,852,416 BF16). q8_gguf is the ggml-org talker file; its mmproj (fast model + codec decoder) adds 2.05 GB; audio.cpp's single Q8 package is 6.32 GB. German WER 1.23 on the Open TTS Leaderboard (3rd of 23). Artificial Analysis Elo 1101 (#48). Same lab's newer Drama 3 ranks much higher and has a friendlier licence. Fish's 'S2.1 Pro' on Artificial Analysis appears to be API-only (no HF repo found).

### `fish-drama-3` (Fish Audio Drama 3)

- Previous `good_for`: The highest-rated open TTS model on Artificial Analysis; audiobooks and scenes with up to 16 speakers.
- Previous `weak_at`: Needs 24-48 GB; commercial use only under US$500k revenue
- Previous `license_note`: Free for personal and research use. Commercial use allowed only while your organisation's yearly revenue is under US$500,000; no hosted TTS or voice-cloning service without a separate licence; requires 'Built with Fish Audio' credit; outputs may not train other speech models.
- Previous `output_limits`: 83 languages (same list as S2 Pro, including German and Swedish). Voice cloning yes (not yet in the llama.cpp port). Up to 16 speakers in one text via speaker tags. Natural-language and inline tag control; edit a take by continuation. Long text is chunked automatically (llama.cpp port: 4,096 positions per run).
- Previous `speed_scaling`: Mixture-of-experts: memory follows all 35B weights, speed follows the ~3B active per token. Autoregressive at ~21.5 frames per second of audio; time grows in a straight line with length. More parallel streams raise throughput but slow each one (vendor H200: RTF 0.13 at 1 stream, 0.37 at 16). No measured consumer-GPU speed found.
- Previous `notes`: Highest-ranked open-weight model on Artificial Analysis (Elo 1279, #7 overall, Nov 2026). Params from safetensors (3,687,388,288 BF16 + 32,212,254,720 F8_E4M3). Sizes: official FP8 repo 41.5 GB total minus codec = 39.6 GB; official int4 (fishaudio/drama-3-int4) 24.0 GB total minus codec = 22.1 GB; ggml-org GGUFs BF16 69.4 / Q8_0 36.9 / Q4_K_M 20.6 GB plus a 2.94 GB mmproj; Jmica/Drama-3-GGUF (audio.cpp) Q4_K_S 24.6, Q3_K_S 20.3, Q2_K 17.1 GB. The HF metadata tag still says fish-audio-research-license, but the LICENSE file is the Community License v1.0 (13 Oct 2026). German WER 2.27 on the Open TTS Leaderboard (11th of 23) and 20x real time batched on H200 there.

### `moonshine-streaming-small` (Moonshine Streaming Small (Moonshine v2))

- Previous `good_for`: Live captions and voice commands with very low delay on CPUs, phones and Raspberry Pi, in English.
- Previous `weak_at`: English only (separate German model); no word timestamps
- Previous `license_note`: Free for commercial use. All Moonshine streaming models are MIT; only the old non-streaming non-English models are non-commercial.
- Previous `output_limits`: English (this model); separate MIT streaming models exist for German, Spanish and Japanese (Small) and for German, Spanish, Arabic, Mandarin, Vietnamese, Tagalog and Japanese (Tiny). No Swedish. Max audio length per pass not stated (the Moonshine Voice library cuts speech into segments with voice detection). No word timestamps. Streaming: yes. No translation.
- Previous `speed_scaling`: Compute grows in a straight line with audio length. The encoder works on short sliding windows while you talk, so the wait after you stop speaking stays short; the text decoder still takes longer for longer sentences.
- Previous `notes`: Not on the current Open ASR Leaderboard. Vendor-reported average WER on the older 8-set Open ASR mix (with LibriSpeech and TED-LIUM, not comparable to today's leaderboard): Tiny 12.0%, Small 7.84%, Medium 6.65%. German Small: 7.5% WER on a quick FLEURS+MLS check by the vendor. Params: 0.14B from safetensors; the paper lists 123M. Siblings: moonshine-streaming-tiny (34M, 0.18 GB fp32) and moonshine-streaming-medium (245M, 1.06 GB fp32, best English accuracy). Community-measured speed (transcribe.cpp, Q8_0, 35 s clip): Apple M4 Max CPU 49x real time, Metal 59x; AMD Ryzen 7 4750U laptop CPU 9.3x. GGUF sizes from handy-computer/moonshine-streaming-small-gguf. German model: moonshine-ai/moonshine-streaming-small-de (0.11B, 0.45 GB fp32). Weights under 1 GB are given with two decimals.

### `parakeet-tdt-0.6b-v3` (Parakeet TDT 0.6B v3)

- Previous `good_for`: Very fast transcription with timestamps in 25 European languages, quick even on a CPU.
- Previous `weak_at`: Weak on Swedish (about 15% word errors)
- Previous `license_note`: Commercial use allowed; you must credit NVIDIA and link the license.
- Previous `output_limits`: 25 European languages, detected automatically: bg, hr, cs, da, nl, en, et, fi, fr, de, el, hu, it, lv, lt, mt, pl, pt, ro, sk, sl, es, sv, ru, uk. Up to 24 minutes per pass with full attention (on an 80 GB A100), up to 3 hours with local attention. Word, segment and character timestamps: yes. Streaming: only chunked (buffered) streaming through a NeMo script. Punctuation and capitals included.
- Previous `speed_scaling`: Time grows roughly in a straight line with audio length. The decoder skips ahead over frames, so it is fast even on CPU. Memory grows faster than linearly with file length because the encoder attends over the whole file: switch to local attention for files over about 24 minutes.
- Previous `notes`: Open ASR Leaderboard v1.16.1 (18 Nov 2026), English short-form average WER 7.04% (6.95% with fast-gpu-asr decoding), rank 39 of 69. Multilingual tab (not all languages covered, so no average): German 4.12, French 5.40, Italian 4.73, Spanish 3.71, Portuguese 6.08, Dutch 7.53. Long-form 12.60% WER, RTFx 1,419. FLEURS WER from the model card: German 5.04%, Swedish 15.08%; transcribe.cpp (community, Q8_0) measured German 5.24%, Swedish 15.25%. Community speed: onnx-asr (author's benchmark) Ryzen 7 9800X3D CPU 35x, RTX 5070 Ti CUDA 91x, TensorRT fp16 318x, Cortex-A53 1.0x; transcribe.cpp Apple M4 Max Metal 215x, CPU 35x, Ryzen 7 4750U CPU 12x. Weight files: fp32 safetensors and q8_0 GGUF are in NVIDIA's own repo; fp16/Q4_K_M from handy-computer/parakeet-tdt-0.6b-v3-gguf; int8 ONNX from csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8 and istupakov/parakeet-tdt-0.6b-v3-onnx. MLX: mlx-community/parakeet-tdt-0.6b-v3. vLLM support only through a third-party plugin. Superseded within the family? No: still NVIDIA's multilingual Parakeet; parakeet-unified-en-0.6b and nemotron-3.5-asr-streaming-0.6b are English-only or streaming-focused.

### `whisper-large-v3-turbo` (Whisper large-v3-turbo)

- Previous `good_for`: The safe default for almost any language, with the most apps and tools; good Swedish accuracy.
- Previous `output_limits`: 99 languages with automatic detection (quality varies a lot by language). 30 seconds per pass; longer files are handled by chunked long-form decoding with no practical length limit. Segment timestamps natively; word timestamps through alignment in whisper.cpp, faster-whisper, Transformers and openai-whisper. Streaming: not native (only chunked pseudo-streaming tools). Not trained for translation, unlike large-v3.
- Previous `speed_scaling`: Audio is processed in 30-second windows, so memory stays the same for any file length and time grows in a straight line with length. The 4-layer text decoder writes word by word, so speech-dense audio takes longer. Batching several windows (faster-whisper batched mode, whisper.cpp) raises throughput.
- Previous `notes`: Open ASR Leaderboard v1.16.1 (18 Nov 2026), English short-form average WER 8.75%, rank 57 of 69 (whisper-large-v3: 8.24%, RTFx 471). Multilingual tab average 9.94% over 8 languages (German 6.12%; Hindi 41.6% pulls the average up). Long-form 12.82% WER, RTFx 374. FLEURS WER measured by transcribe.cpp (community, Q8_0): German 4.54%, Swedish 8.72%, English 4.38%. Community speed: onnx-asr RTX 5070 Ti CUDA fp16 76x, Ryzen 7 9800X3D CPU 3.9x (int8 5.4x); transcribe.cpp Apple M4 Max Metal 51x, CPU 6.1x (35 s clip). Weight files: fp16 safetensors (OpenAI repo; HF tag says MIT); q8_0 and q5_0 ggml from ggerganov/whisper.cpp (ggml .bin format, same idea as GGUF); Q4_K_M GGUF from handy-computer/whisper-large-v3-turbo-gguf; int8 ONNX (encoder 0.67 + decoder 0.36 GB) from csukuangfj/sherpa-onnx-whisper-turbo; CTranslate2 fp16 1.62 GB from deepdml/faster-whisper-large-v3-turbo-ct2 (int8 is converted at load time); MLX fp16 1.61 GB mlx-community/whisper-large-v3-turbo, 4-bit 0.46 GB mlx-community/whisper-large-v3-turbo-q4. OpenAI has released no newer open-weight speech model as of Nov 2026 (its gpt-transcribe is API-only). Still the most downloaded ASR model on Hugging Face (about 4.7M downloads in 30 days).

### `qwen3-asr-1.7b` (Qwen3-ASR 1.7B)

- Previous `good_for`: High accuracy for English, German and Chinese, including songs, on an 8 GB GPU or a fast laptop.
- Previous `weak_at`: Weak on Swedish (about 20% word errors)
- Previous `output_limits`: 30 languages plus 22 Chinese dialects, detected automatically (includes German and Swedish; Swedish is weak). Up to 20 minutes per pass (technical report). Timestamps only with the separate Qwen3-ForcedAligner-0.6B: 11 languages (not Swedish), up to 5 minutes per pass. Streaming: yes, via the vLLM backend (no batching or timestamps in streaming mode). Also handles singing and songs with background music.
- Previous `speed_scaling`: An audio encoder turns speech into 12.5 tokens per second, then a 1.7B language model writes the text token by token. Time = encoding (straight line with audio length) + one LLM step per output token, so it behaves like a small LLM: GPU speed and batching matter a lot.
- Previous `notes`: Open ASR Leaderboard v1.16.1 (18 Nov 2026), English short-form average WER 6.15% (entry Qwen/Qwen3-ASR-1.7B-hf), rank 17 of 69 and the second-best open model from an established lab. Multilingual tab average 5.94% over 8 languages (German 3.88%), second among open models after Nemotron 3.5 Transcribe. The 5.40% figure seen in blogs comes from an older leaderboard mix that still included LibriSpeech. FLEURS WER measured by transcribe.cpp (community, Q8_0): German 4.25%, Swedish 19.68%. Community speed (transcribe.cpp, Q8_0, 35 s clip): Apple M4 Max Metal 37x, CPU 8.8x; Ryzen 7 4750U Vulkan 3.7x, CPU 2.3x. Vendor throughput: 1.7B reaches RTF 0.13 at 128 concurrent requests with vLLM (GPU not named). Params 2.35B from safetensors includes the ~0.3B audio encoder (the checkpoint may also store the output head separately). GGUF: transcribe.cpp single files from handy-computer/Qwen3-ASR-1.7B-gguf (BF16 4.08, Q8_0 2.19, Q4_K_M 1.32 GB); llama.cpp uses ggml-org/Qwen3-ASR-1.7B-GGUF with a separate audio projector file (Q8_0 2.17 + 0.36 GB). MLX: mlx-community/Qwen3-ASR-1.7B-8bit (mlx-audio). A Transformers-native copy is Qwen/Qwen3-ASR-1.7B-hf. Smaller sibling Qwen3-ASR-0.6B: 7.07% English, 9.37% multilingual.

### `nemotron-3.5-transcribe-30b-a4b` (Nemotron 3.5 Transcribe 30B-A4B)

- Previous `good_for`: The most accurate open model for long, multi-speaker recordings, with speaker labels, in 40 languages including Swedish.
- Previous `weak_at`: Needs a 24-32 GB GPU to run at good speed
- Previous `license_note`: Permissive: commercial use allowed, no territory or field-of-use limits; keep the license and notices when you redistribute the weights; patent-retaliation clause.
- Previous `output_limits`: 40 languages (German 'leading', Swedish 'production-ready'; Norwegian listed but not supported for ASR). Up to 1 hour per pass (65,536-token context). Word timestamps and speaker labels: yes (vLLM and NeMo-Speech.cpp). Streaming: no, offline only. Also translates speech to and from English, takes vocabulary hints, and answers questions about the audio.
- Previous `speed_scaling`: Mixture-of-experts: about 4.3B parameters are active per token, so each step costs about as much as a 4B model, but all 34B must sit in memory. A request needs 12.5 tokens per second of audio plus up to 6 per second of transcript (about 65,000 tokens for 1 hour); the Mamba-hybrid design keeps the cache small (about 0.5 GB for 1 hour). Moving experts to system RAM cuts VRAM but slows decoding a lot.
- Previous `notes`: Open ASR Leaderboard v1.16.1 (18 Nov 2026): English short-form average WER 6.13% (BF16) / 6.12% (FP8), ranks 15-16 of 69. It is the best open model on the multilingual tab (average 4.50% over 8 languages, German 2.79%; 5th overall behind API services) and the best open model from a major lab on long-form (10.52% WER, RTFx 111). On English short-form, newer open entries now edge it out: Musci-ASR-qwen-1019-hf 5.70% (a Qwen3-ASR fine-tune), Salesforce SOV-Transcribe-1 5.96% (7 languages, no Swedish), plus two fine-tunes; the vendor card's 4.71% is on the older 9 public sets. FLEURS WER from the NVIDIA card: German 2.73%, Swedish 7.27%. Vendor speed: about 410 RTFx on one H100 (BF16, MTP2); up to 2,238 audio-seconds per second on an RTX PRO 6000 Blackwell with NVFP4 + DFlash2 in NVIDIA's NIM (not in the open-source release, which NVIDIA says is about 2x slower). No consumer-GPU speed measurement found. params_total_b = 33.7B (whole checkpoint incl. the ~0.8B audio and speaker encoders); weight sizes include the encoder. Weight sources: BF16, FP8 (34.7 GB) and NVFP4 (21.6 GB) are NVIDIA's own repos; GGUF sizes = decoder + 1.67 GB F16 encoder file from AtomicChat/NVIDIA-Nemotron-3.5-Transcribe-30B-A4B-GGUF (Q8_0 35.00, IQ4_NL 19.68, Q2_0_M 13.57 GB decoders; AtomicChat reports IQ4_NL within noise of BF16 on English, German, French, Spanish, and Q2_0_M peaking at 15.6 GiB GPU memory). NVIDIA's own converter also makes NVFP4/IQ4_NL/Q2_0 GGUFs locally. Community MLX ports exist (goodmai/..., divergentlabs/...) but are not verified.
