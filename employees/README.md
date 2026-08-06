# employees/ — AI employee roster and memory

An employee = **agent definition** (`.claude/agents/<name>.md`) + **memory folder**
(`employees/<name>/memory/`) + **skills** + **cron routines**. See
`IMPLEMENTATION_PLAN_AI_EMPLOYEES.md` at the repo root for the full design, and
**`PRIVACY.md` in this folder before committing anything**.

## Layout

```
employees/
  _registry.json          # roster: one entry per employee (see schema below)
  _templates/
    agent.md              # template for .claude/agents/<name>.md
    routines.md           # template for employees/<name>/routines.md
    memory/               # memory folder skeleton, copied at hire time
      profile.md          # identity: role, scope, boundaries (written at hire, rarely changes)
      long-term.md        # distilled durable knowledge — the "brain" (~800-line cap)
      insights.md         # open insights/risks/questions, feeds the daily brief
      teachings.md        # queue of things to teach the user, feeds the daily brief
      journal/            # append-only daily notes, YYYY-MM-DD.md, 30-day retention
  <employee-name>/        # e.g. employees/nara/ — created by /hire
    memory/               # copied from _templates/memory/
    routines.md           # human-readable list of that employee's cron jobs
```

## Registry entry schema

Each element of `employees` in `_registry.json`:

```json
{
  "name": "nara",
  "display_name": "Nara",
  "role": "Community Manager",
  "cadence": "weekly",
  "status": "active",
  "created": "2026-08-06",
  "removed": null,
  "routines": [
    {
      "name": "social-check",
      "wita": "Mon 09:00",
      "cron_utc": "0 1 * * 1",
      "trigger_id": null
    }
  ],
  "last_run": null
}
```

- `display_name` is optional (capitalized form for briefs/dashboards); `name` is the
  canonical lowercase id used for folders and agent files.
- `status`: `active` | `paused` | `removed`. Offboarded employees keep their registry
  entry with `status: "removed"` and a `removed` date; their files are deleted.
- `cron_utc`: 5-field cron in **UTC** (Lombok is WITA, UTC+8 — subtract 8 hours; if that
  crosses midnight, shift the day-of-week/day-of-month fields back one day too).
- Routines across ALL employees must be staggered **at least 30 minutes apart** so
  concurrent sessions never race on git pushes.
- `last_run`: ISO-8601 UTC timestamp; every routine's final step updates it (own entry
  only) and commits + pushes.
