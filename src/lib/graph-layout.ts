import type { GraphNode, GraphNodeType } from '../types/novel'

export const NODE_TYPE_COLORS: Record<GraphNodeType, string> = {
  character: '#3498db',
  location: '#2ecc71',
  organization: '#9b59b6',
  item: '#f39c12',
  event: '#e67e22',
  chapter: '#34495e',
  foreshadowing: '#e74c3c',
}

export const COMMUNITY_COLORS = [
  '#1abc9c', '#3498db', '#9b59b6', '#e67e22', '#e74c3c', '#2ecc71',
  '#f1c40f', '#16a085', '#2980b9', '#8e44ad', '#d35400', '#c0392b',
]

export function initialGraphPosition(node: GraphNode, index: number, total: number): { x: number; y: number } {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5))
  const communityOffset = Math.max(0, node.community) * 80
  const radius = 80 + Math.sqrt(index + 1) * 28 + communityOffset
  const angle = index * goldenAngle
  const scale = Math.max(1, Math.sqrt(total) / 4)
  return {
    x: Math.cos(angle) * radius * scale,
    y: Math.sin(angle) * radius * scale,
  }
}

export function nodeSize(linkCount: number, maxLinks: number): number {
  if (maxLinks <= 0) return 8
  return 8 + Math.sqrt(linkCount / maxLinks) * 14
}
