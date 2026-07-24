import type { GraphNode, GraphNodeType, RelationshipLink } from '../types/novel'

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

export const RELATION_LABELS: Record<string, string> = {
  ally: '盟友',
  rival: '对手',
  family: '血缘',
  mentor: '师徒',
  enemy: '仇敌',
  friend: '朋友',
  love: '恋情',
  ambiguous: '关联',
}

export const RELATION_SOURCE_LABELS: Record<NonNullable<RelationshipLink['sourceKind']>, string> = {
  manual: '作者确认',
  snapshot: '章节快照',
  'co-occurrence': '共同出场推测',
  catalog: '结构化目录',
  foreshadowing: '伏笔关联',
}

export function relationshipLabel(edge: RelationshipLink): string {
  if (edge.kind === 'affiliation') return '组织归属'
  if (edge.kind === 'appearance') return '共同出场'
  if (edge.kind === 'participation') return '章节参与'
  if (edge.kind === 'foreshadowing') return '伏笔关联'
  if (edge.kind === 'organizationHierarchy') return '组织层级'
  return edge.label ?? RELATION_LABELS[edge.type] ?? `未知关系（${edge.type}）`
}

export function relationshipSourceLabel(edge: RelationshipLink): string | undefined {
  if (edge.temporalStatus === 'historical') return '历史阶段'
  return edge.sourceKind ? RELATION_SOURCE_LABELS[edge.sourceKind] : undefined
}

export function relationshipDirectionLabel(edge: RelationshipLink, perspectiveNodeId?: string): string {
  if (!edge.direction || edge.direction === 'undirected') return '双向'
  if (!perspectiveNodeId) return edge.direction === 'b-to-a' ? '反向' : '正向'
  const outgoing = edge.direction === 'b-to-a' ? edge.target === perspectiveNodeId : edge.source === perspectiveNodeId
  return outgoing ? '指向' : '来自'
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
            label: `${relationshipLabel(edge)}：${other?.label ?? otherId}`,
            type: other?.type ?? node.type,
            children: [],
          }
        }),
    })),
  }))
}
