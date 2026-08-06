# Routine registry

Active scheduled routines (Claude Code Remote triggers). Keep this in sync: register on
create, update on change, remove on delete. List with the `list_triggers` tool or the
claude.ai Routines UI.

| Routine | Trigger id | Schedule (UTC → WITA) | Mode | Job |
|---|---|---|---|---|
| Daily second-brain update — analyze repo & work | `trig_01GvS8BhUN4REAKMo13EuJ9Y` | `41 22 * * *` → daily 06:41 | Fresh session, email notification | Analyze repo + last 7 days of work; rewrite `memory/state.md`, write `memory/log/<date>.md`, append evidenced decisions; flag marketing-context drift (updates only via `product-marketing` skill). Output: branch `claude/daily-memory-update` → PR to `main` |

**Known limitation:** the daily routine was created from a connector-less session, so its fired
sessions have **no MCP connector tools** (no GitHub MCP → it pushes its branch but may not be
able to open the PR itself; the run email will say so). To fix, recreate it from the claude.ai
Routines UI with the GitHub connector attached and update the id here.

Spawning conventions: see `memory/README.md` § "Spawning routines on demand".
