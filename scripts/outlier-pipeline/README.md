# Outlier pipeline

Finds trending "outlier" AI content on TikTok / Instagram / LinkedIn / Reddit and feeds it into the Content Studio (`dashboard/`) for scoring and remixing. First run: 2026-07-23.

## Flow

```
Apify scrape  →  raw/*.json  →  normalize.mjs  →  content.json
                                                     ├─ to-studio.mjs  →  ../../dashboard/data/outliers.json
                                                     └─ build.mjs      →  outlier-radar.html (standalone shareable page)
```

Run it:

```sh
node normalize.mjs   # raw/*.json → content.json (+ outlier scores)
node to-studio.mjs   # → dashboard/data/outliers.json (preserves your status/myScore/myNotes by id)
node build.mjs       # → outlier-radar.html
```

## Refreshing the data (via Claude + Apify MCP)

Ask Claude to re-run these actors and save each dataset as `raw/<platform>.json`
(the files are the verbatim `get-dataset-items` output: `{"items": [...]}`):

| Platform | Actor | Input used |
|---|---|---|
| TikTok | `clockworks/tiktok-scraper` | hashtags `aitools, aimarketing, chatgpt`, resultsPerPage 20 |
| Instagram | `apify/instagram-hashtag-scraper` | hashtags `aitools, aimarketing`, resultsLimit 25 — ⚠️ returns *recent* posts, mostly low-signal; consider a top-posts actor |
| LinkedIn | `harvestapi/linkedin-post-search` | queries "AI tools marketing", "AI meetup community", "keeping up with AI", postedLimit month |
| Reddit | `trudax/reddit-scraper-lite` | pain-point searches, sort top / month — slow (~15 min); normalize.mjs keyword-filters out non-AI viral posts |

Cap each run with `maxTotalChargeUsd` ~5 (actual total cost of the first run ≈ $0.60).

## Scoring

`outlierScore` = engagement vs. the platform's median in the batch (×median), multiplied on TikTok by how far the video reached beyond the creator's follower count (clamped 0.5–5×). Instagram's hidden like counts (`likesCount: -1`) are clamped to 0.

## Files

- `raw/` — verbatim Apify dataset dumps from the 2026-07-23 scrape
- `content.json` — normalized + scored posts (all platforms)
- `dashboard-template.html` — template for the standalone page (`/*__DATA__*/` placeholder)
- `outlier-radar.html` — built standalone page (also published as a Claude artifact)
