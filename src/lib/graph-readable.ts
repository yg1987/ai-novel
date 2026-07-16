import type { GraphNode, GraphNodeType, RelationType, RelationshipLink } from '../types/novel'

export interface DocumentGroup {
  type: GraphNodeType
  label: string
  nodes: GraphNode[]
}

export interface MindMapNode {
  id: string
  label: string
  type: GraphNodeType | 'root'
  children: MindMapNode[]
}

export const TYPE_LABELS: Record<GraphNodeType, string> = {
  character: '角色',
  location: '地点',
  organization: '组织',
  item: '物品',
  event: '事件',
  chapter: '章节',
  foreshadowing: '伏笔',
}

export const RELATION_LABELS: Record<RelationType, string> = {
  ally: '盟友',
  rival: '对手',
  family: '血缘',
  mentor: '师徒',
  enemy: '仇敌',
  friend: '朋友',
  love: '恋情',
  ambiguous: '关联',
}

export function groupGraphDocumentNodes(nodes: GraphNode[]): DocumentGroup[] {
  const order: GraphNodeType[] = ['character', 'chapter', 'location', 'organization', 'item', 'event', 'foreshadowing']
  return order
    .map((type) => ({
      type,
      label: TYPE_LABELS[type],
      nodes: nodes.filter((node) => node.type === type).sort((a, b) => a.label.localeCompare(b.label, 'zh-CN')),
    }))
    .filter((group) => group.nodes.length > 0)
}

export function buildGraphDocument(nodes: GraphNode[], edges: RelationshipLink[]): string {
  const lines: string[] = ['# 关系图谱文档', '']
  for (const group of groupGraphDocumentNodes(nodes)) {
    lines.push(`## ${group.label}`, '')
    for (const node of group.nodes) {
      const related = edges.filter((edge) => edge.source === node.id || edge.target === node.id)
      lines.push(`- ${node.label}（${related.length} 个关联）`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

export function buildGraphMindMap(nodes: GraphNode[], edges: RelationshipLink[]): MindMapNode[] {
  return groupGraphDocumentNodes(nodes).map((group) => ({
    id: `group:${group.type}`,
    label: group.label,
    type: 'root',
    children: group.nodes.map((node) => ({
      id: node.id,
      label: node.label,
      type: node.type,
      children: edges
        .filter((edge) => edge.source === node.id || edge.target === node.id)
        .slice(0, 8)
        .map((edge) => {
          const otherId = edge.source === node.id ? edge.target : edge.source
          const other = nodes.find((candidate) => candidate.id === otherId)
          return {
            id: `${node.id}->${otherId}`,
            label: `${RELATION_LABELS[edge.type]}：${other?.label ?? otherId}`,
            type: other?.type ?? node.type,
            children: [],
          }
        }),
    })),
  }))
}
