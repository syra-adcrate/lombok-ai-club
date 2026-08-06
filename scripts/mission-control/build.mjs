#!/usr/bin/env node
// Mission Control — scans the workspace and emits a self-contained HTML map
// of every file, grouped by the second-brain aggregator's parts.
//
//   node scripts/mission-control/build.mjs                 → mission-control.html (repo root)
//   node scripts/mission-control/build.mjs --artifact out  → also writes a body-only copy for publishing

import { execSync } from 'node:child_process';
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
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
      if (rel === 'mission-control.html') continue;
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
    id: 'intake', stage: '01', name: 'Intake', title: 'Outlier pipeline',
    desc: 'Scrapes viral AI content from TikTok / Instagram / LinkedIn / Reddit via Apify, scores it against platform medians, and feeds the studio.',
    match: p => p.startsWith('scripts/outlier-pipeline/'),
  },
  {
    id: 'curation', stage: '02', name: 'Curation', title: 'Content Studio dashboard',
    desc: 'Local Node dashboard (Cloudflare-deployable) for rating scraped outliers, managing the media library, and writing remix briefs.',
    match: p => p.startsWith('dashboard/'),
  },
  {
    id: 'synthesis', stage: '03', name: 'Synthesis', title: 'Remix briefs',
    desc: 'Outlier post → hook → shot plan, adapted to the club’s audience. The bridge between scraped inspiration and produced content.',
    match: p => p.startsWith('REMIXES/'),
  },
  {
    id: 'production', stage: '04', name: 'Production', title: 'Video projects',
    desc: 'HyperFrames projects — programmatic HTML compositions rendered to MP4 reels and slideshows.',
    match: p => p.startsWith('videos/'),
    groupBy: p => p.split('/')[1],
  },
  {
    id: 'memory', stage: null, name: 'Memory', title: 'Context & instructions',
    desc: 'What Claude loads every session: routing rules, positioning, voice, dev-server configs. The single source of truth the other parts read.',
    match: p => p === 'CLAUDE.md' || p === 'README.md' || p === 'LICENSE' || p === '.gitignore'
      || p.startsWith('.agents/') || p.startsWith('.claude/'),
  },
  {
    id: 'ops', stage: null, name: 'Ops', title: 'Plans, rubrics & tooling',
    desc: 'Working implementation plans, the rubric used to audit remix quality, and this mission-control generator.',
    match: p => /^IMPLEMENTATION_PLAN.*\.md$/.test(p) || p === 'REMIX_AUDIT_RUBRIC.md'
      || p.startsWith('scripts/mission-control/'),
  },
];

const TYPE_BY_EXT = {
  '.md': 'doc', '.txt': 'doc',
  '.json': 'data', '.jsonc': 'data', '.sql': 'data',
  '.js': 'code', '.mjs': 'code',
  '.html': 'html',
  '.png': 'media', '.jpg': 'media', '.jpeg': 'media', '.mp4': 'media', '.woff2': 'media',
};

function build() {
  const dates = gitDates();
  const files = walk(ROOT).map(f => ({
    ...f,
    date: dates.get(f.path) ?? f.mtime,
    type: TYPE_BY_EXT[extname(f.path).toLowerCase()] ?? 'other',
  }));

  const parts = PARTS.map(part => {
    const own = files.filter(f => part.match(f.path)).sort((a, b) => a.path.localeCompare(b.path));
    let groups = null;
    if (part.groupBy) {
      const m = new Map();
      for (const f of own) {
        const g = part.groupBy(f.path);
        if (!m.has(g)) m.set(g, []);
        m.get(g).push(f);
      }
      groups = [...m.entries()].map(([name, fs]) => ({ name, files: fs }));
    }
    return { ...part, match: undefined, groupBy: undefined, files: own, groups };
  });

  const unmatched = files.filter(f => !PARTS.some(p => p.match(f.path)));
  if (unmatched.length) {
    parts.push({
      id: 'unsorted', stage: null, name: 'Unsorted', title: 'Not yet mapped to a part',
      desc: 'Files no part claims yet — extend the rules in scripts/mission-control/build.mjs.',
      files: unmatched, groups: null,
    });
  }

  return {
    repo: REPO_URL,
    generated: Date.now(),
    branch: execSync('git rev-parse --abbrev-ref HEAD', { cwd: ROOT }).toString().trim(),
    totalFiles: files.length,
    totalBytes: files.reduce((s, f) => s + f.size, 0),
    parts,
  };
}

// ---------- render ----------

const STYLE = `
  :root {
    --bg: #0e1116; --panel: #161b23; --panel-2: #1d242f; --border: #2a3341;
    --text: #e8edf4; --muted: #8a96a8; --accent: #35c2a0; --accent-2: #f2b64c;
    --radius: 12px;
    --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: var(--bg); color: var(--text); min-height: 100vh;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  a { color: inherit; text-decoration: none; }
  header {
    display: flex; align-items: baseline; gap: 16px; flex-wrap: wrap;
    padding: 18px 28px; border-bottom: 1px solid var(--border);
    position: sticky; top: 0; background: var(--bg); z-index: 10;
  }
  header h1 { font-size: 17px; font-weight: 700; letter-spacing: .2px; }
  header h1 span { color: var(--accent); }
  header .meta { font-family: var(--mono); font-size: 12px; color: var(--muted); }
  header input {
    margin-left: auto; background: var(--panel); border: 1px solid var(--border);
    border-radius: 999px; color: var(--text); font-size: 13.5px; padding: 8px 16px; width: 260px;
  }
  header input:focus { outline: none; border-color: var(--accent); }
  main { max-width: 1080px; margin: 0 auto; padding: 28px; }

  .strip { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 28px; }
  .strip a.cell { display: block; }
  .cell {
    background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius);
    padding: 14px 16px; transition: border-color .15s;
  }
  a.cell:hover { border-color: var(--accent); }
  .cell .k { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: var(--muted); }
  .cell .v { font-family: var(--mono); font-size: 22px; margin-top: 6px; font-variant-numeric: tabular-nums; }
  .cell .v small { font-size: 12px; color: var(--muted); margin-left: 4px; }
  .cell.total .v { color: var(--accent); }

  .flow-label { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: var(--muted); margin: 30px 0 14px; }
  .flow-label::after { content: ""; display: inline-block; vertical-align: middle; width: 120px; height: 1px; background: var(--border); margin-left: 12px; }

  section.part {
    background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius);
    margin-bottom: 16px; overflow: hidden;
  }
  section.part[open] {}
  .part-head {
    display: flex; align-items: baseline; gap: 14px; padding: 16px 20px; cursor: pointer; list-style: none;
  }
  .part-head::-webkit-details-marker { display: none; }
  .part-head .stage { font-family: var(--mono); font-size: 13px; color: var(--accent); font-weight: 700; }
  .part-head .stage.aux { color: var(--accent-2); }
  .part-head h2 { font-size: 15px; font-weight: 700; }
  .part-head h2 small { color: var(--muted); font-weight: 600; margin-left: 8px; }
  .part-head .stats { margin-left: auto; font-family: var(--mono); font-size: 12px; color: var(--muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
  .part-head .caret { color: var(--muted); font-size: 11px; transition: transform .15s; }
  details[open] .part-head .caret { transform: rotate(90deg); }
  .part-desc { padding: 0 20px 14px; color: var(--muted); font-size: 13px; max-width: 65ch; line-height: 1.5; }

  .files { border-top: 1px solid var(--border); overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-family: var(--mono); font-size: 12.5px; }
  td { padding: 7px 20px; border-top: 1px solid rgba(42,51,65,.5); white-space: nowrap; }
  tr:first-child td { border-top: none; }
  tr:hover td { background: var(--panel-2); }
  td.path { width: 100%; }
  td.path a:hover { color: var(--accent); }
  td.grp { color: var(--accent-2); font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; padding-top: 14px; }
  td.size, td.date { text-align: right; color: var(--muted); font-variant-numeric: tabular-nums; }
  .chip { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; padding: 2px 7px; border-radius: 5px; }
  .chip.doc   { background: rgba(53,194,160,.14); color: var(--accent); }
  .chip.code  { background: rgba(122,184,255,.14); color: #7ab8ff; }
  .chip.data  { background: rgba(242,182,76,.14); color: var(--accent-2); }
  .chip.html  { background: rgba(224,96,79,.14); color: #e0604f; }
  .chip.media { background: rgba(179,157,219,.14); color: #b39ddb; }
  .chip.other { background: var(--panel-2); color: var(--muted); }

  .hidden { display: none !important; }
  footer { padding: 18px 28px 40px; text-align: center; color: var(--muted); font-size: 12px; font-family: var(--mono); }
`;

const SCRIPT = `
  const q = document.getElementById('q');
  q.addEventListener('input', () => {
    const term = q.value.trim().toLowerCase();
    document.querySelectorAll('tr[data-path]').forEach(tr => {
      tr.classList.toggle('hidden', !!term && !tr.dataset.path.includes(term));
    });
    document.querySelectorAll('section.part').forEach(sec => {
      const any = sec.querySelector('tr[data-path]:not(.hidden)');
      sec.classList.toggle('hidden', !!term && !any);
      if (term && any) sec.setAttribute('open', '');
    });
    document.querySelectorAll('tr[data-grp]').forEach(tr => {
      const g = tr.dataset.grp;
      const any = document.querySelector('tr[data-path][data-ingrp="' + g + '"]:not(.hidden)');
      tr.classList.toggle('hidden', !!term && !any);
    });
  });
`;

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmtSize = n => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n >= 1024 ? Math.round(n / 1024) + ' KB' : n + ' B';
const fmtDate = ts => new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

function fileRow(model, f, ingrp) {
  const href = `${model.repo}/blob/main/${f.path}`;
  return `<tr data-path="${esc(f.path.toLowerCase())}"${ingrp ? ` data-ingrp="${esc(ingrp)}"` : ''}>
    <td class="path"><a href="${href}" target="_blank" rel="noopener">${esc(f.path)}</a></td>
    <td><span class="chip ${f.type}">${f.type}</span></td>
    <td class="size">${fmtSize(f.size)}</td>
    <td class="date">${fmtDate(f.date)}</td></tr>`;
}

function partSection(model, part, open) {
  const bytes = part.files.reduce((s, f) => s + f.size, 0);
  const rows = part.groups
    ? part.groups.map(g =>
        `<tr data-grp="${esc(g.name)}"><td class="grp" colspan="4">${esc(g.name)} · ${g.files.length} files</td></tr>` +
        g.files.map(f => fileRow(model, f, g.name)).join('')).join('')
    : part.files.map(f => fileRow(model, f)).join('');
  return `<details class="part" id="${part.id}"${open ? ' open' : ''}>
    <summary class="part-head">
      <span class="stage${part.stage ? '' : ' aux'}">${part.stage ?? '&#9679;'}</span>
      <h2>${esc(part.name)}<small>${esc(part.title)}</small></h2>
      <span class="stats">${part.files.length} files · ${fmtSize(bytes)}</span>
      <span class="caret">&#9654;</span>
    </summary>
    <p class="part-desc">${esc(part.desc)}</p>
    <div class="files"><table>${rows}</table></div>
  </details>`;
}

function renderBody(model) {
  const flow = model.parts.filter(p => p.stage);
  const aux = model.parts.filter(p => !p.stage);
  const strip = model.parts.map(p =>
    `<a class="cell" href="#${p.id}"><div class="k">${p.stage ? p.stage + ' · ' : ''}${esc(p.name)}</div><div class="v">${p.files.length}<small>files</small></div></a>`).join('');
  return `
  <header>
    <h1>Lombok AI Club <span>&#47;&#47;</span> Mission Control</h1>
    <span class="meta">second-brain aggregator &middot; ${model.totalFiles} files &middot; ${fmtSize(model.totalBytes)}</span>
    <input id="q" type="search" placeholder="Filter files&hellip;" autocomplete="off">
  </header>
  <main>
    <div class="strip">
      <div class="cell total"><div class="k">Workspace</div><div class="v">${model.totalFiles}<small>files</small></div></div>
      ${strip}
    </div>
    <div class="flow-label">The content flow</div>
    ${flow.map(p => partSection(model, p, true)).join('')}
    <div class="flow-label">Always loaded</div>
    ${aux.map(p => partSection(model, p, true)).join('')}
  </main>
  <footer>generated by scripts/mission-control/build.mjs &middot; branch ${esc(model.branch)} &middot; ${new Date(model.generated).toISOString().slice(0, 10)}</footer>
  <script>${SCRIPT}</script>`;
}

// ---------- write ----------

const model = build();
const body = renderBody(model);
writeFileSync(OUT, `<!DOCTYPE html>
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
`);
console.log(`wrote mission-control.html — ${model.totalFiles} files across ${model.parts.length} parts`);

const flagIdx = process.argv.indexOf('--artifact');
if (flagIdx > -1 && process.argv[flagIdx + 1]) {
  writeFileSync(process.argv[flagIdx + 1],
    `<title>Mission Control — Lombok AI Club</title>\n<style>${STYLE}</style>\n${body}`);
  console.log(`wrote artifact copy to ${process.argv[flagIdx + 1]}`);
}
