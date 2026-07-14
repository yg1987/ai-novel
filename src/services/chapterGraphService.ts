// src/services/chapterGraphService.ts
import { listChapters, getChapterContent } from '../api/tauri'
import { estimateWordCount } from '../utils/cjkCount'
import { loadForeshadows } from './foreshadowStorage'

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

export async function loadChapterGraph(projectId: string): Promise<ChapterGraph> {
  const chapters = await listChapters(projectId)
  chapters.sort((a, b) => a.order - b.order)

  // Build nodes
  const nodeMap = new Map<string, ChapterNode>()
  for (const ch of chapters) {
    const html = await getChapterContent(projectId, ch.volume, ch.id)
    const plain = html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ')
    nodeMap.set(ch.id, {
      id: ch.id,
      order: ch.order,
      title: ch.title,
      wordCount: estimateWordCount(plain),
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
    const store = await loadForeshadows(projectId)
    for (const entry of store.entries) {
      // Planted → resolved edge
      if (entry.status === 'resolved' && entry.resolvedChapterId) {
        const sourceId = entry.plantedChapterId
        const targetId = entry.resolvedChapterId
        if (nodeMap.has(sourceId) && nodeMap.has(targetId) && sourceId !== targetId) {
          edges.push({
            source: sourceId,
            target: targetId,
            type: 'foreshadow',
            label: `伏笔: ${entry.name}`,
          })
        }
      }
      // Planted/advanced → push clues as edges
      for (const clue of entry.clues) {
        if (nodeMap.has(clue.chapterId)) {
          edges.push({
            source: entry.plantedChapterId,
            target: clue.chapterId,
            type: 'foreshadow',
            label: `推进: ${entry.name}`,
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
