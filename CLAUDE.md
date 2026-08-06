# Lombok AI Club — project instructions

## Always use the marketing-skills plugin

For ANY marketing task in this project (copy, social posts, ads, emails, content strategy, launch, SEO, CRO, pricing, partnerships, etc.):

1. **Invoke the matching `marketing-skills:*` skill first** — do not freelance marketing work without it. Examples: social content → `marketing-skills:social`, page copy → `marketing-skills:copywriting`, event promotion → `marketing-skills:launch`, email sequences → `marketing-skills:emails`, content planning → `marketing-skills:content-strategy`. If several apply, use each for its part.
2. **Read `.agents/product-marketing.md` before producing anything** — it is the single source of truth for positioning, audience, voice, and key messages. Never re-ask for foundational info that's already in it.
3. **Update context only via `marketing-skills:product-marketing`** — it handles versioning and the changelog. Don't edit `.agents/product-marketing.md` ad hoc, and don't create parallel context/strategy files.

## Xenorita — customer success manager

**Xenorita** (she/her) is the club's customer success employee — a persistent
persona defined in `.claude/agents/xenorita.md`, portrait at
`.agents/customer-success/xenorita.png`.

- For ANYTHING involving customers, venues, sponsors, partners, or speakers —
  "what's next", logging what happened with an account, follow-ups, account
  health, pipeline reviews — delegate to the **xenorita** agent (or invoke the
  `xenorita` skill). Don't handle customer state ad hoc.
- Her memory is `.agents/customer-success/` (pipeline stages, one file per
  customer, and her self-improving `playbook.md`). All changes to it go
  through her, and she updates it in the same turn she learns something.
- This is separate from marketing: `.agents/product-marketing.md` stays the
  positioning source of truth (marketing-skills plugin only); Xenorita reads
  it but never edits it.
- The full AI team roster (Xenorita plus the Rinjani/Bima/Nala personas and
  their portraits) lives in `.agents/TEAM.md`. Only Xenorita is a full agent;
  the others are named faces on existing workflows and change no routing rules.

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
   duplicate it. Xenorita's customer memory (`.agents/customer-success/`) is likewise hers —
   `memory/` links to it rather than duplicating it.

## Project facts

- This project is the marketing/community workspace for **Lombok AI Club** — the AI & tech community in Kuta, Lombok, Indonesia.
- Positioning (see context doc for full detail): nomads-first, English-first voice, Bahasa Indonesia for local outreach; free forever, sponsor-funded; fully independent from AdCrate; weekly mixed-format events.
