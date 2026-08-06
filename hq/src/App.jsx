import React, { useMemo, useState } from 'react'
import Graph from './components/Graph.jsx'
import FilterPanel from './components/FilterPanel.jsx'
import TodayPanel from './components/TodayPanel.jsx'
import graph from './data/graph.json'
import brief from './data/brief.json'

export const GROUPS = [
  { key: 'hub', label: 'HQ', color: '#9aa0b4' },
  { key: 'employee', label: 'Employees', color: '#a48af4' },
  { key: 'insight-open', label: 'Insights · open', color: '#e0635c' },
  { key: 'insight-surfaced', label: 'Insights · surfaced', color: '#d1935c' },
  { key: 'insight-done', label: 'Insights · done', color: '#5c6274' },
  { key: 'teaching', label: 'Teachings', color: '#e3c06b' },
  { key: 'journal', label: 'Journal days', color: '#5ea3e8' },
  { key: 'routine', label: 'Routines', color: '#54b8ba' },
  { key: 'customer', label: 'Customers', color: '#67b26f' },
  { key: 'persona', label: 'Personas', color: '#8b90ad' },
]

export default function App() {
  const [visible, setVisible] = useState(() => new Set(GROUPS.map((g) => g.key)))
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)

  const colorOf = useMemo(() => {
    const m = Object.fromEntries(GROUPS.map((g) => [g.key, g.color]))
    return (group) => m[group] ?? '#888'
  }, [])

  const counts = useMemo(() => {
    const c = {}
    for (const n of graph.nodes) c[n.group] = (c[n.group] ?? 0) + 1
    return c
  }, [])

  return (
    <div className="app">
      <Graph
        data={graph}
        colorOf={colorOf}
        visible={visible}
        query={query}
        selected={selected}
        onSelect={setSelected}
      />
      <header className="brand">
        <h1>HQ · second brain</h1>
        <p>{graph.nodes.length} nodes · generated {graph.generated.slice(0, 10)}</p>
      </header>
      <TodayPanel brief={brief} />
      <FilterPanel
        groups={GROUPS}
        counts={counts}
        visible={visible}
        setVisible={setVisible}
        query={query}
        setQuery={setQuery}
      />
      {selected && (
        <aside className="detail">
          <button className="close" onClick={() => setSelected(null)} aria-label="Close">×</button>
          <span className="chip" style={{ background: colorOf(selected.group) }} />
          <strong>{selected.label}</strong>
          <p>{selected.detail}</p>
        </aside>
      )}
    </div>
  )
}
