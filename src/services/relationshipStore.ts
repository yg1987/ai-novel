// src/services/relationshipStore.ts
import Graph from 'graphology'
import louvain from 'graphology-communities-louvain'
import { listChapters, listProjectFiles, readProjectFile } from '../api/tauri'
import { characterNodeId, chapterNodeId, eventNodeId, foreshadowingNodeId, itemNodeId, locationNodeId, organizationNodeId } from '../lib/graph-id'
import { computeGraphInsights } from '../lib/graph-insights'
import { loadForeshadows } from './foreshadowStorage'
import { RELATION_META } from '../types/novel'
import type { ChapterSnapshot, GraphNode, GraphNodeType, RelationType, RelationshipGraph, RelationshipLink } from '../types/novel'

const SNAPSHOT_DIR = 'memory/snapshots'
const CHARACTER_DIR = 'characters'
const WORLDVIEW_DIR = 'worldview'
const RELATION_PATTERN = /^\s*(.+?)\s*→\s*(.+?)\s*→\s*(.+?)\s*$/

interface ParsedCharacterCard {
  name: string
  group: 'protagonist' | 'supporter' | 'antagonist' | 'neutral'
  tags: string[]
  organizations: string[]
}

function createNode(id: string, label: string, type: GraphNodeType, group: string = type): GraphNode {
  return { id, label, type, group, community: -1, linkCount: 0, firstAppearance: 0, lastAppearance: 0, appearanceCount: 0, tags: [] }
}

function ensureNode(nodeMap: Map<string, GraphNode>, id: string, label: string, type: GraphNodeType, group: string = type): GraphNode {
  const existing = nodeMap.get(id)
  if (existing) return existing
  const node = createNode(id, label, type, group)
  nodeMap.set(id, node)
  return node
}

function parseRelationshipChange(raw: string): { charA: string; type: string; charB: string } | null {
  const m = RELATION_PATTERN.exec(raw)
  if (!m) return null
  return { charA: m[1]!.trim(), type: m[2]!.trim(), charB: m[3]!.trim() }
}

function mapRelationType(type: string): RelationType {
  const lower = type.toLowerCase()
  if (lower.includes('盟友') || lower.includes('同伴')) return 'ally'
  if (lower.includes('敌人') || lower.includes('仇')) return 'enemy'
  if (lower.includes('家人') || lower.includes('兄弟') || lower.includes('父子') || lower.includes('母女')) return 'family'
  if (lower.includes('师徒') || lower.includes('老师') || lower.includes('弟子')) return 'mentor'
  if (lower.includes('恋人') || lower.includes('爱') || lower.includes('夫妻')) return 'love'
  if (lower.includes('竞争') || lower.includes('rival') || lower.includes('对手')) return 'rival'
  if (lower.includes('朋友') || lower.includes('好友')) return 'friend'
  return 'ambiguous'
}

function splitList(value: string): string[] {
  return value.split(/[,，、;；\s]+/).map((s) => s.trim()).filter(Boolean)
}

function parseCharacterCard(name: string, content: string): ParsedCharacterCard {
  let group: ParsedCharacterCard['group'] = 'neutral'
  const tags = new Set<string>()
  const organizations = new Set<string>()

  for (const rawLine of content.split('\n')) {
    const field = rawLine.trim().match(/^[-*\s]*([^：:]+)[：:]\s*(.+)$/)
    if (!field) continue
    const key = field[1]!.trim()
    const value = field[2]!.trim()
    if (key.includes('身份')) {
      if (/主角|主线|核心/.test(value)) group = 'protagonist'
      else if (/反派|敌/.test(value)) group = 'antagonist'
      else if (/配角|同伴|伙伴|盟友/.test(value)) group = 'supporter'
    }
    if (key.includes('标签')) splitList(value).forEach((tag) => tags.add(tag))
    if (key.includes('阵营') || key.includes('势力') || key.includes('组织')) splitList(value).forEach((org) => organizations.add(org))
  }

  return { name, group, tags: Array.from(tags), organizations: Array.from(organizations) }
}

function extractWorldviewOrganizations(filename: string, content: string): string[] {
  const names = new Set<string>()
  const stem = filename.replace(/\.md$/i, '').trim()
  if (stem) names.add(stem)
  const title = content.match(/^#\s+(.+)$/m)?.[1]?.trim()
  if (title) names.add(title)
  for (const rawLine of content.split('\n')) {
    const match = rawLine.trim().match(/^(?:组织|势力)[：:]\s*(.+)$/)
    if (match) splitList(match[1]!).forEach((name) => names.add(name))
  }
  return Array.from(names).filter(Boolean)
}

function relationLink(source: string, target: string, type: RelationType, chapter: number, options: Partial<RelationshipLink> = {}): RelationshipLink {
  const meta = RELATION_META[type]
  return {
    source,
    target,
    type,
    tier: options.tier ?? meta.tier,
    weight: options.weight ?? meta.weight,
    strength: options.strength ?? Math.min(1, meta.weight / 3),
    firstMentioned: options.firstMentioned ?? chapter,
    lastMentioned: options.lastMentioned ?? chapter,
    mentions: options.mentions ?? 1,
    description: options.description,
    structural: options.structural,
  }
}

function edgeKey(source: string, target: string): string {
  return [source, target].sort().join('::')
}

function mergeDescription(existing: string | undefined, next: string | undefined): string | undefined {
  if (!existing) return next
  if (!next || existing.includes(next)) return existing
  return `${existing}；${next}`
}

function mergeEdge(linkMap: Map<string, RelationshipLink>, nodes: Map<string, GraphNode>, next: RelationshipLink): void {
  if (!nodes.has(next.source) || !nodes.has(next.target) || next.source === next.target) return
  const key = edgeKey(next.source, next.target)
  const existing = linkMap.get(key)
  if (!existing) {
    linkMap.set(key, next)
    return
  }
  existing.mentions += next.mentions
  existing.firstMentioned = Math.min(existing.firstMentioned, next.firstMentioned)
  existing.lastMentioned = Math.max(existing.lastMentioned, next.lastMentioned)
  existing.weight += next.weight
  existing.strength = Math.min(1, existing.strength + next.strength)
  if (existing.type === 'ambiguous' && next.type !== 'ambiguous') {
    existing.type = next.type
    existing.tier = next.tier
  }
  existing.description = mergeDescription(existing.description, next.description)
  existing.structural = Boolean(existing.structural && next.structural)
}

function commonNeighborScore(graph: Graph, source: string, target: string): number {
  const sourceNeighbors = new Set<string>()
  graph.forEachNeighbor(source, (neighbor) => sourceNeighbors.add(neighbor))
  let score = 0
  graph.forEachNeighbor(target, (neighbor) => {
    if (!sourceNeighbors.has(neighbor)) return
    const degree = graph.degree(neighbor)
    score += degree > 1 ? 1 / Math.log(degree + 1) : 0
  })
  return score
}

function applyFiveSignalWeights(linkMap: Map<string, RelationshipLink>, nodeMap: Map<string, GraphNode>, graph: Graph): void {
  for (const [key, link] of linkMap) {
    const source = nodeMap.get(link.source)
    const target = nodeMap.get(link.target)
    if (!source || !target || !graph.hasEdge(key)) continue

    const description = link.description ?? ''
    const hasCoOccurrence = description.includes('共同出场')
    const hasExplicitRelation = description.includes('→') || (!description.startsWith('共同出场') && description.length > 0)
    const directSignal = hasExplicitRelation && !link.structural ? 1 : 0
    const coOccurrenceSignal = hasCoOccurrence ? Math.min(2, Math.log1p(link.mentions)) : 0
    const commonNeighborSignal = Math.min(2, commonNeighborScore(graph, link.source, link.target))
    const typeAffinitySignal = source.type === target.type ? 0.4 : 1
    const relationStrengthSignal = RELATION_META[link.type].weight / 1.5

    const weighted =
      directSignal * 3.0 +
      coOccurrenceSignal * 4.0 +
      commonNeighborSignal * 1.5 +
      typeAffinitySignal * 1.0 +
      relationStrengthSignal * 1.5

    const structuralFactor = link.structural ? 0.45 : 1
    link.weight = Math.max(0.2, Number((weighted * structuralFactor).toFixed(2)))
    link.strength = Math.max(0.05, Math.min(1, Number((link.weight / 10).toFixed(2))))
    graph.setEdgeAttribute(key, 'weight', link.weight)
    graph.setEdgeAttribute(key, 'strength', link.strength)
  }
}

async function loadSnapshots(projectId: string): Promise<ChapterSnapshot[]> {
  const snapshotFiles = await listProjectFiles(projectId, SNAPSHOT_DIR).catch(() => [])
  const snapshots: ChapterSnapshot[] = []
  for (const f of snapshotFiles) {
    if (!f.name.endsWith('.snapshot.json')) continue
    try {
      const raw = await readProjectFile(projectId, SNAPSHOT_DIR, f.name)
      snapshots.push(JSON.parse(raw) as ChapterSnapshot)
    } catch { /* skip malformed */ }
  }
  return snapshots.sort((a, b) => a.chapterNumber - b.chapterNumber)
}

export async function loadRelationshipGraph(projectId: string): Promise<RelationshipGraph> {
  const nodeMap = new Map<string, GraphNode>()
  const linkMap = new Map<string, RelationshipLink>()
  const chapters = await listChapters(projectId).catch(() => [])
  const snapshots = await loadSnapshots(projectId)

  const characterFiles = await listProjectFiles(projectId, CHARACTER_DIR).catch(() => [])
  for (const file of characterFiles) {
    if (!file.name.endsWith('.md')) continue
    const name = file.name.replace(/\.md$/i, '')
    let parsed: ParsedCharacterCard = { name, group: 'neutral', tags: [], organizations: [] }
    try {
      parsed = parseCharacterCard(name, await readProjectFile(projectId, CHARACTER_DIR, file.name))
    } catch { /* keep defaults */ }
    const node = ensureNode(nodeMap, characterNodeId(name), name, 'character', parsed.group)
    node.tags = parsed.tags
    for (const org of parsed.organizations) {
      const orgId = organizationNodeId(org)
      ensureNode(nodeMap, orgId, org, 'organization', 'organization')
      mergeEdge(linkMap, nodeMap, relationLink(node.id, orgId, 'ambiguous', 0, { weight: 1, strength: 0.25, structural: true, description: `角色阵营：${org}` }))
    }
  }

  const chapterByNumber = new Map<number, string>()
  for (const chapter of chapters.slice().sort((a, b) => a.order - b.order)) {
    const id = chapterNodeId(chapter.id)
    chapterByNumber.set(chapter.order, id)
    const node = ensureNode(nodeMap, id, `第${chapter.order}章 ${chapter.title}`, 'chapter', 'chapter')
    node.firstAppearance = chapter.order
    node.lastAppearance = chapter.order
    node.appearanceCount = 1
  }

  for (const file of await listProjectFiles(projectId, WORLDVIEW_DIR).catch(() => [])) {
    if (!file.name.endsWith('.md')) continue
    try {
      const content = await readProjectFile(projectId, WORLDVIEW_DIR, file.name)
      for (const org of extractWorldviewOrganizations(file.name, content)) ensureNode(nodeMap, organizationNodeId(org), org, 'organization', 'organization')
    } catch { /* skip unreadable worldview files */ }
  }

  const coOccurrences = new Map<string, { source: string; target: string; count: number; first: number; last: number }>()

  for (const snap of snapshots) {
    const chapterNode = chapterByNumber.get(snap.chapterNumber)
    const fallbackChapterId = `ch${String(snap.chapterNumber).padStart(3, '0')}`
    const seenCharacters = new Set<string>()

    for (const charName of snap.characters) {
      const charId = characterNodeId(charName)
      const node = nodeMap.get(charId)
      if (!node) continue
      seenCharacters.add(charId)
      node.firstAppearance = node.firstAppearance === 0 ? snap.chapterNumber : Math.min(node.firstAppearance, snap.chapterNumber)
      node.lastAppearance = Math.max(node.lastAppearance, snap.chapterNumber)
      node.appearanceCount++
      if (chapterNode) mergeEdge(linkMap, nodeMap, relationLink(chapterNode, charId, 'ambiguous', snap.chapterNumber, { weight: 0.7, strength: 0.15, structural: true, description: '章节出场' }))
    }

    for (const location of snap.locations) {
      const locationId = locationNodeId(location)
      const node = ensureNode(nodeMap, locationId, location, 'location', 'location')
      node.firstAppearance = node.firstAppearance === 0 ? snap.chapterNumber : Math.min(node.firstAppearance, snap.chapterNumber)
      node.lastAppearance = Math.max(node.lastAppearance, snap.chapterNumber)
      node.appearanceCount++
      if (chapterNode) mergeEdge(linkMap, nodeMap, relationLink(chapterNode, locationId, 'ambiguous', snap.chapterNumber, { weight: 0.6, strength: 0.12, structural: true, description: '章节地点' }))
    }

    for (const item of snap.items) {
      const itemId = itemNodeId(item)
      const node = ensureNode(nodeMap, itemId, item, 'item', 'item')
      node.firstAppearance = node.firstAppearance === 0 ? snap.chapterNumber : Math.min(node.firstAppearance, snap.chapterNumber)
      node.lastAppearance = Math.max(node.lastAppearance, snap.chapterNumber)
      node.appearanceCount++
      if (chapterNode) mergeEdge(linkMap, nodeMap, relationLink(chapterNode, itemId, 'ambiguous', snap.chapterNumber, { weight: 0.6, strength: 0.12, structural: true, description: '章节物品' }))
    }

    snap.timelineEvents.forEach((event, index) => {
      const eventId = eventNodeId(chapterNode?.replace(/^chapter:/, '') ?? fallbackChapterId, index)
      const node = ensureNode(nodeMap, eventId, event, 'event', 'event')
      node.firstAppearance = snap.chapterNumber
      node.lastAppearance = snap.chapterNumber
      node.appearanceCount = 1
      if (chapterNode) mergeEdge(linkMap, nodeMap, relationLink(chapterNode, eventId, 'ambiguous', snap.chapterNumber, { weight: 1.2, strength: 0.25, structural: true, description: '章节事件' }))
      for (const charId of seenCharacters) mergeEdge(linkMap, nodeMap, relationLink(charId, eventId, 'ambiguous', snap.chapterNumber, { weight: 0.5, strength: 0.1, description: '角色参与事件' }))
    })

    for (const raw of snap.relationshipChanges) {
      const parsed = parseRelationshipChange(raw)
      if (!parsed) continue
      const type = mapRelationType(parsed.type)
      mergeEdge(linkMap, nodeMap, relationLink(characterNodeId(parsed.charA), characterNodeId(parsed.charB), type, snap.chapterNumber, {
        weight: RELATION_META[type].weight * 3,
        strength: 0.35,
        description: raw,
      }))
    }

    const chars = Array.from(seenCharacters)
    for (let i = 0; i < chars.length; i++) {
      for (let j = i + 1; j < chars.length; j++) {
        const source = chars[i]!
        const target = chars[j]!
        const key = [source, target].sort().join('::')
        const existing = coOccurrences.get(key)
        if (existing) {
          existing.count++
          existing.last = snap.chapterNumber
        } else {
          coOccurrences.set(key, { source, target, count: 1, first: snap.chapterNumber, last: snap.chapterNumber })
        }
      }
    }
  }

  for (const co of coOccurrences.values()) {
    const key = edgeKey(co.source, co.target)
    if (!linkMap.has(key) && co.count < 2) continue
    mergeEdge(linkMap, nodeMap, relationLink(co.source, co.target, 'ambiguous', co.first, {
      firstMentioned: co.first,
      lastMentioned: co.last,
      mentions: co.count,
      weight: Math.min(4, co.count * 0.8),
      strength: Math.min(0.7, co.count * 0.12),
      description: `共同出场 ${co.count} 次`,
    }))
  }

  try {
    const store = await loadForeshadows(projectId)
    for (const entry of store.entries) {
      if (entry.status === 'abandoned') continue
      const fsId = foreshadowingNodeId(entry.id)
      const fsNode = ensureNode(nodeMap, fsId, entry.name, 'foreshadowing', entry.status)
      fsNode.tags = [entry.category, entry.status]
      const chapterIds = [entry.plantedChapterId, ...entry.clues.map((clue) => clue.chapterId), entry.resolvedChapterId].filter(Boolean) as string[]
      for (const chapterId of chapterIds) {
        const chId = chapterNodeId(chapterId)
        if (nodeMap.has(chId)) mergeEdge(linkMap, nodeMap, relationLink(fsId, chId, 'ambiguous', 0, { weight: 1.4, strength: 0.3, structural: true, description: '伏笔章节关联' }))
      }
      for (const charName of entry.relatedCharacters) {
        const charId = characterNodeId(charName)
        if (nodeMap.has(charId)) mergeEdge(linkMap, nodeMap, relationLink(fsId, charId, 'ambiguous', 0, { weight: 1.2, strength: 0.25, description: '伏笔角色关联' }))
      }
    }
  } catch { /* no foreshadow store */ }

  const graph = new Graph({ type: 'undirected', multi: false })
  for (const node of nodeMap.values()) graph.addNode(node.id, { ...node })
  for (const [key, link] of linkMap) {
    if (graph.hasNode(link.source) && graph.hasNode(link.target) && link.source !== link.target) graph.addEdgeWithKey(key, link.source, link.target, { ...link })
  }

  applyFiveSignalWeights(linkMap, nodeMap, graph)

  try {
    const communities = louvain(graph)
    for (const [nodeId, community] of Object.entries(communities)) {
      const node = nodeMap.get(nodeId)
      if (node) node.community = community
    }
  } catch { /* keep default community */ }

  graph.forEachNode((nodeId) => {
    const node = nodeMap.get(nodeId)
    if (node) node.linkCount = graph.degree(nodeId)
  })

  return {
    nodes: Array.from(nodeMap.values()),
    links: Array.from(linkMap.values()),
    insights: computeGraphInsights(graph),
  }
}
