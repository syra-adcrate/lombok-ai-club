# Ads Outlier Pipeline — Implementation Plan

_Drafted 2026-07-23. Companion to `IMPLEMENTATION_PLAN.md` (Content Studio) and `scripts/outlier-pipeline/` (organic pipeline, first run 2026-07-23)._

## Goal

Do for **paid ads** what the organic pipeline does for viral posts: mine the **Meta Ad Library** and **TikTok ad libraries** for proven-winner ad creatives, score them as outliers, land them in the Content Studio next to the organic outliers, and remix the winning hooks/structures into **organic** content for Lombok AI Club (we run no paid ads — ads are pure creative intelligence here).

Why ads are a better signal than organic in some ways: an ad that has been **running for months** or sits in TikTok's **Top Ads** ranking is spend-validated — someone paid to keep it alive because it converts. Organic virality can be luck; ad longevity rarely is.

```
Apify ad-library actors → raw/ads-*.json → normalize-ads.mjs → ads.json
                                                ├─ to-studio.mjs (extended) → dashboard/data/outliers.json
                                                └─ inputs/winning-ads/       → ad-creative skill corpus
```

---

## Reality check: the "Facebook Ad Library MCP" (researched 2026-07-23)

The linked help page (facebook.com/business/help/1456422242197840) documents **Meta's official Ads MCP** — remote endpoint `https://mcp.facebook.com/ads`, OAuth against Business Manager, ~29 tools over Marketing API v25. It is for **managing your own ad account** (campaigns, insights, benchmarks). It **explicitly does not cover the Ad Library**, competitor ads, or creative media. Likewise, the official Graph API `ads_archive` endpoint only returns political/issue ads globally — commercial ads are queryable **only for EU/UK-delivered ads** (DSA transparency), and it never returns raw media URLs.

**Decision — three options for "connecting the ad library":**

| Option | What | Verdict |
|---|---|---|
| **A. Apify MCP (already connected)** ✅ | Run ad-library actors through the existing Apify connector, same as the organic scrape | **Do this.** Zero new auth, proven actors, pay-per-result |
| B. Community `facebook-ads-library-mcp` (talknerdytome-labs) | MCP wrapping the paid ScrapeCreators API; adds `get_meta_ads`, ad image/video analysis tools | Skip for now — new paid API key + new server for capability A already gives us |
| C. Official Meta Ads MCP (`mcp.facebook.com/ads`) | Own-account management + industry benchmarks | **Later** — only becomes useful if the club ever runs paid ads (e.g. sponsor-funded event promo). Requires Business Manager OAuth, which must be authorized from an interactive session |

---

## Phase A — Scrape (Apify actors, via existing Apify MCP)

Cap every run with `maxTotalChargeUsd: 5` (expected actual cost of a full run: **≈ $1.50–3**).

### A1 — Meta Ad Library

**Actor: `curious_coder/facebook-ads-library-scraper`** — the de-facto standard (34.6k users, 99.7% success, $0.75/1k ads).

- **Inputs:** Ad Library search URLs and/or advertiser page URLs; filters for active status, country, period; `sortBy: impressions_desc` in page mode; `scrapeAdDetails: true` for EU reach.
- **Outputs we need:** creative text + image/video URLs, start/end dates (→ days running), advertiser page, platforms served, CTA type, landing URL, EU reach + demographic breakdown, "N ads use this creative" variation counts.
- **Backup actor:** `constructive_calm/facebook-ad-library-pro` ($0.49/1k, cheapest, adds targeting metadata).

**Query set v1** (rotate like the organic hashtags):
- Keywords: `AI tools`, `AI course`, `learn AI`, `ChatGPT`, `AI automation`, `AI community`
- Advertiser pages: 5–10 AI-education/tool brands whose creative style fits our audience (build the list during the first run; e.g. AI newsletter brands, cohort-course brands, nomad-targeting SaaS)
- Countries: US, GB, AU (nomad-heavy English markets) + an EU country (NL or DE) so `eu_total_reach` data comes back
- Active ads only, save as `raw/ads-meta.json`

### A2 — TikTok Creative Center Top Ads (global, performance-ranked)

**Actor: `dltik/tiktok-creative-center`** ($2/1k, 100% success — returns **CTR, likes, 720p MP4 URL**, duration, industry; sortable by CTR/likes). Cheap alternative: `azzouzana/tiktok-creative-center-top-ads-scraper` ($0.50/1k).

- **Inputs:** keyword (`AI`, `AI tools`), country, period, industry (Education / Tech), sort by CTR then by likes.
- Mere inclusion in Top Ads is already a top-percentile signal; CTR rank is the score input.
- Save as `raw/ads-tiktok-top.json`.

### A3 — TikTok EU Ad Library (optional, second iteration)

**Actor: `data_xplorer/tiktok-ads-scraper`** (dual mode: EU library + Top Ads, $1.50/1k) or `crawlerbros/tiktok-ads-library-scraper-pro` (adds derived `daysActive`, impression buckets). EU-only data; adds longevity + impression signals TikTok Top Ads doesn't expose. Skip in v1 unless Top Ads yields < 30 usable ads.

> ⚠️ All Creative Center scrapers hit TikTok's internal API — it can change without notice. Keep the actor choice in one config spot (see B3) so a swap is one line.

---

## Phase B — Normalize & score (`normalize-ads.mjs`)

New script alongside `normalize.mjs` — same one-schema philosophy, **different scoring model** (ads have no like/view medians worth comparing; they have spend-validation signals):

### B1 — Ad outlier score

```
Meta:    adScore = daysRunning/30  ×  (1 + log10(1 + variationCount))  ×  reachBoost
         reachBoost = 1 + log10(1 + euTotalReach/10_000)   (1.0 when no EU data)

TikTok:  adScore = ctrRank-or-ctr-tier  ×  (1 + log10(1 + likes))
         (+ fixed 1.5× "Top Ads inclusion" base — being listed at all is the signal)
```

Expressed like the organic score as a comparable multiplier; both feed the same sorted list in the dashboard.

### B2 — Extend the shared schema

Same core fields as `content.json` posts, plus an `ad` block:

```json
{
  "platform": "meta-ads | tiktok-ads",
  "id": "...", "url": "adLibraryUrl", "hook": "first line of primary text",
  "text": "primary text + headline + description",
  "author": "advertiser page name", "date": "startDate",
  "outlierScore": 4.2,
  "ad": {
    "daysRunning": 94, "variations": 7, "euReach": 120000,
    "ctr": null, "mediaUrls": ["..."], "cta": "Learn More",
    "landingUrl": "...", "platformsServed": ["facebook","instagram"]
  }
}
```

### B3 — Config file

`scripts/outlier-pipeline/ads.config.json`: actor ids, query sets, countries, cost caps — so rotating queries or swapping a broken actor never means editing code.

---

## Phase C — Land in Content Studio

- **C1 — Extend `to-studio.mjs`** to ingest `ads.json`: map `ad.*` into `whyOutlier` ("running 94 days · 7 creative variations · 120K EU reach — spend-validated") and put ad copy + media URLs in `script` as remix raw material. **Depends on bug B1 in `IMPLEMENTATION_PLAN.md`** (merge currently drops prior items — fix first or ad outliers will vanish on the next organic rerun).
- **C2 — Dashboard tweaks:** add `meta-ads` / `tiktok-ads` platform badges (distinct color — these are *ads*, remix the concept, never repost); render `ad.daysRunning`/`ctr` chips on the card; extend the README data contract.
- **C3 — ICP classification** for ad outliers uses the same `icpFit`/`icpSegments`/`icpReason` pass (F1), judged against `.agents/product-marketing.md` — most scraped ads sell tools/courses; the question is always "does the *hook/format* transfer to a free community brand?", so expect mostly `icpFit: "format"`.

---

## Phase D — Marketing-skills integration (baked in, per CLAUDE.md)

Every marketing-judgment step routes through the plugin — no freelancing:

| Stage | Skill | What it does here |
|---|---|---|
| **Corpus building** | `marketing-skills:ad-creative` (Grounded Inputs) | Top-scored scraped ads populate `scripts/outlier-pipeline/inputs/winning-ads/` (screenshots/media + copy). This is the skill's own grounding corpus — every future concept must cite which winning ad it traces to; no invented claims |
| **Ad analysis** | `marketing-skills:ad-creative` (Mode 4 + `references/hook-system.md`) | Deconstruct each shortlisted ad: angle category (pain / outcome / curiosity / identity / contrarian…), hook mechanics, structure (Us-vs-Them, Stat Callout, FAQ Card… from the 15-template library). Output: a one-paragraph "why it wins" per shortlisted ad, written into `myNotes`/brief |
| **Ads → organic translation** | `marketing-skills:social` | Convert the winning angle into organic formats per our channel mix (IG reels/carousels first): keep the hook + structure, strip the offer/CTA-to-buy, replace with community CTA (RSVP / join WhatsApp). English only, club voice ("builders", "build day", never "masterclass") |
| **Remix audit** | Remix-auditor role + `REMIX_AUDIT_RUBRIC.md` | Score hook/body/CTA of every remix at `scripting` stage, adapted per platform (existing workflow, unchanged) |
| **Recurring cadence** | `marketing-skills:marketing-loops` | When this goes weekly (Phase E), run it as a creative-drop loop: scrape → analyze → 3–5 remix briefs/week |
| **Context updates** | `marketing-skills:product-marketing` | Any positioning learnings from ad analysis (e.g. angles that consistently fit our ICP) go into `.agents/product-marketing.md` via the skill — never ad-hoc edits |

**The ads→organic translation rules (the whole point, made explicit):**
1. **Steal the angle, not the ad.** An ad's hook ("Nobody talks about what happens after you learn ChatGPT…") transfers; its offer ("50% off the cohort") does not.
2. Long-running ad → the *concept* is validated → brief it as a reel/carousel with our proof (event footage, member spotlights).
3. Ad with 7+ variations → the advertiser found a winning *structure* → template it for our content pillars (40% event promo, 30% AI tips, 20% spotlights, 10% scene).
4. Never repost ad media. Media URLs are for study + `inputs/winning-ads/` only.

---

## Phase E — Automate (folds into existing roadmap)

- **E1 —** Add the ad actors to **F5 (recurring weekly scrape)** and **F6 (`npm run scrape`)** from `IMPLEMENTATION_PLAN.md`: one command runs organic + ads, logs to `runs.json` (date, queries, counts, cost).
- **E2 —** Dedupe ads by creative fingerprint (advertiser + normalized text hash) across runs — long-running ads will reappear every week; bump `daysRunning` instead of duplicating.
- **E3 —** Weekly summary notification: "N new ad outliers, top 3 hooks: …".

---

## Execution order

| Step | Work | Size | Blocked on |
|---|---|---|---|
| 1 | Fix organic-pipeline bug B1 (merge drops items) | 30 min | — |
| 2 | A1 + A2 first scrape (Apify MCP, cost cap $5) | ~30 min | — |
| 3 | B1–B3 `normalize-ads.mjs` + config | ~2 h | step 2 (real field shapes) |
| 4 | C1–C2 studio ingest + badges | ~1–2 h | steps 1, 3 |
| 5 | D corpus + first analysis pass on top ~20 ads → 5 remix briefs | ~2 h | step 4 |
| 6 | E automation (with F5/F6) | ~half day | steps 2–5 proven |

**Needs you (can't be done from this session):** nothing for v1 (Apify MCP already covers it). Only if we later want option C — official Meta Ads MCP — you'd authorize `mcp.facebook.com/ads` OAuth from an interactive session / claude.ai connector settings.

## Open questions

- Advertiser page list for A1 — build from the first keyword scrape's best advertisers, or seed with brands you already admire?
- TikTok Top Ads country filter: US-only, or US+GB+AU blend? (Indonesia Top Ads inventory for "AI" is likely thin but worth one cheap probe.)
- Do ad outliers share the dashboard's outlier list (recommended, one triage queue) or get their own tab?
