// Scans employees/ (the second brain) and writes hq/src/data/graph.json.
// Run from anywhere: node hq/scripts/build-graph.mjs
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const EMP = join(ROOT, 'employees')
const OUT = join(ROOT, 'hq', 'src', 'data')

const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')

// Parses "- 2026-08-06 · **status** · text..." bullets, joining wrapped lines.
function parseBullets(md) {
  const items = []
  let cur = null
  for (const line of md.split('\n')) {
    const m = line.match(/^- (\d{4}-\d{2}-\d{2}) · \*\*(\w+)\*\*(?: \([\d-]+\))? · (.*)$/)
    if (m) {
      if (cur) items.push(cur)
      cur = { date: m[1], status: m[2], text: m[3] }
    } else if (cur && /^ {2,}\S/.test(line)) {
      cur.text += ' ' + line.trim()
    } else if (cur && line.trim() === '') {
      items.push(cur)
      cur = null
    }
  }
  if (cur) items.push(cur)
  return items.map((it) => ({ ...it, text: it.text.replace(/\*\*/g, '') }))
}

const registry = JSON.parse(read(join(EMP, '_registry.json')) || '{"employees":[]}')
const employees = registry.employees.filter((e) => e.status !== 'removed')

const nodes = []
const links = []
const add = (n) => (nodes.push(n), n)
const link = (a, b) => links.push({ source: a, target: b })

add({ id: 'hq', label: 'HQ', group: 'hub', size: 16, detail: `Registry v${registry.version ?? 1} · ${employees.length} active employee(s)` })

for (const emp of employees) {
  const name = emp.name
  const dir = join(EMP, name, 'memory')
  const display = emp.display_name || name
  const longTerm = read(join(dir, 'long-term.md'))
  add({
    id: `emp:${name}`,
    label: display,
    group: 'employee',
    size: 11,
    detail: `${emp.role} · since ${emp.created} · last run ${emp.last_run ?? 'never'} · long-term.md ${longTerm.split('\n').length} lines`,
  })
  link('hq', `emp:${name}`)

  parseBullets(read(join(dir, 'insights.md'))).forEach((it, i) => {
    add({ id: `ins:${name}:${i}`, label: it.text.slice(0, 48) + (it.text.length > 48 ? '…' : ''), group: `insight-${it.status}`, size: 5, detail: `${it.date} · insight (${it.status}) · ${it.text}`, owner: name })
    link(`emp:${name}`, `ins:${name}:${i}`)
  })

  parseBullets(read(join(dir, 'teachings.md'))).forEach((it, i) => {
    add({ id: `teach:${name}:${i}`, label: it.text.slice(0, 48) + (it.text.length > 48 ? '…' : ''), group: 'teaching', size: 5, detail: `${it.date} · teaching (${it.status}) · ${it.text}`, owner: name })
    link(`emp:${name}`, `teach:${name}:${i}`)
  })

  const jdir = join(dir, 'journal')
  if (existsSync(jdir)) {
    for (const f of readdirSync(jdir).filter((f) => f.endsWith('.md')).sort()) {
      const day = f.replace('.md', '')
      const body = read(join(jdir, f))
      add({ id: `j:${name}:${day}`, label: day, group: 'journal', size: 4, detail: `journal · ${body.split('\n').filter((l) => l.startsWith('- ')).length} entries`, owner: name })
      link(`emp:${name}`, `j:${name}:${day}`)
    }
  }

  const routines = read(join(EMP, name, 'routines.md'))
  ;[...routines.matchAll(/^## (?!Scheduling)(.+)$/gm)].forEach((m, i) => {
    add({ id: `rt:${name}:${i}`, label: m[1].trim(), group: 'routine', size: 5, detail: `routine · ${m[1].trim()}`, owner: name })
    link(`emp:${name}`, `rt:${name}:${i}`)
  })
}

// Cross-links: a memory node mentioning another employee's name links to them.
const names = employees.map((e) => ({ id: `emp:${e.name}`, rx: new RegExp(`\\b${e.display_name || e.name}\\b`, 'i') }))
for (const n of nodes) {
  if (!n.owner) continue
  for (const other of names) {
    if (other.id !== `emp:${n.owner}` && other.rx.test(n.detail)) link(n.id, other.id)
  }
}

mkdirSync(OUT, { recursive: true })
writeFileSync(join(OUT, 'graph.json'), JSON.stringify({ generated: new Date().toISOString(), nodes, links }, null, 1))
console.log(`graph.json: ${nodes.length} nodes, ${links.length} links`)
