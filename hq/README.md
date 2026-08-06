# HQ — second-brain dashboard

Obsidian-style dashboard for the AI-employee system. React (Vite) + canvas force graph
(d3-force). Single surface for everything: the graph of the second brain, the daily
brief, and per-node detail. No artifacts — this app is the delivery channel.

## Data flow

- The **second brain lives in git**: `employees/<name>/memory/*` (markdown + registry).
- `scripts/build-graph.mjs` scans `employees/` → `src/data/graph.json`
  (nodes: employees, insights by status, teachings, journal days, routines;
  links: ownership + cross-mentions).
- Aria's `/standup` writes `src/data/brief.json` (structured brief) and regenerates
  `graph.json` at the end of every run — both are committed, so the dashboard is always
  reproducible from the repo.

## Commands

```sh
npm install
npm run graph    # rescan employees/ → src/data/graph.json
npm run dev      # dev server
npm run build    # graph + production build → dist/
```

## UI

- **Graph**: drag to pan, wheel to zoom, drag nodes to arrange, click for detail.
- **Filters** (right): search dims non-matches; checkboxes toggle groups;
  double-click a group to solo it.
- **Today** (left): the latest brief — top 3, schedule, decisions with defaults,
  flagged items, the daily teaching, status line.
