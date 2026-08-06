# Fixtures — example connector data

Everything in this folder is **fabricated example data** for developing and demoing
employee routines without live connector access. Rules:

- All names, companies, addresses, and events are invented; domains are `example.com`
  variants. Nothing here may be copied from a real inbox or calendar — this repo is
  public.
- The `/standup` skill uses these automatically when connector tools are unavailable
  (**example mode**). Every brief section derived from fixtures is labeled EXAMPLE DATA.
- Fixture-derived content must never be written into any employee's `long-term.md` as
  fact — journals may only note that an example run happened.
- When Gmail/Calendar connectors go live, these files stop being used (live tools take
  precedence). Keep them for testing new employees' routines.

Files:
- `gmail-example.json` — shaped like a simplified Gmail search result (id, from,
  subject, snippet, labels, date).
- `calendar-example.json` — shaped like a simplified Calendar events list (summary,
  start/end with WITA offset, attendees, status; `responseStatus: "needsAction"` marks
  an unanswered invite).
