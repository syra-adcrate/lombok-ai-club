import React, { useEffect, useRef } from 'react'
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, forceX, forceY } from 'd3-force'

export default function Graph({ data, colorOf, visible, query, selected, onSelect }) {
  const canvasRef = useRef(null)
  const stateRef = useRef(null)
  // Interaction props are read from a ref so the sim/listeners mount once.
  const propsRef = useRef({})
  propsRef.current = { colorOf, visible, query: query.trim().toLowerCase(), selected, onSelect }

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const nodes = data.nodes.map((n) => ({ ...n }))
    const links = data.links.map((l) => ({ ...l }))
    const st = {
      nodes,
      links,
      tf: { x: window.innerWidth / 2, y: window.innerHeight / 2, k: 1 },
      hover: null,
      dragNode: null,
      panning: false,
      last: { x: 0, y: 0 },
    }
    stateRef.current = st

    const sim = forceSimulation(nodes)
      .force('link', forceLink(links).id((n) => n.id).distance((l) => (l.source.group === 'hub' || l.target.group === 'hub' ? 140 : 46)).strength(0.6))
      .force('charge', forceManyBody().strength((n) => -40 - n.size * 6))
      .force('center', forceCenter(0, 0))
      .force('collide', forceCollide((n) => n.size + 4))
      .force('x', forceX(0).strength(0.03))
      .force('y', forceY(0).strength(0.03))
    st.sim = sim

    const dpr = window.devicePixelRatio || 1
    const resize = () => {
      canvas.width = canvas.clientWidth * dpr
      canvas.height = canvas.clientHeight * dpr
      st.tf.x = canvas.clientWidth / 2
      st.tf.y = canvas.clientHeight / 2
      draw()
    }

    const isLit = (n) => {
      const { visible, query } = propsRef.current
      if (!visible.has(n.group)) return false
      if (query && !(n.label + ' ' + (n.detail ?? '')).toLowerCase().includes(query)) return false
      return true
    }

    function draw() {
      const { colorOf, selected } = propsRef.current
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      ctx.translate(st.tf.x, st.tf.y)
      ctx.scale(st.tf.k, st.tf.k)

      for (const l of st.links) {
        const lit = isLit(l.source) && isLit(l.target)
        ctx.strokeStyle = lit ? 'rgba(140,145,165,0.28)' : 'rgba(140,145,165,0.05)'
        ctx.lineWidth = 1 / st.tf.k
        ctx.beginPath()
        ctx.moveTo(l.source.x, l.source.y)
        ctx.lineTo(l.target.x, l.target.y)
        ctx.stroke()
      }

      for (const n of st.nodes) {
        const lit = isLit(n)
        const active = n === st.hover || (selected && n.id === selected.id)
        ctx.globalAlpha = lit ? 1 : 0.12
        ctx.fillStyle = colorOf(n.group)
        ctx.beginPath()
        ctx.arc(n.x, n.y, n.size + (active ? 2 : 0), 0, Math.PI * 2)
        ctx.fill()
        if (active) {
          ctx.strokeStyle = 'rgba(230,232,240,0.9)'
          ctx.lineWidth = 1.5 / st.tf.k
          ctx.stroke()
        }
        const showLabel = active || n.size >= 11 || st.tf.k > 1.6
        if (showLabel && lit) {
          ctx.fillStyle = 'rgba(213,215,228,0.92)'
          ctx.font = `${Math.max(11 / st.tf.k, 4)}px system-ui, sans-serif`
          ctx.textAlign = 'center'
          ctx.fillText(n.label, n.x, n.y + n.size + 12 / st.tf.k)
        }
        ctx.globalAlpha = 1
      }
    }
    st.draw = draw
    sim.on('tick', draw)

    const toGraph = (e) => {
      const r = canvas.getBoundingClientRect()
      return { x: (e.clientX - r.left - st.tf.x) / st.tf.k, y: (e.clientY - r.top - st.tf.y) / st.tf.k }
    }
    const pick = (e) => {
      const p = toGraph(e)
      let best = null
      let bestD = Infinity
      for (const n of st.nodes) {
        const d = Math.hypot(n.x - p.x, n.y - p.y)
        if (d < n.size + 6 / st.tf.k && d < bestD) { best = n; bestD = d }
      }
      return best
    }

    const onWheel = (e) => {
      e.preventDefault()
      const r = canvas.getBoundingClientRect()
      const mx = e.clientX - r.left
      const my = e.clientY - r.top
      const k2 = Math.min(4, Math.max(0.15, st.tf.k * Math.exp(-e.deltaY * 0.0018)))
      st.tf.x = mx - ((mx - st.tf.x) / st.tf.k) * k2
      st.tf.y = my - ((my - st.tf.y) / st.tf.k) * k2
      st.tf.k = k2
      draw()
    }
    const onDown = (e) => {
      const n = pick(e)
      if (n) {
        st.dragNode = n
        n.fx = n.x
        n.fy = n.y
        sim.alphaTarget(0.25).restart()
      } else {
        st.panning = true
      }
      st.last = { x: e.clientX, y: e.clientY }
      st.moved = false
    }
    const onMove = (e) => {
      if (st.dragNode) {
        const p = toGraph(e)
        st.dragNode.fx = p.x
        st.dragNode.fy = p.y
        st.moved = true
      } else if (st.panning) {
        st.tf.x += e.clientX - st.last.x
        st.tf.y += e.clientY - st.last.y
        st.last = { x: e.clientX, y: e.clientY }
        st.moved = true
        draw()
      } else {
        const h = pick(e)
        if (h !== st.hover) {
          st.hover = h
          canvas.style.cursor = h ? 'pointer' : 'grab'
          draw()
        }
      }
    }
    const onUp = (e) => {
      if (st.dragNode) {
        if (!st.moved) propsRef.current.onSelect(data.nodes.find((n) => n.id === st.dragNode.id))
        st.dragNode.fx = null
        st.dragNode.fy = null
        st.dragNode = null
        sim.alphaTarget(0)
      } else if (st.panning && !st.moved) {
        propsRef.current.onSelect(null)
      }
      st.panning = false
    }

    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('mousedown', onDown)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('resize', resize)
    resize()

    return () => {
      sim.stop()
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('mousedown', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('resize', resize)
    }
  }, [data])

  // Re-draw (no re-simulation) when filters/search/selection change.
  useEffect(() => {
    stateRef.current?.draw?.()
  }, [visible, query, selected])

  return <canvas ref={canvasRef} className="graph" />
}
