# AI Club Lombok — Content Studio

Local dashboard for the outlier-remix workflow:

1. **Outliers** — scraped viral posts land here, ranked by outlier score. Star-rate them, shortlist or skip.
2. **My Photos & Videos** — upload your own event photos/videos (drag & drop), tag them (`event-recap`, `venue`, `speaker`, …) and add notes. You can also paste a Pinterest pin URL (or any direct image/video URL) into the import bar — the media is downloaded into the library, auto-tagged `pinterest`/`imported` + `reference`, with a link back to the source pin. Imported references are for private inspiration/shot-planning only, not for reposting.
3. **Remix Briefs** — pair an outlier with your reference footage, write the hook + shot plan, track status (idea → scripting → filming → posted).
4. **🧠 Second Brain** — the AI team roster (Xenorita, Rinjani, Bima, Nala with portraits) plus Xenorita's live customer pipeline: every account's stage, health, and next action, sorted by priority (overdue → at-risk → due soon), with her playbook and pipeline rules one click away. Read-only by design — the data is parsed live from `.agents/customer-success/customers/*.md`, and all changes go through Xenorita (`/xenorita` in Claude Code). Local server only (needs repo file access; not available on the Cloudflare Worker deploy).

## Run

```bash
cd dashboard && npm start
# → http://localhost:4321
```

## Data contract (for the scraping session)

Write scraped outliers to `dashboard/data/outliers.json` as an array of:

```json
{
  "id": "unique-string",
  "platform": "tiktok | instagram | reddit | linkedin",
  "author": "@handle",
  "title": "caption or headline",
  "url": "link to original post",
  "views": 0, "likes": 0, "comments": 0, "shares": 0,
  "outlierScore": 14.2,
  "whyOutlier": "one-line explanation of why it over-performed",
  "script": "transcript / beat-by-beat breakdown of the original (shown in the detail view)",
  "postedAt": "2026-07-10",
  "icpFit": "yes | format | no",
  "icpSegments": ["local", "nomad", "business"],
  "icpReason": "why it does/doesn't fit AI Club Lombok's ICP (see ../MARKETING_CONTEXT.md)",
  "status": "new",
  "myScore": 0,
  "myNotes": ""
}
```

`outlierScore` = engagement vs. the account/topic baseline (e.g. 14.2× normal). The two entries currently in the file are **samples** (`"sample": true`) — delete them when writing real data. Preserve `status`, `myScore`, `myNotes`, `icpFit`, `icpSegments`, `icpReason` on re-writes if the user has already rated/classified items; newly scraped items may omit the `icp*` fields (they'll be classified in the dashboard session).

Uploaded media lives in `dashboard/uploads/`, metadata in `dashboard/data/assets.json`, briefs in `dashboard/data/remixes.json`.
