#!/usr/bin/env python3
"""HQ dashboard generator: scan employees/ and emit a single-file HTML force graph.

Usage: python3 .claude/skills/hq-dashboard/generate.py [--root .] [--out PATH]

Default output is dashboard/public/second-brain.html — the "Second Brain" tab of the
Content Studio app (both server.js and the Cloudflare worker serve dashboard/public/
statically). Stdlib only, repo-relative paths only (the employees/ tree is portable —
see employees/PRIVACY.md). The output is self-contained (inline JSON + canvas JS, no
external resources) so it can also be published as a claude.ai Artifact.
"""
import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path

# Hue wheel for per-employee color groups; assignment order follows registry order.
EMPLOYEE_COLORS = ["#8b7ff0", "#4cc2a9", "#e0a458", "#d97fa8", "#6db1e8", "#b8c46a"]
STATUS_COLORS = {"open": "#e5b567", "surfaced": "#64a8e8", "done": "#58b085"}
TEACHING_COLOR = "#c98cd6"
ROUTINE_COLOR = "#45b8b0"
JOURNAL_COLOR = "#5c5c6e"

# Item formats in insights.md / teachings.md:
#   template: - [open | 2026-08-06 | FACT] text     (teachings: no FACT/INFERENCE tag)
#   aria:     - 2026-08-06 · **surfaced** (2026-08-06) · text
RE_TEMPLATE = re.compile(r"^- \[(\w+) \| (\d{4}-\d{2}-\d{2})(?: \| (FACT|INFERENCE))?\]\s*(.*)")
RE_ARIA = re.compile(r"^- (\d{4}-\d{2}-\d{2}) · \*\*(\w+)\*\*(?: \([^)]*\))? · (.*)")
STATUS_ALIASES = {"queued": "open", "taught": "done"}


def parse_items(path):
    """Parse dated status items from an insights/teachings file, both known formats."""
    if not path.exists():
        return []
    items = []
    for line in path.read_text(encoding="utf-8").splitlines():
        m = RE_TEMPLATE.match(line)
        if m:
            status, date, tag, text = m.groups()
        else:
            m = RE_ARIA.match(line)
            if m:
                date, status, text = m.groups()
                tag = None
            elif items and (line.startswith("  ") or line.startswith("\t")) and line.strip():
                items[-1]["text"] += " " + line.strip()
                continue
            else:
                continue
        status = STATUS_ALIASES.get(status.lower(), status.lower())
        items.append({"status": status, "date": date, "tag": tag, "text": text.strip()})
    for it in items:
        it["text"] = re.sub(r"\*\*(.+?)\*\*", r"\1", it["text"]).strip()
    return items


def scan(root):
    root = Path(root)
    registry = json.loads((root / "employees" / "_registry.json").read_text(encoding="utf-8"))
    nodes, edges, today_insights, roster = [], [], [], []

    active = [e for e in registry["employees"] if e.get("status") != "removed"]
    for i, emp in enumerate(active):
        name = emp["name"]
        color = EMPLOYEE_COLORS[i % len(EMPLOYEE_COLORS)]
        emp_id = f"emp:{name}"
        label = emp.get("display_name") or name.title()
        nodes.append({
            "id": emp_id, "type": "employee", "label": label, "owner": name,
            "color": color, "meta": f'{emp["role"]} · {emp.get("cadence", "?")} · {emp.get("status")}',
            "text": f'Last run: {emp.get("last_run") or "never"}',
        })
        roster.append({"name": label, "color": color, "status": emp.get("status"),
                       "last_run": emp.get("last_run")})

        mem = root / "employees" / name / "memory"
        for j, it in enumerate(parse_items(mem / "insights.md")):
            nid = f"ins:{name}:{j}"
            nodes.append({
                "id": nid, "type": "insight", "label": it["text"][:52], "owner": name,
                "color": STATUS_COLORS.get(it["status"], "#8a8a99"), "status": it["status"],
                "meta": " · ".join(x for x in (it["date"], it["status"], it["tag"]) if x),
                "text": it["text"],
            })
            edges.append([emp_id, nid])
            if it["status"] in ("open", "surfaced"):
                today_insights.append({"owner": label, "color": color, **it})
        for j, it in enumerate(parse_items(mem / "teachings.md")):
            nid = f"tea:{name}:{j}"
            nodes.append({
                "id": nid, "type": "teaching", "label": it["text"][:52], "owner": name,
                "color": TEACHING_COLOR, "status": it["status"],
                "meta": f'{it["date"]} · {it["status"]}', "text": it["text"],
            })
            edges.append([emp_id, nid])
        journal = mem / "journal"
        if journal.is_dir():
            for f in sorted(journal.glob("????-??-??.md")):
                nid = f"jrn:{name}:{f.stem}"
                nodes.append({
                    "id": nid, "type": "journal", "label": f.stem, "owner": name,
                    "color": JOURNAL_COLOR, "meta": "journal day",
                    "text": f"Journal {f.stem} ({len(f.read_text(encoding='utf-8').splitlines())} lines)",
                })
                edges.append([emp_id, nid])
        for r in emp.get("routines", []):
            nid = f"rtn:{name}:{r['name']}"
            nodes.append({
                "id": nid, "type": "routine", "label": r["name"], "owner": name,
                "color": ROUTINE_COLOR,
                "meta": f'{r.get("wita", "?")} WITA · cron {r.get("cron_utc", "?")} UTC',
                "text": f'Scheduled: {"yes" if r.get("trigger_id") else "not yet (trigger_id null)"}',
            })
            edges.append([emp_id, nid])

    today_insights.sort(key=lambda x: (x["status"] != "open", x["date"]), reverse=False)
    return {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "nodes": nodes, "edges": edges,
        "today": today_insights[:5], "roster": roster,
        "employees": [{"name": r["name"], "owner": e["name"], "color": r["color"]}
                      for r, e in zip(roster, active)],
    }


TEMPLATE = r"""<title>Lombok HQ — employee graph</title>
<style>
  :root {
    --bg: #14141b; --panel: rgba(23,23,32,.93); --line: #2a2a3a;
    --text: #d6d6e0; --muted: #79798c; --accent: #8b7ff0;
  }
  html, body { height: 100%; }
  body { margin: 0; background: var(--bg); color: var(--text); overflow: hidden;
         font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
  canvas { position: fixed; inset: 0; display: block; cursor: grab; }
  .bar { position: fixed; top: 0; left: 0; right: 0; display: flex; align-items: center;
         gap: 14px; padding: 10px 16px; background: linear-gradient(var(--bg), transparent);
         pointer-events: none; z-index: 3; }
  .bar h1 { font-size: 15px; font-weight: 600; margin: 0; letter-spacing: .02em; }
  .bar .stamp { color: var(--muted); font: 11px ui-monospace, monospace; }
  .bar input { pointer-events: auto; margin-left: auto; background: var(--panel);
               border: 1px solid var(--line); border-radius: 6px; color: var(--text);
               padding: 6px 10px; width: 210px; font: 13px system-ui, sans-serif; }
  .bar input:focus { outline: 1px solid var(--accent); border-color: var(--accent); }
  .panel { position: fixed; background: var(--panel); border: 1px solid var(--line);
           border-radius: 10px; padding: 14px 16px; width: 252px; z-index: 2;
           backdrop-filter: blur(6px); max-height: calc(100vh - 120px); overflow-y: auto; }
  .panel h2 { font-size: 11px; font-weight: 600; letter-spacing: .09em; margin: 0 0 10px;
              text-transform: uppercase; color: var(--muted); }
  #today { left: 16px; top: 54px; }
  #filters { right: 16px; top: 54px; }
  #detail { left: 16px; bottom: 16px; display: none; width: 300px; }
  #detail .meta { color: var(--muted); font: 11px ui-monospace, monospace; margin-top: 6px; }
  .item { display: grid; grid-template-columns: 10px 1fr; gap: 8px; margin: 0 0 10px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 5px; }
  .item .who { color: var(--muted); font-size: 11px; }
  .roster { border-top: 1px solid var(--line); margin-top: 12px; padding-top: 10px; }
  .roster .item { margin-bottom: 6px; }
  .roster .lr { font: 11px ui-monospace, monospace; color: var(--muted); }
  label.row { display: flex; align-items: center; gap: 8px; margin: 5px 0; cursor: pointer; }
  label.row input { accent-color: var(--accent); }
  .swatch { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
  .legend { border-top: 1px solid var(--line); margin-top: 10px; padding-top: 8px;
            color: var(--muted); font-size: 12px; }
  .legend .row-l { display: flex; gap: 8px; align-items: center; margin: 4px 0; }
  .hint { position: fixed; bottom: 12px; right: 16px; color: var(--muted); font-size: 11px; z-index: 2; }
  @media (max-width: 760px) { #today { display: none; } .panel { width: 210px; } }
</style>

<div class="bar">
  <h1>Lombok HQ</h1><span class="stamp">generated __GENERATED__</span>
  <input id="search" type="search" placeholder="Search nodes…" aria-label="Search nodes">
</div>

<div class="panel" id="today">
  <h2>Today</h2>
  <div id="today-items"></div>
  <div class="roster"><h2>Roster</h2><div id="roster-items"></div></div>
</div>

<div class="panel" id="filters">
  <h2>Employees</h2><div id="emp-filters"></div>
  <h2 style="margin-top:12px">Nodes</h2><div id="type-filters"></div>
  <label class="row"><input type="checkbox" id="hide-done"> hide done</label>
  <div class="legend">
    <div class="row-l"><span class="swatch" style="background:#e5b567"></span>insight · open</div>
    <div class="row-l"><span class="swatch" style="background:#64a8e8"></span>insight · surfaced</div>
    <div class="row-l"><span class="swatch" style="background:#58b085"></span>done / taught</div>
    <div class="row-l"><span class="swatch" style="background:#c98cd6"></span>teaching</div>
    <div class="row-l"><span class="swatch" style="background:#45b8b0"></span>routine</div>
    <div class="row-l"><span class="swatch" style="background:#5c5c6e"></span>journal day</div>
  </div>
</div>

<div class="panel" id="detail"><h2 id="d-type"></h2><div id="d-text"></div><div class="meta" id="d-meta"></div></div>
<div class="hint">drag to pan · wheel to zoom · click a node</div>
<canvas id="c"></canvas>

<script>
"use strict";
const DATA = __DATA__;

// --- panels -----------------------------------------------------------------
const el = id => document.getElementById(id);
const esc = s => { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; };
el("today-items").innerHTML = DATA.today.length
  ? DATA.today.map(t => `<div class="item"><span class="dot" style="background:${
      t.status === "open" ? "#e5b567" : "#64a8e8"}"></span><div>${esc(t.text)}<div class="who">${
      esc(t.owner)} · ${t.date} · ${t.status}</div></div></div>`).join("")
  : `<div class="who" style="color:var(--muted)">No open insights.</div>`;
el("roster-items").innerHTML = DATA.roster.map(r =>
  `<div class="item"><span class="dot" style="background:${r.color}"></span><div>${esc(r.name)}
   <div class="lr">${r.last_run ? "last run " + r.last_run.slice(0, 16).replace("T", " ") + "Z" : "never run"}</div></div></div>`).join("");

const empOn = {}, typeOn = { employee: 1, insight: 1, teaching: 1, routine: 1, journal: 1 };
el("emp-filters").innerHTML = DATA.employees.map(e =>
  `<label class="row"><input type="checkbox" checked data-emp="${e.owner}">
   <span class="swatch" style="background:${e.color}"></span>${esc(e.name)}</label>`).join("");
el("type-filters").innerHTML = Object.keys(typeOn).map(t =>
  `<label class="row"><input type="checkbox" checked data-type="${t}">${t}s</label>`).join("");
DATA.employees.forEach(e => empOn[e.owner] = true);
document.querySelectorAll("[data-emp]").forEach(cb =>
  cb.addEventListener("change", () => { empOn[cb.dataset.emp] = cb.checked; }));
document.querySelectorAll("[data-type]").forEach(cb =>
  cb.addEventListener("change", () => { typeOn[cb.dataset.type] = cb.checked; }));
let hideDone = false, query = "";
el("hide-done").addEventListener("change", e => hideDone = e.target.checked);
el("search").addEventListener("input", e => query = e.target.value.trim().toLowerCase());

// --- graph ------------------------------------------------------------------
const canvas = el("c"), ctx = canvas.getContext("2d");
let W = 0, H = 0, dpr = 1;
function resize() {
  dpr = window.devicePixelRatio || 1;
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + "px"; canvas.style.height = H + "px";
}
window.addEventListener("resize", () => { resize(); kick(); });
resize();

// deterministic layout: seeded PRNG so regenerated pages look familiar
let seed = 1337;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

const R = { employee: 16, insight: 6, teaching: 6, routine: 5, journal: 4 };
const nodes = DATA.nodes.map(n => ({
  ...n, r: R[n.type], x: 0, y: 0, vx: 0, vy: 0, fixed: false,
}));
const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
// cluster start positions: employees on a ring, satellites near their owner
const emps = nodes.filter(n => n.type === "employee");
emps.forEach((n, i) => {
  const a = (i / Math.max(emps.length, 1)) * 2 * Math.PI;
  n.x = Math.cos(a) * 160; n.y = Math.sin(a) * 160;
});
nodes.forEach(n => {
  if (n.type === "employee") return;
  const o = byId["emp:" + n.owner] || { x: 0, y: 0 };
  n.x = o.x + (rnd() - .5) * 220; n.y = o.y + (rnd() - .5) * 220;
});
const edges = DATA.edges.map(([a, b]) => [byId[a], byId[b]]).filter(e => e[0] && e[1]);

const visible = n => empOn[n.owner] && typeOn[n.type] && !(hideDone && n.status === "done");
const matches = n => !query || n.label.toLowerCase().includes(query) ||
  (n.text || "").toLowerCase().includes(query) || n.owner.includes(query);

let alpha = 1;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
function kick() { alpha = Math.max(alpha, .6); }
function tick() {
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    for (let j = i + 1; j < nodes.length; j++) {   // repulsion
      const b = nodes[j];
      let dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy;
      if (d2 < 1) { dx = rnd() - .5; dy = rnd() - .5; d2 = 1; }
      if (d2 > 90000) continue;
      const f = 1300 / d2 * alpha, d = Math.sqrt(d2);
      dx = dx / d * f; dy = dy / d * f;
      a.vx += dx; a.vy += dy; b.vx -= dx; b.vy -= dy;
    }
    a.vx -= a.x * .0022 * alpha; a.vy -= a.y * .0022 * alpha;  // center gravity
  }
  for (const [a, b] of edges) {                                // springs
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
    const rest = a.type === "employee" && b.type === "employee" ? 220 : 74;
    const f = (d - rest) * .022 * alpha, ux = dx / d * f, uy = dy / d * f;
    a.vx += ux; a.vy += uy; b.vx -= ux; b.vy -= uy;
  }
  for (const n of nodes) {
    if (n.fixed) { n.vx = n.vy = 0; continue; }
    n.vx *= .82; n.vy *= .82; n.x += n.vx; n.y += n.vy;
  }
  alpha = Math.max(alpha * .985, .02);
}
if (reduced) { alpha = 1; for (let i = 0; i < 400; i++) tick(); alpha = 0; }

let tx = 0, ty = 0, scale = 1, hover = null, selected = null;
function toWorld(px, py) { return [(px - W / 2 - tx) / scale, (py - H / 2 - ty) / scale]; }

function draw() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#14141b"; ctx.fillRect(0, 0, W, H);
  ctx.translate(W / 2 + tx, H / 2 + ty); ctx.scale(scale, scale);

  ctx.lineWidth = 1 / scale;
  for (const [a, b] of edges) {
    if (!visible(a) || !visible(b)) continue;
    const dim = query && !(matches(a) || matches(b));
    ctx.strokeStyle = dim ? "rgba(120,120,145,.05)" : "rgba(120,120,145,.22)";
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  for (const n of nodes) {
    if (!visible(n)) continue;
    const dim = query && !matches(n);
    ctx.globalAlpha = dim ? .08 : 1;
    ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, 7);
    ctx.fillStyle = n.color; ctx.fill();
    if (n === selected || n === hover) {
      ctx.strokeStyle = "#d6d6e0"; ctx.lineWidth = 1.5 / scale; ctx.stroke();
    }
    if (n.type === "employee" || n === hover || n === selected || scale > 1.5) {
      ctx.fillStyle = n.type === "employee" ? "#d6d6e0" : "#9a9aad";
      ctx.font = `${(n.type === "employee" ? 12 : 10) / scale}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(n.label, n.x, n.y + n.r + 13 / scale);
    }
    ctx.globalAlpha = 1;
  }
}
function frame() { if (alpha > .021) tick(); draw(); requestAnimationFrame(frame); }
requestAnimationFrame(frame);

// --- interaction ------------------------------------------------------------
let drag = null, panning = false, px = 0, py = 0;
function pick(mx, my) {
  const [wx, wy] = toWorld(mx, my);
  let best = null, bd = 1e9;
  for (const n of nodes) {
    if (!visible(n)) continue;
    const d = Math.hypot(n.x - wx, n.y - wy);
    if (d < Math.max(n.r + 6, 10) && d < bd) { best = n; bd = d; }
  }
  return best;
}
canvas.addEventListener("pointerdown", e => {
  canvas.setPointerCapture(e.pointerId);
  const n = pick(e.clientX, e.clientY);
  if (n) { drag = n; n.fixed = true; } else { panning = true; }
  px = e.clientX; py = e.clientY;
});
canvas.addEventListener("pointermove", e => {
  if (drag) {
    const [wx, wy] = toWorld(e.clientX, e.clientY);
    drag.x = wx; drag.y = wy; kick();
  } else if (panning) {
    tx += e.clientX - px; ty += e.clientY - py; px = e.clientX; py = e.clientY;
  } else {
    hover = pick(e.clientX, e.clientY);
    canvas.style.cursor = hover ? "pointer" : "grab";
  }
});
canvas.addEventListener("pointerup", e => {
  if (drag) { drag.fixed = false; drag = null; }
  else if (panning && Math.hypot(e.clientX - px, e.clientY - py) < 4) {
    selected = pick(e.clientX, e.clientY);
    const d = el("detail");
    if (selected) {
      d.style.display = "block";
      el("d-type").textContent = `${selected.type} · ${selected.owner}`;
      el("d-text").textContent = selected.text || selected.label;
      el("d-meta").textContent = selected.meta || "";
    } else d.style.display = "none";
  }
  panning = false;
});
canvas.addEventListener("wheel", e => {
  e.preventDefault();
  const k = Math.exp(-e.deltaY * .0012), ns = Math.min(3, Math.max(.3, scale * k));
  const [wx, wy] = toWorld(e.clientX, e.clientY);
  tx -= wx * (ns - scale); ty -= wy * (ns - scale); scale = ns;
}, { passive: false });
</script>
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".", help="repo root (contains employees/)")
    ap.add_argument("--out", default=None,
                    help="output HTML path (default: <root>/dashboard/public/second-brain.html)")
    args = ap.parse_args()
    if args.out is None:
        args.out = str(Path(args.root) / "dashboard" / "public" / "second-brain.html")
    data = scan(args.root)
    html = TEMPLATE.replace("__GENERATED__", data["generated"]).replace(
        "__DATA__", json.dumps(data, ensure_ascii=False))
    Path(args.out).write_text(html, encoding="utf-8")
    print(f"hq-dashboard: {len(data['nodes'])} nodes, {len(data['edges'])} edges -> {args.out}")


if __name__ == "__main__":
    main()
