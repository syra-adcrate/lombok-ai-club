# Routines — {{NAME}}

<!-- Human-readable mirror of this employee's scheduled routines. The source of truth
     for schedules is employees/_registry.json (cron_utc + trigger_id); keep this file
     in sync when routines change. -->

All times below are **Lombok time (WITA, UTC+8)**; the registry stores the UTC cron.
Routines across all employees are staggered ≥30 minutes apart to avoid git push races.

| Routine | WITA schedule | UTC cron | What it does |
|---|---|---|---|
| {{main-routine}} | {{e.g. Mon 09:00}} | {{e.g. 0 1 * * 1}} | {{summary}} |
| memory-distill | {{e.g. Sun 07:30}} | {{e.g. 30 23 * * 6}} | Weekly memory compression (`memory-distill` skill) |

## Standard end-of-routine protocol (every routine, no exceptions)

1. Append today's `journal/YYYY-MM-DD.md` entry; update `insights.md` / `teachings.md`.
2. `git pull --rebase` (resolve conflicts favoring the remote for files you don't own).
3. Update **your own** `last_run` (ISO-8601 UTC) in `employees/_registry.json` — touch no
   other entry.
4. Commit memory changes with message `<name>: <routine> — YYYY-MM-DD` and push.
   If push is rejected, pull --rebase and push again (up to 4 attempts, backoff 2/4/8/16s).
