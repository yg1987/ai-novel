import Graph from 'graphology'
import louvain from 'graphology-communities-louvain'
import { listChapters, listProjectFiles, readProjectFile } from '../api/tauri'
import { characterNodeId, chapterNodeId, eventNodeId, foreshadowingNodeId, itemNodeId, locationNodeId, organizationNodeId } from '../lib/graph-id'
import { computeGraphInsights } from '../lib/graph-insights'
import { loadCharacterCatalog, resolveCharacterName } from './characterCatalog'
import { loadCharacterModuleConfig } from './characterConfig'
import { currentRelationshipPeriod, loadCharacterRelationships, validateRelationshipStore } from './characterRelations'
import { loadForeshadows } from './foreshadowStorage'
import { loadOrganizations } from './organizationStore'
import { buildChapterSequence } from './chapterCatalog'
import { RELATION_META } from '../types/novel'
import type { ChapterRef } from '../types/chapter'
import type { CharacterModuleConfig, CharacterRelationship, RelationshipPeriod } from '../types/character'
import type { ChapterSnapshot, GraphNode, GraphNodeType, RelationType, RelationshipGraph, RelationshipLink } from '../types/novel'

const SNAPSHOT_DIR = 'memory/snapshots'
const RELATION_PATTERN = /^\s*(.+?)\s*→\s*(.+?)\s*→\s*(.+?)\s*$/

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
  const match = RELATION_PATTERN.exec(raw)
  if (!match) return null
  return { charA: match[1]!.trim(), type: match[2]!.trim(), charB: match[3]!.trim() }
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

function relationMeta(type: string): { tier: 1 | 2 | 3; weight: number } {
  return RELATION_META[type as RelationType] ?? RELATION_META.ambiguous
}

function relationLink(source: string, target: string, type: string, chapter: number, options: Partial<RelationshipLink> = {}): RelationshipLink {
  const meta = relationMeta(type)
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
    kind: options.kind ?? 'relationship',
    sourceKind: options.sourceKind,
    recordId: options.recordId,
    periodId: options.periodId,
    temporalStatus: options.temporalStatus,
    relationshipStatus: options.relationshipStatus,
    startChapter: options.startChapter,
    endChapter: options.endChapter,
    direction: options.direction ?? 'undirected',
    evidence: options.evidence,
    label: options.label,
    color: options.color,
  }
}

function edgeKey(link: Pick<RelationshipLink, 'source' | 'target' | 'kind' | 'direction'>): string {
  const endpoints = link.direction === 'undirected' ? [link.source, link.target].sort() : [link.source, link.target]
  return `${link.kind ?? 'relationship'}::${link.direction ?? 'undirected'}::${endpoints.join('::')}`
}

function relationshipEdgeKey(link: RelationshipLink): string {
  const base = edgeKey(link)
  if (link.temporalStatus !== 'historical') return base
  return `${base}::history::${link.recordId ?? 'relationship'}::${link.periodId ?? 'period'}`
}

function mergeDescription(existing: string | undefined, next: string | undefined): string | undefined {
  if (!existing) return next
  if (!next || existing.includes(next)) return existing
  return `${existing}；${next}`
}

function mergeLinkMetadata(existing: RelationshipLink, next: RelationshipLink): void {
  existing.mentions += next.mentions
  existing.firstMentioned = Math.min(existing.firstMentioned, next.firstMentioned)
  existing.lastMentioned = Math.max(existing.lastMentioned, next.lastMentioned)
  existing.weight += next.weight
  existing.strength = Math.min(1, existing.strength + next.strength)
  existing.description = mergeDescription(existing.description, next.description)
  existing.evidence = [...new Set([...(existing.evidence ?? []), ...(next.evidence ?? [])])]
  existing.structural = Boolean(existing.structural && next.structural)
}

function sameUnorderedEndpoints(left: RelationshipLink, right: RelationshipLink): boolean {
  return (left.source === right.source && left.target === right.target) || (left.source === right.target && left.target === right.source)
}

export function appendEvidenceToCurrentManualRelationship(links: Iterable<RelationshipLink>, evidence: RelationshipLink): boolean {
  for (const link of links) {
    if (link.kind !== 'relationship' || link.sourceKind !== 'manual' || link.temporalStatus !== 'current') continue
    if (!sameUnorderedEndpoints(link, evidence)) continue
    mergeLinkMetadata(link, evidence)
    return true
  }
  return false
}

/** A merge key includes kind and stable endpoints, so analysis can never overwrite a manual relationship. */
function mergeEdge(linkMap: Map<string, RelationshipLink>, nodes: Map<string, GraphNode>, next: RelationshipLink): void {
  if (!nodes.has(next.source) || !nodes.has(next.target) || next.source === next.target) return
  const key = relationshipEdgeKey(next)
  const existing = linkMap.get(key)
  if (!existing) {
    linkMap.set(key, next)
    return
  }
  mergeLinkMetadata(existing, next)
}

function relationshipEndpoints(record: CharacterRelationship): { source: string; target: string; direction: RelationshipLink['direction'] } {
  let source = characterNodeId(record.characterAId)
  let target = characterNodeId(record.characterBId)
  if (record.direction === 'b-to-a') [source, target] = [target, source]
  return { source, target, direction: record.direction === 'undirected' ? 'undirected' : 'a-to-b' }
}

function manualPeriodLink(
  record: CharacterRelationship,
  period: RelationshipPeriod,
  temporalStatus: NonNullable<RelationshipLink['temporalStatus']>,
  config: CharacterModuleConfig,
): RelationshipLink {
  const { source, target, direction } = relationshipEndpoints(record)
  const definition = config.relationshipTypes.find((candidate) => candidate.id === period.typeId)
  return relationLink(source, target, period.typeId, 0, {
    kind: 'relationship',
    sourceKind: 'manual',
    recordId: record.id,
    periodId: period.id,
    temporalStatus,
    relationshipStatus: period.status,
    startChapter: period.startChapter,
    endChapter: period.endChapter,
    direction,
    description: period.description || record.notes,
    evidence: [temporalStatus === 'current' ? '作者确认' : '作者确认 · 历史阶段'],
    tier: definition?.tier,
    weight: definition?.weight,
    label: definition?.label,
    color: definition?.color,
  })
}

export function buildManualRelationshipLinks(
  records: CharacterRelationship[],
  config: CharacterModuleConfig,
): RelationshipLink[] {
  const links: RelationshipLink[] = []
  for (const record of records) {
    const current = currentRelationshipPeriod(record)
    if (current) links.push(manualPeriodLink(record, current, 'current', config))
    for (const period of record.periods) {
      if (period !== current) links.push(manualPeriodLink(record, period, 'historical', config))
    }
  }
  return links
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
    const manualSignal = link.sourceKind === 'manual' ? 1 : 0
    const explicitSignal = link.sourceKind === 'snapshot' && link.kind === 'relationship' ? 1 : 0
    const coOccurrenceSignal = link.sourceKind === 'co-occurrence' ? Math.min(2, Math.log1p(link.mentions)) : 0
    const commonNeighborSignal = Math.min(2, commonNeighborScore(graph, link.source, link.target))
    const typeAffinitySignal = source.type === target.type ? 0.4 : 1
    const relationStrengthSignal = link.weight / 1.5
    const weighted = manualSignal * 5 + explicitSignal * 3 + coOccurrenceSignal * 4 + commonNeighborSignal * 1.5 + typeAffinitySignal + relationStrengthSignal * 1.5
    const structuralFactor = link.structural ? 0.45 : 1
    link.weight = Math.max(0.2, Number((weighted * structuralFactor).toFixed(2)))
    link.strength = Math.max(0.05, Math.min(1, Number((link.weight / 10).toFixed(2))))
    if (description) graph.setEdgeAttribute(key, 'description', description)
    graph.setEdgeAttribute(key, 'weight', link.weight)
    graph.setEdgeAttribute(key, 'strength', link.strength)
  }
}

export async function loadChapterSnapshots(projectId: string): Promise<ChapterSnapshot[]> {
  const snapshotFiles = await listProjectFiles(projectId, SNAPSHOT_DIR).catch(() => [])
  const snapshots: ChapterSnapshot[] = []
  for (const file of snapshotFiles) {
    if (!file.name.endsWith('.snapshot.json')) continue
    try { snapshots.push(JSON.parse(await readProjectFile(projectId, SNAPSHOT_DIR, file.name)) as ChapterSnapshot) } catch { /* malformed evidence is ignored */ }
  }
  return snapshots.sort((left, right) => left.chapterNumber - right.chapterNumber)
}

export async function loadRelationshipGraph(projectId: string): Promise<RelationshipGraph> {
  const nodeMap = new Map<string, GraphNode>()
  const linkMap = new Map<string, RelationshipLink>()
  const [chapters, snapshots, config, organizations] = await Promise.all([
    listChapters(projectId).catch(() => []),
    loadChapterSnapshots(projectId),
    loadCharacterModuleConfig(projectId),
    loadOrganizations(projectId),
  ])
  const { catalog } = await loadCharacterCatalog(projectId, config)
  const relationships = await loadCharacterRelationships(projectId)
  validateRelationshipStore(relationships, new Set(catalog.records.map((record) => record.id)))
  const makeLink = (source: string, target: string, type: string, chapter: number, options: Partial<RelationshipLink> = {}) => {
    const definition = config.relationshipTypes.find((candidate) => candidate.id === type)
    return relationLink(source, target, type, chapter, {
      ...options,
      tier: options.tier ?? definition?.tier,
      weight: options.weight ?? definition?.weight,
      label: options.label ?? definition?.label,
      color: options.color ?? definition?.color,
    })
  }

  // 1. Stable directory nodes and author-maintained organization hierarchy.
  const organizationById = new Map(organizations.organizations.map((organization) => [organization.id, organization]))
  for (const organization of organizations.organizations) {
    const id = organizationNodeId(organization.id)
    ensureNode(nodeMap, id, organization.name, 'organization', organization.status)
    if (organization.parentId && organizationById.has(organization.parentId)) {
      mergeEdge(linkMap, nodeMap, makeLink(organizationNodeId(organization.parentId), id, 'ambiguous', 0, {
        kind: 'organizationHierarchy', sourceKind: 'catalog', structural: true, description: '组织层级', direction: 'a-to-b',
      }))
    }
  }
  for (const record of catalog.records) {
    const node = ensureNode(nodeMap, characterNodeId(record.id), record.name, 'character', record.stanceId)
    node.tags = record.tags
    for (const affiliation of record.affiliations) {
      const organization = organizationById.get(affiliation.organizationId)
      const current = affiliation.periods.find((period) => !period.endChapter && period.status !== 'former')
      if (!organization || !current) continue
      mergeEdge(linkMap, nodeMap, makeLink(node.id, organizationNodeId(organization.id), 'ambiguous', 0, {
        kind: 'affiliation', sourceKind: 'catalog', structural: true, description: current.role ? `组织归属：${current.role}` : '组织归属', recordId: affiliation.organizationId,
      }))
    }
  }

  // 2. Author-confirmed relationships are distinct from every evidence edge.
  for (const link of buildManualRelationshipLinks(relationships.relationships, config)) mergeEdge(linkMap, nodeMap, link)

  const chapterByNumber = new Map<number, string>()
  const orderedChapters = buildChapterSequence(chapters).chapters
  orderedChapters.forEach((chapter, index) => {
    const chapterNumber = index + 1
    const id = chapterNodeId({ volume: chapter.volume, chapterId: chapter.id })
    chapterByNumber.set(chapterNumber, id)
    const node = ensureNode(nodeMap, id, `${chapter.volume} · ${chapter.title || chapter.id}`, 'chapter', 'chapter')
    node.firstAppearance = chapterNumber
    node.lastAppearance = chapterNumber
    node.appearanceCount = 1
  })

  // 3. Snapshots contribute evidence only; unresolved names are intentionally not materialized as ghost nodes.
  const coOccurrences = new Map<string, { source: string; target: string; count: number; first: number; last: number }>()
  for (const snapshot of snapshots) {
    const chapterNode = chapterByNumber.get(snapshot.chapterNumber)
    const fallbackChapterId = `ch${String(snapshot.chapterNumber).padStart(3, '0')}`
    const seenCharacters = new Set<string>()
    for (const name of snapshot.characters) {
      const resolved = resolveCharacterName(catalog.records, name).characterId
      if (!resolved) continue
      const characterId = characterNodeId(resolved)
      const node = nodeMap.get(characterId)
      if (!node) continue
      seenCharacters.add(characterId)
      node.firstAppearance = node.firstAppearance === 0 ? snapshot.chapterNumber : Math.min(node.firstAppearance, snapshot.chapterNumber)
      node.lastAppearance = Math.max(node.lastAppearance, snapshot.chapterNumber)
      node.appearanceCount++
      if (chapterNode) mergeEdge(linkMap, nodeMap, makeLink(chapterNode, characterId, 'ambiguous', snapshot.chapterNumber, { kind: 'participation', sourceKind: 'snapshot', structural: true, description: '章节出场' }))
    }
    for (const location of snapshot.locations) {
      const id = locationNodeId(location)
      const node = ensureNode(nodeMap, id, location, 'location', 'location')
      node.firstAppearance = node.firstAppearance === 0 ? snapshot.chapterNumber : Math.min(node.firstAppearance, snapshot.chapterNumber)
      node.lastAppearance = Math.max(node.lastAppearance, snapshot.chapterNumber)
      node.appearanceCount++
      if (chapterNode) mergeEdge(linkMap, nodeMap, makeLink(chapterNode, id, 'ambiguous', snapshot.chapterNumber, { kind: 'participation', sourceKind: 'snapshot', structural: true, description: '章节地点' }))
    }
    for (const item of snapshot.items) {
      const id = itemNodeId(item)
      const node = ensureNode(nodeMap, id, item, 'item', 'item')
      node.firstAppearance = node.firstAppearance === 0 ? snapshot.chapterNumber : Math.min(node.firstAppearance, snapshot.chapterNumber)
      node.lastAppearance = Math.max(node.lastAppearance, snapshot.chapterNumber)
      node.appearanceCount++
      if (chapterNode) mergeEdge(linkMap, nodeMap, makeLink(chapterNode, id, 'ambiguous', snapshot.chapterNumber, { kind: 'participation', sourceKind: 'snapshot', structural: true, description: '章节物品' }))
    }
    snapshot.timelineEvents.forEach((event, index) => {
      const id = eventNodeId(chapterNode?.replace(/^chapter:/, '') ?? fallbackChapterId, index)
      const node = ensureNode(nodeMap, id, event, 'event', 'event')
      node.firstAppearance = snapshot.chapterNumber
      node.lastAppearance = snapshot.chapterNumber
      node.appearanceCount = 1
      if (chapterNode) mergeEdge(linkMap, nodeMap, makeLink(chapterNode, id, 'ambiguous', snapshot.chapterNumber, { kind: 'participation', sourceKind: 'snapshot', structural: true, description: '章节事件' }))
      for (const characterId of seenCharacters) mergeEdge(linkMap, nodeMap, makeLink(characterId, id, 'ambiguous', snapshot.chapterNumber, { kind: 'participation', sourceKind: 'snapshot', description: '角色参与事件' }))
    })
    for (const raw of snapshot.relationshipChanges) {
      const parsed = parseRelationshipChange(raw)
      if (!parsed) continue
      const left = resolveCharacterName(catalog.records, parsed.charA).characterId
      const right = resolveCharacterName(catalog.records, parsed.charB).characterId
      if (!left || !right) continue
      const type = mapRelationType(parsed.type)
      const evidence = makeLink(characterNodeId(left), characterNodeId(right), type, snapshot.chapterNumber, { kind: 'relationship', sourceKind: 'snapshot', description: raw, evidence: [`第${snapshot.chapterNumber}章`] })
      if (!appendEvidenceToCurrentManualRelationship(linkMap.values(), evidence)) mergeEdge(linkMap, nodeMap, evidence)
    }
    const characters = Array.from(seenCharacters)
    for (let index = 0; index < characters.length; index++) {
      for (let next = index + 1; next < characters.length; next++) {
        const source = characters[index]!
        const target = characters[next]!
        const key = `${source}::${target}`
        const existing = coOccurrences.get(key)
        if (existing) { existing.count++; existing.last = snapshot.chapterNumber }
        else coOccurrences.set(key, { source, target, count: 1, first: snapshot.chapterNumber, last: snapshot.chapterNumber })
      }
    }
  }
  for (const occurrence of coOccurrences.values()) {
    if (occurrence.count < 2) continue
    mergeEdge(linkMap, nodeMap, makeLink(occurrence.source, occurrence.target, 'ambiguous', occurrence.first, {
      kind: 'appearance', sourceKind: 'co-occurrence', firstMentioned: occurrence.first, lastMentioned: occurrence.last, mentions: occurrence.count,
      description: `共同出场 ${occurrence.count} 次`, evidence: [`第${occurrence.first}–${occurrence.last}章`],
    }))
  }

  // 4. Foreshadow links use stable IDs when available and otherwise resolve old display names through aliases.
  try {
    const store = await loadForeshadows(projectId)
    for (const entry of store.entries) {
      if (entry.status === 'abandoned') continue
      const fsId = foreshadowingNodeId(entry.id)
      const node = ensureNode(nodeMap, fsId, entry.name, 'foreshadowing', entry.status)
      node.tags = [entry.category, entry.status]
      const chapterRefs = [entry.plantedChapter, ...entry.progress.map((progress) => progress.chapter), entry.recordedResolutionChapter].filter((reference): reference is ChapterRef => Boolean(reference))
      for (const chapterRef of chapterRefs) {
        const id = chapterNodeId(chapterRef)
        if (nodeMap.has(id)) mergeEdge(linkMap, nodeMap, makeLink(fsId, id, 'ambiguous', 0, { kind: 'foreshadowing', sourceKind: 'foreshadowing', structural: true, description: '伏笔章节关联' }))
      }
      const characterIds = entry.relatedCharacterIds ?? entry.relatedCharacters.flatMap((name) => resolveCharacterName(catalog.records, name).characterId ?? [])
      for (const characterId of characterIds) {
        const id = characterNodeId(characterId)
        if (nodeMap.has(id)) mergeEdge(linkMap, nodeMap, makeLink(fsId, id, 'ambiguous', 0, { kind: 'foreshadowing', sourceKind: 'foreshadowing', description: '伏笔角色关联' }))
      }
    }
  } catch { /* no readable foreshadow store */ }

  const graph = new Graph({ type: 'undirected', multi: true })
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
  } catch { /* isolated or sparse graphs retain the default community */ }
  graph.forEachNode((nodeId) => {
    const node = nodeMap.get(nodeId)
    if (node) node.linkCount = graph.degree(nodeId)
  })
  return { nodes: Array.from(nodeMap.values()), links: Array.from(linkMap.values()), insights: computeGraphInsights(graph) }
}
