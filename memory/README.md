# Second brain — `memory/`

The persistent work memory for this workspace, maintained by **routines** (scheduled Claude
sessions) and by any interactive session that changes project state. It answers, at any point
in time: *what is the current state of the project, what happened recently, what did we decide,
and what automation is running?*

## What lives here (and what doesn't)

| File | What it is | Update rule |
|---|---|---|
| `state.md` | Living snapshot of project state — pipeline numbers, plan progress, blockers | **Rewrite in place** to reflect reality; it describes *now*, not history |
| `log/YYYY-MM-DD.md` | Daily digest — what changed in the repo and the work that day | **Append-only**: one file per day, written by the daily memory routine (or a session, if the routine hasn't run yet) |
| `decisions.md` | Decision log — choices made and why | **Append-only**: never rewrite past entries; supersede with a new entry |
| `routines.md` | Registry of active routines (scheduled triggers) | Keep in sync whenever a routine is created, updated, or deleted |

**Not here:** marketing positioning, audience, voice, and key messages. That is
`.agents/product-marketing.md`, the single source of truth for marketing context, and it is
updated **only** via the `marketing-skills:product-marketing` skill (see `CLAUDE.md`). The
second brain records *work and state*; the context doc records *strategy*. Don't duplicate one
into the other — link instead.

## How it's maintained

1. **Daily memory routine** (see `routines.md`): a scheduled fresh session that analyzes the
   repo + last 7 days of git history, rewrites `state.md`, writes `log/<today>.md`, appends any
   evidenced decisions, and flags marketing-context drift (routing actual context edits through
   the `product-marketing` skill). It commits to branch `claude/daily-memory-update` and keeps
   one open PR to `main` — merge that PR regularly so memory doesn't drift from the default branch.
2. **Interactive sessions**: when a session makes a decision or materially changes state, it
   should update `decisions.md` / `state.md` in the same commit as the work. Don't wait for the
   routine to reconstruct it from git archaeology.

## Spawning routines on demand

Routines are durable server-side triggers (they survive session/container death — do **not**
use session-local cron for anything that must outlive a session). Any Claude Code session in
this environment can spawn one:

- **From a session:** use the Claude Code Remote `create_trigger` tool.
  `create_new_session_on_fire: true` for standalone recurring jobs (each firing starts clean —
  write the prompt as a complete standalone instruction); `run_once_at` for one-shots.
  Cron expressions are **UTC** (Lombok is UTC+8 / WITA).
- **From the claude.ai Routines UI:** required if the routine's sessions need MCP connectors
  (e.g. GitHub, Apify) — connectors can only be granted from a session/UI that holds them.

**Conventions:**
1. Register every routine in `routines.md` (id, schedule, purpose, output path) in the same
   session that creates it, and remove the entry when deleting the routine.
2. Routine output lands in the repo via branch + PR, never direct pushes to `main`.
3. One routine, one job. Prefer several small routines over one mega-prompt.
4. Routines that produce or judge marketing content must follow `CLAUDE.md` routing
   (marketing-skills plugin, context doc first).
