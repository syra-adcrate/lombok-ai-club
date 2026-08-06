import React, { useState } from 'react'

export default function FilterPanel({ groups, counts, visible, setVisible, query, setQuery }) {
  const [open, setOpen] = useState(true)

  const toggle = (key) => {
    setVisible((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }
  const solo = (key) => setVisible(new Set([key, 'hub', 'employee']))
  const all = () => setVisible(new Set(groups.map((g) => g.key)))

  return (
    <aside className="panel filters">
      <div className="panel-head" onClick={() => setOpen(!open)}>
        <span className={`caret ${open ? 'open' : ''}`}>▸</span>
        <strong>Filters</strong>
        <button className="reset" onClick={(e) => { e.stopPropagation(); all(); setQuery('') }} title="Reset">↺</button>
      </div>
      {open && (
        <div className="panel-body">
          <input
            className="search"
            placeholder="Search the brain…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="group-list">
            {groups.map((g) => (
              <label key={g.key} className={visible.has(g.key) ? 'group' : 'group off'} onDoubleClick={() => solo(g.key)}>
                <input type="checkbox" checked={visible.has(g.key)} onChange={() => toggle(g.key)} />
                <span className="dot" style={{ background: g.color }} />
                <span className="name">{g.label}</span>
                <span className="count">{counts[g.key] ?? 0}</span>
              </label>
            ))}
          </div>
          <p className="hint">click node = detail · double-click group = solo · drag = arrange</p>
        </div>
      )}
    </aside>
  )
}
