import { useState, useEffect, useRef } from 'react'
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from 'd3-force'
import { loadRelationshipGraph } from '../services/relationshipStore'
import type { RelationshipGraph, GraphNode } from '../types/novel'

interface Props {
  projectId: string
}

interface SimNode extends SimulationNodeDatum {
  id: string
  label: string
  group: string
  radius: number
}

interface SimLink extends SimulationLinkDatum<SimNode> {
  type: string
  strength: number
}

const NODE_RADIUS: Record<string, number> = {
  protagonist: 24,
  supporter: 18,
  antagonist: 20,
  neutral: 14,
}

const NODE_COLORS: Record<string, string> = {
  protagonist: '#e74c3c',
  supporter: '#3498db',
  antagonist: '#8e44ad',
  neutral: '#95a5a6',
}

const LINK_COLORS: Record<string, string> = {
  ally: '#2ecc71',
  rival: '#e67e22',
  family: '#1abc9c',
  mentor: '#f39c12',
  enemy: '#e74c3c',
  friend: '#3498db',
  love: '#e91e63',
  ambiguous: '#bdc3c7',
}

function getTypeLabel(type: string): string {
  const map: Record<string, string> = {
    ally: '盟友', rival: '对手', family: '血缘',
    mentor: '师徒', enemy: '仇敌', friend: '朋友',
    love: '恋情', ambiguous: '关联',
  }
  return map[type] ?? type
}

export default function RelationshipGraph({ projectId }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [graph, setGraph] = useState<RelationshipGraph | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [hoveredLink, setHoveredLink] = useState<SimLink | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    loadRelationshipGraph(projectId)
      .then(setGraph)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [projectId])

  useEffect(() => {
    if (!graph || !svgRef.current) return

    const width = svgRef.current.clientWidth || 800
    const height = svgRef.current.clientHeight || 600
    const nodes: SimNode[] = graph.nodes.map((n) => ({
      id: n.id,
      label: n.label,
      group: n.group,
      radius: NODE_RADIUS[n.group] || 14,
    }))
    const links: SimLink[] = graph.links.map((l) => ({
      source: l.source,
      target: l.target,
      type: l.type,
      strength: l.strength * 0.5,
    }))

    const simulation = forceSimulation<SimNode>(nodes)
      .force('link', forceLink<SimNode, SimLink>(links).id((d) => d.id).distance(100))
      .force('charge', forceManyBody().strength(-200))
      .force('center', forceCenter(width / 2, height / 2))
      .force('collide', forceCollide().radius((d) => (d as SimNode).radius + 8))
      .alphaDecay(0.02)

    const svg = svgRef.current
    // Clear previous
    let child = svg.lastChild
    while (child) { svg.removeChild(child); child = svg.lastChild }

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    svg.appendChild(g)

    let transform = { x: 0, y: 0, k: 1 }

    // Wheel zoom
    const wheelHandler = (e: WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? 0.9 : 1.1
      transform.k = Math.max(0.2, Math.min(4, transform.k * delta))
      g.setAttribute('transform', `translate(${transform.x},${transform.y}) scale(${transform.k})`)
    }
    svg.addEventListener('wheel', wheelHandler, { passive: false })

    // Pan
    let panStart = { x: 0, y: 0 }
    let isPanning = false
    const mouseDown = (e: MouseEvent) => {
      if ((e.target as Element).tagName === 'svg') {
        isPanning = true
        panStart = { x: e.clientX - transform.x, y: e.clientY - transform.y }
      }
    }
    const mouseMove = (e: MouseEvent) => {
      if (isPanning) {
        transform.x = e.clientX - panStart.x
        transform.y = e.clientY - panStart.y
        g.setAttribute('transform', `translate(${transform.x},${transform.y}) scale(${transform.k})`)
      }
    }
    const mouseUp = () => { isPanning = false }
    svg.addEventListener('mousedown', mouseDown)
    svg.addEventListener('mousemove', mouseMove)
    svg.addEventListener('mouseup', mouseUp)

    // Draw links
    const linkGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    g.appendChild(linkGroup)
    const linkElements = links.map((l) => {
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'line')
      el.setAttribute('stroke', LINK_COLORS[l.type] || '#bdc3c7')
      el.setAttribute('stroke-width', String(Math.max(1, l.strength * 4)))
      el.setAttribute('stroke-opacity', '0.4')
      el.addEventListener('mouseenter', () => setHoveredLink(l))
      el.addEventListener('mouseleave', () => setHoveredLink(null))
      linkGroup.appendChild(el)
      return el
    })

    // Draw nodes
    const nodeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    g.appendChild(nodeGroup)
    const nodeElements = nodes.map((n) => {
      const nodeEl = document.createElementNS('http://www.w3.org/2000/svg', 'g')
      nodeEl.style.cursor = 'pointer'

      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
      circle.setAttribute('r', String(n.radius))
      circle.setAttribute('fill', NODE_COLORS[n.group] || '#95a5a6')
      circle.setAttribute('stroke', '#fff')
      circle.setAttribute('stroke-width', '2')
      nodeEl.appendChild(circle)

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
      text.setAttribute('text-anchor', 'middle')
      text.setAttribute('dy', '0.35em')
      text.setAttribute('font-size', '11')
      text.setAttribute('fill', '#fff')
      text.setAttribute('font-weight', '600')
      text.textContent = n.label.slice(0, 4)
      nodeEl.appendChild(text)

      // Hover tooltip
      nodeEl.addEventListener('mouseenter', () => {
        const tooltip = document.createElementNS('http://www.w3.org/2000/svg', 'text')
        tooltip.setAttribute('text-anchor', 'middle')
        tooltip.setAttribute('dy', String(-n.radius - 8))
        tooltip.setAttribute('font-size', '12')
        tooltip.setAttribute('fill', '#333')
        tooltip.setAttribute('font-weight', '600')
        tooltip.setAttribute('class', 'graph-tooltip')
        tooltip.textContent = n.label
        nodeEl.appendChild(tooltip)
      })
      nodeEl.addEventListener('mouseleave', () => {
        nodeEl.querySelectorAll('.graph-tooltip').forEach((el) => el.remove())
      })

      nodeEl.addEventListener('click', () => {
        const gn = graph.nodes.find((gn) => gn.id === n.id)
        if (gn) setSelectedNode(gn)
      })

      // Drag
      const dragStart = (e: MouseEvent) => {
        e.stopPropagation()
        const rect = svg.getBoundingClientRect()
        const onMove = (ev: MouseEvent) => {
          n.fx = (ev.clientX - rect.left - transform.x) / transform.k
          n.fy = (ev.clientY - rect.top - transform.y) / transform.k
          simulation.alpha(0.3).restart()
        }
        const onUp = () => {
          n.fx = null
          n.fy = null
          document.removeEventListener('mousemove', onMove)
          document.removeEventListener('mouseup', onUp)
        }
        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
      }
      nodeEl.addEventListener('mousedown', dragStart)

      nodeGroup.appendChild(nodeEl)
      return nodeEl
    })

    // Tick
    simulation.on('tick', () => {
      linkElements.forEach((el, i) => {
        const l = links[i]!
        const s = l.source as SimNode
        const t = l.target as SimNode
        el.setAttribute('x1', String(s.x))
        el.setAttribute('y1', String(s.y))
        el.setAttribute('x2', String(t.x))
        el.setAttribute('y2', String(t.y))
      })
      nodeElements.forEach((el, i) => {
        const n = nodes[i]!
        el.setAttribute('transform', `translate(${n.x},${n.y})`)
      })
    })

    return () => {
      simulation.stop()
      svg.removeEventListener('wheel', wheelHandler)
      svg.removeEventListener('mousedown', mouseDown)
      svg.removeEventListener('mousemove', mouseMove)
      svg.removeEventListener('mouseup', mouseUp)
    }
  }, [graph])

  if (loading) return <div className="review-empty">加载关系图谱…</div>
  if (error) return <div className="review-empty">加载失败：{error}</div>
  if (!graph) return <div className="review-empty">暂无角色数据</div>

  const relatedLinks = selectedNode
    ? graph.links.filter((l) => l.source === selectedNode.id || l.target === selectedNode.id)
    : []

  return (
    <div className="graph-panel panel-layout">
      <div className="panel-editor graph-canvas-area">
        <svg ref={svgRef} className="graph-svg" width="100%" height="100%" />
        {hoveredLink && (
          <div className="graph-link-tooltip">
            <span style={{ color: LINK_COLORS[hoveredLink.type], fontWeight: 600 }}>
              {getTypeLabel(hoveredLink.type)}
            </span>
            <span> — {(hoveredLink.source as SimNode).label} ↔ {(hoveredLink.target as SimNode).label}</span>
          </div>
        )}
      </div>
      <div className="graph-sidebar panel-sidebar">
        <h3>节点详情</h3>
        {selectedNode ? (
          <div className="graph-node-detail">
            <h4>{selectedNode.label}</h4>
            <div className="graph-detail-row"><span>身份</span><span>{selectedNode.group}</span></div>
            <div className="graph-detail-row"><span>首次出场</span><span>第{selectedNode.firstAppearance}章</span></div>
            <div className="graph-detail-row"><span>最近出场</span><span>第{selectedNode.lastAppearance}章</span></div>
            <div className="graph-detail-row"><span>出场次数</span><span>{selectedNode.appearanceCount}次</span></div>
            <div className="graph-detail-section">
              <h5>关联关系</h5>
              {relatedLinks.length === 0 && <p className="review-empty">暂无关联</p>}
              {relatedLinks.map((l, i) => {
                const other = l.source === selectedNode.id ? l.target : l.source
                return (
                  <div key={i} className="graph-related-link">
                    <span className="graph-link-type" style={{ color: LINK_COLORS[l.type] }}>
                      {getTypeLabel(l.type)}
                    </span>
                    <span> → {other}</span>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="review-empty">
            <p>点击节点查看详情</p>
            <div className="graph-legend">
              <h5>图例</h5>
              {Object.entries(NODE_COLORS).map(([key, color]) => (
                <div key={key} className="graph-legend-item">
                  <span className="graph-legend-dot" style={{ background: color }} />
                  <span>{key}</span>
                </div>
              ))}
              <h5 style={{ marginTop: 12 }}>关系类型</h5>
              {Object.entries(LINK_COLORS).map(([key, color]) => (
                <div key={key} className="graph-legend-item">
                  <span className="graph-legend-line" style={{ background: color }} />
                  <span>{getTypeLabel(key)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
