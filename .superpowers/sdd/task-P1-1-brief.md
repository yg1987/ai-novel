# Task P1-1: Relationship Data Model + Store

**Files:**
- Create: `src/services/relationshipStore.ts`
- Modify: `src/types/novel.ts` (add relationship types)

**Interfaces:**
- Consumes: `listProjectFiles(projectId, 'characters')`, `readProjectFile(projectId, 'memory/snapshots', ...)`, `readProjectFile(projectId, 'memory', 'character-states.json')` — all from `../api/tauri`
- Produces: typed `RelationshipGraph` with nodes + links

**Data Model:** The relationship graph is derived from two sources:
1. Character files in `characters/` directory (each `.md` filename = node)
2. `relationshipChanges` from chapter snapshots in `memory/snapshots/*.snapshot.json`
3. `character-states.json` character cognition data (adds depth)

## Existing Types

These types are already defined in `src/types/novel.ts` and should be preserved:

```typescript
export interface ChapterSnapshot {
  chapterNumber: number
  chapterTitle: string
  summary: string
  characters: string[]
  locations: string[]
  items: string[]
  characterStateChanges: string[]
  relationshipChanges: string[]      // "林烬 → 盟友 → 苏婉"
  knowledgeChanges: string[]
  foreshadowingChanges: string[]
  timelineEvents: string[]
  endingHook: string
  qualityScore?: number
  suggestions?: string[]
}
```

## Step-by-Step

### Step 1: Add relationship types to `src/types/novel.ts`

Append to the end of existing file:

```typescript
// ─── Relationship Graph (v0.5) ────────────────────

export interface GraphNode {
  id: string
  label: string
  group: string               // 'protagonist' | 'supporter' | 'antagonist' | 'neutral'
  firstAppearance: number     // chapter number
  lastAppearance: number
  appearanceCount: number
  tags: string[]              // from character card tags if available
}

export type RelationType = 'ally' | 'rival' | 'family' | 'mentor' | 'enemy' | 'friend' | 'love' | 'ambiguous'

export interface RelationshipLink {
  source: string              // character name
  target: string              // character name
  type: RelationType
  strength: number            // 0.0 - 1.0, computed from co-occurrence count
  firstMentioned: number      // chapter number
  lastMentioned: number
  mentions: number            // how many chapters mention this relationship
  description?: string        // from relationshipChanges if available
}

export interface RelationshipGraph {
  nodes: GraphNode[]
  links: RelationshipLink[]
}
```

### Step 2: Create `src/services/relationshipStore.ts`

```typescript
// src/services/relationshipStore.ts
import { listProjectFiles, readProjectFile } from '../api/tauri'
import type { GraphNode, RelationshipLink, RelationshipGraph, ChapterSnapshot } from '../types/novel'

const SNAPSHOT_DIR = 'memory/snapshots'
const COGNITION_FILE = 'character-states.json'
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
  if (lower.includes('盟友') || lower.includes('朋友') || lower.includes('同伴')) return 'ally'
  if (lower.includes('敌人') || lower.includes('对手') || lower.includes('仇')) return 'enemy'
  if (lower.includes('家人') || lower.includes('兄弟') || lower.includes('父子') || lower.includes('母女')) return 'family'
  if (lower.includes('师徒') || lower.includes('老师') || lower.includes('弟子')) return 'mentor'
  if (lower.includes('恋人') || lower.includes('爱') || lower.includes('夫妻')) return 'love'
  if (lower.includes('竞争') || lower.includes('rival')) return 'rival'
  if (lower.includes('朋友') || lower.includes('好友')) return 'friend'
  return 'ambiguous'
}
```

### Step 3: Verify and commit

Run: `npx tsc --noEmit` — expect clean pass (no output)

```bash
git add src/types/novel.ts src/services/relationshipStore.ts
git commit -m "feat(graph): add relationship data model and store service"
```

## Global Constraints (binding)

- No `as any`, `@ts-ignore`, or `@ts-expect-error` allowed
- TypeScript strict mode — new types go in `src/types/`
- Every new file must have clean `lsp_diagnostics` before commit
- Every change must pass `npx tsc --noEmit`
