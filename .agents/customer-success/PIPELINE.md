# Customer pipeline — stages, cadence, health

Owned by **Xenorita** (`.claude/agents/xenorita.md`). Applies to every file in
`customers/`. Customer types: `venue`, `sponsor`, `partner`, `speaker`.

## Stages

| Stage | Meaning | Entry criteria | Follow-up cadence |
|---|---|---|---|
| `prospect` | Identified, not yet contacted | Name + why they fit + a way to reach them | Contact within 7 days of adding |
| `contacted` | First outreach sent, no real conversation yet | Outreach logged | Nudge after 4 days silent; second nudge after 7 more; then `dormant` |
| `in-talks` | Two-way conversation happening (chat, meeting, walkthrough) | They replied with interest | Never more than 5 days without a touch |
| `pilot` | First concrete collaboration agreed or done (first hosted event, first sponsored item, first talk) | Date + scope agreed | Before: confirm 2 days out. After: thank-you + recap within 2 days, debrief within 7 |
| `active` | Recurring relationship (regular venue slot, ongoing sponsor, repeat speaker) | Second collaboration agreed, or explicit ongoing commitment | Personal check-in every 14 days minimum; recap/results after every event |
| `at-risk` | Active/pilot account cooling: complaints, slow replies, hosting/payment friction | Any churn signal logged | Immediate save action within 3 days — always a concrete next action |
| `dormant` | Paused on good terms, or went quiet pre-pilot | Explicit pause, or unresponsive after full `contacted` sequence | Revisit ping every 60 days |
| `churned` | Relationship ended | They declined/ended it, or two dormant revisits with no reply | None — but log the churn reason in their file AND `playbook.md` |

Rules:
- Never skip stages without evidence (e.g. straight to `active` only if a
  recurring commitment is explicit).
- Stage changes are logged in the customer's interaction log with the reason.
- Every non-churned account must always have a **Next action with a due date**.

## Health

| Health | Meaning |
|---|---|
| 🟢 | On track: recent positive contact, next action set, no friction |
| 🟡 | Watch: slower replies, cadence slipped, small unresolved friction |
| 🔴 | Trouble: churn signal, broken commitment, or cadence badly overdue |

Health reflects *momentum*, stage reflects *relationship depth* — an `active`
account can be 🔴, a `prospect` can be 🟢.

## Priority order (for "what's next?")

1. Overdue next actions (oldest first)
2. 🔴 accounts, then 🟡 past cadence
3. Actions due in the next 7 days
4. Stalled accounts (no touch beyond stage cadence)
