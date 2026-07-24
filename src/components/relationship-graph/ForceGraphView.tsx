import { useEffect, useMemo, useState } from 'react'
import Graph from 'graphology'
import forceAtlas2 from 'graphology-layout-forceatlas2'
import { SigmaContainer, useRegisterEvents } from '@react-sigma/core'
import type { Settings } from 'sigma/settings'
import '@react-sigma/core/lib/style.css'
import { COMMUNITY_COLORS, NODE_TYPE_COLORS, initialGraphPosition, nodeSize } from '../../lib/graph-layout'
import { RELATION_LABELS } from '../../lib/graph-readable'
import type { GraphLabelVisibility } from '../../lib/graph-mode'
import type { GraphNode, RelationshipLink } from '../../types/novel'

export interface ContextMenuState { nodeId: string; x: number; y: number }

type SigmaNodeAttributes = Omit<GraphNode, 'type'> & {
  graphNodeType: GraphNode['type']
  type: string
  x: number
  y: number
  size: number
  color: string
  [key: string]: unknown
}

type SigmaEdgeAttributes = Omit<RelationshipLink, 'type'> & {
  relationType: RelationshipLink['type']
  type: string
  size: number
  color: string
  label: string
  [key: string]: unknown
}

type SigmaGraph = Graph<SigmaNodeAttributes, SigmaEdgeAttributes, Record<string, unknown>>

function nodeColor(node: GraphNode): string {
  if (node.community >= 0) return COMMUNITY_COLORS[node.community % COMMUNITY_COLORS.length] ?? NODE_TYPE_COLORS[node.type]
  return NODE_TYPE_COLORS[node.type]
}

function edgeColor(edge: RelationshipLink): string {
  if (edge.structural) return '#cbd5e1'
  const colors: Record<string, string> = { ally: '#2ecc71', rival: '#e67e22', family: '#1abc9c', mentor: '#f39c12', enemy: '#e74c3c', friend: '#3498db', love: '#e91e63', ambiguous: '#94a3b8' }
  return edge.color ?? colors[edge.type] ?? '#94a3b8'
}

function createSigmaGraph(nodes: GraphNode[], edges: RelationshipLink[], positionCache: Map<string, { x: number; y: number }>): SigmaGraph {
  const graph = new Graph<SigmaNodeAttributes, SigmaEdgeAttributes, Record<string, unknown>>({ type: 'undirected', multi: true })
  const maxLinks = Math.max(0, ...nodes.map((node) => node.linkCount))
  nodes.forEach((node, index) => {
    const position = positionCache.get(node.id) ?? initialGraphPosition(node, index, nodes.length)
    graph.addNode(node.id, { ...node, graphNodeType: node.type, type: 'circle', x: position.x, y: position.y, size: nodeSize(node.linkCount, maxLinks), color: nodeColor(node), label: node.label })
  })
  edges.forEach((edge, index) => {
    if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target) || edge.source === edge.target) return
    graph.addEdgeWithKey(`${edge.source}::${edge.target}::${index}`, edge.source, edge.target, { ...edge, relationType: edge.type, type: 'line', size: Math.max(1, Math.min(6, edge.weight)), color: edgeColor(edge), label: edge.label ?? RELATION_LABELS[edge.type] ?? `未知关系（${edge.type}）` })
  })
  try {
    forceAtlas2.assign(graph, { iterations: Math.min(120, Math.max(30, nodes.length * 2)), settings: { gravity: 1, scalingRatio: 8, slowDown: 2, barnesHutOptimize: nodes.length > 80 }, getEdgeWeight: 'weight' })
  } catch { /* keep golden-angle positions */ }
  graph.forEachNode((node, attributes) => {
    if (typeof attributes.x === 'number' && typeof attributes.y === 'number') {
      positionCache.set(node, { x: attributes.x, y: attributes.y })
    }
  })
  return graph
}

function GraphEvents({ onSelect, onContext }: { onSelect: (nodeId: string) => void; onContext: (menu: ContextMenuState | null) => void }) {
  const registerEvents = useRegisterEvents<SigmaNodeAttributes, SigmaEdgeAttributes, Record<string, unknown>>()
  useEffect(() => {
    registerEvents({
      clickNode: (event) => onSelect(event.node),
      rightClickNode: (event) => {
        event.event.preventSigmaDefault()
        const original = event.event.original
        original.preventDefault()
        original.stopPropagation()
        const point = original instanceof MouseEvent ? original : original.touches[0]
        onContext({ nodeId: event.node, x: point?.clientX ?? 0, y: point?.clientY ?? 0 })
      },
      clickStage: () => onContext(null),
    })
  }, [onContext, onSelect, registerEvents])
  return null
}

function GraphMiniMap({ graph, focusedNodeId }: { graph: SigmaGraph; focusedNodeId: string | null }) {
  const points = useMemo(() => {
    const next: { id: string; x: number; y: number; color: string }[] = []
    graph.forEachNode((id, attributes) => {
      if (typeof attributes.x === 'number' && typeof attributes.y === 'number') {
        next.push({ id, x: attributes.x, y: attributes.y, color: attributes.color ?? '#94a3b8' })
      }
    })
    return next
  }, [graph])
  if (points.length === 0) return null
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const width = Math.max(1, maxX - minX)
  const height = Math.max(1, maxY - minY)
  const projectX = (x: number) => 8 + ((x - minX) / width) * 104
  const projectY = (y: number) => 8 + ((y - minY) / height) * 64
  return <svg className="graph-minimap" viewBox="0 0 120 80" aria-hidden="true">{points.map((point) => <circle key={point.id} cx={projectX(point.x)} cy={projectY(point.y)} r={point.id === focusedNodeId ? 3.5 : 2} fill={point.id === focusedNodeId ? '#111827' : point.color} opacity={point.id === focusedNodeId ? 1 : 0.75} />)}</svg>
}

interface Props {
  nodes: GraphNode[]
  edges: RelationshipLink[]
  focusedNodeId: string | null
  labelVisibility: GraphLabelVisibility
  onSelect: (nodeId: string) => void
  onContext: (menu: ContextMenuState | null) => void
}

export default function ForceGraphView({ nodes, edges, focusedNodeId, labelVisibility, onSelect, onContext }: Props) {
  const [positionCache] = useState(() => new Map<string, { x: number; y: number }>())
  const sigmaGraph = useMemo(() => createSigmaGraph(nodes, edges, positionCache), [edges, nodes, positionCache])
  const settings = useMemo<Partial<Settings<SigmaNodeAttributes, SigmaEdgeAttributes, Record<string, unknown>>>>(() => ({
    renderEdgeLabels: false,
    labelRenderedSizeThreshold: 12,
    allowInvalidContainer: true,
    nodeReducer: (node, data) => {
      const isFocused = node === focusedNodeId || edges.some((edge) => (edge.source === focusedNodeId && edge.target === node) || (edge.target === focusedNodeId && edge.source === node))
      if (focusedNodeId && !isFocused) return { ...data, color: '#d7dde5', label: '' }
      if (labelVisibility === 'minimal') return { ...data, label: '' }
      return data
    },
    edgeReducer: (_edge, data) => {
      if (!focusedNodeId) return data
      const keep = data.source === focusedNodeId || data.target === focusedNodeId
      return keep ? data : { ...data, hidden: true }
    },
  }), [edges, focusedNodeId, labelVisibility])

  return (
    <div className="graph-sigma-container" onContextMenu={(event) => event.preventDefault()}>
      <SigmaContainer<SigmaNodeAttributes, SigmaEdgeAttributes, Record<string, unknown>> graph={sigmaGraph} settings={settings} className="graph-sigma-canvas" style={{ width: '100%', height: '100%' }}>
        <GraphEvents onSelect={onSelect} onContext={onContext} />
      </SigmaContainer>
      <GraphMiniMap graph={sigmaGraph} focusedNodeId={focusedNodeId} />
    </div>
  )
}
