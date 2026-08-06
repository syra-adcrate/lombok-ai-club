# Decision log

Append-only. Newest at the bottom. Supersede, don't rewrite.

---

## 2026-07-23 — Ads intelligence via Apify, not a new MCP

For the ads pipeline, use the **already-connected Apify MCP** with ad-library actors (option A)
instead of the community `facebook-ads-library-mcp` (new paid API) or Meta's official Ads MCP
(own-account management only, no Ad Library access). Official Meta MCP reconsidered only if the
club ever runs paid ads. _Source: `IMPLEMENTATION_PLAN_ADS.md`._

## 2026-07-23 — Ads are creative intelligence only

The club runs **no paid ads**. Ad libraries are mined for spend-validated hooks/structures and
translated to organic content: steal the angle, never the ad; never repost ad media.
_Source: `IMPLEMENTATION_PLAN_ADS.md`, Phase D rules._

## 2026-07-23 — Local JSON is canonical until F7

Until the dual-source-of-truth fix (F7), local `dashboard/data/*.json` is canonical and the
deployed D1 is treated as a stale mirror. _Source: `IMPLEMENTATION_PLAN.md` B4._

## 2026-08-06 — Memory maintained by durable routines, not session cron

Recurring memory maintenance uses **Claude Code Remote triggers** (server-side, survive
container death), not session-local cron jobs (die with the session, 7-day cap). First routine:
daily memory update at 06:41 WITA. _Source: routine-spawn session._

## 2026-08-06 — Second brain lives in `memory/`, separate from marketing context

Work memory (state, logs, decisions, routine registry) lives in `memory/`; marketing
positioning stays exclusively in `.agents/product-marketing.md` via the `product-marketing`
skill. Routine output reaches `main` via the `claude/daily-memory-update` branch + one open PR,
never direct pushes.
