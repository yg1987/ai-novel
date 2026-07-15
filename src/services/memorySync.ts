import { writeProjectFile, readProjectFile } from '../api/tauri'
import type { ChapterSnapshot, CognitionState, CharacterCognition, TimelineEntry } from '../types/novel'
import { loadForeshadows, saveForeshadows, createForeshadowId } from './foreshadowStorage'

const SNAPSHOT_DIR = 'memory/snapshots'
const COGNITION_DIR = 'memory'
const COGNITION_FILE = 'character-states.json'

/**
 * Save a chapter snapshot and sync structured data (foreshadow, cognition, timeline).
 */
export async function saveChapterSnapshot(
  projectId: string,
  snapshot: ChapterSnapshot,
): Promise<void> {
  const chapterId = `ch${String(snapshot.chapterNumber).padStart(3, '0')}`

  // 1. Save raw snapshot JSON
  await writeProjectFile(
    projectId,
    SNAPSHOT_DIR,
    `${chapterId}.snapshot.json`,
    JSON.stringify(snapshot, null, 2),
  )

  // 2. Sync foreshadowing
  await syncForeshadowing(projectId, snapshot, chapterId)

  // 3. Sync character cognition
  await syncCharacterCognition(projectId, snapshot)

  // 4. Sync timeline events
  await syncTimeline(projectId, snapshot)
}

// ─── Foreshadow sync ─────────────────────────────

async function syncForeshadowing(
  projectId: string,
  snapshot: ChapterSnapshot,
  chapterId: string,
): Promise<void> {
  const store = await loadForeshadows(projectId)
  let changed = false
  const now = new Date().toISOString().slice(0, 16)

  for (const change of snapshot.foreshadowingChanges) {
    const trimmed = change.trim()

    // "新增伏笔: 名称 - 描述 [关联角色: A, B]"
    // 从 AI 输出中提取角色标注，只关联与伏笔直接相关的角色
    const plantMatch = trimmed.match(/^新增伏笔[：:]\s*(.+?)(?:\s*[-—]\s*(.+?))?\s*(?:\[关联角色[：:]\s*(.+?)\])?\s*$/)
    if (plantMatch) {
      const name = plantMatch[1]!.trim()
      const desc = plantMatch[2]?.trim() ?? name
      const charStr = plantMatch[3]?.trim()
      const relatedChars = charStr
        ? charStr.split(/[,，、\s]+/).map(s => s.trim()).filter(Boolean)
        : []
      // 去重：同名 + 同章节 ID 视为重复
      const exists = store.entries.some(
        (e) => e.name === name && e.plantedChapterId === chapterId,
      )
      if (!exists) {
        store.entries.push({
          id: createForeshadowId(),
          name,
          description: desc,
          status: 'planted',
          category: 'mystery',
          importance: 0.6,
          plantedChapterId: chapterId,
          clues: [],
          relatedCharacters: relatedChars,
          notes: '',
          createdAt: now,
          updatedAt: now,
        })
        changed = true
      }
      continue
    }

    // "推进伏笔: 名称"
    const advMatch = trimmed.match(/^推进伏笔[：:]\s*(.+)$/)
    if (advMatch) {
      const name = advMatch[1]!.trim()
      const entry = store.entries.find(
        (e) => e.name === name && e.status !== 'resolved' && e.status !== 'abandoned',
      )
      if (entry) {
        entry.status = 'advanced'
        entry.clues.push({
          chapterId,
          description: snapshot.summary.slice(0, 100),
          timestamp: new Date().toISOString(),
        })
        entry.updatedAt = now
        changed = true
      }
      continue
    }

    // "回收伏笔: 名称"
    const resMatch = trimmed.match(/^回收伏笔[：:]\s*(.+)$/)
    if (resMatch) {
      const name = resMatch[1]!.trim()
      const entry = store.entries.find(
        (e) => e.name === name && e.status !== 'resolved',
      )
      if (entry) {
        entry.status = 'resolved'
        entry.resolvedChapterId = chapterId
        entry.updatedAt = now
        changed = true
      }
    }
  }

  if (changed) {
    await saveForeshadows(projectId, store)
  }
}

// ─── Character cognition sync ────────────────────

async function loadCognitionState(projectId: string): Promise<CognitionState> {
  try {
    const raw = await readProjectFile(projectId, COGNITION_DIR, COGNITION_FILE)
    if (raw.trim()) return JSON.parse(raw) as CognitionState
  } catch { /* file may not exist */ }
  return { characters: [], readerKnows: [], lastUpdatedChapter: 0 }
}

async function syncCharacterCognition(projectId: string, snapshot: ChapterSnapshot): Promise<void> {
  if (snapshot.knowledgeChanges.length === 0) return

  const state = await loadCognitionState(projectId)
  let changed = false

  for (const change of snapshot.knowledgeChanges) {
    // Pattern: "角色名知道/发现/意识到/得知 X"
    const knowMatch = change.match(/^(.+?)知道[了]?(.+)$/)
    if (knowMatch) {
      const charName = knowMatch[1]!.trim()
      const knowledge = knowMatch[2]!.trim()
      const cognition = findOrCreateCognition(state, charName)
      if (!cognition.knows.includes(knowledge)) {
        cognition.knows.push(knowledge)
        changed = true
      }
      continue
    }

    // Pattern: "角色名不知道/没察觉 X"
    const notKnowMatch = change.match(/^(.+?)不知道(.+)$/)
    if (notKnowMatch) {
      const charName = notKnowMatch[1]!.trim()
      const knowledge = notKnowMatch[2]!.trim()
      const cognition = findOrCreateCognition(state, charName)
      if (!cognition.doesNotKnow.includes(knowledge)) {
        cognition.doesNotKnow.push(knowledge)
        changed = true
      }
      continue
    }

    // Pattern: "读者知道 X"
    const readerMatch = change.match(/^读者知道[了]?(.+)$/)
    if (readerMatch) {
      const info = readerMatch[1]!.trim()
      if (!state.readerKnows.includes(info)) {
        state.readerKnows.push(info)
        changed = true
      }
    }
  }

  if (changed) {
    state.lastUpdatedChapter = snapshot.chapterNumber
    await writeProjectFile(projectId, COGNITION_DIR, COGNITION_FILE, JSON.stringify(state, null, 2))
  }
}

function findOrCreateCognition(state: CognitionState, character: string): CharacterCognition {
  let existing = state.characters.find((c) => c.character === character)
  if (!existing) {
    existing = { character, knows: [], doesNotKnow: [] }
    state.characters.push(existing)
  }
  return existing
}

// ─── Timeline sync ────────────────────────────────

/** Sync timeline events from snapshot to memory/timeline.json */
async function syncTimeline(projectId: string, snapshot: ChapterSnapshot): Promise<void> {
  if (!snapshot.timelineEvents?.length) return

  let timeline: TimelineEntry[] = []
  try {
    const existing = await readProjectFile(projectId, 'memory', 'timeline.json')
    if (existing?.trim()) {
      timeline = JSON.parse(existing) as TimelineEntry[]
    }
  } catch { /* start fresh */ }

  // Replace any existing entry for this chapter (re-save = update)
  const existingIdx = timeline.findIndex((e) => e.chapterNumber === snapshot.chapterNumber)
  const entry: TimelineEntry = {
    chapterNumber: snapshot.chapterNumber,
    events: snapshot.timelineEvents,
  }
  if (existingIdx >= 0) {
    timeline[existingIdx] = entry
  } else {
    timeline.push(entry)
  }

  // Sort by chapter number ascending
  timeline.sort((a, b) => a.chapterNumber - b.chapterNumber)

  await writeProjectFile(projectId, 'memory', 'timeline.json', JSON.stringify(timeline, null, 2))
}
