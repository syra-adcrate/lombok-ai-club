# Content Studio — Implementation Plan & Roadmap

_Audited 2026-07-23 against `dashboard/server.js`, `dashboard/src/worker.js`, `dashboard/public/index.html`, and `scripts/outlier-pipeline/*`._

The intended flow is:

**scrape → score → ICP-classify → triage → remix brief → film → schedule (Buffer) → post → learn**

Everything below is ordered so the flow becomes usable end-to-end as early as possible.

---

## Phase 0 — Bug fixes (do first, ~half a day)

### Data-loss bugs (highest priority)

- [ ] **B1 — Pipeline rerun wipes triage history and ICP fields.**
  `scripts/outlier-pipeline/to-studio.mjs` rebuilds `outliers.json` from the new batch only:
  outliers absent from the latest scrape are dropped entirely (goodbye shortlist), and the
  merge preserves only `status`/`myScore`/`myNotes` — not `icpFit`/`icpSegments`/`icpReason`,
  violating the contract in `dashboard/README.md`.
  **Fix:** keep prior items whose `status` is `shortlist` (or that have `myScore`/`myNotes`),
  and carry all `icp*` fields through the merge.

- [ ] **B2 — Non-atomic JSON writes can silently wipe a collection.**
  `server.js` `writeJson` writes in place; a crash mid-write corrupts the file, then
  `readJson` falls back to `[]` and the next write persists a near-empty array.
  **Fix:** write to `file.tmp` + `fs.renameSync`, and keep a rolling `.bak` of each data file.

- [ ] **B3 — Worker last-write-wins races.** Every D1 request does read-whole-collection →
  modify → write-whole-collection; two concurrent edits lose one.
  **Fix (pragmatic):** single-user tool, so a `version` column + retry-on-conflict is enough;
  the real fix is per-row tables (see F7).

- [ ] **B4 — Two sources of truth.** Local `data/*.json` and the deployed D1 have no sync;
  `seed.sql` is already stale. **Fix:** covered by F7 below — until then, treat local as
  canonical and note it in the README.

### Upload / import bugs

- [ ] **B5 — Deployed upload silently drops big files.** `worker.js` skips files > 25 MiB
  (KV cap) or non-media *without any error*, while the frontend toasts
  "Added N files ✓" based on the count it *sent*, not what was saved. Phone videos
  routinely exceed 25 MiB, so uploads appear to vanish.
  **Fix:** return `{added, skipped: [{name, reason}]}` from both servers; toast the skips.

- [ ] **B6 — Wrong limit in error copy.** `worker.js` import-url says "95MB max"; the actual
  cap is 25 MiB. Fix the message (and remove it entirely once R2 lands, F10).

- [ ] **B7 — Relative media URLs crash import.** `extractMediaUrl` can return a relative or
  protocol-relative `og:image`; `fetch()`/`new URL()` then throw → 500.
  **Fix:** resolve with `new URL(v, pageUrl)` in both `server.js` and `worker.js`.

- [ ] **B8 — Multer rejections return HTML, not JSON.** The `fileFilter` error falls through
  to Express's default handler; the frontend expects JSON. Add an error-handling middleware
  after the upload route.

- [ ] **B9 — No SSRF guard on import-url** (can be pointed at localhost/private ranges).
  Low risk locally, worth blocking private IPs on the deployed worker.

### API validation bugs

- [ ] **B10 — Outlier PATCH accepts garbage.** Any `status` string and `NaN` `myScore` are
  persisted. Whitelist `new|shortlist|skip` and clamp score to 0–5.

- [ ] **B11 — Manual posts can impersonate Buffer posts.** `POST /api/schedule` passes
  `source`/`bufferId` straight through `sanitizePost`, so a manual post can be marked
  `source: "buffer"` and later be clobbered by sync. Strip both fields on the manual-create path.

- [ ] **B12 — 100 kb JSON body limit.** `express.json()` default will 413 a real Buffer queue
  import. Set `limit: '5mb'`.

- [ ] **B13 — Deployed worker has no auth.** Anyone with the URL can read, delete, and upload.
  Minimum viable: a shared-secret header checked in the worker + stored in the frontend
  (prompt once, localStorage); proper fix is Cloudflare Access (F11).

### Frontend bugs

- [ ] **B14 — Outliers tab looks empty by default.** The ICP filter defaults to
  "✅ ICP fit only" but **0 of 136 outliers have `icpFit` set**, so the default view is blank.
  Until F1 runs, default the filter to "Everything" (or auto-fallback when the filtered list is empty).

- [ ] **B15 — "Unclassified" rendered as "off-icp".** `icpBadges` treats missing `icpFit` as
  `"no"`. Show an explicit `unclassified` badge instead — it's the difference between
  "not yet reviewed" and "reviewed and rejected".

- [ ] **B16 — Post modal Save can silently no-op.** Clearing the date field makes
  `new Date("T17:00").toISOString()` throw inside the click handler — nothing happens, no
  feedback. Validate date/time before building the body.

- [ ] **B17 — Upload toast lies** (frontend half of B5): report what the server actually saved.

- [ ] **B18 (minor) — Asset picker loads `preload="metadata"` video elements for every asset**;
  gets heavy as the library grows. Use poster thumbnails or `preload="none"`.

---

## Phase 1 — Complete the core flow (this week)

The goal: one piece of content travels the whole pipeline, scrape → posted.

- [ ] **F1 — ICP classification pass.** Classify all 136 outliers (`icpFit`, `icpSegments`,
  `icpReason`) against `.agents/product-marketing.md`. Agent-assisted batch job writing to
  `outliers.json` (preserving user fields). *Prerequisite for meaningful triage; do first.*

- [ ] **F2 — Triage mode.** 135/136 outliers are still `new`. Add a keyboard-driven review
  mode (J/K next-prev, 1–5 stars, S shortlist, X skip) so burning down the backlog takes
  minutes, not clicks.

- [ ] **F3 — Buffer sync, both directions.**
  - Authorize the `buffer` connector (claude.ai connector settings — currently unauthenticated).
  - First pull → `POST /api/schedule/import` (contract already implemented).
  - **Push direction (new):** "Send to Buffer" on a calendar post → creates a Buffer draft,
    stores the returned `bufferId`. Until this exists the calendar is read-only mirroring.
  - Recurring pull via a scheduled task (daily is plenty).

- [ ] **F4 — Brief ↔ calendar link.** The schema already has `remixId`; the UI barely uses it.
  - "Schedule this →" button on a remix brief (pre-fills the post modal).
  - Show the linked outlier/brief on the calendar post modal, and the scheduled date on the brief card.
  - When a linked post is marked `sent`, prompt to flip the brief to `posted`.

---

## Phase 2 — Automation (next 2 weeks)

- [ ] **F5 — Recurring scrape.** Weekly scheduled run of the actor set + pipeline scripts:
  rotate hashtags/queries, swap `apify/instagram-hashtag-scraper` for a top-posts actor
  (current one returns recent low-engagement spam), dedupe against existing ids, notify with
  a "N new outliers, top 3: …" summary. Depends on B1.

- [ ] **F6 — One-command pipeline.** `npm run scrape` orchestrating actors → `normalize.mjs` →
  `to-studio.mjs` with a run log (`runs.json`: date, inputs, counts, cost) so batches are auditable.

- [ ] **F7 — Kill the dual source of truth.** Either (a) make the deployed worker canonical and
  point the pipeline + local dev at it, or (b) add `npm run push`/`pull` sync scripts.
  Recommendation: (a), with per-collection rows moved to real D1 tables (also resolves B3).

---

## Phase 3 — Close the loop (rest of the month)

- [ ] **F8 — Performance tracking.** Scrape your own accounts' post metrics (same Apify actors,
  by profile URL), attach results to the calendar post / remix brief, and show
  "your remix vs. source outlier" side by side. This is what makes the whole system a loop
  instead of a conveyor belt.

- [ ] **F9 — Remix audit in the dashboard.** Wire `REMIX_AUDIT_RUBRIC.md` scoring
  (hook/body/CTA per platform) into the brief card — score at `scripting` stage, before filming.

- [ ] **F10 — Media on R2.** KV's 25 MiB cap blocks real video on the deployed dashboard.
  Enable R2, swap the `MEDIA` binding (the worker comment already plans for this), drop the cap.

- [ ] **F11 — Proper auth.** Replace the B13 stopgap with Cloudflare Access (free for this scale).

---

## Suggested execution order

| Step | Items | Size |
|---|---|---|
| 1 | B1, B2, B10–B12, B14–B17 (local correctness + UX) | ~2–3 h |
| 2 | B5–B8, B13 (worker parity + minimal auth) | ~2 h |
| 3 | F1 ICP pass → F2 triage mode | ~2–3 h |
| 4 | F3 Buffer (needs connector auth from you) → F4 linking | ~3 h |
| 5 | F5–F7 automation | ~1–2 days |
| 6 | F8–F11 feedback loop & infra | ongoing |

**The two things only you can do:** authorize the Buffer connector in claude.ai connector
settings (blocks F3), and enable R2 on the Cloudflare account (blocks F10).
