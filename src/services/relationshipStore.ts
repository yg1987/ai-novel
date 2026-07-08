// src/services/relationshipStore.ts
import { listProjectFiles, readProjectFile } from '../api/tauri'
import type { GraphNode, RelationshipLink, RelationshipGraph, ChapterSnapshot } from '../types/novel'

const SNAPSHOT_DIR = 'memory/snapshots'
const CHARACTER_DIR = 'characters'

const RELATION_PATTERN = /^\s*(.+?)\s*→\s*(.+?)\s*→\s*(.+?)\s*$/

function parseRelationshipChange(raw: string): { charA: string; type: string; charB: string } | null {
  const m = RELATION_PATTERN.exec(raw)
  if (!m) return null
  return { charA: m[1]!.trim(), type: m[2]!.trim(), charB: m[3]!.trim() }
}

export async function loadRelationshipGraph(projectId: string): Promise<RelationshipGraph> {
  // 1. Load all character names
  const charFiles = await listProjectFiles(projectId, CHARACTER_DIR)
  const charNames = new Set(charFiles.map((f) => f.name.replace(/\.md$/i, '')))

  // 2. Load all chapter snapshots
  const snapshotFiles = await listProjectFiles(projectId, SNAPSHOT_DIR)
  const snapshots: ChapterSnapshot[] = []
  for (const f of snapshotFiles) {
    if (!f.name.endsWith('.snapshot.json')) continue
    try {
      const raw = await readProjectFile(projectId, SNAPSHOT_DIR, f.name)
      snapshots.push(JSON.parse(raw) as ChapterSnapshot)
    } catch { /* skip malformed */ }
  }
  snapshots.sort((a, b) => a.chapterNumber - b.chapterNumber)

  // 3. Build nodes from character files
  const nodeMap = new Map<string, GraphNode>()
  for (const name of charNames) {
    nodeMap.set(name, {
      id: name,
      label: name,
      group: 'neutral',
      firstAppearance: Infinity,
      lastAppearance: 0,
      appearanceCount: 0,
      tags: [],
    })
  }

  // 4. Track appearances and relationships from snapshots
  const linkMap = new Map<string, RelationshipLink>()

  for (const snap of snapshots) {
    const ch = snap.chapterNumber

    // Update node appearances
    for (const charName of snap.characters) {
      const node = nodeMap.get(charName)
      if (node) {
        if (ch < node.firstAppearance) node.firstAppearance = ch
        if (ch > node.lastAppearance) node.lastAppearance = ch
        node.appearanceCount++
      }
    }

    // Parse relationship changes
    for (const raw of snap.relationshipChanges) {
      const parsed = parseRelationshipChange(raw)
      if (!parsed) continue
      const { charA, type, charB } = parsed
      const key = [charA, charB].sort().join('::')
      const existing = linkMap.get(key)
      if (existing) {
        existing.strength = Math.min(1.0, existing.strength + 0.15)
        if (ch > existing.lastMentioned) existing.lastMentioned = ch
        existing.mentions++
      } else {
        linkMap.set(key, {
          source: charA,
          target: charB,
          type: mapRelationType(type),
          strength: 0.3,
          firstMentioned: ch,
          lastMentioned: ch,
          mentions: 1,
          description: raw,
        })
      }
    }
  }

  // 5. Infer co-occurrence links (characters appearing in same chapter without explicit relationship)
  for (const snap of snapshots) {
    const chars = snap.characters
    for (let i = 0; i < chars.length; i++) {
      for (let j = i + 1; j < chars.length; j++) {
        const key = [chars[i]!, chars[j]!].sort().join('::')
        if (!linkMap.has(key)) {
          linkMap.set(key, {
            source: chars[i]!,
            target: chars[j]!,
            type: 'ambiguous',
            strength: 0.1,
            firstMentioned: snap.chapterNumber,
            lastMentioned: snap.chapterNumber,
            mentions: 1,
          })
        }
      }
    }
  }

  return {
    nodes: Array.from(nodeMap.values()),
    links: Array.from(linkMap.values()),
  }
}

function mapRelationType(type: string): RelationshipLink['type'] {
  const lower = type.toLowerCase()
  if (lower.includes('盟友') || lower.includes('同伴')) return 'ally'
  if (lower.includes('敌人') || lower.includes('对手') || lower.includes('仇')) return 'enemy'
  if (lower.includes('家人') || lower.includes('兄弟') || lower.includes('父子') || lower.includes('母女')) return 'family'
  if (lower.includes('师徒') || lower.includes('老师') || lower.includes('弟子')) return 'mentor'
  if (lower.includes('恋人') || lower.includes('爱') || lower.includes('夫妻')) return 'love'
  if (lower.includes('竞争') || lower.includes('rival')) return 'rival'
  if (lower.includes('朋友') || lower.includes('好友')) return 'friend'
  return 'ambiguous'
}
