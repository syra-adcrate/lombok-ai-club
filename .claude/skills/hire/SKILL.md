---
name: hire
description: >-
  Hire a new AI employee end-to-end: /hire <name> "<role>". Scaffolds memory from
  employees/_templates/, creates the agent definition, schedules staggered cron
  routines (Lombok WITA → UTC), registers the employee in employees/_registry.json,
  and runs a first induction. Also handles offboarding: /hire offboard <name>.
---

# /hire — open (or close) an AI employee

Input: `<name>` (lowercase, filesystem-safe) and `"<role>"`. If either is missing, ask.
All paths are **relative to the repository root** — never absolute (the `employees/`
tree must stay portable to a private repo; see `employees/PRIVACY.md`).

If the first argument is `offboard`, jump to **Offboarding** at the bottom.

Refuse to hire if `employees/<name>/` already exists or the registry has a non-removed
entry for `<name>`.

## Timezone and scheduling rules (apply throughout)

- The user thinks in **Lombok time: WITA = UTC+8**. Cron jobs are stored/scheduled in
  **UTC**: subtract 8 hours from the WITA time. If that goes below 00:00, wrap to the
  previous day AND shift any day-of-week / day-of-month field back one day.
  Examples: daily 06:30 WITA → `30 22 * * *` (22:30 UTC, previous calendar day);
  Sunday 07:00 WITA → `0 23 * * 6` (Saturday 23:00 UTC); Mon 09:00 WITA → `0 1 * * 1`.
- **Stagger rule:** read every `cron_utc` across ALL employees in
  `employees/_registry.json` (including the routines you are about to add). No two
  routines anywhere in the roster may fire within **30 minutes** of each other —
  concurrent sessions race on git pushes. If a requested time collides, shift the new
  routine by 30–60 minutes and tell the user.
- **Every routine prompt must end with the standard end-of-routine protocol** (verbatim
  in the cron prompt): write journal/insights/teachings + update this employee's
  `last_run` (ISO-8601 UTC) in `employees/_registry.json` (own entry only) → **commit
  own files first** (`<name>: <routine> — YYYY-MM-DD`; git refuses to rebase over
  uncommitted changes) → `git pull --rebase` (keep the remote version of anything not
  owned) → push, retrying pull/rebase+push up to 4 times with 2/4/8/16 s backoff.

## The 8-step checklist

### 1. Define
Establish with the user (ask only for what's missing): one-line **mission**, **owned
surfaces** (repo-relative paths, accounts, channels), explicit **non-goals**,
**escalation rule** ("write to insights.md instead of acting when X"), and **cadence**
(default weekly — daily routines cost real money; only the Chief of Staff defaults to
daily, per the plan's cost-control guardrail).

### 2. Scaffold memory
Copy `employees/_templates/memory/` → `employees/<name>/memory/` (keep
`journal/README.md`). Fill every `{{...}}` placeholder in `profile.md` from step 1.
Seed `long-term.md`'s "Seeded at hire" section with anything already known about this
business section — from the repo, from the conversation — as date-stamped
`[FACT ...]` / `[INFERENCE ...]` entries. Seed memory > empty memory. Never seed
email/calendar-derived content or PII (`employees/PRIVACY.md`).

### 3. Create the agent
Copy `employees/_templates/agent.md` → `.claude/agents/<name>.md`. Fill in name/role
placeholders. Scope `tools:` to the minimum for the job (marketing employees get the
marketing-skills plugin noted in their profile voice notes; ops employees get Bash;
nobody gets more than their job needs). Do not weaken the memory-protocol or
write-boundary sections — they are the contract.

### 4. Attach skills
In `profile.md`, list which shared skills apply (e.g. `marketing-skills:*` for
marketing roles, `memory-distill` for everyone). Create an employee-specific skill
under `.claude/skills/` only if a workflow is truly unique to them — prefer shared.

### 5. Schedule routines
For each routine from the cadence in step 1, **plus always a weekly `memory-distill`**
(pick a quiet slot, stagger rule applies):
- Convert WITA → UTC cron per the rules above; check the stagger rule.
- Create the scheduled job (Claude Code scheduled tasks / cron triggers) whose prompt:
  identifies the employee ("You are <name>; act per `.claude/agents/<name>.md`"), states
  the routine's job, and ends with the standard end-of-routine protocol verbatim.
  The distill routine's prompt is: run the `memory-distill` skill for `<name>`, then the
  end-of-routine protocol.
- Record every routine in `employees/<name>/routines.md` (copy
  `employees/_templates/routines.md`, fill the table) with WITA time, UTC cron, and
  trigger id.
- If scheduling infrastructure is unavailable in the current session, still write
  `routines.md` and registry entries with `trigger_id: null`, and tell the user the
  jobs must be created from a session that can schedule.

### 6. Register
Append to `employees/_registry.json` (schema in `employees/README.md`): name, role,
cadence, `status: "active"`, created (today, YYYY-MM-DD), `removed: null`, routines
(name, wita, cron_utc, trigger_id), `last_run: null`.

### 7. Induction run
Run the employee's main routine once, now, as that agent (subagent if available,
otherwise follow `.claude/agents/<name>.md` yourself). Verify afterwards: a journal
entry exists for today, `insights.md`/`teachings.md` format is respected, `last_run`
was updated, and nothing outside `employees/<name>/` + owned surfaces was touched.
Adjust `profile.md` with the user before letting the cron take over.

### 8. Dashboard
Regenerate the graph dashboard (`hq-dashboard` skill) so the new employee appears.
If the skill doesn't exist yet (it's Phase 2), skip and say so.

Finally: commit everything (`hire: <name> (<role>)`) and push per the end-of-routine
git protocol.

## Offboarding — `/hire offboard <name>`

1. Confirm with the user; show what will be deleted.
2. Delete every scheduled trigger listed for the employee in the registry.
3. Delete `employees/<name>/` and `.claude/agents/<name>.md`.
4. In `_registry.json`, keep the entry but set `status: "removed"` and
   `removed: <today>` — the roster is history, not just current state.
5. Commit (`offboard: <name>`) and push.
