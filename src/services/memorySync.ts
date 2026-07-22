import { writeProjectFile, readProjectFile } from '../api/tauri'
import type { ChapterSnapshot, CognitionState, CharacterCognition, TimelineEntry } from '../types/novel'

const SNAPSHOT_DIR = 'memory/snapshots'
const COGNITION_DIR = 'memory'
const COGNITION_FILE = 'character-states.json'

/**
 * Save a chapter snapshot and sync shared cognition and timeline data.
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

  // 2. Sync character cognition
  await syncCharacterCognition(projectId, snapshot)

  // 3. Sync timeline events
  await syncTimeline(projectId, snapshot)
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
