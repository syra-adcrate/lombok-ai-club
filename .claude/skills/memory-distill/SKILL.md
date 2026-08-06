---
name: memory-distill
description: >-
  Weekly memory compression for one AI employee: /memory-distill <name>. Folds the
  week's journal entries into employees/<name>/memory/long-term.md, enforces the
  ~800-line cap, prunes journals older than 30 days, and preserves FACT provenance
  dates. Run per-employee on a weekly cron or on demand.
---

# /memory-distill — weekly compression of an employee's memory

Input: `<name>` of an employee with `status: "active"` in `employees/_registry.json`.
If missing or unknown, list active employees and ask. All paths are repo-relative;
work in `employees/<name>/memory/`.

## 1. Load context

Read `profile.md` (to judge what is durable *for this role*), `long-term.md` in full,
and every `journal/YYYY-MM-DD.md` from the last 7 days — or since the last distill if
older entries were never folded in (journals older than the newest distilled date and
younger than 30 days count as backlog; include them).

## 2. Fold journals into long-term.md

- Extract only **durable** knowledge: stable facts, decisions and their reasons,
  recurring patterns, contacts/venues/tools (no PII — `employees/PRIVACY.md`), things
  that would change how a future session acts. Skip play-by-play, one-off task noise,
  and anything already captured.
- **Preserve provenance dates**: an entry distilled from a journal keeps the journal
  entry's original date, not today's — `[FACT 2026-08-03] ...` stays `2026-08-03`.
- Keep the FACT / INFERENCE tag from the source. If a journal claim is untagged, tag it
  yourself: observed → FACT, deduced → INFERENCE. If new evidence upgrades an
  INFERENCE to a FACT, replace the entry, keeping the original date and appending
  `(confirmed YYYY-MM-DD)`.
- Merge into the "Distilled knowledge" section grouped by topic, not chronologically.
  Deduplicate: a new observation of a known fact updates the existing line rather than
  adding a sibling.

## 3. Enforce the cap (~800 lines)

After folding, if `long-term.md` exceeds ~800 lines, prune until under: delete
superseded and stale entries (things no longer true or no longer relevant to the
profile's mission), collapse verbose clusters into tighter summaries — but never drop
a load-bearing FACT just for space; tighten wording instead. Pruned means deleted, not
archived. The file must stay small enough to be read in full at every session start.

## 4. Prune journals and statuses

- Delete `journal/YYYY-MM-DD.md` files **older than 30 days** (keep `journal/README.md`).
  Anything durable in them should already be in `long-term.md` — spot-check the oldest
  file before deleting; fold anything that slipped through.
- In `insights.md` and `teachings.md`, delete `done` items older than 30 days; leave
  `open`/`surfaced` items untouched (the standup owns those transitions).

## 5. Report and finish

Summarize in chat: entries folded, lines in `long-term.md` before/after, journals
deleted, anything pruned for the cap.

Then the standard end-of-routine protocol: append a short entry to today's journal
("memory-distill: <stats>") and update `<name>`'s `last_run` (ISO-8601 UTC) in
`employees/_registry.json` (own entry only); **commit own files first**
(`<name>: memory-distill — YYYY-MM-DD` — commit BEFORE pulling, git refuses to rebase
over uncommitted changes); `git pull --rebase` (keep the remote version of anything not
owned); push — retrying pull/rebase + push up to 4 times with 2/4/8/16 s backoff.
