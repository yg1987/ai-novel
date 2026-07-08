// src/services/chapterGraphService.ts
import { listChapters, getChapterContent, readProjectFile } from '../api/tauri'

export interface ChapterNode {
  id: string
  order: number
  title: string
  wordCount: number
  characterCount: number
}

export interface ChapterEdge {
  source: string   // chapter id
  target: string   // chapter id
  type: 'foreshadow' | 'continuity' | 'adjacent'
  label: string
}

export interface ChapterGraph {
  nodes: ChapterNode[]
  edges: ChapterEdge[]
}

const FORESHADOW_FILE = 'foreshadows.json'

export async function loadChapterGraph(projectId: string): Promise<ChapterGraph> {
  const chapters = await listChapters(projectId)
  chapters.sort((a, b) => a.order - b.order)

  // Build nodes
  const nodeMap = new Map<string, ChapterNode>()
  for (const ch of chapters) {
    const html = await getChapterContent(projectId, ch.id)
    const plain = html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ')
    nodeMap.set(ch.id, {
      id: ch.id,
      order: ch.order,
      title: ch.title,
      wordCount: plain.length,
      characterCount: (plain.match(/[\u4e00-\u9fff]/g) || []).length,
    })
  }

  const edges: ChapterEdge[] = []

  // Adjacent chapter edges (chapter N → chapter N+1)
  for (let i = 0; i < chapters.length - 1; i++) {
    edges.push({
      source: chapters[i]!.id,
      target: chapters[i + 1]!.id,
      type: 'adjacent',
      label: '顺序',
    })
  }

  // Foreshadow edges from foreshadows.json
  try {
    const raw = await readProjectFile(projectId, 'memory', FORESHADOW_FILE)
    const store = JSON.parse(raw)
    for (const entry of store.entries || []) {
      if (entry.status === 'resolved' && entry.resolvedChapter) {
        const sourceId = `ch${String(entry.plantedChapter).padStart(3, '0')}`
        const targetId = `ch${String(entry.resolvedChapter).padStart(3, '0')}`
        if (nodeMap.has(sourceId) && nodeMap.has(targetId) && sourceId !== targetId) {
          edges.push({
            source: sourceId,
            target: targetId,
            type: 'foreshadow',
            label: `伏笔: ${entry.name}`,
          })
        }
      }
    }
  } catch { /* no foreshadow data */ }

  return {
    nodes: Array.from(nodeMap.values()),
    edges,
  }
}
