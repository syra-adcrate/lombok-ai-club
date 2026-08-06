# Project state

_Last updated: 2026-08-06 (seeded at second-brain creation; maintained by the daily memory routine)._

## Where things stand

The workspace shipped its **initial open-source release** (single commit `14cf347` on `main`).
The full system — context doc, Content Studio dashboard, outlier pipeline, remix batches, video
projects — is in place; the operating loop (triage → remix → schedule → post → learn) is
**not yet running end-to-end**.

## Content Studio (dashboard)

- **Outliers:** 232 scraped; **231 `new` / 1 `shortlist`** — triage backlog essentially untouched.
- **ICP classification:** **0 of 232** have `icpFit` set (plan item F1 not started). Because the
  UI defaults to "ICP fit only", the Outliers tab looks empty by default (bug B14).
- **Remix briefs:** 7 (5 `idea`, 2 `filming`).
- **Media assets:** 6.
- **Calendar:** 1 manual draft post (2026-07-24) — Buffer sync (F3) not connected.

## Pipelines

- **Organic outlier pipeline** (`scripts/outlier-pipeline/`): first run done 2026-07-23 via
  Apify. Known data-loss bug **B1** (rerun wipes triage history / ICP fields) is the top
  blocker before any rerun.
- **Ads pipeline** (`IMPLEMENTATION_PLAN_ADS.md`, drafted 2026-07-23): planned, not started.
  `ads.config.json` + `normalize-ads.mjs` exist as scaffolding; no ad scrape has run.

## Plans & progress

- `IMPLEMENTATION_PLAN.md` (audited 2026-07-23): Phase 0 bugs **B1–B18 all open**;
  features **F1–F11 all open**.
- `IMPLEMENTATION_PLAN_ADS.md`: Phases A–E all open; step 1 is fixing B1.

## Automation / second brain

- Daily memory routine active since 2026-08-06 (see `routines.md`).
- Second-brain structure (`memory/`) created 2026-08-06.

## Blockers on the human (syra)

- Authorize the **Buffer** connector in claude.ai connector settings (blocks F3).
- Enable **R2** on the Cloudflare account (blocks F10, real video on the deployed dashboard).

## Content inventory

- `REMIXES/`: 3 batches (first-meetup, english-market, outlier-remixes).
- `videos/`: 4 HyperFrames projects (ai-tools-reel, 5-ai-tools-slideshow,
  ai-escape-news-slideshow, ai-writing-fix-slideshow).
