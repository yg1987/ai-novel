import { useState, useEffect, useRef } from 'react'
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, type SimulationNodeDatum, type SimulationLinkDatum } from 'd3-force'
import { loadChapterGraph, type ChapterGraph } from '../services/chapterGraphService'
import './GraphShared.css'

interface Props {
  projectId: string
}

interface SimNode extends SimulationNodeDatum {
  id: string
  order: number
  label: string
}

interface SimLink extends SimulationLinkDatum<SimNode> {
  type: string
  label: string
}

const EDGE_COLORS: Record<string, string> = {
  foreshadow: '#e74c3c',
  'foreshadow-first': '#95a5a6',
  continuity: '#3498db',
  adjacent: '#bdc3c7',
}

const EDGE_LABELS: Record<string, string> = {
  foreshadow: '伏笔关联',
  'foreshadow-first': '首次推进',
  continuity: '角色延续',
  adjacent: '顺序',
}

export default function ChapterGraph({ projectId }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [graph, setGraph] = useState<ChapterGraph | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedEdge, setSelectedEdge] = useState<SimLink | null>(null)

  useEffect(() => {
    setLoading(true)
    loadChapterGraph(projectId)
      .then(setGraph)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [projectId])

  useEffect(() => {
    if (!graph || !svgRef.current || graph.nodes.length === 0) return

    const width = svgRef.current.clientWidth || 800
    const height = svgRef.current.clientHeight || 400

    const nodes: SimNode[] = graph.nodes.map((n) => ({
      id: n.id,
      order: n.order,
      label: n.title,
    }))

    const links: SimLink[] = graph.edges.map((e) => ({
      source: e.source,
      target: e.target,
      type: e.type,
      label: e.label,
    }))

    // Use force-directed layout with horizontal bias
    const simulation = forceSimulation<SimNode>(nodes)
      .force('link', forceLink<SimNode, SimLink>(links).id((d) => d.id).distance(120))
      .force('charge', forceManyBody().strength(-100))
      .force('center', forceCenter(width / 2, height / 2))
      .force('collide', forceCollide().radius(30))
      .alphaDecay(0.03)

    const svg = svgRef.current
    let child = svg.lastChild
    while (child) { svg.removeChild(child); child = svg.lastChild }

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    svg.appendChild(g)

    // Link layer
    const linkGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    g.appendChild(linkGroup)
    const linkElements = links.map((l) => {
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'line')
      el.setAttribute('stroke', EDGE_COLORS[l.type] || '#bdc3c7')
      el.setAttribute('stroke-width', l.type === 'adjacent' ? '1' : '2')
      el.setAttribute('stroke-opacity', l.type === 'adjacent' ? '0.3' : '0.6')
      if (l.type === 'foreshadow' || l.type === 'foreshadow-first') {
        el.setAttribute('stroke-dasharray', '5,3')
      }
      el.addEventListener('mouseenter', () => setSelectedEdge(l))
      el.addEventListener('mouseleave', () => setSelectedEdge(null))
      linkGroup.appendChild(el)
      return el
    })

    // Node layer
    const nodeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    g.appendChild(nodeGroup)
    const nodeElements = nodes.map((n) => {
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'g')
      el.style.cursor = 'pointer'

      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      rect.setAttribute('width', '80')
      rect.setAttribute('height', '30')
      rect.setAttribute('x', '-40')
      rect.setAttribute('y', '-15')
      rect.setAttribute('rx', '6')
      rect.setAttribute('fill', '#4a6fa5')
      rect.setAttribute('stroke', '#fff')
      rect.setAttribute('stroke-width', '1.5')
      el.appendChild(rect)

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
      text.setAttribute('text-anchor', 'middle')
      text.setAttribute('dy', '0.35em')
      text.setAttribute('font-size', '11')
      text.setAttribute('fill', '#fff')
      text.setAttribute('font-weight', '600')
      text.textContent = n.label
      el.appendChild(text)

      nodeGroup.appendChild(el)
      return el
    })

    simulation.on('tick', () => {
      linkElements.forEach((el, i) => {
        const l = links[i]!
        const s = l.source as SimNode
        const t = l.target as SimNode
        if (s.x != null && s.y != null && t.x != null && t.y != null) {
          el.setAttribute('x1', String(s.x))
          el.setAttribute('y1', String(s.y))
          el.setAttribute('x2', String(t.x))
          el.setAttribute('y2', String(t.y))
        }
      })
      nodeElements.forEach((el, i) => {
        const n = nodes[i]!
        if (n.x != null && n.y != null) {
          el.setAttribute('transform', `translate(${n.x},${n.y})`)
        }
      })
    })

    return () => { simulation.stop() }
  }, [graph])

  if (loading) return <div className="review-empty">加载章节关系图…</div>
  if (error) return <div className="review-empty">加载失败：{error}</div>
  if (!graph || graph.nodes.length === 0) return <div className="review-empty">暂无章节数据</div>

  return (
    <div className="graph-panel panel-layout" style={{ flexDirection: 'column' }}>
      <div className="graph-canvas-area" style={{ flex: 1 }}>
        <svg ref={svgRef} className="graph-svg" width="100%" height="100%" />
        {selectedEdge && (
          <div className="graph-link-tooltip">
            <span style={{ color: EDGE_COLORS[selectedEdge.type], fontWeight: 600 }}>
              {EDGE_LABELS[selectedEdge.type] || selectedEdge.type}
            </span>
            <span> — {selectedEdge.label}</span>
          </div>
        )}
      </div>
      <div className="graph-legend" style={{ padding: '8px 16px', display: 'flex', gap: 16, justifyContent: 'center', borderTop: '1px solid var(--border)' }}>
        {Object.entries(EDGE_COLORS).map(([key, color]) => (
          <div key={key} className="graph-legend-item" style={{ fontSize: '0.78rem' }}>
            <span className="graph-legend-line" style={{ background: color }} />
            <span>{EDGE_LABELS[key] || key}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
