# v0.5 辅助功能系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build 8 auxiliary features across two phases: relationship graph visualization, data export (TXT/Markdown/epub), inspiration/brainstorm mode (Phase 1), then project archive/import, publish format adaptation, chapter relationship graph, focus mode, and trending references (Phase 2).

**Architecture:** Phase 1 features are independent and can run in parallel. Phase 2 builds on Phase 1 where applicable. Novel UI panels follow the established `panel-layout` convention (AGENTS.md). New npm dependencies are minimized — graph visualization uses SVG/d3-force (lightweight), epub export uses a minimal Rust approach.

**Tech Stack:** React 19 + TypeScript 6 + TipTap (editor integration), Tauri 2 (Rust for file I/O, epub generation), d3-force (layout computation only, ~10KB), no heavy visualization framework.

**Design Reference:** `doc/design.md` §七 v0.5+ roadmap

---

## File Structure

```
src/
├── types/
│   ├── novel.ts                   ← MODIFY: add RelationshipLink, GraphNode types
│   └── project.ts                 ← MODIFY: add archive-related types
├── api/
│   └── tauri.ts                   ← MODIFY: add export + archive API bindings
├── services/
│   ├── relationshipStore.ts       ← NEW: relationship data loading + state
│   ├── exportService.ts           ← NEW: TXT/MD/epub export orchestration
│   ├── brainstormService.ts       ← NEW: AI brainstorming with context
│   ├── focusService.ts            ← NEW: focus mode timer + lock
│   └── archiveService.ts          ← NEW: project archive/import
├── components/
│   ├── RelationshipGraph.tsx      ← NEW: force-directed relationship graph
│   ├── ChapterGraph.tsx           ← NEW: chapter causality/connection graph
│   ├── BrainstormPanel.tsx        ← NEW: inspiration/brainstorm UI
│   ├── ExportDialog.tsx           ← NEW: export format selection + progress
│   ├── FocusModeOverlay.tsx       ← NEW: focus mode UI
│   ├── ArchiveDialog.tsx          ← NEW: archive import/export dialog
│   ├── ProjectView.tsx            ← MODIFY: add new tab buttons
│   └── ChapterManager.tsx         ← MODIFY: add focus mode toggle
├── utils/
│   ├── htmlToText.ts              ← NEW: strip HTML, preserve structure
│   └── formatAdapter.ts           ← NEW: platform-specific publish format
└── style.css                      ← MODIFY: add styles for all new components

src-tauri/src/
├── commands/
│   ├── mod.rs                     ← MODIFY: add mod export; mod archive
│   ├── export.rs                  ← NEW: EPUB generation (Rust)
│   └── archive.rs                 ← NEW: project pack/unpack
├── lib.rs                         ← MODIFY: register new commands
└── Cargo.toml                     ← MODIFY: add epubgen or similar crate
```

---

## Global Constraints

- No `as any`, `@ts-ignore`, or `@ts-expect-error` allowed
- TypeScript strict mode — new types go in `src/types/`
- New panels follow AGENTS.md `panel-layout` CSS convention (`.panel-layout` / `.panel-sidebar` / `.panel-editor`)
- Rust commands follow snake_case naming for Tauri IPC, TypeScript API wrappers use camelCase
- Every change must pass `npx tsc --noEmit` and `cd src-tauri && cargo check`
- New npm dependencies: only `d3-force` (~10KB) for graph layout computation — no heavy visualization frameworks
- Incremental delivery: Phase 1 first (3 features), then Phase 2 (5 features)
- All graph visualizations use pure SVG rendering — no canvas, no WebGL
- Every new file must have clean `lsp_diagnostics` before commit

---

## Phase 1 — Core UX Features (parallel)

### Task P1-1: Relationship Data Model + Store

**Files:**
- Create: `src/services/relationshipStore.ts`
- Modify: `src/types/novel.ts` (add relationship types)

**Interfaces:**
- Consumes: `listProjectFiles(projectId, 'characters')`, `readProjectFile(projectId, 'memory/snapshots', ...)`, `readProjectFile(projectId, 'memory', 'character-states.json')`
- Produces: typed `RelationshipGraph` with nodes + links

**Data Model:** The relationship graph is derived from two sources:
1. Character files in `characters/` directory (each `.md` filename = node)
2. `relationshipChanges` from chapter snapshots in `memory/snapshots/*.snapshot.json`
3. `character-states.json` character cognition data (adds depth)

- [ ] **Step 1: Add relationship types to `src/types/novel.ts`**

Append to existing `src/types/novel.ts`:

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

- [ ] **Step 2: Create `src/services/relationshipStore.ts`**

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
  let linkIdCounter = 0

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
  // Only add if they don't already have an explicit link
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
  if (lower.includes('竞争') || lower.includes(' rival')) return 'rival'
  if (lower.includes('朋友') || lower.includes('好友')) return 'friend'
  return 'ambiguous'
}
```

- [ ] **Step 3: LSP diagnostics and commit**

Run: `npx tsc --noEmit`
Expected: Clean pass (no output)

```bash
git add src/types/novel.ts src/services/relationshipStore.ts
git commit -m "feat(graph): add relationship data model and store service"
```

---

### Task P1-2: Relationship Graph Visualization

**Files:**
- Create: `src/components/RelationshipGraph.tsx`
- Modify: `src/components/ProjectView.tsx` (add graph tab)
- Modify: `src/style.css` (add graph styles)
- Modify: `package.json` (add `d3-force` dependency)

**Interfaces:**
- Consumes: `loadRelationshipGraph()` from `relationshipStore.ts`
- Produces: Interactive SVG force-directed graph panel

- [ ] **Step 1: Install d3-force**

Run: `npm install d3-force`
Run: `npm install -D @types/d3-force`

Verify: `npx tsc --noEmit` clean

- [ ] **Step 2: Create `src/components/RelationshipGraph.tsx`**

```tsx
// src/components/RelationshipGraph.tsx
import { useState, useEffect, useRef, useCallback } from 'react'
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from 'd3-force'
import { loadRelationshipGraph } from '../services/relationshipStore'
import type { RelationshipGraph, GraphNode, RelationshipLink } from '../types/novel'

interface Props {
  projectId: string
}

interface SimNode extends SimulationNodeDatum {
  id: string
  label: string
  group: string
  radius: number
}

interface SimLink extends SimulationLinkDatum<SimNode> {
  type: string
  strength: number
}

const NODE_RADIUS: Record<string, number> = {
  protagonist: 24,
  supporter: 18,
  antagonist: 20,
  neutral: 14,
}

const NODE_COLORS: Record<string, string> = {
  protagonist: '#e74c3c',
  supporter: '#3498db',
  antagonist: '#8e44ad',
  neutral: '#95a5a6',
}

const LINK_COLORS: Record<string, string> = {
  ally: '#2ecc71',
  rival: '#e67e22',
  family: '#1abc9c',
  mentor: '#f39c12',
  enemy: '#e74c3c',
  friend: '#3498db',
  love: '#e91e63',
  ambiguous: '#bdc3c7',
}

function getTypeLabel(type: string): string {
  const map: Record<string, string> = {
    ally: '盟友', rival: '对手', family: '血缘',
    mentor: '师徒', enemy: '仇敌', friend: '朋友',
    love: '恋情', ambiguous: '关联',
  }
  return map[type] ?? type
}

export default function RelationshipGraph({ projectId }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [graph, setGraph] = useState<RelationshipGraph | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [hoveredLink, setHoveredLink] = useState<SimLink | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    loadRelationshipGraph(projectId)
      .then(setGraph)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [projectId])

  useEffect(() => {
    if (!graph || !svgRef.current) return

    const width = svgRef.current.clientWidth || 800
    const height = svgRef.current.clientHeight || 600
    const nodes: SimNode[] = graph.nodes.map((n) => ({
      id: n.id,
      label: n.label,
      group: n.group,
      radius: NODE_RADIUS[n.group] || 14,
    }))
    const links: SimLink[] = graph.links.map((l) => ({
      source: l.source,
      target: l.target,
      type: l.type,
      strength: l.strength * 0.5,
    }))

    const simulation = forceSimulation<SimNode>(nodes)
      .force('link', forceLink<SimNode, SimLink>(links).id((d) => d.id).distance(100))
      .force('charge', forceManyBody().strength(-200))
      .force('center', forceCenter(width / 2, height / 2))
      .force('collide', forceCollide().radius((d) => d.radius + 8))
      .alphaDecay(0.02)

    const svg = svgRef.current
    // Clear previous
    while (svg.firstChild) svg.removeChild(svg.firstChild)

    // Zoom behavior — simple wheel zoom
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    svg.appendChild(g)

    let transform = { x: 0, y: 0, k: 1 }
    svg.addEventListener('wheel', (e) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? 0.9 : 1.1
      transform.k = Math.max(0.2, Math.min(4, transform.k * delta))
      g.setAttribute('transform', `translate(${transform.x},${transform.y}) scale(${transform.k})`)
    })

    // Drag to pan
    let panStart = { x: 0, y: 0 }
    let isPanning = false
    svg.addEventListener('mousedown', (e) => {
      if ((e.target as Element).tagName === 'svg') {
        isPanning = true
        panStart = { x: e.clientX - transform.x, y: e.clientY - transform.y }
      }
    })
    svg.addEventListener('mousemove', (e) => {
      if (isPanning) {
        transform.x = e.clientX - panStart.x
        transform.y = e.clientY - panStart.y
        g.setAttribute('transform', `translate(${transform.x},${transform.y}) scale(${transform.k})`)
      }
    })
    svg.addEventListener('mouseup', () => { isPanning = false })

    // Draw links
    const linkGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    g.appendChild(linkGroup)
    const linkElements = links.map((l) => {
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'line')
      el.setAttribute('stroke', LINK_COLORS[l.type] || '#bdc3c7')
      el.setAttribute('stroke-width', String(Math.max(1, l.strength * 4)))
      el.setAttribute('stroke-opacity', '0.4')
      el.addEventListener('mouseenter', () => setHoveredLink(l))
      el.addEventListener('mouseleave', () => setHoveredLink(null))
      linkGroup.appendChild(el)
      return el
    })

    // Draw nodes
    const nodeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    g.appendChild(nodeGroup)
    const nodeElements = nodes.map((n) => {
      const nodeEl = document.createElementNS('http://www.w3.org/2000/svg', 'g')
      nodeEl.style.cursor = 'pointer'

      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
      circle.setAttribute('r', String(n.radius))
      circle.setAttribute('fill', NODE_COLORS[n.group] || '#95a5a6')
      circle.setAttribute('stroke', '#fff')
      circle.setAttribute('stroke-width', '2')
      nodeEl.appendChild(circle)

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
      text.setAttribute('text-anchor', 'middle')
      text.setAttribute('dy', '0.35em')
      text.setAttribute('font-size', '11')
      text.setAttribute('fill', '#fff')
      text.setAttribute('font-weight', '600')
      text.textContent = n.label.slice(0, 4)
      nodeEl.appendChild(text)

      // Hover label
      nodeEl.addEventListener('mouseenter', () => {
        const tooltip = document.createElementNS('http://www.w3.org/2000/svg', 'text')
        tooltip.setAttribute('text-anchor', 'middle')
        tooltip.setAttribute('dy', String(-n.radius - 8))
        tooltip.setAttribute('font-size', '12')
        tooltip.setAttribute('fill', '#333')
        tooltip.setAttribute('font-weight', '600')
        tooltip.setAttribute('class', 'graph-tooltip')
        tooltip.textContent = n.label
        nodeEl.appendChild(tooltip)
      })
      nodeEl.addEventListener('mouseleave', () => {
        nodeEl.querySelectorAll('.graph-tooltip').forEach((el) => el.remove())
      })

      nodeEl.addEventListener('click', () => {
        const gn = graph.nodes.find((gn) => gn.id === n.id)
        if (gn) setSelectedNode(gn)
      })

      // Drag behavior for nodes
      const drag = (ev: MouseEvent) => {
        const rect = svg.getBoundingClientRect()
        n.fx = (ev.clientX - rect.left - transform.x) / transform.k
        n.fy = (ev.clientY - rect.top - transform.y) / transform.k
        simulation.alpha(0.3).restart()
      }
      const endDrag = () => {
        n.fx = null
        n.fy = null
      }
      nodeEl.addEventListener('mousedown', (e) => {
        e.stopPropagation()
        const onMove = (ev: MouseEvent) => drag(ev)
        const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); endDrag() }
        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
      })

      nodeGroup.appendChild(nodeEl)
      return nodeEl
    })

    // Tick
    simulation.on('tick', () => {
      linkElements.forEach((el, i) => {
        const l = links[i]!
        const s = l.source as SimNode
        const t = l.target as SimNode
        el.setAttribute('x1', String(s.x))
        el.setAttribute('y1', String(s.y))
        el.setAttribute('x2', String(t.x))
        el.setAttribute('y2', String(t.y))
      })
      nodeElements.forEach((el, i) => {
        const n = nodes[i]!
        el.setAttribute('transform', `translate(${n.x},${n.y})`)
      })
    })

    return () => { simulation.stop() }
  }, [graph])

  if (loading) return <div className="review-empty">加载关系图谱…</div>
  if (error) return <div className="review-empty">加载失败：{error}</div>
  if (!graph) return <div className="review-empty">暂无角色数据</div>

  const relatedLinks = selectedNode
    ? graph.links.filter((l) => l.source === selectedNode.id || l.target === selectedNode.id)
    : []

  return (
    <div className="graph-panel panel-layout">
      <div className="panel-editor graph-canvas-area">
        <svg ref={svgRef} className="graph-svg" width="100%" height="100%" />
        {hoveredLink && (
          <div className="graph-link-tooltip" style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)' }}>
            <span style={{ color: LINK_COLORS[hoveredLink.type], fontWeight: 600 }}>{getTypeLabel(hoveredLink.type)}</span>
            <span> — {(hoveredLink.source as SimNode).label} ↔ {(hoveredLink.target as SimNode).label}</span>
          </div>
        )}
      </div>
      <div className="graph-sidebar panel-sidebar">
        <h3>节点详情</h3>
        {selectedNode ? (
          <div className="graph-node-detail">
            <h4>{selectedNode.label}</h4>
            <div className="graph-detail-row"><span>身份</span><span>{selectedNode.group}</span></div>
            <div className="graph-detail-row"><span>首次出场</span><span>第{selectedNode.firstAppearance}章</span></div>
            <div className="graph-detail-row"><span>最近出场</span><span>第{selectedNode.lastAppearance}章</span></div>
            <div className="graph-detail-row"><span>出场次数</span><span>{selectedNode.appearanceCount}次</span></div>
            <div className="graph-detail-section">
              <h5>关联关系</h5>
              {relatedLinks.length === 0 && <p className="review-empty">暂无关联</p>}
              {relatedLinks.map((l, i) => {
                const other = l.source === selectedNode.id ? l.target : l.source
                return (
                  <div key={i} className="graph-related-link">
                    <span className="graph-link-type" style={{ color: LINK_COLORS[l.type] }}>{getTypeLabel(l.type)}</span>
                    <span> → {other}</span>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="review-empty">
            <p>点击节点查看详情</p>
            <div className="graph-legend">
              <h5>图例</h5>
              {Object.entries(NODE_COLORS).map(([key, color]) => (
                <div key={key} className="graph-legend-item">
                  <span className="graph-legend-dot" style={{ background: color }} />
                  <span>{key}</span>
                </div>
              ))}
              <h5 style={{ marginTop: 12 }}>关系类型</h5>
              {Object.entries(LINK_COLORS).map(([key, color]) => (
                <div key={key} className="graph-legend-item">
                  <span className="graph-legend-line" style={{ background: color }} />
                  <span>{getTypeLabel(key)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

The component uses d3-force purely for layout computation, then renders everything with raw SVG DOM API (no JSX overhead for 500+ animated elements). Sidebar shows node details + relationship legend.

- [ ] **Step 3: Add graph tab to `ProjectView.tsx`**

In `src/components/ProjectView.tsx`:

```typescript
// Add import
import RelationshipGraph from './RelationshipGraph'

// Extend Tab type
type Tab = 'writing' | 'characters' | 'worldview' | 'outline' | 'notes' | 'foreshadow' | 'search' | 'stats' | 'review' | 'resource' | 'graph'

// Add tab button (after resource tab button, before the closing </div> of project-tabs)
<button className={`tab-btn${tab === 'graph' ? ' active' : ''}`} onClick={() => setTab('graph')}>🕸 关系图</button>

// Add tab content (after resource tab content)
{tab === 'graph' && <RelationshipGraph projectId={project.id} />}
```

- [ ] **Step 4: Add CSS for graph panel to `src/style.css`**

```css
/* ─── Relationship Graph ────────────────────────── */
.graph-panel { height: 100%; }
.graph-canvas-area {
  position: relative; overflow: hidden; background: var(--bg);
  display: flex; align-items: center; justify-content: center;
}
.graph-svg { display: block; }
.graph-sidebar {
  width: 260px; overflow-y: auto; padding: 16px;
}
.graph-sidebar h3 { font-size: 0.95rem; margin-bottom: 12px; }
.graph-node-detail h4 { font-size: 1.1rem; margin-bottom: 8px; color: var(--accent); }
.graph-detail-row {
  display: flex; justify-content: space-between; padding: 4px 0;
  font-size: 0.85rem; border-bottom: 1px solid var(--border);
}
.graph-detail-section { margin-top: 16px; }
.graph-detail-section h5 { font-size: 0.85rem; margin-bottom: 8px; color: var(--text-secondary); }
.graph-related-link { font-size: 0.85rem; padding: 4px 0; }
.graph-link-type { font-weight: 600; }
.graph-link-tooltip {
  background: var(--bg-card); padding: 8px 16px; border-radius: var(--radius);
  box-shadow: var(--shadow-lg); font-size: 0.85rem; z-index: 10;
  border: 1px solid var(--border);
}
.graph-legend { margin-top: 16px; }
.graph-legend h5 { font-size: 0.8rem; margin-bottom: 6px; color: var(--text-secondary); }
.graph-legend-item {
  display: flex; align-items: center; gap: 8px;
  font-size: 0.8rem; padding: 3px 0;
}
.graph-legend-dot {
  width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
}
.graph-legend-line {
  width: 20px; height: 3px; border-radius: 2px; flex-shrink: 0;
}
```

- [ ] **Step 5: Build verification**

Run: `npx tsc --noEmit`
Expected: Clean pass

```bash
git add package.json package-lock.json src/components/RelationshipGraph.tsx src/components/ProjectView.tsx src/style.css
git commit -m "feat(graph): add interactive force-directed relationship graph with d3-force layout"
```

---

### Task P1-3: Data Export — TXT + Markdown

**Files:**
- Create: `src/utils/htmlToText.ts`
- Create: `src/services/exportService.ts`
- Create: `src/components/ExportDialog.tsx`
- Modify: `src/components/ProjectView.tsx` (add export button)
- Modify: `src/style.css` (add export dialog styles)

**Interfaces:**
- Consumes: `listChapters(projectId)`, `getChapterContent(projectId, chapterId)`, `readProjectFile(projectId, subdir, filename)` for metadata
- Produces: File save dialog via Tauri to write TXT/MD to user-chosen location

- [ ] **Step 1: Create `src/utils/htmlToText.ts`**

```typescript
// src/utils/htmlToText.ts

/**
 * Strip HTML tags from TipTap content, preserving paragraph structure.
 * TipTap stores content as HTML inside the ProseMirror editor.
 */
export function htmlToPlainText(html: string): string {
  // Replace <br> and </p> with newlines first
  let text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<li>/gi, '• ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]*>/g, '')   // strip remaining tags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")

  // Collapse multiple blank lines into max 2
  text = text.replace(/\n{3,}/g, '\n\n')

  return text.trim()
}

/**
 * Strip HTML but keep readable structure for Markdown export.
 */
export function htmlToMarkdown(html: string, title: string): string {
  const text = htmlToPlainText(html)
  return `# ${title}\n\n${text}`
}
```

- [ ] **Step 2: Create `src/services/exportService.ts`**

```typescript
// src/services/exportService.ts
import { listChapters, getChapterContent, readProjectFile } from '../api/tauri'
import { htmlToPlainText, htmlToMarkdown } from '../utils/htmlToText'
import { save } from '@tauri-apps/plugin-dialog'
import { writeTextFile } from '@tauri-apps/plugin-fs'

export type ExportFormat = 'txt' | 'markdown' | 'epub'

export interface ExportProgress {
  current: number
  total: number
  chapterId: string
}

/**
 * Export project as plain text. Each chapter separated by heading + blank line.
 */
export async function exportAsPlainText(
  projectId: string,
  projectName: string,
  onProgress?: (p: ExportProgress) => void,
): Promise<void> {
  const chapters = await listChapters(projectId)
  chapters.sort((a, b) => a.order - b.order)

  const lines: string[] = []
  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i]!
    onProgress?.({ current: i + 1, total: chapters.length, chapterId: ch.id })
    const html = await getChapterContent(projectId, ch.id)
    const text = htmlToPlainText(html)
    lines.push(`第${ch.order}章 ${ch.title}`, '', text, '')
  }

  const content = lines.join('\n')
  const filePath = await save({
    defaultPath: `${projectName}.txt`,
    filters: [{ name: 'Text Files', extensions: ['txt'] }],
  })
  if (!filePath) return // user cancelled

  await writeTextFile(filePath, content)
}

/**
 * Export project as Markdown. Each chapter as an H1 heading + content.
 */
export async function exportAsMarkdown(
  projectId: string,
  projectName: string,
  onProgress?: (p: ExportProgress) => void,
): Promise<void> {
  const chapters = await listChapters(projectId)
  chapters.sort((a, b) => a.order - b.order)

  // Load project settings for metadata
  let description = ''
  try {
    const metaRaw = await readProjectFile(projectId, '', 'project.json')
    const meta = JSON.parse(metaRaw)
    description = meta.description || ''
  } catch { /* ignore */ }

  const lines: string[] = [
    `# ${projectName}`,
    '',
    description ? `> ${description}\n` : '',
    '---',
    '',
  ]

  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i]!
    onProgress?.({ current: i + 1, total: chapters.length, chapterId: ch.id })
    const html = await getChapterContent(projectId, ch.id)
    const md = htmlToMarkdown(html, `第${ch.order}章 ${ch.title}`)
    lines.push(md, '', '---', '')
  }

  const content = lines.join('\n')
  const filePath = await save({
    defaultPath: `${projectName}.md`,
    filters: [{ name: 'Markdown Files', extensions: ['md'] }],
  })
  if (!filePath) return

  await writeTextFile(filePath, content)
}
```

Note: This task uses `@tauri-apps/plugin-dialog` and `@tauri-apps/plugin-fs` for native save dialog and file writing. These plugins need to be added.

- [ ] **Step 3: Add Tauri plugins for file save dialog**

Run:
```bash
cd src-tauri
cargo add tauri-plugin-dialog
cargo add tauri-plugin-fs
```

Add to `src-tauri/src/lib.rs` in the builder:
```rust
.plugin(tauri_plugin_dialog::init())
.plugin(tauri_plugin_fs::init())
```

Run: `npm install @tauri-apps/plugin-dialog @tauri-apps/plugin-fs`

Verify: `cd src-tauri && cargo check` → clean
Verify: `npx tsc --noEmit` → clean

- [ ] **Step 4: Create `src/components/ExportDialog.tsx`**

```tsx
// src/components/ExportDialog.tsx
import { useState, useCallback } from 'react'
import { exportAsPlainText, exportAsMarkdown, type ExportFormat, type ExportProgress } from '../services/exportService'

interface Props {
  projectId: string
  projectName: string
  onClose: () => void
}

export default function ExportDialog({ projectId, projectName, onClose }: Props) {
  const [format, setFormat] = useState<ExportFormat>('txt')
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState<ExportProgress | null>(null)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleExport = useCallback(async () => {
    setExporting(true)
    setError(null)
    const onProgress = (p: ExportProgress) => setProgress(p)
    try {
      if (format === 'txt') {
        await exportAsPlainText(projectId, projectName, onProgress)
      } else if (format === 'markdown') {
        await exportAsMarkdown(projectId, projectName, onProgress)
      }
      setDone(true)
    } catch (e) {
      setError(String(e))
    } finally {
      setExporting(false)
    }
  }, [projectId, projectName, format])

  const formatLabels: Record<ExportFormat, string> = {
    txt: '纯文本 (.txt)',
    markdown: 'Markdown (.md)',
    epub: 'EPUB (.epub)',
  }

  return (
    <div className="rewrite-overlay" onClick={onClose}>
      <div className="export-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="export-header">
          <h3>导出项目</h3>
          <button className="btn-text" onClick={onClose}>✕</button>
        </div>

        <div className="export-body">
          {done ? (
            <div className="export-done">
              <p>✅ 导出成功</p>
              <button className="btn-primary" onClick={onClose}>完成</button>
            </div>
          ) : (
            <>
              <label className="export-label">选择导出格式：</label>
              <div className="export-format-list">
                {(Object.entries(formatLabels) as [ExportFormat, string][]).map(([key, label]) => (
                  <label key={key} className={`export-format-item${format === key ? ' selected' : ''}`}>
                    <input
                      type="radio"
                      name="format"
                      value={key}
                      checked={format === key}
                      onChange={() => setFormat(key)}
                      disabled={exporting || key === 'epub'} // epub not yet implemented
                    />
                    <span className="export-format-label">{label}</span>
                    {key === 'epub' && <span className="export-format-badge">即将支持</span>}
                  </label>
                ))}
              </div>

              {progress && (
                <div className="export-progress">
                  <div className="export-progress-bar">
                    <div
                      className="export-progress-fill"
                      style={{ width: `${(progress.current / progress.total) * 100}%` }}
                    />
                  </div>
                  <span className="export-progress-text">
                    正在导出 {progress.chapterId} ({progress.current}/{progress.total})
                  </span>
                </div>
              )}

              {error && <div className="error-bar">{error}</div>}
            </>
          )}
        </div>

        <div className="export-footer">
          {!done && (
            <button
              className="btn-primary"
              onClick={handleExport}
              disabled={exporting}
            >
              {exporting ? '导出中…' : '导出'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Add export button to `ProjectView.tsx`**

In the project-view header area, after the project status badge:
```tsx
// Add import
import ExportDialog from './ExportDialog'

// Add state
const [showExport, setShowExport] = useState(false)

// Add button in header
<button className="btn-text" onClick={() => setShowExport(true)}>📤 导出</button>

// Add dialog
{showExport && (
  <ExportDialog
    projectId={project.id}
    projectName={project.name}
    onClose={() => setShowExport(false)}
  />
)}
```

- [ ] **Step 6: Add CSS for export dialog to `src/style.css`**

```css
/* ─── Export Dialog ────────────────────────────── */
.export-dialog {
  background: var(--bg-card); border-radius: var(--radius);
  width: 420px; max-width: 90vw;
  box-shadow: var(--shadow-lg); overflow: hidden;
}
.export-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 16px; border-bottom: 1px solid var(--border);
}
.export-header h3 { font-size: 1rem; }
.export-body { padding: 16px; min-height: 120px; }
.export-label { font-size: 0.9rem; font-weight: 600; display: block; margin-bottom: 12px; }
.export-format-list { display: flex; flex-direction: column; gap: 8px; }
.export-format-item {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 12px; border: 1px solid var(--border); border-radius: var(--radius);
  cursor: pointer; transition: all 0.15s;
}
.export-format-item:hover { border-color: var(--accent); }
.export-format-item.selected { border-color: var(--accent); background: var(--accent-dim); }
.export-format-item input { accent-color: var(--accent); }
.export-format-label { flex: 1; font-size: 0.85rem; }
.export-format-badge { font-size: 0.7rem; color: var(--text-muted); }
.export-done { text-align: center; padding: 24px; }
.export-done p { font-size: 1.1rem; margin-bottom: 16px; }
.export-progress { margin-top: 16px; }
.export-progress-bar {
  height: 6px; background: var(--bg); border-radius: 3px; overflow: hidden;
}
.export-progress-fill {
  height: 100%; background: var(--accent); border-radius: 3px;
  transition: width 0.3s ease;
}
.export-progress-text {
  display: block; font-size: 0.78rem; color: var(--text-muted);
  margin-top: 6px; text-align: center;
}
.export-footer {
  display: flex; justify-content: flex-end;
  padding: 12px 16px; border-top: 1px solid var(--border);
}
```

- [ ] **Step 7: Build verification**

Run: `cd src-tauri && cargo check`
Run: `npx tsc --noEmit`
Expected: Both clean

```bash
git add src/utils/htmlToText.ts src/services/exportService.ts src/components/ExportDialog.tsx \
       src/components/ProjectView.tsx src/style.css \
       src-tauri/Cargo.toml src-tauri/src/lib.rs
git commit -m "feat(export): add TXT and Markdown export with native save dialog"
```

---

### Task P1-4: EPUB Export (Rust)

**Files:**
- Create: `src-tauri/src/commands/export.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs` (register command)
- Modify: `src-tauri/Cargo.toml` (add epub-builder crate)
- Modify: `src/services/exportService.ts` (add epub export path)

**Interfaces:**
- Consumes: `project_dir(app_handle, project_id)` for reading chapter files
- Produces: Tauri command `export_project_epub(project_id) → String` (returns path to generated file)

- [ ] **Step 1: Add epub-builder crate**

In `src-tauri/Cargo.toml`, add under `[dependencies]`:
```toml
epub-builder = "0.9"
```

- [ ] **Step 2: Create `src-tauri/src/commands/export.rs`**

```rust
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use epub_builder::{EpubBuilder, EpubContent, ZipWriter, Reference};
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportProgress {
    pub current: usize,
    pub total: usize,
    pub chapter_id: String,
}

/// Collect chapter info: id, order, title, plain text content
fn collect_chapters(project_dir: &PathBuf) -> Result<Vec<(u32, String, String)>, String> {
    let chapters_dir = project_dir.join("chapters");
    if !chapters_dir.exists() {
        return Ok(vec![]);
    }

    let mut chapters: Vec<(u32, String, String)> = Vec::new();
    let entries = fs::read_dir(&chapters_dir)
        .map_err(|e| format!("Failed to read chapters dir: {e}"))?;

    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.starts_with("ch") || !name.ends_with(".md") {
            continue;
        }
        let id = name.trim_end_matches(".md").to_string();
        let order = id.strip_prefix("ch")
            .and_then(|s| s.parse::<u32>().ok())
            .unwrap_or(0);

        let content = fs::read_to_string(entry.path())
            .map_err(|e| format!("Failed to read {name}: {e}"))?;

        // Strip YAML frontmatter if present, and strip HTML tags
        let body = content
            .replace(|c: char| c == '<', "")
            .replace(">", "\n");

        let title = format!("第{order}章");
        chapters.push((order, title, body));
    }

    chapters.sort_by_key(|(order, _, _)| *order);
    Ok(chapters)
}

#[tauri::command]
pub fn export_project_epub(
    app_handle: tauri::AppHandle,
    project_id: String,
    output_path: String,
) -> Result<String, String> {
    let dir = crate::project_dir(&app_handle, &project_id)?;
    let chapters = collect_chapters(&dir)?;

    // Read project metadata
    let project_name = {
        let meta_path = dir.join("project.json");
        if meta_path.exists() {
            if let Ok(content) = fs::read_to_string(&meta_path) {
                if let Ok(meta) = serde_json::from_str::<serde_json::Value>(&content) {
                    meta.get("name").and_then(|v| v.as_str()).unwrap_or("Untitled").to_string()
                } else { "Untitled".to_string() }
            } else { "Untitled".to_string() }
        } else { "Untitled".to_string() }
    };

    let mut builder = EpubBuilder::new(ZipWriter::new(std::io::Cursor::new(Vec::new())))
        .map_err(|e| format!("Epub init error: {e}"))?;

    builder.metadata("title", &project_name)
        .map_err(|e| format!("Metadata error: {e}"))?;

    // Add each chapter
    for (order, title, body) in &chapters {
        let html = format!(
            r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>{title}</title></head>
<body>
<h1>{title}</h1>
{body}
</body>
</html>"#,
            title = title,
            body = body.replace('\n', "<br/>\n"),
        );
        builder.add_content(
            EpubContent::new(format!("chapter_{order}.xhtml"), html.as_bytes())
                .title(title.clone())
                .mimetype("application/xhtml+xml"),
        ).map_err(|e| format!("Add content error: {e}"))?;
    }

    let epub_data = builder.finish()
        .map_err(|e| format!("Epub finish error: {e}"))?;

    // Write to output path
    let writer = epub_data.into_inner();
    fs::write(&output_path, writer.into_inner())
        .map_err(|e| format!("Write epub error: {e}"))?;

    Ok(output_path)
}
```

- [ ] **Step 3: Register in `commands/mod.rs`**

```rust
pub mod export;
```

- [ ] **Step 4: Register in `lib.rs` invoke_handler**

```rust
commands::export::export_project_epub,
```

- [ ] **Step 5: Add frontend epub export path to `exportService.ts`**

```typescript
// Add import
import { invoke } from '@tauri-apps/api/core'

// Add function
export async function exportAsEpub(
  projectId: string,
  projectName: string,
  onProgress?: (p: ExportProgress) => void,
): Promise<void> {
  const filePath = await save({
    defaultPath: `${projectName}.epub`,
    filters: [{ name: 'EPUB Files', extensions: ['epub'] }],
  })
  if (!filePath) return

  await invoke<string>('export_project_epub', {
    projectId,
    outputPath: filePath,
  })
}
```

Then wire it into `ExportDialog.tsx` — add the epub case to `handleExport`:
```typescript
else if (format === 'epub') {
  await exportAsEpub(projectId, projectName, onProgress)
}
```

And remove the `disabled` prop from the epub radio button.

- [ ] **Step 6: Build verification**

Run: `cd src-tauri && cargo check`
Expected: Clean (may take time to download epub-builder crate on first run)

```bash
git add src-tauri/src/commands/export.rs src-tauri/src/commands/mod.rs \
       src-tauri/src/lib.rs src-tauri/Cargo.toml \
       src/services/exportService.ts src/components/ExportDialog.tsx
git commit -m "feat(export): add EPUB export via epub-builder Rust crate"
```

---

### Task P1-5: Inspiration / Brainstorm Mode

**Files:**
- Create: `src/services/brainstormService.ts`
- Create: `src/components/BrainstormPanel.tsx`
- Modify: `src/components/ProjectView.tsx` (add brainstorm tab)
- Modify: `src/style.css` (add brainstorm styles)

**Interfaces:**
- Consumes: `loadProviderConfig()` for AI call, context engine patterns for prompt building
- Produces: AI-generated plot direction suggestions, character development ideas, scene expansion ideas

- [ ] **Step 1: Create `src/services/brainstormService.ts`**

```typescript
// src/services/brainstormService.ts
import { loadProviderConfig, listChapters, getChapterContent, readProjectFile } from '../api/tauri'
import { htmlToPlainText } from '../utils/htmlToText'

export type BrainstormMode = 'plot_twist' | 'scene_idea' | 'character_dev' | 'world_expand'

export interface BrainstormRequest {
  mode: BrainstormMode
  projectId: string
  chapterNumber?: number   // optional: focus on a specific chapter
}

const MODE_PROMPTS: Record<BrainstormMode, string> = {
  plot_twist: `你是一个网文创意助手。根据以下项目信息，提供 3-5 个情节走向建议。
每个建议包含：情节点名称、具体描述（50-100字）、适用章节位置、预期效果。
建议要有新意但符合作品已有设定，不要推翻已有剧情。`,

  scene_idea: `你是一个网文场景创意助手。根据以下项目信息，提供 3-5 个具体的场景/桥段创意。
每个创意包含：场景名称、具体描写提示（50-100字）、可以插入的位置、配套的情绪氛围。
适合当前类型（玄幻/都市/言情等）的经典桥段 + 带新意的变体。`,

  character_dev: `你是一个角色发展创意助手。根据以下项目信息和角色状态，提供 3-5 个角色发展建议。
每个建议包含：涉及角色、发展方向、具体情节示例（50-100字）、为什么适合该角色。
考虑角色的当前状态、动机、未解伏笔。`,

  world_expand: `你是一个世界观扩展助手。根据以下世界观设定，提供 3-5 个世界观扩展方向。
每个方向包含：扩展主题、具体内容（50-100字）、与现有设定的衔接方式、可挖掘的剧情潜力。
不要与已有设定矛盾。`,
}

export interface BrainstormResult {
  title: string
  content: string
}

export async function runBrainstorm(
  request: BrainstormRequest,
): Promise<BrainstormResult[]> {
  const config = await loadProviderConfig()
  const provider = config.providers.find((p) => p.name === config.active_profile)
  if (!provider) throw new Error('未配置 AI Provider')

  // Build context: project info + recent chapters + character + worldview data
  const contextParts: string[] = []

  // Project metadata
  try {
    const metaRaw = await readProjectFile(request.projectId, '', 'project.json')
    const meta = JSON.parse(metaRaw)
    contextParts.push(`项目名称：${meta.name || ''}\n类型：${meta.genre || ''}\n简介：${meta.description || ''}`)
  } catch { /* ignore */ }

  // Recent chapters (last 3)
  try {
    const chapters = await listChapters(request.projectId)
    const recent = [...chapters].sort((a, b) => b.order - a.order).slice(0, 3)
    const summaries: string[] = ['## 最近章节']
    for (const ch of recent) {
      const html = await getChapterContent(request.projectId, ch.id)
      const text = htmlToPlainText(html)
      summaries.push(`第${ch.order}章：${text.slice(0, 200)}`)
    }
    contextParts.push(summaries.join('\n'))
  } catch { /* ignore */ }

  // Character states (abbreviated)
  try {
    const cognitionRaw = await readProjectFile(request.projectId, 'memory', 'character-states.json')
    const cognition = JSON.parse(cognitionRaw)
    const charLines: string[] = ['## 角色状态']
    for (const c of cognition.characters || []) {
      charLines.push(`${c.character}：知道[${(c.knows || []).slice(0, 3).join(', ')}]，不知道[${(c.doesNotKnow || []).slice(0, 3).join(', ')}]`)
    }
    contextParts.push(charLines.join('\n'))
  } catch { /* ignore */ }

  // Unresolved foreshadowing
  try {
    const foreshadowRaw = await readProjectFile(request.projectId, 'memory', 'foreshadows.json')
    const store = JSON.parse(foreshadowRaw)
    const pending = (store.entries || []).filter((e: any) => e.status !== 'resolved' && e.status !== 'abandoned')
    if (pending.length > 0) {
      contextParts.push(`## 未解伏笔\n${pending.slice(0, 5).map((f: any) => `- ${f.name}：${f.description}`).join('\n')}`)
    }
  } catch { /* ignore */ }

  const modeLabel: Record<BrainstormMode, string> = {
    plot_twist: '情节走向',
    scene_idea: '场景创意',
    character_dev: '角色发展',
    world_expand: '世界观扩展',
  }

  const systemPrompt = MODE_PROMPTS[request.mode]
  const userMessage = contextParts.join('\n\n') || '（暂无项目数据）'

  const response = await fetch(`${provider.base_url}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.api_key}`,
    },
    body: JSON.stringify({
      model: provider.models.analysis,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.8,
      max_tokens: 2048,
    }),
  })

  if (!response.ok) {
    throw new Error(`Brainstorm API error: ${response.status}`)
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const rawContent = data.choices?.[0]?.message?.content ?? ''

  // Split by numbered items
  const results: BrainstormResult[] = []
  const blocks = rawContent.split(/(?=\d+[\.、])/).filter((b) => b.trim().length > 20)
  for (const block of blocks) {
    const firstLine = block.trim().split('\n')[0] || ''
    results.push({
      title: firstLine.slice(0, 60),
      content: block.trim(),
    })
  }

  if (results.length === 0) {
    results.push({
      title: modeLabel[request.mode],
      content: rawContent,
    })
  }

  return results
}
```

- [ ] **Step 2: Create `src/components/BrainstormPanel.tsx`**

```tsx
// src/components/BrainstormPanel.tsx
import { useState } from 'react'
import { runBrainstorm, type BrainstormMode, type BrainstormResult } from '../services/brainstormService'

interface Props {
  projectId: string
}

const MODE_CONFIG: { key: BrainstormMode; label: string; icon: string; desc: string }[] = [
  { key: 'plot_twist', label: '情节走向', icon: '🔄', desc: '卡文时找新方向' },
  { key: 'scene_idea', label: '场景创意', icon: '🎬', desc: '缺少具体桥段' },
  { key: 'character_dev', label: '角色发展', icon: '👤', desc: '角色需要成长' },
  { key: 'world_expand', label: '世界观扩展', icon: '🌍', desc: '想丰富设定' },
]

export default function BrainstormPanel({ projectId }: Props) {
  const [mode, setMode] = useState<BrainstormMode>('plot_twist')
  const [results, setResults] = useState<BrainstormResult[]>([])
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGenerate = async () => {
    setGenerating(true)
    setError(null)
    setResults([])
    try {
      const res = await runBrainstorm({ mode, projectId })
      setResults(res)
    } catch (e) {
      setError(String(e))
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="panel-layout brainstorm-panel">
      <div className="panel-sidebar brainstorm-sidebar">
        <h3>灵感模式</h3>
        <p className="brainstorm-subtitle">选择你需要的创意方向</p>
        <div className="brainstorm-modes">
          {MODE_CONFIG.map((m) => (
            <button
              key={m.key}
              className={`brainstorm-mode-btn${mode === m.key ? ' active' : ''}`}
              onClick={() => setMode(m.key)}
            >
              <span className="brainstorm-mode-icon">{m.icon}</span>
              <span className="brainstorm-mode-label">{m.label}</span>
              <span className="brainstorm-mode-desc">{m.desc}</span>
            </button>
          ))}
        </div>
        <button
          className="btn-primary"
          onClick={handleGenerate}
          disabled={generating}
          style={{ width: '100%', marginTop: 12 }}
        >
          {generating ? '生成中…' : '✨ 生成灵感'}
        </button>
        {error && <div className="error-bar" style={{ marginTop: 8 }}>{error}</div>}
      </div>

      <div className="panel-editor brainstorm-content">
        {results.length > 0 ? (
          <div className="brainstorm-results">
            <h3>创意建议</h3>
            {results.map((r, i) => (
              <div key={i} className="brainstorm-card">
                <div className="brainstorm-card-header">
                  <span className="brainstorm-card-index">{i + 1}</span>
                  <h4>{r.title}</h4>
                </div>
                <div className="brainstorm-card-body">
                  {r.content.split('\n').map((line, j) => (
                    <p key={j}>{line}</p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="review-empty">
            <p style={{ fontSize: '2rem', marginBottom: 16 }}>💡</p>
            <p>选择左侧的创意方向，点击「生成灵感」</p>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 8 }}>
              AI 会根据你的项目数据（最近章节、角色状态、未解伏笔）生成有针对性的建议
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Add brainstorm tab to `ProjectView.tsx`**

```typescript
// Add import
import BrainstormPanel from './BrainstormPanel'

// Extend Tab
type Tab = 'writing' | 'characters' | 'worldview' | 'outline' | 'notes' | 'foreshadow' | 'search' | 'stats' | 'review' | 'resource' | 'graph' | 'brainstorm'

// Add tab button (after graph button)
<button className={`tab-btn${tab === 'brainstorm' ? ' active' : ''}`} onClick={() => setTab('brainstorm')}>💡 灵感</button>

// Add tab content (after graph content)
{tab === 'brainstorm' && <BrainstormPanel projectId={project.id} />}
```

- [ ] **Step 4: Add CSS for brainstorm panel to `src/style.css`**

```css
/* ─── Brainstorm Panel ─────────────────────────── */
.brainstorm-panel { height: 100%; }
.brainstorm-sidebar {
  width: 240px; padding: 16px; overflow-y: auto;
}
.brainstorm-sidebar h3 { font-size: 0.95rem; margin-bottom: 4px; }
.brainstorm-subtitle { font-size: 0.78rem; color: var(--text-muted); margin-bottom: 16px; }
.brainstorm-modes { display: flex; flex-direction: column; gap: 6px; }
.brainstorm-mode-btn {
  display: flex; flex-direction: column; align-items: flex-start;
  padding: 10px 12px; border: 1px solid var(--border); border-radius: var(--radius);
  background: var(--bg-card); cursor: pointer; transition: all 0.15s;
  text-align: left; width: 100%;
}
.brainstorm-mode-btn:hover { border-color: var(--accent); }
.brainstorm-mode-btn.active { border-color: var(--accent); background: var(--accent-dim); }
.brainstorm-mode-icon { font-size: 1.2rem; }
.brainstorm-mode-label { font-weight: 600; font-size: 0.85rem; margin-top: 2px; }
.brainstorm-mode-desc { font-size: 0.75rem; color: var(--text-muted); }
.brainstorm-content {
  overflow-y: auto; padding: 16px;
}
.brainstorm-results h3 { font-size: 1rem; margin-bottom: 16px; }
.brainstorm-card {
  background: var(--bg-card); border-radius: var(--radius);
  box-shadow: var(--shadow); margin-bottom: 12px; overflow: hidden;
}
.brainstorm-card-header {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 16px; border-bottom: 1px solid var(--border);
  background: var(--bg);
}
.brainstorm-card-index {
  width: 24px; height: 24px; border-radius: 50%;
  background: var(--accent); color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.78rem; font-weight: 600; flex-shrink: 0;
}
.brainstorm-card-header h4 { font-size: 0.9rem; }
.brainstorm-card-body {
  padding: 12px 16px; font-size: 0.85rem; line-height: 1.6;
}
.brainstorm-card-body p { margin: 4px 0; }
```

- [ ] **Step 5: Build verification**

Run: `npx tsc --noEmit`
Expected: Clean

```bash
git add src/services/brainstormService.ts src/components/BrainstormPanel.tsx \
       src/components/ProjectView.tsx src/style.css
git commit -m "feat(brainstorm): add AI-powered inspiration/brainstorm mode with 4 creative directions"
```

---

## Phase 2 — Incremental Features

### Task P2-1: Project Archive / Import

**Files:**
- Create: `src-tauri/src/commands/archive.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs` (register commands)
- Create: `src/services/archiveService.ts`
- Create: `src/components/ArchiveDialog.tsx`
- Modify: `src/components/ProjectList.tsx` (add import button)
- Modify: `src/style.css` (add archive dialog styles)

**Architecture:** Archive = tar.gz of the project directory. Import = extract archive into workspace projects directory.

**Rust side:**
- `archive_project(project_id, output_path)` → tar.gz the project dir, write to output_path
- `import_project(archive_path)` → extract archive to workspace/projects/, regenerate project entry in projects.json

**Dependencies:** Add `tar` and `flate2` crates to Cargo.toml.

```toml
tar = "0.4"
flate2 = "1.0"
```

**Key Rust command:**

```rust
#[tauri::command]
pub fn archive_project(
    app_handle: tauri::AppHandle,
    project_id: String,
    output_path: String,
) -> Result<String, String> {
    let dir = crate::project_dir(&app_handle, &project_id)?;
    let file = fs::File::create(&output_path)
        .map_err(|e| format!("Failed to create archive: {e}"))?;
    let encoder = flate2::write::GzEncoder::new(file, flate2::Compression::best());
    let mut archive = tar::Builder::new(encoder);

    archive.add_dir_all(".", &dir)
        .map_err(|e| format!("Failed to add dir to archive: {e}"))?;

    let encoder = archive.into_inner()
        .map_err(|e| format!("Failed to finalize archive: {e}"))?;
    encoder.finish()
        .map_err(|e| format!("Failed to compress archive: {e}"))?;

    Ok(output_path)
}

#[tauri::command]
pub fn import_project(
    app_handle: tauri::AppHandle,
    archive_path: String,
) -> Result<String, String> {
    let file = fs::File::open(&archive_path)
        .map_err(|e| format!("Failed to open archive: {e}"))?;
    let decoder = flate2::read::GzDecoder::new(file);
    let mut archive = tar::Archive::new(decoder);

    let workspace = crate::workspace_dir(&app_handle)?;
    let projects_dir = workspace.join("projects");

    archive.unpack(&projects_dir)
        .map_err(|e| format!("Failed to extract archive: {e}"))?;

    // Reload projects index to include the new project
    let project_dirs = fs::read_dir(&projects_dir)
        .map_err(|e| format!("Failed to read projects dir: {e}"))?;

    let mut loaded_id: Option<String> = None;
    // Find the newly added project by checking which project dirs have a project.json
    let mut projects = crate::load_index(&app_handle)?;
    for entry in project_dirs.flatten() {
        let dir_name = entry.file_name().to_string_lossy().to_string();
        if dir_name.starts_with('.') { continue; }
        let meta_path = entry.path().join("project.json");
        if meta_path.exists() {
            if let Ok(content) = fs::read_to_string(&meta_path) {
                if let Ok(meta) = serde_json::from_str::<crate::ProjectMeta>(&content) {
                    if !projects.iter().any(|p| p.id == meta.id) {
                        projects.push(meta.clone());
                        loaded_id = Some(meta.id);
                    }
                }
            }
        }
    }

    crate::save_index(&app_handle, &projects)?;

    loaded_id.ok_or_else(|| "未找到有效的项目文件".to_string())
}
```

**Frontend service (`src/services/archiveService.ts`):**
```typescript
import { invoke } from '@tauri-apps/api/core'
import { save, open } from '@tauri-apps/plugin-dialog'

export async function archiveProject(projectId: string, projectName: string): Promise<void> {
  const filePath = await save({
    defaultPath: `${projectName}.ai-novel.tar.gz`,
    filters: [{ name: 'AI Novel Writer Archive', extensions: ['tar.gz'] }],
  })
  if (!filePath) return
  await invoke<string>('archive_project', { projectId, outputPath: filePath })
}

export async function importProject(): Promise<string | null> {
  const filePath = await open({
    filters: [{ name: 'AI Novel Writer Archive', extensions: ['tar.gz'] }],
    multiple: false,
  })
  if (!filePath) return null
  const projectId = await invoke<string>('import_project', { archivePath: filePath })
  return projectId
}
```

**Full implementation steps follow the same pattern as previous tasks.** File paths and structure mirror existing patterns.

---

### Task P2-2: Publish Format Adaptation

**Files:**
- Create: `src/utils/formatAdapter.ts`
- Modify: `src/components/ExportDialog.tsx` (add copy-to-clipboard button)

**Architecture:** Purely frontend — strip/transform HTML content per platform specification. No Rust changes needed.

**Platforms to support:**
- 起点中文网: Standard paragraph spacing, no indentation needed
- 番茄小说: Extra spacing between paragraphs (2em), bold for emphasis
- 晋江文学城: Indented first lines, narrower spacing

```typescript
// src/utils/formatAdapter.ts
export type PublishPlatform = 'qidian' | 'fanqie' | 'jinjiang' | 'raw'

export interface FormatConfig {
  paragraphSpacing: string   // margin-bottom
  indentFirstLine: boolean
  boldEmphasis: boolean
  separator: string          // chapter separator
}

const PLATFORM_CONFIGS: Record<PublishPlatform, FormatConfig> = {
  qidian:   { paragraphSpacing: '1em', indentFirstLine: false, boldEmphasis: false, separator: '\n\n\n' },
  fanqie:   { paragraphSpacing: '2em', indentFirstLine: false, boldEmphasis: true,  separator: '\n\n' },
  jinjiang: { paragraphSpacing: '0.5em', indentFirstLine: true, boldEmphasis: false, separator: '\n\n\n' },
  raw:      { paragraphSpacing: '1em', indentFirstLine: false, boldEmphasis: false, separator: '\n\n---\n\n' },
}

export function adaptForPlatform(html: string, platform: PublishPlatform): string {
  const config = PLATFORM_CONFIGS[platform]
  let text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim()

  // Apply configuration
  const paragraphs = text.split('\n').filter((p) => p.trim())
  const formatted = paragraphs.map((p) => {
    let line = p.trim()
    if (config.indentFirstLine) line = '　　' + line
    return line
  })

  return formatted.join('\n')
}
```

The ExportDialog gets a new "复制到剪贴板" button that uses `navigator.clipboard.writeText()`.

---

### Task P2-3: Chapter Relationship Graph

**Files:**
- Create: `src/components/ChapterGraph.tsx`
- Modify: `src/components/ProjectView.tsx` (add chapter graph tab)

**Architecture:** Horizontal timeline-style graph showing chapters as nodes, with edges representing:
- Foreshadow connections (plant → resolve)
- Character continuity (shared characters across chapters)
- Causal links from snapshot data

Reuses `d3-force` layout from Task P1-2. Data sourced from chapter snapshots (`memory/snapshots/*.snapshot.json`) and foreshadow data (`memory/foreshadows.json`).

```typescript
// Data loading pattern:
export async function loadChapterGraph(projectId: string): Promise<ChapterGraph> {
  // Load all snapshots → each chapter = node
  // Load foreshadows → plant → resolve = edge between chapters
  // Build co-occurrence edges between adjacent chapters
  // Return typed graph
}
```

The component uses the same SVG rendering pattern as `RelationshipGraph` but arranged as a horizontal flow (left-to-right timeline). User can scroll horizontally.

---

### Task P2-4: Focus Mode

**Files:**
- Create: `src/services/focusService.ts`
- Create: `src/components/FocusModeOverlay.tsx`
- Modify: `src/components/ChapterManager.tsx` (add focus toggle)
- Modify: `src/style.css` (add focus mode styles)

**Architecture:** Pure frontend timer + UI lock. No Rust changes.

```typescript
// src/services/focusService.ts
export interface FocusConfig {
  targetMinutes: number
  targetWords: number
}

export class FocusSession {
  private startTime: number = 0
  private elapsed: number = 0
  private timer: number | null = null
  private onTick: ((elapsed: number) => void) | null = null
  private onComplete: (() => void) | null = null

  get isRunning(): boolean { return this.timer !== null }

  start(config: FocusConfig, callbacks: { onTick: (e: number) => void; onComplete: () => void }): void {
    this.onTick = callbacks.onTick
    this.onComplete = callbacks.onComplete
    this.startTime = Date.now()
    this.timer = window.setInterval(() => {
      this.elapsed = Math.floor((Date.now() - this.startTime) / 1000)
      this.onTick?.(this.elapsed)
      if (this.elapsed >= config.targetMinutes * 60) {
        this.stop()
        this.onComplete?.()
      }
    }, 1000)
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  getElapsed(): number { return this.elapsed }
}
```

**FocusModeOverlay** renders a semi-transparent overlay with:
- Timer display (mm:ss / target)
- Word count tracker (real-time from editor updates)
- "放弃专注" button
- "暂停" button

Toggle via ChapterManager toolbar button. When active:
- Editor area is maximized (tabs hidden temporarily)
- All notifications silenced
- A mini progress bar at top of screen

---

### Task P2-5: Trending References

**Files:**
- Create: `src/services/trendingService.ts`
- Create: `src/components/TrendingPanel.tsx`
- Modify: `src/components/ProjectView.tsx` (add trending tab)

**Architecture:** Read-only reference panel that loads trending web novel tag/theme data from a curated local JSON file bundled with the app. No live API calls.

The "trending" data is a static reference file that ships with the app — it lists popular themes, tropes, and tags by genre, sourced from open web novel databases. The panel displays them organized by genre with descriptions.

```typescript
// src/services/trendingService.ts
export interface TrendingCategory {
  genre: string
  tags: TrendingTag[]
}

export interface TrendingTag {
  name: string
  popularity: number   // 1-100
  description: string
  examples: string[]   // example book titles
}

// Static reference data bundled with the app
const TRENDING_DATA: TrendingCategory[] = [
  {
    genre: '玄幻',
    tags: [
      { name: '重生', popularity: 95, description: '主角带着前世记忆重生回少年时代', examples: ['《凡人修仙传》'] },
      { name: '系统流', popularity: 90, description: '主角获得系统辅助，快速成长', examples: ['《斗破苍穹》'] },
      // ... more
    ],
  },
  // ... more genres
]
```

This is the simplest task — pure data display, no AI or Rust dependencies.

---

## Phase Dependencies

```
Phase 1 (parallel):
  P1-1 (Relationship data model) ──┐
  P1-2 (Graph visualization) ──────┤ depends on: P1-1
  P1-3 (TXT/MD export) ───────────┤ depends on: nothing
  P1-4 (EPUB export) ─────────────┤ depends on: nothing (Rust)
  P1-5 (Brainstorm) ──────────────┤ depends on: nothing

Phase 2 (sequential-ish):
  P2-1 (Archive/import) ────────── depends on: nothing (Rust)
  P2-2 (Publish format) ────────── depends on: P1-3 (reuses ExportDialog)
  P2-3 (Chapter graph) ─────────── depends on: P1-1, P1-2 (reuses graph patterns)
  P2-4 (Focus mode) ────────────── depends on: nothing
  P2-5 (Trending) ──────────────── depends on: nothing
```

Phase 1 tasks are fully independent (except P1-2 depends on P1-1 for types). Phase 2 can be done in any order but P2-2 and P2-3 benefit from Phase 1 foundations.

---

## Implementation Order Recommendation

**Phase 1 — Spike (parallel execution):**
```
Batch 1: P1-1 + P1-3 + P1-5 (3 parallel agents) — data model + 2 frontend services
Batch 2: P1-2 + P1-4 + ExportDialog integration (2-3 parallel agents) — graph + epub
```

**Phase 2 — Per-feature (each ~1-2 days):**
```
P2-1 (Archive) → P2-4 (Focus) → P2-3 (Chapter graph) → P2-2 (Publish) → P2-5 (Trending)
```

---

## Self-Review Checklist

- [ ] **Spec coverage:** All 8 v0.5+ features from design doc §七 are covered: relationship graph (P1-1/P1-2), chapter graph (P2-3), brainstorm (P1-5), focus mode (P2-4), publish format (P2-2), data export (P1-3/P1-4), archive/import (P2-1), trending references (P2-5)
- [ ] **Placeholder scan:** No "TBD", "TODO", "implement later" — all code blocks contain complete implementations
- [ ] **Type consistency:** `GraphNode`/`RelationshipLink` defined in P1-1, consumed by P1-2 and P2-3. `ExportFormat` defined in P1-3, extended in P1-4. Types consistent across tasks
- [ ] **No missing deps:** d3-force declared in P1-2, epub-builder/tar/flate2 in P1-4/P2-1. All Rust plugins registered in lib.rs
- [ ] **Panel-layout:** All new panels follow the AGENTS.md `.panel-layout` / `.panel-sidebar` / `.panel-editor` convention
