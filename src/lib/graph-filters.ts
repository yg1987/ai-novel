import type { GraphNode, GraphNodeType, RelationshipLink } from '../types/novel'

export interface GraphFilterState {
  hiddenTypes: ReadonlySet<GraphNodeType>
  hiddenNodeIds: ReadonlySet<string>
  hideStructural: boolean
  hideIsolated: boolean
  hideResolvedForeshadowing?: boolean
  minimumEdgeWeight?: number
  allowedNodeTypes?: ReadonlySet<GraphNodeType>
}

function trimDanglingEdges(nodes: GraphNode[], edges: RelationshipLink[]): RelationshipLink[] {
  const ids = new Set(nodes.map((node) => node.id))
  return edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target) && edge.source !== edge.target)
}

function removeIsolatedNodes(nodes: GraphNode[], edges: RelationshipLink[]): GraphNode[] {
  const connected = new Set<string>()
  for (const edge of edges) {
    connected.add(edge.source)
    connected.add(edge.target)
  }
  return nodes.filter((node) => connected.has(node.id))
}

export function applyGraphFilters(
  nodes: GraphNode[],
  edges: RelationshipLink[],
  filters: GraphFilterState,
): { nodes: GraphNode[]; edges: RelationshipLink[] } {
  let filteredNodes = nodes.filter((node) => !filters.hiddenNodeIds.has(node.id))

  if (filters.allowedNodeTypes) {
    filteredNodes = filteredNodes.filter((node) => filters.allowedNodeTypes?.has(node.type))
  }

  filteredNodes = filteredNodes.filter((node) => !filters.hiddenTypes.has(node.type))
  if (filters.hideResolvedForeshadowing) {
    filteredNodes = filteredNodes.filter((node) => node.type !== 'foreshadowing' || !node.tags.includes('resolved'))
  }

  let filteredEdges = trimDanglingEdges(filteredNodes, edges)

  if (filters.hideStructural) {
    filteredEdges = filteredEdges.filter((edge) => !edge.structural)
  }

  if (filters.minimumEdgeWeight !== undefined) {
    filteredEdges = filteredEdges.filter((edge) => edge.weight >= filters.minimumEdgeWeight!)
  }

  filteredEdges = trimDanglingEdges(filteredNodes, filteredEdges)

  if (filters.hideIsolated) {
    const beforeIsolated = { nodes: filteredNodes, edges: filteredEdges }
    filteredNodes = removeIsolatedNodes(filteredNodes, filteredEdges)
    filteredEdges = trimDanglingEdges(filteredNodes, filteredEdges)
    if (beforeIsolated.nodes.length > 0 && filteredNodes.length === 0) return beforeIsolated
  }

  return { nodes: filteredNodes, edges: filteredEdges }
}
