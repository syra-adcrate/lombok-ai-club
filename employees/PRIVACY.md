# PRIVACY — read before committing anything under `employees/`

This repository is **public** (open-source release). Employee memory will eventually
contain email/calendar-derived and business-sensitive content, so **employee memory must
NOT live in this repository long-term** — the whole `employees/` tree is designed to be
moved to a private repository.

## Hard rules for this repo

- **No real email content, calendar content, or personally identifiable information (PII)
  may ever be committed here.** That includes names/addresses of correspondents, meeting
  attendees, email subjects/bodies, phone numbers, and anything derived from connector
  data (Gmail, Google Calendar, WhatsApp, etc.).
- **No business-sensitive content**: sponsor negotiations, financials, credentials,
  API keys, tokens.
- What IS allowed here: **scaffolding, templates, skills, and clearly-fake test data**
  (e.g. a throwaway `testbot` employee used to verify the hire flow).

## Portability rules

So the tree can be relocated to a private repo with a plain `git mv` / copy:

- **All references are relative** — to the repo root (`employees/<name>/memory/...`) or
  to the current file. Never use absolute paths (`/home/...`) or machine-specific paths
  in any file under `employees/`, in agent definitions, or in skills that touch this tree.
- Nothing under `employees/` may hard-code this repository's name or URL.
- Agent definitions (`.claude/agents/<name>.md`) and the `hire` / `memory-distill` skills
  travel with the tree; they reference memory only via relative paths.

If a routine or distillation is about to write content that violates the rules above,
the correct behavior is: **do not write it**, and record a note in that employee's
`insights.md` saying the memory tree needs to move to the private repo first.
