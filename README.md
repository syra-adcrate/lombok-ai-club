# Lombok AI Club — Claude-powered marketing workspace

The complete marketing & community workspace for **Lombok AI Club** — the AI & tech community in Kuta, Lombok, Indonesia. The whole thing is designed to be **driven by Claude Code**: content strategy, social remixes, a self-hosted content dashboard, a viral-content scraping pipeline, and programmatic short-form videos.

It's open-sourced as a **template**: fork it, swap in your own community/product context, and you get the same AI-operated marketing system for yourself.

## What's inside

| Path | What it is |
|---|---|
| `CLAUDE.md` | Project instructions Claude Code loads every session — routing rules ("always use the marketing-skills plugin") + project facts |
| `.agents/product-marketing.md` | The single source of truth for positioning, audience, voice, key messages. Every marketing skill reads this before producing anything |
| `.claude/launch.json` | Dev-server configs so Claude can start the dashboard and video previews itself |
| `dashboard/` | **Content Studio** — local Node dashboard (also deployable to Cloudflare Workers) for rating scraped outlier posts, managing your media library, and writing remix briefs |
| `scripts/outlier-pipeline/` | Scrapes viral AI content from TikTok / Instagram / LinkedIn / Reddit via Apify, scores it (engagement vs. platform median × reach ratio), and feeds the dashboard |
| `REMIXES/` | Batches of remix briefs: outlier post → hook → shot plan, adapted to the club's ICP |
| `videos/` | [HyperFrames](https://www.npmjs.com/package/hyperframes) video projects — programmatic HTML compositions rendered to MP4 reels/slideshows |
| `IMPLEMENTATION_PLAN*.md`, `REMIX_AUDIT_RUBRIC.md` | Working plans and the rubric used to audit remix quality |

## Plug it into your own Claude Code

This is the implementation plan for adopting the workspace for your own community or product.

### 1. Clone and open

```bash
git clone https://github.com/syra-adcrate/lombok-ai-club.git my-marketing
cd my-marketing
claude
```

Claude Code automatically loads `CLAUDE.md`, so from the first message it knows the routing rules and where the context doc lives.

### 2. Install the marketing-skills plugin

The workspace assumes the `marketing-skills` plugin (skills like `marketing-skills:social`, `marketing-skills:copywriting`, `marketing-skills:launch`, …). In Claude Code run `/plugin` and install **marketing-skills** from the marketplace. Without it, `CLAUDE.md` tells Claude to stop and ask rather than freelance marketing work — that's intentional.

### 3. Rebuild the context doc for *your* product

Don't edit `.agents/product-marketing.md` by hand. Ask Claude:

> Use marketing-skills:product-marketing to rebuild the context doc for my product: [describe your product, audience, channels]

The skill interviews you, rewrites the doc, and keeps a version changelog. Every other skill then stops re-asking foundational questions.

### 4. Update `CLAUDE.md` project facts

Replace the "Project facts" section (community name, location, positioning bullets) with yours. Keep the "Always use the marketing-skills plugin" section — it's what makes the workspace consistent.

### 5. Run the Content Studio dashboard

```bash
cd dashboard && npm install && npm start   # → http://localhost:4321
```

Or just ask Claude to "start the content studio" — `.claude/launch.json` already defines it. See [dashboard/README.md](dashboard/README.md) for the workflow (Outliers → My Media → Remix Briefs) and the JSON data contract.

Optional Cloudflare deploy: `dashboard/wrangler.jsonc` + `schema.sql`/`seed.sql` are included. Create your **own** D1 database and KV namespace (`wrangler d1 create`, `wrangler kv namespace create`) and replace the IDs in `wrangler.jsonc` before `wrangler deploy`.

### 6. Refresh the outlier pipeline

Connect the [Apify MCP server](https://apify.com) to Claude Code, then follow [scripts/outlier-pipeline/README.md](scripts/outlier-pipeline/README.md): Claude re-runs the scraper actors (≈ $0.60 per full run), saves dumps to `raw/` (gitignored), and:

```bash
node normalize.mjs   # score everything
node to-studio.mjs   # → dashboard outliers (preserves your ratings)
node build.mjs       # → standalone outlier-radar.html
```

### 7. Make videos

Each folder in `videos/` is a self-contained HyperFrames project (brief → storyboard → HTML composition → MP4 render). Ask Claude to "create a reel about X like ai-tools-reel" — the existing projects are the few-shot examples. Previews are pre-wired in `.claude/launch.json`.

### Adaptation checklist

- [ ] `.agents/product-marketing.md` rebuilt via the skill (step 3)
- [ ] `CLAUDE.md` project facts updated
- [ ] `dashboard/data/*.json` cleared of Lombok AI Club's ratings/briefs (keep the file shapes)
- [ ] Own Cloudflare D1/KV IDs in `wrangler.jsonc` (only if deploying)
- [ ] Apify MCP connected (only if scraping)
- [ ] `videos/*/assets/` replaced with your own footage/photos

## Notes on what's *not* in the repo

- `scripts/outlier-pipeline/raw/` — raw scraped third-party data isn't redistributed; regenerate it yourself (step 6).
- `dashboard/uploads/` — the club's private media library, including imported reference images that aren't licensed for redistribution. Yours stays local too.

## License

[MIT](LICENSE). Note: rendered videos and photos in `videos/` are Lombok AI Club content — replace them with your own rather than reusing.
