import Graph from 'graphology'
import type { InsightItem } from '../types/novel'

export function findSurprisingConnections(graph: Graph): InsightItem[] {
  const insights: InsightItem[] = []
  graph.forEachEdge((_edge, attributes, source, target, sourceAttributes, targetAttributes) => {
    let score = 0
    if (sourceAttributes.community !== targetAttributes.community) score += 3
    if (sourceAttributes.type !== targetAttributes.type) score += 2
    const sourceDegree = graph.degree(source)
    const targetDegree = graph.degree(target)
    if (Math.abs(sourceDegree - targetDegree) >= 3) score += 2
    if ((attributes.weight ?? 0) <= 1) score += 1
    if (score >= 3) {
      insights.push({
        type: 'surprising-connection',
        title: '惊喜连接',
        description: `${sourceAttributes.label ?? source} 与 ${targetAttributes.label ?? target} 存在值得关注的跨域连接。`,
        nodeIds: [source, target],
        suggestion: '检查这条关系是否可以扩展成剧情呼应或人物动机。',
      })
    }
  })
  return insights.slice(0, 8)
}

export function detectKnowledgeGaps(graph: Graph): InsightItem[] {
  const insights: InsightItem[] = []
  graph.forEachNode((node, attributes) => {
    if (graph.degree(node) <= 1) {
      insights.push({
        type: 'isolated-node',
        title: '孤立节点',
        description: `${attributes.label ?? node} 与其他设定的连接偏少。`,
        nodeIds: [node],
        suggestion: '考虑补充出场、关系或伏笔关联，避免设定悬空。',
      })
    }
  })

  const communities = new Map<number, string[]>()
  graph.forEachNode((node, attributes) => {
    const community = typeof attributes.community === 'number' ? attributes.community : -1
    communities.set(community, [...(communities.get(community) ?? []), node])
  })

  for (const [community, nodes] of communities) {
    if (nodes.length < 3) continue
    const possible = nodes.length * (nodes.length - 1) / 2
    let actual = 0
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        if (graph.hasEdge(nodes[i]!, nodes[j]!) || graph.hasEdge(nodes[j]!, nodes[i]!)) actual++
      }
    }
    if (possible > 0 && actual / possible < 0.15) {
      insights.push({
        type: 'sparse-community',
        title: '稀疏社区',
        description: `社区 ${community} 内部连接密度偏低。`,
        nodeIds: nodes,
        suggestion: '检查同一剧情团块内的角色、地点、事件是否缺少明确联系。',
      })
    }
  }

  graph.forEachNode((node, attributes) => {
    const neighborCommunities = new Set<number>()
    graph.forEachNeighbor(node, (_neighbor, neighborAttributes) => {
      if (typeof neighborAttributes.community === 'number') neighborCommunities.add(neighborAttributes.community)
    })
    if (neighborCommunities.size >= 3) {
      insights.push({
        type: 'bridge-node',
        title: '桥梁节点',
        description: `${attributes.label ?? node} 连接了多个社区。`,
        nodeIds: [node],
        suggestion: '这是潜在的关键角色、核心地点或主线道具，适合加强戏剧功能。',
      })
    }
  })

  return insights.slice(0, 12)
}

export function computeGraphInsights(graph: Graph): InsightItem[] {
  return [...findSurprisingConnections(graph), ...detectKnowledgeGaps(graph)].slice(0, 16)
}
