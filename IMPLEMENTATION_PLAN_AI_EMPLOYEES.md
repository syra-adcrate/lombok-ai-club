# AI Employees — Implementation Plan

> **MOVED (2026-08-06):** the AI-employee system — `employees/` memory tree, agent
> definitions, the hire/standup/memory-distill skills, and the `hq/` dashboard app —
> now lives in **`syra-adcrate/second-brain`**. This copy of the plan stays for
> reference; all further work happens there.

_Drafted 2026-08-06. Goal: a team of named AI employees, each with its own memory, skills, and
scheduled routines — connected to email and calendar, self-updating, with an Obsidian-style
graph dashboard and a daily "what matters today" brief. New employees can be hired on demand
with one command._

Everything below maps to primitives Claude Code already has, so there is almost no custom
infrastructure to build: **an employee = agent definition + memory folder + skills + cron
routines.** The only truly custom piece is the graph dashboard, and even that is a static
HTML page generated from the memory folders.

---

## Architecture at a glance

```
employees/
  _registry.json                  # roster: name, role, cadence, status, created
  _templates/
    agent.md                      # template for .claude/agents/<name>.md
    memory/                       # empty memory folder structure to copy
  <employee-name>/                # e.g. employees/nara/
    memory/
      profile.md                  # who they are: role, scope, personality, boundaries
      long-term.md                # distilled durable knowledge (the "brain")
      insights.md                 # open insights, risks, questions for you (feeds the brief)
      teachings.md                # queue of things to teach you (feeds the brief)
      journal/
        2026-08-06.md             # append-only working notes, one file per day
    routines.md                   # human-readable list of that employee's cron jobs

.claude/
  agents/
    <employee-name>.md            # subagent definition; system prompt points at memory folder
  skills/
    hire/                         # /hire <name> "<role>" — creates a new employee end-to-end
    standup/                      # /standup — daily brief across all employees
    memory-distill/               # weekly: compress journals into long-term.md
    hq-dashboard/                 # regenerate the Obsidian-style graph dashboard
```

**How the pieces map to Claude Code features:**

| Concept | Implementation |
|---|---|
| Employee "body" | `.claude/agents/<name>.md` subagent definition (name, model, tools, system prompt) |
| Memory | Markdown files in `employees/<name>/memory/` — journal (raw) → long-term (distilled) |
| Skills | `.claude/skills/*` — shared skills for everyone, plus employee-specific ones |
| Routines | Claude Code scheduled tasks (cron) — one per routine, each invokes the employee |
| Email / Calendar | Gmail + Google Calendar connectors on claude.ai (already how `/morning` works) |
| Dashboard | Static HTML force-graph generated from the memory folders; published as an Artifact |
| Hiring on demand | `/hire` skill: copies templates, registers, schedules routines — one command |

---

## The memory loop (what keeps them "always up to date")

Memory is a two-speed system, enforced by convention in every routine:

1. **Every routine run ends by writing memory.** Last step of every employee session:
   append to `journal/YYYY-MM-DD.md` (what was done, learned, decided) and update
   `insights.md` / `teachings.md` if anything belongs in the brief. Raw, cheap, append-only.
2. **Weekly distillation** (`memory-distill` skill, cron per employee): read the week's
   journal entries, fold durable facts into `long-term.md`, prune stale entries, delete
   journals older than ~30 days. This keeps `long-term.md` small enough to load in full at
   the start of every session — that's the "wakes up knowing everything" effect.
3. **`profile.md` is written at hire time and rarely changes** — it's identity, not knowledge.

Rules that make this work long-term (bake them into the agent template):

- Every employee session **starts** by reading `profile.md` + `long-term.md` + the last
  2 journal entries. Nothing else is assumed.
- `long-term.md` has a hard soft-cap (~800 lines). Distillation must prune to stay under it.
- `insights.md` items carry a date and a status (`open` / `surfaced` / `done`) so the daily
  brief never re-serves stale insights.
- Employees never edit each other's memory. Cross-employee knowledge flows only through
  the standup brief or explicit handoff notes.

---

## The daily brief ("most important things to think about")

One employee is special: the **Chief of Staff** (first hire). Their daily routine:

1. Read calendar (today + next 7 days) and unread/starred email via connectors.
2. Read every employee's `insights.md` and `teachings.md`.
3. Produce the morning brief: **top 3 things to think about today**, schedule, email that
   needs a decision, one teaching item (a concept/tool/tactic relevant to current work —
   this is the "teaches me new things" requirement, drawn from `teachings.md` queues).
4. Mark surfaced insights as `surfaced`, write their own journal entry.
5. Deliver as a styled HTML brief (the existing `/morning` skill pattern) and/or push
   notification.

---

## The dashboard (Obsidian-style graph)

A static, self-contained HTML page — same tech as the Obsidian graph screenshot: a
force-directed canvas graph, dark theme, filter panel with colored groups.

- **Generator:** `hq-dashboard` skill scans `employees/` and emits nodes + edges as inline
  JSON into a single HTML file (canvas + ~200 lines of force-simulation JS, no external
  libs so it can ship as a claude.ai Artifact).
- **Nodes:** employees (large, one color per employee), insights (colored by status),
  teachings, routines, journal days. **Edges:** ownership (employee → its memories),
  mentions (insight ↔ insight when one references another's topic).
- **Panels:** left — "Today" (top-3 from the latest standup); right — Obsidian-style
  filters (search, per-employee color groups, hide done insights).
- **Refresh:** the Chief of Staff's daily routine regenerates it after the standup, so the
  graph is always at most a day old. Republished to the same Artifact URL each time.
- Later (optional): fold it into the existing `dashboard/` Cloudflare Worker app as a new
  tab, if a hosted always-on version is wanted. Not needed for v1.

---

## Starter roster (hire in this order)

| # | Name | Role / section | Routines |
|---|---|---|---|
| 1 | **Aria — Chief of Staff** | Cross-business prioritization, email + calendar, daily brief, teaching | Daily 06:30 standup · weekly Sunday memory distill |
| 2 | **Nara — Community Manager** | Lombok AI Club: events, WhatsApp/social cadence, member growth | Daily social check · weekly event-prep Monday |
| 3 | **Kai — Content Studio Operator** | Outlier pipeline, remix briefs, video queue (this repo's `dashboard/` + `scripts/`) | Weekly pipeline run + triage Tuesday |
| 4 | **Sena — Partnerships & Sponsors** | Sponsor pipeline, venue relations, cross-promos | Weekly Thursday pipeline review |

AdCrate-side employees (sales, product, support…) use the exact same template — hire them
in the AdCrate repo with the same `/hire` skill so each business keeps its own roster, and
give Aria read access to both if you want one unified morning brief.

Each employee's `profile.md` must state: mission (1 line), owned surfaces (files, accounts,
channels), explicit non-goals, escalation rule ("write to insights.md instead of acting
when X"), and voice notes (per CLAUDE.md: marketing employees must use the
`marketing-skills:*` plugin and read `.agents/product-marketing.md` — put that in Nara's
and Sena's profiles).

---

## Phased build

### Phase 0 — Foundation (half a day)
- [x] **F1** Create `employees/` tree: `_registry.json` (empty roster) + `_templates/`
      (agent template, memory folder with `profile.md` / `long-term.md` / `insights.md` /
      `teachings.md` skeletons containing the rules above).
- [x] **F2** Write the agent template `_templates/agent.md`: frontmatter (name,
      description, tools) + system prompt that hard-codes the memory protocol
      (read-on-start, journal-on-end, never touch other employees' folders).
- [x] **F3** Build the **`/hire` skill** (see checklist below — the skill automates it).
- [x] **F4** Build the **`memory-distill` skill** (input: employee name; does the weekly
      compression; enforces the long-term.md size cap).

### Phase 1 — First employee + daily brief (1 day)
- [ ] **E1** Connect Gmail + Google Calendar connectors on claude.ai (one-time, manual —
      note: scheduled/headless runs must be started from claude.ai so connector auth is
      available; verify this early, it's the main integration risk).
- [ ] **E2** `/hire Aria "Chief of Staff"` — first real run of the hire flow.
- [ ] **E3** Build the **`/standup` skill**: the 5-step daily-brief flow above. Reuse the
      existing `/morning` skill's rendering as the output layer.
- [ ] **E4** Schedule Aria's routines: daily 06:30 standup, Sunday distill. Run 3 manual
      standups first to tune the brief before trusting the cron.

### Phase 2 — Dashboard (1 day)

_Direction change (2026-08-06, Syra): everything lives on the dashboard — a **React app
in this repo** (`hq/`), no artifacts. The second brain stays as git-tracked files in
`employees/`; the dashboard reads generated JSON snapshots of it._

- [x] **D1** Build the `hq/` React app (Vite + react + d3-force): canvas force graph,
      dark Obsidian-style theme, filter panel with per-group colors/counts/search,
      Today panel rendering `hq/src/data/brief.json`, node-detail card.
      `hq/scripts/build-graph.mjs` scans `employees/` → `hq/src/data/graph.json`.
- [x] **D2** Standup delivery rewired: briefs are written as structured JSON to
      `hq/src/data/brief.json` + graph data regenerated at the end of every standup.
      No artifact publishing anywhere in the loop.

_Also shipped in a parallel session (pre-direction-change): a no-build variant —
`.claude/skills/hq-dashboard/generate.py` (stdlib scanner → self-contained canvas HTML)
wired into the Content Studio as a "Second Brain" tab
(`dashboard/public/second-brain.html`). Consolidation pending: keep one of the two._

### Phase 3 — Scale the roster (half a day each)
- [ ] **R1** `/hire Nara "Community Manager"` + her routines; profile points at the
      marketing plugin rules.
- [ ] **R2** `/hire Kai "Content Studio Operator"` + weekly pipeline routine (wire to
      `scripts/outlier-pipeline` and `dashboard/` data files).
- [ ] **R3** `/hire Sena "Partnerships"` + weekly routine.
- [ ] **R4** After 2 weeks: review each employee's `long-term.md` quality; tighten
      distillation prompts where memory is bloating or losing important facts.

### Phase 4 — Compounding (ongoing)
- [ ] **C1** Teaching loop: each employee's routines end with "add one `teachings.md` item
      if you touched something the user should learn"; Aria rotates one into each brief.
- [ ] **C2** Monthly "performance review": a skill that scores each employee's memory
      hygiene + insight usefulness and proposes profile/routine edits.
- [ ] **C3** Optional: hosted dashboard tab in the existing Cloudflare Worker app.

---

## The `/hire` checklist (tasks to open a new employee)

This is exactly what the `/hire <name> "<role>"` skill automates — and the manual list
until it exists:

1. **Define** — one-line mission, owned surfaces, non-goals, escalation rule, cadence.
2. **Scaffold memory** — copy `employees/_templates/memory/` → `employees/<name>/memory/`;
   fill `profile.md` from the definition; leave `long-term.md` seeded with anything you
   already know about that business section (seed memory > empty memory).
3. **Create the agent** — copy `_templates/agent.md` → `.claude/agents/<name>.md`; fill in
   name/role; scope its tools (marketing employees get the marketing plugin; ops employees
   get Bash; nobody gets more than their job needs).
4. **Attach skills** — list which shared skills apply; create employee-specific skills
   under `.claude/skills/` only if a workflow is truly unique to them.
5. **Schedule routines** — create the cron jobs (daily or weekly per the cadence decided
   in step 1) + always a weekly `memory-distill`. Record them in `routines.md`.
6. **Register** — append to `employees/_registry.json` (name, role, cadence, created,
   status: active).
7. **Induction run** — run the employee's main routine once manually; check the journal
   entry and first insights; adjust `profile.md` before letting the cron take over.
8. **Dashboard** — regenerate so the new employee appears in the graph.

---

## Risks & guardrails

- **Connector auth in scheduled runs** — the whole email/calendar loop depends on
  scheduled sessions having connector access; validate in Phase 1 (E1) before building on it.
- **Memory bloat** is the failure mode that kills these systems — the distillation cap and
  journal retention (30 days) are load-bearing, not nice-to-haves.
- **Cost control** — daily routines on every employee gets expensive; default everyone
  except Aria to weekly, promote to daily only when a routine proves its value.
- **Write boundaries** — employees write only inside `employees/<their-name>/` and their
  owned surfaces; anything cross-cutting goes through `insights.md` → Aria → you.
