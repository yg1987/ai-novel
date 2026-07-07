import { writeProjectFile, readProjectFile } from '../api/tauri'
import type { ChapterSnapshot, ForeshadowStore, CognitionState, CharacterCognition } from '../types/novel'

const SNAPSHOT_DIR = 'memory/snapshots'
const FORESHADOW_DIR = 'memory'
const FORESHADOW_FILE = 'foreshadows.json'
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
  await syncForeshadowing(projectId, snapshot)

  // 3. Sync character cognition
  await syncCharacterCognition(projectId, snapshot)
}

// ─── Foreshadow sync ─────────────────────────────

async function loadForeshadowStore(projectId: string): Promise<ForeshadowStore> {
  try {
    const raw = await readProjectFile(projectId, FORESHADOW_DIR, FORESHADOW_FILE)
    if (raw.trim()) return JSON.parse(raw) as ForeshadowStore
  } catch { /* file may not exist */ }
  return { version: 1, entries: [], updatedAt: '' }
}

async function syncForeshadowing(projectId: string, snapshot: ChapterSnapshot): Promise<void> {
  const store = await loadForeshadowStore(projectId)
  let changed = false

  for (const change of snapshot.foreshadowingChanges) {
    const trimmed = change.trim()

    // "新增伏笔: 名称 - 描述"
    const plantMatch = trimmed.match(/^新增伏笔[：:]\s*(.+?)(?:[-—]\s*(.+))?$/)
    if (plantMatch) {
      const name = plantMatch[1]!.trim()
      const desc = plantMatch[2]?.trim() ?? name
      if (!store.entries.some((e) => e.name === name && e.status !== 'resolved')) {
        store.entries.push({
          id: `f${String(Date.now())}`,
          name,
          description: desc,
          status: 'planted',
          category: 'mystery',
          importance: 0.6,
          plantedChapter: snapshot.chapterNumber,
          advancedChapters: [],
          relatedCharacters: snapshot.characters,
          notes: '',
        })
        changed = true
      }
      continue
    }

    // "推进伏笔: 名称"
    const advMatch = trimmed.match(/^推进伏笔[：:]\s*(.+)$/)
    if (advMatch) {
      const name = advMatch[1]!.trim()
      const entry = store.entries.find((e) => e.name === name)
      if (entry && entry.status !== 'resolved') {
        entry.status = 'advanced'
        entry.advancedChapters.push(snapshot.chapterNumber)
        changed = true
      }
      continue
    }

    // "回收伏笔: 名称"
    const resMatch = trimmed.match(/^回收伏笔[：:]\s*(.+)$/)
    if (resMatch) {
      const name = resMatch[1]!.trim()
      const entry = store.entries.find((e) => e.name === name)
      if (entry) {
        entry.status = 'resolved'
        entry.resolvedChapter = snapshot.chapterNumber
        changed = true
      }
    }
  }

  if (changed) {
    store.updatedAt = new Date().toISOString().slice(0, 16)
    await writeProjectFile(projectId, FORESHADOW_DIR, FORESHADOW_FILE, JSON.stringify(store, null, 2))
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
