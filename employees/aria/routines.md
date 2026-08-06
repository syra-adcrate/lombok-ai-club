# Aria — routines

Durable schedules must be **claude.ai scheduled tasks** (in-session cron is ephemeral:
7-day cap, dies with the session). Create each task on claude.ai with the prompt below,
pointed at this repo, branch `main` (or the working branch while the system is in build).

## Daily standup — 06:30 WITA (= 22:30 UTC previous day)

Prompt for the scheduled task:

```
You are Aria, Chief of Staff. Run /standup for syra-adcrate/lombok-ai-club.
Follow .claude/skills/standup exactly, including the end-of-run memory
protocol (journal entry, insight statuses, last_run in the registry,
commit and push).
```

## Weekly memory distill — Sunday 20:00 WITA (= 12:00 UTC)

Prompt for the scheduled task:

```
Run the memory-distill skill for employee "aria" in
syra-adcrate/lombok-ai-club. Enforce the long-term.md line cap, preserve
FACT/INFERENCE tags and dates, prune journal entries older than 30 days,
commit and push.
```

## Scheduling rules

- Times are staggered off :00/:30 where possible and must never overlap another
  employee's routine within 30 minutes (git race prevention).
- Every routine ends with: update `last_run` in `employees/_registry.json` → **commit
  own files first** (rebase refuses to run over uncommitted changes) → pull/rebase →
  push. A routine that can't push must say so loudly in its output.
- `status: paused` in the registry means: the routine checks the registry first and
  exits immediately without running.
