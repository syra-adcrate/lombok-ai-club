# Routines — Testbot

<!-- Human-readable mirror of this employee's scheduled routines. The source of truth
     for schedules is employees/_registry.json (cron_utc + trigger_id); keep this file
     in sync when routines change. -->

All times below are **Lombok time (WITA, UTC+8)**; the registry stores the UTC cron.
Routines across all employees are staggered ≥30 minutes apart to avoid git push races.

**Dry-run note:** no real cron triggers were created for this throwaway employee
(`trigger_id: null` in the registry) — the schedule below is scaffold-verification data
only, and the one "self-check" run was executed manually.

| Routine | WITA schedule | UTC cron | What it does |
|---|---|---|---|
| self-check | Mon 09:00 | `0 1 * * 1` | Fake routine: confirm memory files readable, write a test journal entry |
| memory-distill | Sun 08:00 | `0 0 * * 0` | Weekly memory compression (`memory-distill` skill) |

## Standard end-of-routine protocol (every routine, no exceptions)

1. Append today's `journal/YYYY-MM-DD.md` entry; update `insights.md` / `teachings.md`.
2. `git pull --rebase` (resolve conflicts favoring the remote for files you don't own).
3. Update **your own** `last_run` (ISO-8601 UTC) in `employees/_registry.json` — touch no
   other entry.
4. Commit memory changes with message `<name>: <routine> — YYYY-MM-DD` and push.
   If push is rejected, pull --rebase and push again (up to 4 attempts, backoff 2/4/8/16s).
