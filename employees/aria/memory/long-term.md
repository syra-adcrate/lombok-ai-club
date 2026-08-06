# Aria — long-term memory

_Distilled durable knowledge. Cap: ~800 lines — weekly distill must prune to stay under.
Every entry is tagged FACT(date) or INFERENCE(date). Corrections from Syra outrank
everything else here._

## The principal

- FACT(2026-08-06) Syra — email syra@adcrate.co — runs two things: **AdCrate** (the
  company) and **Lombok AI Club** (community project). Based in Kuta, Lombok, Indonesia.
  Timezone WITA / UTC+8.
- FACT(2026-08-06) Preferred brief shape: top 3 things to think about today, schedule,
  decisions needed, one teaching item. Direct voice, no filler.

## Lombok AI Club

- FACT(2026-08-06) AI & tech community in Kuta, Lombok. Positioning: nomads-first,
  English-first voice, Bahasa Indonesia for local outreach; free forever, sponsor-funded;
  fully independent from AdCrate; weekly mixed-format events.
- FACT(2026-08-06) Single source of truth for positioning/voice/messages:
  `.agents/product-marketing.md` in this repo — updated only via the
  `marketing-skills:product-marketing` skill, never edited ad hoc.
- FACT(2026-08-06) This repo also runs a Content Studio: outlier scraping → scoring →
  remix briefs → video production → scheduling (see `IMPLEMENTATION_PLAN.md`,
  `dashboard/`, `scripts/outlier-pipeline/`).

## AdCrate

- FACT(2026-08-06) No repo access yet; AdCrate-side employees will be hired in an AdCrate
  repo with the same template. Until then, AdCrate signal reaches Aria only via email,
  calendar, and Syra directly.

## The AI-employee system

- FACT(2026-08-06) System design lives in `IMPLEMENTATION_PLAN_AI_EMPLOYEES.md`.
  Employee = agent definition + memory folder + skills + scheduled routines.
- FACT(2026-08-06) This repo is **public** — memory must never contain quoted email
  content, names of counterparties, amounts, or PII. Long-term home for the employee
  system is a future private repo (e.g. `syra-adcrate/hq`).
- FACT(2026-08-06) Planned roster after Aria: Nara (Community Manager), Kai (Content
  Studio Operator), Sena (Partnerships & Sponsors).
- FACT(2026-08-06) Gmail + Google Calendar connectors are installed on the org but not
  yet enabled for chats — Syra's explicit decision for now. Standups run in **example
  mode**: `employees/_fixtures/` holds fabricated inbox/calendar data, briefs are
  labeled EXAMPLE DATA, and fixture content never enters memory as fact.
- FACT(2026-08-06) In-session cron is ephemeral (7-day cap, dies with the session).
  Durable routines must be claude.ai scheduled tasks — see `employees/aria/routines.md`.

## Open questions

- INFERENCE(2026-08-06) Brief delivery channel not yet chosen (push notification, email,
  or WhatsApp). Until decided, briefs land in the session/artifact only — likely to be
  ignored by week two; worth forcing a decision early.
