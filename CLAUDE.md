# Lombok AI Club — project instructions

## Always use the marketing-skills plugin

For ANY marketing task in this project (copy, social posts, ads, emails, content strategy, launch, SEO, CRO, pricing, partnerships, etc.):

1. **Invoke the matching `marketing-skills:*` skill first** — do not freelance marketing work without it. Examples: social content → `marketing-skills:social`, page copy → `marketing-skills:copywriting`, event promotion → `marketing-skills:launch`, email sequences → `marketing-skills:emails`, content planning → `marketing-skills:content-strategy`. If several apply, use each for its part.
2. **Read `.agents/product-marketing.md` before producing anything** — it is the single source of truth for positioning, audience, voice, and key messages. Never re-ask for foundational info that's already in it.
3. **Update context only via `marketing-skills:product-marketing`** — it handles versioning and the changelog. Don't edit `.agents/product-marketing.md` ad hoc, and don't create parallel context/strategy files.

## Second brain (`memory/`)

`memory/` is the persistent work memory: `state.md` (current project state — read it at session
start before re-deriving where things stand), `log/YYYY-MM-DD.md` (daily digests),
`decisions.md` (append-only decision log), `routines.md` (registry of scheduled routines).
Rules:

1. **Read `memory/state.md` early in any working session** — don't reconstruct project state
   from scratch.
2. **When you make a decision or materially change state, update `decisions.md` / `state.md`
   in the same commit as the work.** Daily digests are otherwise handled by the daily memory
   routine.
3. **Creating/updating/deleting a routine? Update `memory/routines.md` in the same session**,
   following the spawning conventions in `memory/README.md`.
4. The second brain holds *work and state* only — marketing positioning stays in
   `.agents/product-marketing.md` via the skill (rule above), and `memory/` must never
   duplicate it.

## Project facts

- This project is the marketing/community workspace for **Lombok AI Club** — the AI & tech community in Kuta, Lombok, Indonesia.
- Positioning (see context doc for full detail): nomads-first, English-first voice, Bahasa Indonesia for local outreach; free forever, sponsor-funded; fully independent from AdCrate; weekly mixed-format events.
