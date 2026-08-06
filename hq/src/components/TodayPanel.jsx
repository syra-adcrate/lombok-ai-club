import React, { useState } from 'react'

export default function TodayPanel({ brief }) {
  const [open, setOpen] = useState(true)

  return (
    <aside className="panel today">
      <div className="panel-head" onClick={() => setOpen(!open)}>
        <span className={`caret ${open ? 'open' : ''}`}>▸</span>
        <strong>Today</strong>
        <span className="date">{brief.dateLabel}</span>
      </div>
      {open && (
        <div className="panel-body">
          {brief.mode !== 'LIVE' && <div className="mode">{brief.mode} — {brief.modeNote}</div>}

          <h3>Top 3</h3>
          <ol className="top3">
            {brief.top3.map((t, i) => (
              <li key={i}><b>{t.title}</b><p>{t.body}</p></li>
            ))}
          </ol>

          <h3>Schedule</h3>
          <ul className="sched">
            {brief.schedule.map((s, i) => (
              <li key={i}><code>{s.time}</code><span>{s.label}{s.note && <em> · {s.note}</em>}</span></li>
            ))}
          </ul>

          <h3>Needs a decision</h3>
          <ul className="decisions">
            {brief.decisions.map((d, i) => (
              <li key={i}>{d.text}<div className="default">Default: {d.default}</div></li>
            ))}
          </ul>

          {brief.flagged?.length > 0 && (
            <>
              <h3 className="flag-h">Flagged</h3>
              {brief.flagged.map((f, i) => <p className="flag" key={i}>{f}</p>)}
            </>
          )}

          <h3>Teaching · {brief.teaching.title}</h3>
          <p className="teach">{brief.teaching.body}</p>

          <p className="statusline">{brief.status}</p>
        </div>
      )}
    </aside>
  )
}
