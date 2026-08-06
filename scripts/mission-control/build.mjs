#!/usr/bin/env node
// Mission Control — scans the workspace and emits a self-contained, Obsidian-style
// graph view of every file, clustered by the second-brain aggregator's parts.
//
//   node scripts/mission-control/build.mjs                 → mission-control.html (repo root)
//   node scripts/mission-control/build.mjs --artifact out  → also writes a body-only copy for publishing

import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..');
const REPO_URL = 'https://github.com/syra-adcrate/lombok-ai-club';
const SKIP = new Set(['.git', 'node_modules']);
const OUT = join(ROOT, 'mission-control.html');

// ---------- collect files ----------

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else {
      const rel = relative(ROOT, full);
      if (rel === 'mission-control.html' || rel === 'dashboard/public/second-brain.html') continue;
      acc.push({ path: rel, size: st.size, mtime: st.mtimeMs / 1000 });
    }
  }
  return acc;
}

// last-commit unix time per file, from a single git-log pass
function gitDates() {
  const map = new Map();
  let out = '';
  try {
    out = execSync('git log --format=%%ct%ct --name-only', { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString();
  } catch { return map; }
  let ts = 0;
  for (const line of out.split('\n')) {
    if (line.startsWith('%ct')) ts = Number(line.slice(3));
    else if (line.trim() && !map.has(line.trim())) map.set(line.trim(), ts);
  }
  return map;
}

// ---------- classify into parts ----------

const PARTS = [
  {
    id: 'intake', stage: '01', name: 'Intake', title: 'Outlier pipeline', color: '#35c2a0',
    desc: 'Scrapes viral AI content via Apify, scores it, feeds the studio.',
    match: p => p.startsWith('scripts/outlier-pipeline/'),
  },
  {
    id: 'curation', stage: '02', name: 'Curation', title: 'Content Studio', color: '#f2b64c',
    desc: 'Dashboard for rating outliers, media library, remix briefs.',
    match: p => p.startsWith('dashboard/'),
  },
  {
    id: 'synthesis', stage: '03', name: 'Synthesis', title: 'Remix briefs', color: '#7ab8ff',
    desc: 'Outlier post → hook → shot plan, adapted to the club’s audience.',
    match: p => p.startsWith('REMIXES/'),
  },
  {
    id: 'production', stage: '04', name: 'Production', title: 'Video projects', color: '#b39ddb',
    desc: 'HyperFrames compositions rendered to MP4 reels and slideshows.',
    match: p => p.startsWith('videos/'),
    groupBy: p => p.split('/')[1],
  },
  {
    id: 'memory', stage: null, name: 'Memory', title: 'Context & instructions', color: '#e0604f',
    desc: 'What Claude loads every session: routing rules, positioning, voice.',
    match: p => p === 'CLAUDE.md' || p === 'README.md' || p === 'LICENSE' || p === '.gitignore'
      || p.startsWith('.agents/') || p.startsWith('.claude/'),
  },
  {
    id: 'ops', stage: null, name: 'Ops', title: 'Plans, rubrics & tooling', color: '#8a96a8',
    desc: 'Implementation plans, the remix audit rubric, this generator.',
    match: p => /^IMPLEMENTATION_PLAN.*\.md$/.test(p) || p === 'REMIX_AUDIT_RUBRIC.md'
      || p.startsWith('scripts/mission-control/'),
  },
];

const TYPE_BY_EXT = {
  '.md': 'doc', '.txt': 'doc',
  '.json': 'data', '.jsonc': 'data', '.sql': 'data',
  '.js': 'code', '.mjs': 'code',
  '.html': 'html',
  '.png': 'media', '.jpg': 'media', '.jpeg': 'media', '.svg': 'media', '.mp4': 'media', '.woff2': 'media',
};

// ---------- cross-link extraction ----------

const TEXT_EXT = new Set(['.md', '.txt', '.html', '.mjs', '.js', '.json', '.jsonc', '.sql', '']);
const MAX_SCAN = 400 * 1024;

function extractRefs(files, videoProjects) {
  // index basenames + extension-less stems that are unique repo-wide and long
  // enough to not false-hit (index.html, meta.json, BRIEF.md, ...)
  const byToken = new Map();
  for (const f of files) {
    const base = basename(f.path);
    const stem = base.replace(/\.[^.]+$/, '');
    for (const tok of new Set([base, stem])) {
      if (tok.length < 8) continue;
      byToken.set(tok, byToken.has(tok) ? null : f.path); // null = ambiguous
    }
  }
  const tokens = [...byToken].filter(([, v]) => v).map(([t, v]) => [t, v]);
  const boundary = /[A-Za-z0-9_-]/;

  const edges = new Set();
  const addEdge = (a, b) => { if (a !== b) edges.add(a + '\u0000' + b); };

  for (const f of files) {
    if (!TEXT_EXT.has(extname(f.path).toLowerCase()) || f.size > MAX_SCAN) continue;
    const text = readFileSync(join(ROOT, f.path), 'utf8');
    // 1. full relative path mentions
    for (const g of files) {
      if (g.path !== f.path && text.includes(g.path)) addEdge(f.path, g.path);
    }
    // 2. unique basename / stem mentions, with word-ish boundaries
    for (const [tok, target] of tokens) {
      if (target === f.path) continue;
      let i = -1;
      while ((i = text.indexOf(tok, i + 1)) !== -1) {
        const before = text[i - 1], after = text[i + tok.length];
        if ((!before || !boundary.test(before)) && (!after || !boundary.test(after))) {
          addEdge(f.path, target);
          break;
        }
      }
    }
    // 3. video project directory mentions → project sub-hub
    for (const proj of videoProjects) {
      if (!f.path.startsWith('videos/' + proj + '/') && text.includes('videos/' + proj)) {
        addEdge(f.path, 'proj:' + proj);
      }
    }
  }
  return [...edges].map(e => e.split('\u0000'));
}

// ---------- graph model ----------

function build() {
  const dates = gitDates();
  const files = walk(ROOT).map(f => {
    const part = PARTS.find(p => p.match(f.path));
    return {
      ...f,
      date: dates.get(f.path) ?? f.mtime,
      type: TYPE_BY_EXT[extname(f.path).toLowerCase()] ?? 'other',
      part: part ? part.id : 'unsorted',
    };
  });
  if (files.some(f => f.part === 'unsorted')) {
    throw new Error('unsorted files: ' + files.filter(f => f.part === 'unsorted').map(f => f.path).join(', '));
  }

  const videoProjects = [...new Set(files.filter(f => f.part === 'production').map(f => f.path.split('/')[1]))];

  const nodes = [];
  const edges = [];
  for (const p of PARTS) {
    nodes.push({ id: 'part:' + p.id, kind: 'hub', label: p.name, part: p.id });
  }
  for (const proj of videoProjects) {
    nodes.push({ id: 'proj:' + proj, kind: 'subhub', label: proj, part: 'production' });
    edges.push({ s: 'part:production', t: 'proj:' + proj, kind: 'part' });
  }
  for (const f of files) {
    nodes.push({
      id: f.path, kind: 'file', label: basename(f.path), part: f.part, type: f.type,
      size: f.size, date: f.date, url: REPO_URL + '/blob/main/' + f.path.split('/').map(encodeURIComponent).join('/'),
    });
    edges.push({
      s: f.part === 'production' ? 'proj:' + f.path.split('/')[1] : 'part:' + f.part,
      t: f.path, kind: 'part',
    });
  }
  const ids = new Set(nodes.map(n => n.id));
  for (const [s, t] of extractRefs(files, videoProjects)) {
    if (ids.has(s) && ids.has(t)) edges.push({ s, t, kind: 'ref' });
  }

  return {
    repo: REPO_URL,
    branch: execSync('git rev-parse --abbrev-ref HEAD', { cwd: ROOT }).toString().trim(),
    generated: new Date().toISOString().slice(0, 10),
    totalFiles: files.length,
    totalBytes: files.reduce((s, f) => s + f.size, 0),
    parts: PARTS.map(p => ({
      id: p.id, stage: p.stage, name: p.name, title: p.title, color: p.color, desc: p.desc,
      count: files.filter(f => f.part === p.id).length,
    })),
    nodes, edges,
  };
}

// ---------- page ----------

const STYLE = `
  :root {
    --bg: #0e1116; --panel: #161b23; --panel-2: #1d242f; --border: #2a3341;
    --text: #e8edf4; --muted: #8a96a8; --accent: #35c2a0;
    --radius: 12px;
    --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; overflow: hidden; }
  body {
    background: var(--bg); color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  #graph { position: fixed; inset: 0; display: block; cursor: grab; }
  #graph.dragging { cursor: grabbing; }

  /* ---- control panel (top-left) ---- */
  #panel {
    position: fixed; top: 16px; left: 16px; width: 248px; z-index: 20;
    background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius);
    box-shadow: 0 8px 30px rgba(0,0,0,.45);
    max-height: calc(100vh - 32px); overflow-y: auto;
  }
  #panel-head {
    display: flex; align-items: center; gap: 10px; padding: 12px 14px; cursor: pointer;
    user-select: none;
  }
  #panel-head h1 { font-size: 13px; font-weight: 700; letter-spacing: .2px; flex: 1; }
  #panel-head h1 span { color: var(--accent); }
  #panel-head .caret { color: var(--muted); font-size: 10px; transition: transform .15s; }
  #panel.collapsed .caret { transform: rotate(-90deg); }
  #panel.collapsed #panel-body { display: none; }
  #panel-body { padding: 0 14px 14px; }

  .sect { border-top: 1px solid var(--border); padding: 10px 0; }
  .sect h2 {
    font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.2px;
    color: var(--muted); margin-bottom: 9px;
  }
  #panel input[type="search"] {
    width: 100%; background: var(--panel-2); border: 1px solid var(--border); border-radius: 8px;
    color: var(--text); font-size: 12.5px; padding: 7px 10px; font-family: inherit;
  }
  #panel input[type="search"]:focus { outline: none; border-color: var(--accent); }

  .toggle { display: flex; align-items: center; gap: 8px; padding: 4px 0; cursor: pointer; font-size: 12.5px; color: var(--text); user-select: none; }
  .toggle input { accent-color: var(--accent); }

  .group-row {
    display: flex; align-items: center; gap: 8px; padding: 4px 6px; margin: 0 -6px;
    border-radius: 7px; cursor: pointer; font-size: 12.5px; user-select: none;
  }
  .group-row:hover { background: var(--panel-2); }
  .group-row .dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
  .group-row .n { flex: 1; }
  .group-row .c { font-family: var(--mono); font-size: 11px; color: var(--muted); }
  .group-row.off { opacity: .35; }
  .group-row.off .dot { background: var(--muted) !important; }

  .slider { padding: 3px 0 7px; }
  .slider label { display: flex; justify-content: space-between; font-size: 11.5px; color: var(--muted); margin-bottom: 3px; }
  .slider label output { font-family: var(--mono); color: var(--text); }
  .slider input {
    -webkit-appearance: none; appearance: none; width: 100%; height: 3px; border-radius: 2px;
    background: var(--border); outline: none; cursor: pointer;
  }
  .slider input::-webkit-slider-thumb {
    -webkit-appearance: none; appearance: none; width: 13px; height: 13px; border-radius: 50%;
    background: var(--accent); border: none;
  }
  .slider input::-moz-range-thumb { width: 13px; height: 13px; border-radius: 50%; background: var(--accent); border: none; }
  .slider input:focus-visible { box-shadow: 0 0 0 2px rgba(53,194,160,.5); }

  /* ---- stat chip (top-right) ---- */
  #stats {
    position: fixed; top: 16px; right: 16px; z-index: 20;
    background: var(--panel); border: 1px solid var(--border); border-radius: 999px;
    padding: 8px 16px; font-family: var(--mono); font-size: 11.5px; color: var(--muted);
  }
  #stats b { color: var(--text); font-weight: 700; }

  /* ---- tooltip ---- */
  #tip {
    position: fixed; z-index: 30; pointer-events: none; display: none; max-width: 420px;
    background: var(--panel-2); border: 1px solid var(--border); border-radius: 8px;
    padding: 7px 11px; font-family: var(--mono); font-size: 11.5px; line-height: 1.5;
  }
  #tip .p { color: var(--text); word-break: break-all; }
  #tip .m { color: var(--muted); }

  @media (max-width: 640px) {
    #panel { width: calc(100vw - 32px); }
    #stats { display: none; }
  }
`;

// Page script: plain strings only (no backticks / template interpolation) so it
// nests safely inside this build script's template literal.
const SCRIPT = String.raw`
'use strict';
var DATA = window.__MC__;
var canvas = document.getElementById('graph');
var ctx = canvas.getContext('2d');
var tip = document.getElementById('tip');

var COLORS = {}, PART_NAME = {};
DATA.parts.forEach(function (p) { COLORS[p.part_id || p.id] = p.color; PART_NAME[p.id] = p.name; });

// ---- state ----
var params = {
  textFade: 1.1,    // zoom level where labels start appearing
  nodeSize: 1,
  linkThick: 1,
  centerForce: 0.35,
  repelForce: 1,
  linkForce: 0.6,
  linkDist: 70,
};
var filters = { q: '', media: true, refsOnly: false, parts: {} };
DATA.parts.forEach(function (p) { filters.parts[p.id] = true; });

var nodes = DATA.nodes.map(function (n) { return Object.assign({ x: 0, y: 0, vx: 0, vy: 0 }, n); });
var byId = {};
nodes.forEach(function (n) { byId[n.id] = n; });
var edges = DATA.edges.map(function (e) { return { s: byId[e.s], t: byId[e.t], kind: e.kind }; });

var deg = {};
edges.forEach(function (e) { deg[e.s.id] = (deg[e.s.id] || 0) + 1; deg[e.t.id] = (deg[e.t.id] || 0) + 1; });
var adj = {};
edges.forEach(function (e) {
  (adj[e.s.id] = adj[e.s.id] || []).push(e.t.id);
  (adj[e.t.id] = adj[e.t.id] || []).push(e.s.id);
});

function radius(n) {
  var r = n.kind === 'hub' ? 11 : n.kind === 'subhub' ? 6.5 : 2.6 + Math.min(3.4, (deg[n.id] || 1) * 0.5);
  return r * params.nodeSize;
}
function mass(n) { return n.kind === 'hub' ? 14 : n.kind === 'subhub' ? 5 : 1; }

// ---- visibility ----
function nodeVisible(n) {
  if (!filters.parts[n.part]) return false;
  if (!filters.media && n.type === 'media') return false;
  if (filters.refsOnly && n.kind === 'file') {
    var hasRef = (adj[n.id] || []).length && edges.some(function (e) {
      return e.kind === 'ref' && (e.s === n || e.t === n);
    });
    if (!hasRef) return false;
  }
  return true;
}
var vis = [], visEdges = [];
function refreshVisible() {
  vis = nodes.filter(nodeVisible);
  var set = {};
  vis.forEach(function (n) { set[n.id] = 1; });
  visEdges = edges.filter(function (e) {
    if (!set[e.s.id] || !set[e.t.id]) return false;
    if (filters.refsOnly && e.kind !== 'ref') return false;
    return true;
  });
}

function matchesQuery(n) {
  return !filters.q || n.id.toLowerCase().indexOf(filters.q) !== -1 || n.label.toLowerCase().indexOf(filters.q) !== -1;
}

// ---- layout: seed clusters, then force sim ----
var W = 0, H = 0, DPR = 1;
function resize() {
  DPR = window.devicePixelRatio || 1;
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = W * DPR; canvas.height = H * DPR;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
}
resize();
window.addEventListener('resize', function () { resize(); draw(); });

(function seed() {
  var hubs = nodes.filter(function (n) { return n.kind === 'hub'; });
  hubs.forEach(function (h, i) {
    var a = (i / hubs.length) * Math.PI * 2 - Math.PI / 2;
    h.x = Math.cos(a) * 340; h.y = Math.sin(a) * 340;
  });
  nodes.forEach(function (n) {
    if (n.kind === 'hub') return;
    var hub = byId['part:' + n.part];
    n.x = hub.x + (Math.random() - 0.5) * 260;
    n.y = hub.y + (Math.random() - 0.5) * 260;
  });
})();

var alpha = 0;
function reheat(a) { alpha = Math.max(alpha, a); if (!running) loop(); }

function tick() {
  var i, j, n, m, dx, dy, d2, d, f;
  // repulsion
  for (i = 0; i < vis.length; i++) {
    n = vis[i];
    for (j = i + 1; j < vis.length; j++) {
      m = vis[j];
      dx = n.x - m.x; dy = n.y - m.y;
      d2 = dx * dx + dy * dy;
      if (d2 > 90000 || d2 === 0) continue;
      f = params.repelForce * 260 / d2;
      if (n.kind !== 'file' && m.kind !== 'file') f *= 30; // keep cluster hubs apart
      if (f > 4) f = 4;
      n.vx += dx * f / mass(n); n.vy += dy * f / mass(n);
      m.vx -= dx * f / mass(m); m.vy -= dy * f / mass(m);
    }
  }
  // springs
  for (i = 0; i < visEdges.length; i++) {
    var e = visEdges[i];
    dx = e.t.x - e.s.x; dy = e.t.y - e.s.y;
    d = Math.sqrt(dx * dx + dy * dy) || 1;
    var dist = params.linkDist * (e.s.kind === 'hub' || e.t.kind === 'hub' ? 1.35 : 1);
    f = params.linkForce * 0.02 * (d - dist) / d;
    e.s.vx += dx * f / mass(e.s); e.s.vy += dy * f / mass(e.s);
    e.t.vx -= dx * f / mass(e.t); e.t.vy -= dy * f / mass(e.t);
  }
  // center gravity + integrate
  for (i = 0; i < vis.length; i++) {
    n = vis[i];
    n.vx -= n.x * params.centerForce * 0.0022;
    n.vy -= n.y * params.centerForce * 0.0022;
    if (n === dragNode) { n.vx = 0; n.vy = 0; continue; }
    n.vx *= 0.86; n.vy *= 0.86;
    n.x += n.vx * alpha * 2.2;
    n.y += n.vy * alpha * 2.2;
  }
  alpha *= 0.994;
  if (alpha < 0.004) alpha = 0;
}

// ---- viewport ----
var view = { x: 0, y: 0, k: 1 };
function fit() {
  var minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  vis.forEach(function (n) {
    if (n.x < minX) minX = n.x; if (n.x > maxX) maxX = n.x;
    if (n.y < minY) minY = n.y; if (n.y > maxY) maxY = n.y;
  });
  var k = Math.min(W / (maxX - minX + 220), H / (maxY - minY + 220));
  view.k = Math.min(1.4, k);
  view.x = W / 2 - (minX + maxX) / 2 * view.k;
  view.y = H / 2 - (minY + maxY) / 2 * view.k;
}
function toScreen(n) { return { x: n.x * view.k + view.x, y: n.y * view.k + view.y }; }

// ---- draw ----
var hoverNode = null;
function draw() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#0e1116';
  ctx.fillRect(0, 0, W, H);

  var hoverSet = null;
  if (hoverNode) {
    hoverSet = {};
    hoverSet[hoverNode.id] = 1;
    (adj[hoverNode.id] || []).forEach(function (id) { hoverSet[id] = 1; });
  }
  var searching = !!filters.q;

  // edges
  var i, e, a, b;
  for (i = 0; i < visEdges.length; i++) {
    e = visEdges[i];
    a = toScreen(e.s); b = toScreen(e.t);
    var lit = hoverSet ? (hoverSet[e.s.id] && hoverSet[e.t.id] && (e.s === hoverNode || e.t === hoverNode)) : true;
    var alphaE = lit ? (e.kind === 'ref' ? 0.5 : 0.28) : 0.05;
    if (searching && !hoverSet) alphaE *= 0.45;
    ctx.strokeStyle = e.kind === 'ref' ? 'rgba(53,194,160,' + alphaE + ')' : 'rgba(138,150,168,' + alphaE + ')';
    ctx.lineWidth = (e.kind === 'ref' ? 1.1 : 0.7) * params.linkThick * (hoverSet && lit ? 1.6 : 1);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  // nodes
  var labelAlpha = Math.max(0, Math.min(1, (view.k - params.textFade) / 0.45));
  for (i = 0; i < vis.length; i++) {
    var n = vis[i];
    var s = toScreen(n);
    var r = radius(n) * Math.sqrt(view.k);
    var dim = (hoverSet && !hoverSet[n.id]) || (searching && !matchesQuery(n));
    ctx.globalAlpha = dim ? 0.12 : 1;
    ctx.fillStyle = COLORS[n.part] || '#8a96a8';
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.fill();
    if (n === hoverNode) {
      ctx.strokeStyle = '#e8edf4';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
    // label
    var la = n.kind !== 'file' ? Math.max(labelAlpha, 0.85) : labelAlpha;
    if (n === hoverNode || (hoverSet && hoverSet[n.id])) la = 1;
    if (dim) la *= 0.15;
    if (la > 0.02) {
      ctx.globalAlpha = la;
      ctx.fillStyle = '#c7d0dc';
      ctx.font = (n.kind === 'hub' ? '700 ' : '') + (n.kind === 'hub' ? 13 : 10.5) + 'px ' +
        (n.kind === 'file' ? 'ui-monospace, Menlo, monospace' : '-apple-system, sans-serif');
      ctx.textAlign = 'center';
      ctx.fillText(n.label, s.x, s.y + r + (n.kind === 'hub' ? 16 : 11));
    }
    ctx.globalAlpha = 1;
  }
}

// ---- main loop ----
var running = false;
function loop() {
  running = true;
  if (alpha > 0) tick();
  draw();
  if (alpha > 0) requestAnimationFrame(loop);
  else running = false;
}

// ---- interaction ----
var dragNode = null, panning = false, moved = 0;
var last = { x: 0, y: 0 };

function pick(mx, my) {
  var best = null, bestD = 1e9;
  for (var i = 0; i < vis.length; i++) {
    var s = toScreen(vis[i]);
    var r = Math.max(7, radius(vis[i]) * Math.sqrt(view.k) + 3);
    var dx = mx - s.x, dy = my - s.y, d = dx * dx + dy * dy;
    if (d < r * r && d < bestD) { best = vis[i]; bestD = d; }
  }
  return best;
}

function pointerPos(ev) {
  return { x: ev.clientX, y: ev.clientY };
}

canvas.addEventListener('pointerdown', function (ev) {
  var p = pointerPos(ev);
  last = p; moved = 0;
  dragNode = pick(p.x, p.y);
  panning = !dragNode;
  canvas.classList.add('dragging');
  canvas.setPointerCapture(ev.pointerId);
});
canvas.addEventListener('pointermove', function (ev) {
  var p = pointerPos(ev);
  if (dragNode) {
    dragNode.x = (p.x - view.x) / view.k;
    dragNode.y = (p.y - view.y) / view.k;
    moved += Math.abs(p.x - last.x) + Math.abs(p.y - last.y);
    last = p;
    reheat(0.25);
    return;
  }
  if (panning) {
    view.x += p.x - last.x; view.y += p.y - last.y;
    moved += Math.abs(p.x - last.x) + Math.abs(p.y - last.y);
    last = p;
    draw();
    return;
  }
  var n = pick(p.x, p.y);
  if (n !== hoverNode) {
    hoverNode = n;
    canvas.style.cursor = n ? 'pointer' : 'grab';
    draw();
  }
  if (n && n.kind === 'file') {
    tip.style.display = 'block';
    tip.style.left = Math.min(p.x + 14, W - 340) + 'px';
    tip.style.top = (p.y + 14) + 'px';
    var kb = n.size >= 1048576 ? (n.size / 1048576).toFixed(1) + ' MB' : n.size >= 1024 ? Math.round(n.size / 1024) + ' KB' : n.size + ' B';
    var dt = new Date(n.date * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    tip.innerHTML = '<div class="p">' + n.id + '</div><div class="m">' + PART_NAME[n.part] + ' · ' + kb + ' · ' + dt + '</div>';
  } else {
    tip.style.display = 'none';
  }
});
canvas.addEventListener('pointerup', function (ev) {
  var wasDrag = dragNode, wasMoved = moved;
  dragNode = null; panning = false;
  canvas.classList.remove('dragging');
  if (wasDrag && wasMoved < 5) {
    if (wasDrag.kind === 'file' && wasDrag.url) window.open(wasDrag.url, '_blank', 'noopener');
    else if (wasDrag.kind !== 'file') {
      // soft-center on the cluster
      view.x += W / 2 - (wasDrag.x * view.k + view.x);
      view.y += H / 2 - (wasDrag.y * view.k + view.y);
      draw();
    }
  }
});
canvas.addEventListener('pointerleave', function () {
  hoverNode = null; tip.style.display = 'none'; draw();
});
canvas.addEventListener('wheel', function (ev) {
  ev.preventDefault();
  var k = view.k * Math.exp(-ev.deltaY * 0.0016);
  k = Math.max(0.12, Math.min(6, k));
  view.x = ev.clientX - (ev.clientX - view.x) * (k / view.k);
  view.y = ev.clientY - (ev.clientY - view.y) * (k / view.k);
  view.k = k;
  draw();
}, { passive: false });

// pinch zoom
var pinch = null;
canvas.addEventListener('touchstart', function (ev) {
  if (ev.touches.length === 2) {
    pinch = Math.hypot(ev.touches[0].clientX - ev.touches[1].clientX, ev.touches[0].clientY - ev.touches[1].clientY);
  }
}, { passive: true });
canvas.addEventListener('touchmove', function (ev) {
  if (pinch && ev.touches.length === 2) {
    ev.preventDefault();
    var d = Math.hypot(ev.touches[0].clientX - ev.touches[1].clientX, ev.touches[0].clientY - ev.touches[1].clientY);
    var cx = (ev.touches[0].clientX + ev.touches[1].clientX) / 2;
    var cy = (ev.touches[0].clientY + ev.touches[1].clientY) / 2;
    var k = Math.max(0.12, Math.min(6, view.k * d / pinch));
    view.x = cx - (cx - view.x) * (k / view.k);
    view.y = cy - (cy - view.y) * (k / view.k);
    view.k = k; pinch = d;
    draw();
  }
}, { passive: false });
canvas.addEventListener('touchend', function () { pinch = null; });

// ---- panel wiring ----
document.getElementById('panel-head').addEventListener('click', function () {
  document.getElementById('panel').classList.toggle('collapsed');
});
document.getElementById('q').addEventListener('input', function (ev) {
  filters.q = ev.target.value.trim().toLowerCase();
  draw();
});
document.getElementById('t-media').addEventListener('change', function (ev) {
  filters.media = ev.target.checked; refreshVisible(); reheat(0.3); draw();
});
document.getElementById('t-refs').addEventListener('change', function (ev) {
  filters.refsOnly = ev.target.checked; refreshVisible(); reheat(0.3); draw();
});
Array.prototype.forEach.call(document.querySelectorAll('.group-row'), function (row) {
  row.addEventListener('click', function () {
    var id = row.dataset.part;
    filters.parts[id] = !filters.parts[id];
    row.classList.toggle('off', !filters.parts[id]);
    refreshVisible(); reheat(0.3); draw();
  });
});
Array.prototype.forEach.call(document.querySelectorAll('.slider input'), function (input) {
  input.addEventListener('input', function () {
    params[input.dataset.p] = Number(input.value);
    input.closest('.slider').querySelector('output').textContent = input.value;
    if (input.dataset.sim) reheat(0.35);
    draw();
  });
});

// ---- go ----
refreshVisible();
alpha = 1;
for (var t = 0; t < 220; t++) tick();  // pre-settle so first paint is calm
alpha = 0.05;
fit();
loop();
`;

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmtSize = n => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n >= 1024 ? Math.round(n / 1024) + ' KB' : n + ' B';

function slider(label, key, min, max, step, val, sim) {
  return `<div class="slider">
    <label>${label}<output>${val}</output></label>
    <input type="range" data-p="${key}"${sim ? ' data-sim="1"' : ''} min="${min}" max="${max}" step="${step}" value="${val}">
  </div>`;
}

function renderBody(model) {
  const groups = model.parts.map(p =>
    `<div class="group-row" data-part="${p.id}">
      <span class="dot" style="background:${p.color}"></span>
      <span class="n">${p.stage ? p.stage + ' · ' : ''}${esc(p.name)} <span style="color:var(--muted)">${esc(p.title)}</span></span>
      <span class="c">${p.count}</span>
    </div>`).join('');

  return `
  <canvas id="graph"></canvas>
  <div id="panel">
    <div id="panel-head">
      <h1>Lombok AI Club <span>&#47;&#47;</span> Mission Control</h1>
      <span class="caret">&#9660;</span>
    </div>
    <div id="panel-body">
      <div class="sect">
        <h2>Filters</h2>
        <input id="q" type="search" placeholder="Search files&hellip;" autocomplete="off">
        <label class="toggle" style="margin-top:8px"><input id="t-media" type="checkbox" checked> Show attachments (media)</label>
        <label class="toggle"><input id="t-refs" type="checkbox"> Cross-links only</label>
      </div>
      <div class="sect">
        <h2>Groups</h2>
        ${groups}
      </div>
      <div class="sect">
        <h2>Display</h2>
        ${slider('Text fade threshold', 'textFade', 0.2, 3, 0.1, 1.1, false)}
        ${slider('Node size', 'nodeSize', 0.5, 2.5, 0.1, 1, false)}
        ${slider('Link thickness', 'linkThick', 0.4, 3, 0.1, 1, false)}
      </div>
      <div class="sect">
        <h2>Forces</h2>
        ${slider('Center force', 'centerForce', 0, 1, 0.05, 0.35, true)}
        ${slider('Repel force', 'repelForce', 0.2, 4, 0.1, 1, true)}
        ${slider('Link force', 'linkForce', 0, 1.5, 0.05, 0.6, true)}
        ${slider('Link distance', 'linkDist', 20, 200, 5, 70, true)}
      </div>
    </div>
  </div>
  <div id="stats"><b>${model.totalFiles}</b> files &middot; ${fmtSize(model.totalBytes)} &middot; ${model.parts.length} parts &middot; ${esc(model.branch)}</div>
  <div id="tip"></div>
  <script>window.__MC__ = ${JSON.stringify({ ...model, nodes: model.nodes, edges: model.edges }).replace(/</g, '\\u003c')};</script>
  <script>${SCRIPT}</script>`;
}

// ---------- write ----------

const model = build();
const body = renderBody(model);
const page = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Mission Control — Lombok AI Club</title>
<style>${STYLE}</style>
</head>
<body>${body}
</body>
</html>
`;
writeFileSync(OUT, page);
// same page inside the Content Studio, served as the "Second Brain" tab's iframe
writeFileSync(join(ROOT, 'dashboard', 'public', 'second-brain.html'), page);
const refs = model.edges.filter(e => e.kind === 'ref');
console.log(`wrote mission-control.html — ${model.nodes.length} nodes, ${model.edges.length} edges (${refs.length} cross-links)`);
for (const e of refs) console.log(`  ref: ${e.s} → ${e.t}`);

const flagIdx = process.argv.indexOf('--artifact');
if (flagIdx > -1 && process.argv[flagIdx + 1]) {
  writeFileSync(process.argv[flagIdx + 1],
    `<title>Mission Control — Lombok AI Club</title>\n<style>${STYLE}</style>\n${body}`);
  console.log(`wrote artifact copy to ${process.argv[flagIdx + 1]}`);
}
