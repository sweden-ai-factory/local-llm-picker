# Pricing notes (checked 2026-11-23)

Companion to `pricing.json`, the data behind the Costs page. It compares (A) buying and running hardware, (B) the same open model through a pay-per-token API, (C) renting a GPU by the hour and (D) paid closed assistants as a reference.

It also has (E) hosted pay-per-use prices for the image, video and speech models in `models-media.json`, with closed services as a reference.

Every number in `pricing.json` was read on a page or public API on 2026-11-23 (a few hardware values come from dated articles or archives; their notes say so). Numbers that could not be verified are `null`, with the reason in a `note`. Treat everything here as planning figures, not quotes.

## 0. What changed in round 3 (2026-11-23, after QA round 2)

Fixes for the data problems in QA-REPORT.md round 2, section D, plus new media prices.

| Change | Where | Count |
|---|---|---|
| `open_weights` added to every closed_api entry; `true` for Mistral Large 4 and Mistral Small 4 (both on Hugging Face as open weights), `false` for the other 14. xAI (only Grok 1 and 2 are open), OpenAI's gpt-6.x, Anthropic and Gemini models are closed. | closed_api | 16 entries, 2 true |
| Apple prices re-read on Apple's US and Swedish stores and the US refurbished store. All M5-generation and M6 prices were unchanged. M4, M4 Pro, M4 Max and M3 Ultra are not sold new any more: M4 now uses refurbished iMac prices, M4 Pro has one refurbished 48 GB price, M4 Max and M3 Ultra are `null` (archived prices kept in the notes). | hardware_prices | 11 Apple entries |
| Strix Halo (`ryzen-ai-max-395`): 64 and 128 GB now from in-stock GMKtec EVO-X2 listings; the out-of-stock Swedish 32 GB price and the 96 GB search snippet were removed (`null` by omission). | hardware_prices | 1 |
| Gorgon Halo (`ryzen-ai-max-pro-495`): hardware.json now has `memory_options_gb: [128, 192]`; prices 128 GB $4,799, 192 GB $6,799. | both files | 1 |
| A100 80GB SXM: the used price ($5,050, AMCompute) stays; hardware.json `approx_price_usd` changed from the 2024 new price ($19,000) to the same used value. | hardware.json | 1 |
| Apple M5 Ultra in hardware.json: `approx_price_usd` is now the 512 GB price ($22,299), matching `memory_gb: 512`; the note now says only 512 GB needs the 36-core chip. The same mismatch was fixed for M5, M5 Pro, M5 Max (40-core) and M6 (each now priced at its `memory_gb`). | hardware.json | 5 |
| Inkling 2 Mini offers (added earlier the same day): cache-read prices added after re-reading OpenRouter's endpoints API. | api_open | 2 offers |
| `covers` added to every hardware_prices entry: `gpu-only` (bare cards and modules), `complete` (Macs, mini PCs, laptops, dev kits, whole servers and workstations) or `ram-only` (`cpu-ddr5-dual-channel`, `epyc-9005-turin`). | hardware_prices | 76 (50 gpu-only, 24 complete, 2 ram-only) |
| CoreWeave cached price for Gemma 4 31B, gpt-oss-20b and gpt-oss-120b: CoreWeave's own price page shows no cache-hit price ("-"), and OpenRouter bills cache reads at the full input price. Stored as `null` (the page then uses the input price, so the cost is unchanged). | api_open | 3 offers |
| Usage profiles: coding now says 22 active days; documents now says 25,000 tokens is about 18,000 English words; new `peak_share` (0.10 / 0.20 / 0.40 / 0.20) with one line of reasoning in each `basis`. | usage_profiles | 4 |
| New sections `media_api` (34 models, 26 with offers, 68 offers), `media_closed` (14 services) and `media_usage_profiles` (12 profiles). | new | |

Not verified or weak in this round: no in-stock 32 GB or 96 GB Strix Halo system could be read on a store page; Beelink's and Minisforum's stores refused automated requests (HTTP 429), so the 128 GB Gorgon Halo price rests on the earlier read and a search snippet; used Mac prices were not checked.

## 1. What the builder must know

**Units.** All money is USD:
- APIs: USD per million tokens (`in`, `out`, `cached_in`).
- Rental: USD per GPU-hour. For 8-GPU instances, the price is the instance price divided by 8.
- Hardware: USD per card or system.
- Subscriptions: USD per seat per month.
- Electricity: USD per kWh.

Convert for display with `fx`, which gives units of each currency per 1 USD: EUR 0.9099, SEK 10.2025, plus GBP, NOK and CHF. These come from the ECB reference rates of 2026-11-20.

**VAT.**
- US prices exclude sales tax.
- Prices converted from EUR or SEK are stored excluding VAT where the page allowed it. Each note says what the original price included.
- Swedish consumers pay 25% VAT on hardware and on most subscriptions. VAT-registered companies reclaim it.
- Two exceptions in the source pages:
  - Claude's EUR consumer prices are shown excluding VAT.
  - Household electricity prices include all taxes and VAT; business electricity prices exclude VAT.
- Suggestion for the UI: show a "prices excl./incl. VAT" toggle and add 25% for Swedish private users.

**Region values in `api_open`.**
- `EU` means the page states EU or EEA hosting. This includes Iceland and Norway data centres, which fall under the same GDPR rules.
- `CH` means hosted in Switzerland.
- `CN` means a Chinese company with no stated data-centre location.
- `US` means all listed data centres are in the US.
- `global` means no location promise.
- Only `EU` and `CH` should get an "EU-hosted" badge.

**New fields in round 3 (use these):**
- `closed_api[].open_weights`: `true` means the model's weights are public (Mistral Large 4, Mistral Small 4). Keep it out of any "paid closed assistant" reference; it is still a valid hosted price.
- `hardware_prices[].covers`: what the price buys. `gpu-only` = a bare card or module, add a host computer; `complete` = a whole computer (Mac, mini PC, laptop, dev kit, workstation, 8-GPU server); `ram-only` = only the memory kit, add the rest of the computer (the `host_system` price minus the RAM it already includes).
- `hardware_prices[].kind` has a new value `refurbished` (Apple Certified Refurbished, sold by Apple with a warranty), next to `street-new`, `used` and `list`.
- `hardware_prices[].usd` can now be `null` when nothing can be bought at the standard memory size (M4 Pro, M4 Max, M3 Ultra). `by_memory_gb` then lists only the sizes that have a price.
- `usage_profiles[].peak_share`: share of users active at the same moment in working hours (occasional 0.10, daily 0.20, coding 0.40, documents 0.20).
- `media_api`, `media_closed`, `media_usage_profiles`: see section 3.

**Extra fields.** These are optional and can be ignored:
- `note` on most items.
- `period` on electricity.
- `cached_input_share` on usage profiles. This is the share of input tokens that hits a prompt cache; it matters a lot for coding agents.
- `active_params_b_min_exclusive` and `models` on the size-curve bands.
- `sources` on `host_system`.
- `GBP`, `NOK`, `CHF` in `fx`.

**Size curve.** The last band (`active_params_b_max: null`, more than 250B active) has no data, because no model in `models-llm.json` is that large.

**Fallback.** 13 of the 49 chat models have `offers: []`. Each of them has a `note` saying why; use `api_size_curve` for these.

**Prices are moving fast.** A memory-chip shortage, and data-centre buyers taking most of the supply, has pushed up GPU, RAM, server and GPU-rental prices since late 2025. Refresh hardware and rental data monthly.

## 2. The Nov 2026 price landscape (what surprised us)

**Hardware is far above launch prices.**
- RTX 5090: about $6,500 new in the US, 3.3x MSRP. A used one averages $6,977, more than new.
- RTX 4090: $4,400 new, 2.75x MSRP.
- Used RTX 3090: $1,680, up 31% in 90 days and above its 2020 launch price.
- Tesla P40 and V100 lowest offers: up about two thirds since late August.
- 32 GB of DDR5 desktop RAM: $474, about 6-11x its lowest-ever price.
- DGX Spark 128 GB: $3,999 (Oct 2025), then $4,699, now $6,950.
- Jetson kits: up 33-101% in July 2026.
- Apple raised Mac prices during 2026. The Mac Studio M5 Ultra 512 GB is $22,299.

**GPU rental rose 50-80% at the "neoclouds".**
- Lambda 8x H100: $2.99 to $4.59 per GPU.
- Nebius H100: $2.95 to $4.50.
- Verda (formerly DataCrunch) single H100: $1.77 (Aug 2025) to $5.56.
- Crusoe has announced further rises from 1 Dec 2026.

Hyperscaler list prices hardly moved, so the gap to AWS and Azure has narrowed. Marketplaces stayed cheap: RunPod community RTX 4090 $0.34/h, H100 SXM $2.69/h.

**Token prices did not follow hardware up.** Competition keeps open-model API prices low: OpenRouter lists about 60 different providers for the 33 models it carries. For example:
- gpt-oss-120b: $0.03 in / $0.17 out.
- DeepSeek-V4.1-Flash: about $0.10 / $0.29.
- GLM-5.3-Flash: $0.08 / $0.28.

Several providers run temporary discounts (DeepInfra shows 5-51% off on some models).

**Closed models got cheaper per token.**
- Claude Opus 5.5 is $4 / $20 and Haiku 5.5 is $0.10 / $0.50.
- OpenAI's gpt-6.2-astra is $8 / $40, 20% below gpt-6-astra.
- Google's Gemini 4 Carbon promotional price ($2 / $10) ends on 2026-11-30; the stored values are the $4 / $20 list price from 1 Dec.

**A 10% surcharge for guaranteed regional (EU) processing is now standard** at OpenAI, Mistral (EU endpoint), Google Cloud regional endpoints, Bedrock regional endpoints and Anthropic's US-only option. Anthropic's own API and xAI have no EU inference option.

**EU-hosted open-model offers cost more.** EU and Swiss hosts (OVHcloud, Scaleway, IONOS, Berget, Regolo, Mistral EU, Infomaniak) cost about 1.1-1.4x the cheapest non-EU established offer for the same model (median 1.36x over 20 models). The range is 1.04x (Gemma 4 26B) to 2.7x (gpt-oss-120b). 22 of the 36 priced models have an EU or Swiss offer.

**Renamed and retired products.**
- Mistral's Le Chat now appears as "Vibe".
- Copilot Pro redirects to Microsoft 365 Premium.
- Mistral Medium 3.5 is deprecated (retires 2027-04-30).
- Moonshot is retiring the Kimi K2 series (including Kimi K2.7 Code) at the end of December 2026.
- Devstral Small 2 was retired from Mistral's API in March 2026.

## 3. Sections

### fx
ECB euro reference rates of 2026-11-20, from https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml. The ECB gives EUR-based rates; USD cross rates are derived (SEK per USD = 11.2125 / 1.0990). The ECB had not published 2026-11-23 rates at check time.

### electricity (9 regions)

**EU countries and Norway.** Eurostat first half of 2026 (Jan-Jun), from the figures workbook behind "Electricity price statistics" (https://ec.europa.eu/eurostat/statistics-explained/images/e/ef/Statistic_Explained_figures_for_Elec_2026_S1_V_1.xlsx, updated Oct 2026). The Eurostat database API itself was down ("server temporarily unavailable").
- Household: band 2,500-5,000 kWh a year, all taxes and VAT included.
- Business: band 500-2,000 MWh a year, excluding VAT and recoverable taxes. This is a mid-sized company; small businesses usually pay more.
- Each note also gives the 2025 second-half value.

**UK.**
- Household: Ofgem price cap unit rate, Oct-Dec 2026, 26.32p/kWh. There is no VAT on electricity from 1 Oct 2026 to 31 Mar 2027. The standing charge is excluded, since only the per-kWh price matters for running costs.
- Business: DESNZ table 3.4.2, 2026 Q2, 500-1,999 MWh band, including Climate Change Levy, excluding VAT.

**USA.** EIA Electric Power Monthly table 5.6.A, August 2026 (preliminary): residential 18.16 and commercial 14.47 cents/kWh. Summer values are slightly above the annual average.

**Sweden.**
- Eurostat gives EUR 0.3062/kWh for households (about 3.43 SEK at today's rate) and EUR 0.1177 for businesses.
- This half-year was 13% above the previous one (EUR 0.2711).
- GlobalPetrolPrices measured 2.72 SEK/kWh in March 2026.
- Prices differ a lot between bidding zones (SE1-SE4) and seasons. A "my price per kWh" input field would help Swedish users.

**Volatility.** Nordic prices swing 15-30% between half-years. Eurostat plans the next update (2026 second half) for April 2027.

### api_open (49 models, 36 with offers, 81 offers)

Inkling 2 Mini (released 2026-11-20) was added to models-llm.json and api_open during the model-data pass; in round 3 its two OpenRouter offers (Prime Intellect $0.075 / $0.30, io.net $0.12 / $0.50) were re-read from OpenRouter's endpoints API and given their cache-read prices ($0.015, $0.024).

**Sources.**
- **OpenRouter's public per-provider API** (`https://openrouter.ai/api/v1/models/<slug>/endpoints`) for 33 models. It gives every provider's input, output and cache-read price, quantization and uptime. OpenRouter passes provider prices through with no per-token markup (it charges a fee when you buy credits).
  - Spot-check against the providers' own pages: Together AI's pricing page matched OpenRouter on all 11 models checked.
  - DeepInfra's pricing page matched on 9 of 9, including its temporary discounts (Qwen3.8-27B 25% off, GLM-5.3 38% off, DeepSeek-V4.1-Flash-1017 51% off, Kimi K3.1 Pro 5% off).
  - Groq's pricing page showed no prices to a fetch.
  - Data-centre locations come from OpenRouter's provider list (`/api/v1/providers`).
- **Lab pages:** Alibaba Model Studio, Qwen Cloud, Z.ai, Moonshot (platform.kimi.ai), MiniMax, Mistral docs, Google Vertex AI, StepFun, Xiaomi MiMo, Liquid and Thinking Machines.
- **EU and Swiss hosts:**
  - Scaleway (public catalogue API; the website blocks fetches)
  - OVHcloud AI Endpoints
  - IONOS AI Model Hub (Germany)
  - Berget AI (Sweden; needs a prepaid monthly plan from EUR 25)
  - Regolo.ai (Italy; low maximum input on some models)
  - Infomaniak (Switzerland; CHF prices converted at the ECB cross rate, VAT status not stated)
  - Safe Swiss Cloud (minimum CHF 95 a month)
  - Public AI (routes worldwide)

**How offers were picked.** Up to three per model:
1. The lab's own API, if there is one.
2. The cheapest offer from an established provider. A different provider is used when the lab has an API. Small or new OpenRouter providers with unusual pricing are left out, but their lowest price is quoted in the note along with the OpenRouter median.
3. The cheapest EU- or Swiss-hosted offer.

Batch, "flex", "priority" and "fast" tiers, and endpoints with less than 90% uptime over the last day, were excluded. Each offer's note says which role it plays, its quantization if known, and context or price tiers. Ranking used a 3:1 input:output blend.

**Lab APIs worth knowing.**
- **Alibaba** has three deployment scopes:
  - "International" (Singapore): the price used as the lab API.
  - "Global": 50-70% cheaper on input, but inference may run anywhere.
  - "European Union" (Frankfurt): only qwen3.8-flash.
- **DeepSeek's own pricing page** reset the connection, so the DeepSeek price is its OpenRouter listing ($0.15 / $0.60). Alibaba sells DeepSeek-V4.1-Flash-1017 at $0.30 / $1.20 at peak and half price from 15:00 to 01:00 Swedish time.
- **Mistral's EU endpoint** (`api.eu.mistral.ai`) costs 1.1x.
- **Google** hosts no small Gemma 4 sizes. Gemma 4 31B and 26B are free-tier only on the Gemini API, and Gemma 4 26B is paid on Vertex AI.
- **NVIDIA build.nvidia.com** is free for prototyping only.
- **IBM watsonx** has no Granite 4.2 price.
- **Meta** has no API for its open Muse models.

**No hosted per-token offer (13 models):**
- qwen3.5-2b, qwen3.5-4b
- gemma-4-e2b, gemma-4-e4b, gemma-4-12b
- granite-4.2-3b, granite-4.2-30b
- olmo-3-7b, olmo-3.1-32b
- eurollm-9b, eurollm-22b
- devstral-small-2-24b
- nemotron-3.5-bolt-74b-a9b

Notes on these:
- **DeepInfra quietly redirects** several retired listings to other models (Qwen3.5-2B/4B to 9B, Granite 4.2 3B/30B to 8B, Olmo 3.1 32B to Gemma 4 31B). The Hugging Face router still shows some of them as live, so those prices were not used.
- **Dedicated (per-hour) only:** Fireworks offers Devstral Small 2, Gemma 4 E4B, Qwen3.5 4B and Nemotron 3 Nano Omni only as on-demand deployments.
- **Left out:** Berget's Qwen3.5-2B is a yes/no decision API with free output, and Thinking Machines' Qwen3.5-4B price is sampling inside a fine-tuning platform.

**Model-matching caveats.**
- `ling-3.1-flash-1019`: OpenRouter's listing is `inclusionai/ling-3.1-flash` (added 2026-10-02) and may serve an earlier revision.
- `qwen3.8-flash-next`: the API model `qwen3.8-flash` is described by Qwen as the official hosted version based on Flash-Next.
- `deepseek-v4.1-flash-1017`: Regolo lists "deepseek-v4.1-flash" without the date tag.

**Quantization.** Many cheap offers run FP8, FP4 or INT4 builds (stated in the notes). Quality can differ slightly from full-precision weights.

**Cached input.** `cached_in_usd_mtok: null` means the provider lists no cache discount; the page then charges cached input at the normal input price. In round 3 the three CoreWeave offers (Gemma 4 31B, gpt-oss-20b, gpt-oss-120b) were changed from "cached = input price" to `null` after CoreWeave's own price page (coreweave.com/forge-pricing/inference-agents) showed "-" for their cache-hit price; other CoreWeave models on that page do have one (for example Qwen3.6 35B-A3B $0.035, Granite 4.2 8B $0.015).

### api_size_curve (5 bands with data)
Built from the same candidate offers as `api_open`. For each band, the value is the median, across that band's models, of each model's own median input and output price. Each band lists its models.

| Active parameters | Input | Output | Models |
|---|---|---|---|
| up to 5B | $0.10 | $0.20 | 7 |
| 5-15B | $0.15 | $0.47 | 11 |
| 15-40B | $0.30 | $1.00 | 11 |
| 40-100B | $0.78 | $2.61 | 4 |
| 100-250B | $1.82 | $9.12 | 2 (thin) |

Caveats:
- Price depends on popularity and total size as well as active size. A dense 27B model often costs more per output token than a 400B-total MoE with 17B active. Use the curve only as a fallback.
- The over-250B band is `null`.

### gpu_rental (32 GPUs, 105 offers)

**Sources.**
- Vast.ai public offers API: median of verified, currently free machines, with the middle half in the note. Global and EU-only medians for the RTX 3090/4090/5090.
- RunPod pricing page and public GraphQL API (community and secure).
- Lambda, Nebius, Scaleway (catalogue API), OVHcloud (page and catalogue API), Hetzner (monthly dedicated servers, divided by 730 hours), Verda (Helsinki), CoreWeave and Crusoe.
- AWS price files (Stockholm, Frankfurt, US East), Azure Retail Prices API (Sweden Central) and the Oracle price list.
- DigitalOcean, Vultr and Hot Aisle.
- getdeploying.com was used only to find AMD providers.

**Caveats.**
- Small Vast samples are flagged: H100 PCIe 4 machines, H100 NVL 3, A100 80GB PCIe 4.
- Vultr "starting at" prices for 8-GPU nodes are pre-paid contract rates, so they are typed `reserved`.
- Scaleway's VAT status rests on a search snippet.
- GCP was not queried.

**Typical discounts (from provider pages).**
- 1-year commitment: about 25-45% off at Azure and other hyperscalers, 8-26% at smaller clouds (Verda 8%, DigitalOcean 24-26%).
- 3-year commitment: about 45-56% off (Azure), up to 50% (OVHcloud savings plan).
- CoreWeave advertises "up to 60%" for committed use.
- RunPod's API shows no self-serve term discount.
- Spot or interruptible: 45-80% off, but the price moves and the machine can be taken back. Nebius spot prices are uncapped.

**8-GPU-only rentals:** AWS (except one 1x H100 size), Azure ND-series, OVHcloud H200/B300, Scaleway B300, CoreWeave HGX, Vultr and OCI AMD shapes.

**EU options.** Sweden (AWS Stockholm, Azure Sweden Central, RunPod EU-SE), Finland (Nebius, Verda, Hetzner), France (Scaleway, OVHcloud), Poland (Scaleway Warsaw). The cheapest EU cloud H100s are OVHcloud and Scaleway at about $3.1-3.5 per GPU-hour.

### closed_api (16 models, 5 vendors) and subscriptions (30 plans)

**Sources.** Vendor pricing pages:
- developers.openai.com/api/docs/pricing
- platform.claude.com/docs/en/about-claude/pricing
- aistudio.google.com/docs/pricing
- docs.x.ai/developers/pricing
- docs.mistral.ai/inference/pricing

All 16 API prices match OpenRouter.

**Current model names:**
- OpenAI: gpt-6.2-astra, gpt-6.2-sol, gpt-6.1-terra, gpt-6-luna
- Anthropic: Claude Fable 5.2, Opus 5.5, Sonnet 5.5, Haiku 5.5
- Google: Gemini 4 Carbon, Neon, Hydrogen, Gemini 3.5 Flash-Lite
- xAI: grok-4.7, grok-4.3. xAI has no small model.
- Mistral: Large 4, Small 4. Both are open-weight (`open_weights: true`; Hugging Face mistralai/Mistral-Large-4-1T-A52B and mistralai/Mistral-Small-4-119B-2603), so the same weights can run locally. They stay in the list as hosted prices only. All other closed_api entries are `open_weights: false`; checked on Hugging Face that xAI has published only Grok 1 and Grok 2 and Google no Gemini weights.

**Tiers and price notes.**
- Tier labels are judgement calls; for example, Opus 5.5 is "mid" because Fable sits above it.
- Short-context prices are stored. Long-context surcharges apply above 272K (OpenAI), 200K (xAI) and 100K (Haiku 5.5, 5x).
- Anthropic's newer tokenizer produces about 30% more tokens for the same text, so per-token prices are not exactly comparable across vendors.

**Subscriptions.**
- `usd_per_month` is the monthly no-commitment US price where one exists; otherwise the per-month price under an annual plan. The note gives the other option and the Swedish price.
- No public price, stored as `null`: ChatGPT Enterprise, Google Workspace Enterprise, Mistral (Vibe) Enterprise.
- Claude Enterprise is $20 per seat plus usage at API rates.
- Some US prices come from secondary sources:
  - Google consumer plans: 9to5Google, because Google's page showed only Swedish prices.
  - ChatGPT Go: OpenAI's January 2026 launch post.
- OpenAI, Google One and Microsoft SEK pages do not state VAT. Comparing prices suggests consumer prices include VAT and business prices exclude it; this is inferred, not stated.

### hardware_prices (76 entries: 55 cards and 8-GPU servers, 21 systems)

**Sources.**
- **New US cards:** Tom's Hardware GPU price index (17 Nov) and GPU Prix (Newegg, Best Buy and B&H tracker, 23 Nov).
- **Swedish prices:** PriceRunner.se and GPU Prix Sweden. Prisjakt and Geizhals blocked fetches.
- **Used cards:** resaleprices.com eBay US market averages (23 Nov), GPUDojo, and the AMCompute appraisal index (to Aug 2026).
- **Datacenter cards:**
  - CDW list prices: H100 NVL $32,383, H200 NVL $33,732, RTX PRO 6000 Server $17,159, L4 $3,584.
  - Thunder Compute's November pricing articles.
  - Thinkmate and Servermall server configurators: HGX H200 from about $410,000, B200 $507,000, B300 $648,000, 8x MI300X $306,000, all excluding tax.
- **Apple (re-read 23 Nov 2026, round 3):** every configuration price was read from the JSON-LD offer on Apple's own US and Swedish configuration pages (apple.com/shop/buy-mac/... and apple.com/se/shop/buy-mac/...), and the US Certified Refurbished list (apple.com/shop/refurbished/mac). US prices exclude sales tax; Swedish prices include 25% VAT and are also given ex VAT in the notes.
  - Current chips, unchanged since the morning pass: M6 (Mac mini 16/24/32 GB $899 / $1,099 / $1,299), M5 (MacBook Air 16/24/32 GB $1,299 / $1,499 / $1,699), M5 Pro (Mac mini 24/48/64 GB $1,699 / $2,299 / $2,699), M5 Max 32-core (36 GB $2,499), M5 Max 40-core (48/64/128 GB $3,099 / $3,499 / $5,099), M5 Ultra (96 GB $5,499, 256 GB $9,499, 512 GB $22,299; 512 GB needs the 36-core CPU/80-core GPU).
  - Memory options: every memory size Apple sells for these chips is in `hardware.json` (Mac mini 16-64 GB, MacBook Pro 16-128 GB, MacBook Air 16-32 GB, Mac Studio 36-512 GB). Apple's store refused every combination outside the `memory_options_gb` lists that was tried (for example M6 with 48 GB, M5 Ultra 30-core with 512 GB, M5 Max 40-core with 96 GB).
  - No longer sold new: M4 is priced from refurbished 24-inch iMacs (16 GB $1,189, 24 GB $1,529, 32 GB $1,869; complete computers with a screen); M4 Pro has only a refurbished 48 GB MacBook Pro ($3,269); M4 Max and M3 Ultra have nothing from Apple, so `usd` is `null` and the archived 2026 list prices are in the notes. The old archived $599 M4 Mac mini price is gone from the data.
  - Apple Sweden has no refurbished store (404).
- **DGX Spark:** $6,950 from two news reports; NVIDIA's store timed out.
- **Strix Halo (Ryzen AI Max+ 395) systems (round 3):** GMKtec's product data (EVO-X2: 64 GB/1 TB $2,199.99, 128 GB/1 TB $3,499.99, both available; EVO-X3 128 GB/2 TB $3,799.99) and Corsair (128 GB/1 TB $3,999.99, in stock; 64 GB Max 385 discontinued). Framework's store served only its Swedish version, where every Framework Desktop is out of stock. No in-stock 32 GB or 96 GB system could be read on a store page, so those sizes have no price.
- **Gorgon Halo (Ryzen AI Max+ PRO 495):** 192 GB GMKtec EVO-X5 Pro $6,799 (gmktec.com) and Framework DIY $6,799 (hwbusters); 128 GB Beelink GTR9 Pro 495 $4,799 (bee-link.com, read in the morning pass; refused automated requests in round 3; a search snippet of the page shows the same price).
- **RAM:** Tom's Hardware RAM index and capitalandcompute.net. These are stored as `cpu-ddr5-dual-channel` and `epyc-9005-turin` with `covers: "ram-only"`.

**Kind.**
- `street-new`: cheapest in-stock new listing.
- `used`: eBay market average or asking median.
- `list`: vendor or reseller list price, a server-derived value, or an archived Apple price.

**Weakest values:**
- RTX PRO 5500: search snippet only.
- MI300X single card: one used listing.
- MI50 32 GB and A100 SXM: sold data up to Aug 2026 only (A100 SXM4 80GB re-checked on AMCompute in round 3: still $4,700-5,400).
- H100 SXM: HGX server price divided by 8.
- H200 SXM and B200: reseller range midpoints.
- V100 32 GB: the asking median is about twice the earlier sold values.

**US vs Sweden.**
- Before VAT, mid-range cards were cheaper in Sweden during Black Week (RTX 5080 $1,567 vs $2,235). The RTX 5090 and workstation cards were dearer.
- Apple is only 2.5-4.6% dearer in Sweden before VAT, and 28-36% dearer with VAT.

### host_system

Machine around a bare GPU, GPU excluded, US prices before tax:

| Machine | Price | What it includes |
|---|---|---|
| Consumer desktop for 1-2 GPUs | $2,109 | Ryzen 7 9700X, B850 board, 64 GB DDR5 ($949, about 45% of the total), 1,200 W PSU, 2 TB NVMe, case, cooler |
| Workstation for 2-4 pro GPUs | $12,386 | Dell Precision 7960 base with 128 GB RDIMM. Dell charges about $1,755 per 32 GB of RAM; a parts-built Threadripper machine would be cheaper. |
| 1-4 GPU rack server | $18,753 | Parts: ASUS 2U barebone, EPYC 9355P, 384 GB RDIMM, 2x 2 TB NVMe |
| 8-GPU HGX host without GPUs | $50,704 | Rough. HGX servers are normally sold with the GPU board fitted; this is built from a previous-generation barebone plus CPUs and 768 GB RAM. |

Use `server_8gpu_chassis_usd` only if a user prices GPUs separately. Otherwise use the `dgx-hgx-*` whole-server prices.

### usage_profiles (4 profiles; rough)

| Profile | Requests per day | Input tokens per request | Output tokens per request | Cached input | Active at the same moment (`peak_share`) |
|---|---|---|---|---|---|
| occasional | 5 | 2,000 | 600 | none | 10% |
| daily | 30 | 4,000 | 600 | 30% | 20% |
| coding | 400 | 50,000 | 300 | 90% | 40% |
| documents | 10 | 25,000 | 800 | none | 20% |

**These are rough planning assumptions, not measurements.** Real use varies 10x between people. Show them as editable defaults. All profiles assume 22 active (working) days a month, as the page does. `peak_share` is an assumption too: few short questions spread over the day overlap little, while coding agents keep requests running for most of a developer's working time.

Grounding:
- **Occasional:** about 2.5 billion ChatGPT messages a day from about 700 million weekly users in mid-2025, roughly 3-4 per weekly user per day (UNU summary of the Harvard/Duke/OpenAI study).
- **Daily:** OpenRouter and a16z's "State of AI" study of 100 trillion tokens (Nov 2024-Nov 2025). Average prompts grew from about 1,500 to over 6,000 tokens and completions from about 150 to 400. Programming prompts average 3-4x general prompts and make up over half of all tokens, which puts a general prompt at about 4,000 tokens.
- **Coding:** Claude Code's cost docs: about $13 per developer per active day ($150-250 a month), with 90% under $30. Their example session is about 94% cache reads. 400 requests x 50,000 tokens x 300 output tokens reproduces about $12 a day at Sonnet-class prices.
  - For local hardware this profile means about 20 million input tokens a day per developer. It is only practical with prompt caching (llama.cpp or vLLM prefix caching) and fast prompt processing.
  - For APIs the cached-input price dominates the cost.
- **Documents:** Claude's PDF docs say 1,500-3,000 tokens per page. OpenAI's rule of thumb is 100 tokens per 75 English words, so 25,000 tokens is about 18,000 English words (the earlier "12,000-word text" was wrong). Swedish text needs more tokens per word than English.

### media_api (34 models, 26 with offers, 68 offers; new in round 3)

Hosted pay-per-use prices for the models in `models-media.json`, in the order of that file.

**Units** (`unit`, `usd_per_unit`; the page converts them to its own units):
- `image` = one picture at the size in `unit_detail`; `megapixel` = per megapixel of output (1024x1024 is about 1.05 MP).
- `video_second` = per second of output video; `video_clip` = per clip (the clip length is in `unit_detail`; only used where it is about 5 s).
- `1k_characters` = per 1,000 characters of input text (text to speech); `audio_minute` / `audio_hour` = per minute or hour of audio (speech produced, or audio transcribed).
- `region`: `EU` only where the provider states EU hosting (BFL's api.eu.bfl.ai for FLUX 3 Klein, IONOS for FLUX.2 klein 4B, OVHcloud for Whisper large-v3-turbo); all other offers are `global`.

| Kind | Models | With offers | Offers |
|---|---|---|---|
| Image (incl. 2 image-edit) | 10 | 10 | 32 |
| Video | 7 | 6 | 15 |
| Text to speech | 12 | 6 | 11 |
| Speech to text | 5 | 4 | 10 |

**How offers were picked.** Up to four per model: the lab's own API, the cheapest established provider, one or two other established providers, and an EU-hosted offer where one exists. Only the same model and version counts; where only a related or closed version is hosted, it is named in the model's `note`. Normal pay-per-use prices only (no batch, subscriptions or promotions; current promotions are in the notes). Settings follow the model's typical output: about 1 MP pictures (2K for MiniMax-H3-Image), 720p video (768p for MiniMax H3, 1080p for LTX-2.5, 480p for Kandinsky 6 Pro, which is its native size).

**Sources.** Providers' own model and pricing pages, read on 2026-11-23: fal.ai (prices from each model page's embedded billing data), Replicate (per-model pricing data), Runware, WaveSpeed, DeepInfra, Together AI, Segmind, Krea, Black Forest Labs, Alibaba Model Studio, MiniMax, Ideogram, Stability AI, IONOS, OVHcloud, Lightricks (docs.ltx.io), Zyphra Cloud (its model list API), Fish Audio docs, Groq docs, Cloudflare Workers AI, and OpenRouter (speech-to-text routing, priced per second of audio). Spot-checked in round 3 against the pages: Replicate LTX-2.5 Fast, DeepInfra Whisper turbo, fal Z-Image-Turbo, Fish Audio S2 Pro and Drama 3.

**No hosted offer (8 models):** kandinsky-6-lite (fal's endpoint is gone), piper-voices, phonon-31m-en (Gradium sells it per device, not per request), pocket-tts, supertonic-3 (Supertone closed its API; date from a news report), chatterbox-multilingual-v3 (hosts serve the older 2025 multilingual release, prices in the note), voxcpm2, moonshine-streaming-small (on-device only).

**Caveats to show or keep in mind.**
- **Lab APIs that may not be the open checkpoint:** Alibaba's qwen-image-2.1-pro ("same model family"), Krea's API for Krea 2 Turbo (calls krea-2/medium-turbo), Ideogram's own API (the public weights are quantized), MiniMax's H3 video API (adds hosted prompt processing). Alibaba's wan2.2-t2v-plus, qwen3-tts-flash and qwen3-asr-flash are not counted as offers (not stated to be the open weights; Wan has no 720p tier); their prices are in the notes.
- **Billed by tokens or bytes:** MiniMax-H3-Image ($0.02333 is MiniMax's own example for one 2K image), Zyphra and Fish Audio (per million UTF-8 bytes, converted at one byte per character, which holds for English; Chinese, Japanese and Korean text costs about three times as much per character).
- **Replicate's LTX-2.5 Fast** ($0.06 per second at 1080p) is less than half of Lightricks' own price ($0.13) and equals Lightricks' price for the older LTX-2.3; it is what Replicate's page states, but it may be out of date.
- **Speed-optimised build:** Replicate's Wan 2.2 TI2V-5B ($0.025 a clip) is a PrunaAI build with a fast mode on by default.
- **Left out:** OVHcloud's SDXL endpoint is free with rate limits (no pay-per-use price), WaveSpeed's Wan 5B (clip length not stated), endpoints billed only by GPU time (fal and Replicate SDXL, Replicate's community Kokoro).
- **Removed endpoints:** fal's HunyuanVideo 1.5, OmniVoice and Kandinsky 6 Lite endpoints return "not found", although Hugging Face still lists some of them.

### media_closed (14 services; new in round 3)

Current closed services from their own pricing pages, in the same units: images OpenAI GPT-Image-2.6 (medium, 1024x1024, $0.0435, from OpenAI's cost calculator), Google Nano Banana 2.1 ($0.0336 at 1K), BFL FLUX 3 Image ($0.048 at 1K); video Google Gemini Omni 1.2 Flash ($0.0695 a second at 720p, worked out from tokens; Veo is no longer on the Gemini price page), Runway Gen-4.5 ($0.12 a second), xAI Grok Imagine Video 1.5 ($0.14 a second); text to speech ElevenLabs v4 ($0.08 per 1,000 characters), Google Chirp 3 HD ($0.03), OpenAI gpt-realtime-2.1-mini ($0.024 a minute, worked out from audio tokens; OpenAI's tts-1, tts-1-hd and gpt-4o-mini-tts shut down on 6 January 2027), Cartesia Sonic-3.6 ($0.065, overage on the $5-a-month plan; no plan without a subscription); speech to text OpenAI gpt-transcribe ($0.0045 a minute), Deepgram Nova-3 ($0.0043), AssemblyAI-STT-3.7 ($0.21 an hour), ElevenLabs Scribe v3 ($0.20 an hour). OpenAI's Sora 2 API shut down on 24 September 2026; Kling's API price page could not be read; Midjourney has no API.

### media_usage_profiles (12; rough)

Three sizes per kind, in the page's units: pictures, 5-second clips, hours of speech produced, hours of audio transcribed. All assume 22 working days a month and are assumptions, not measurements.

| Kind | light | regular | heavy |
|---|---|---|---|
| image (pictures) | 40 | 400 | 4,000 |
| video (5 s clips) | 10 | 100 | 1,000 |
| tts (hours) | 2 | 20 | 200 |
| stt (hours) | 5 | 50 | 500 |

## 4. Volatility and refresh dates

| What | How fast it moves | Recheck |
|---|---|---|
| GPU street prices (RTX 5090/5080/4090, RTX PRO), used cards, RAM | Weekly; ±10-25% a month | Monthly |
| GPU rental (neoclouds, marketplaces, spot) | Hourly (marketplaces, spot), monthly (list prices); Crusoe raises on 2026-12-01 | Monthly |
| Open-model API prices | Monthly; temporary discounts (DeepInfra), peak and off-peak pricing (Alibaba) | Monthly |
| Closed API prices | New models monthly. Gemini 4 Carbon promo ends 2026-11-30; Gemini 3.8 Flash promo and Copilot Business $18 promo end 2026-12-31; OpenAI Ultrafast multiplier changes 2027-03-01 | Monthly |
| Subscriptions | A few times a year | Quarterly |
| Electricity | Half-yearly (Eurostat), quarterly (Ofgem), monthly (EIA) | Half-yearly |
| Apple, DGX Spark, Jetson list prices | Raised at least once in 2026 | Quarterly |
| Apple refurbished stock (M4, M4 Pro) | Daily; items appear and sell out | Monthly, or drop when gone |
| Strix Halo and Gorgon Halo mini PCs | Stock and prices change weekly; several stores block automated reads | Monthly |
| Image, video and speech API prices | Monthly; new model versions replace old endpoints (fal removed three in this round). Fish Audio Drama 3 promotion ($10 instead of $50 per million bytes) ends 2026-11-30; WaveSpeed shows 50% off MiniMax H3 with no end date; Google's Gemini 3.8 Flash TTS price doubles on 2027-01-01; OpenAI's old TTS models shut down 2027-01-06 | Monthly |
| FX | Daily | Monthly |

## 5. Gaps (null or weak values)

- **Null prices:**
  - Size-curve band over 250B active: no data.
  - Three enterprise plans with no public price.
- **No hosted offer:** 13 models (section 3).
- **Not read directly:**
  - Official DeepSeek page (connection reset).
  - Nebius Token Factory price page (403); its serverless prices come via OpenRouter.
  - NVIDIA store (timeout).
  - Prisjakt, Geizhals, Newegg, eBay and B&H (blocked); trackers were used instead.
- **Thin samples:** small Vast samples (flagged in the notes).
- **No price (round 3):** Strix Halo 32 GB and 96 GB (no in-stock system readable on a store page); Apple M4 Pro 24 and 64 GB, M4 Max and M3 Ultra (not sold by Apple; used prices not checked).
- **Weak (round 3):** Gorgon Halo 128 GB ($4,799, Beelink store blocked automated reads); MiniMax-H3-Image (token-billed example price); Replicate LTX-2.5 Fast (possibly stale).
- **Media models with no hosted offer:** 8 of 34 (section 3).

## 6. Corrections for other data files (found while pricing)

- `hardware.json` `approx_price_usd` values are older than these. Several are now far off: MI300X $12,500 vs a $29,900 used listing, A100 40 GB PCIe $9,000 vs $5,999 used, DGX Station $95,000 vs HP's $132,000 GB300 workstation. Prefer `pricing.json` `hardware_prices`.
- **Fixed in hardware.json in round 3:** Apple M5 Ultra (512 GB price and the 36-core note), M5, M5 Pro, M5 Max 32-core and 40-core, M6 (prices now match `memory_gb`), M4 family and M3 Ultra (notes say they are no longer sold new), Ryzen AI Max+ PRO 495 (`memory_options_gb: [128, 192]`, price $6,799 at 192 GB), A100 80GB SXM ($5,050 used instead of the 2024 new price).
- **Still open:**
  - **Dell's GB10 and GB300 machines** are now called "Dell Pro Precision with GB10 / GB300".
  - **B300 per-GPU memory:** Verda and AWS state 268 GB/GiB, not 288.
  - **Ryzen AI Max+ 395:** `approx_price_usd` ($3,300, Jul 2026) is below today's in-stock 128 GB prices ($3,499.99-3,999.99).
- **Apple memory options:** no memory size that Apple sells is missing from `hardware.json` (checked for Mac mini, MacBook Air, MacBook Pro and Mac Studio).
