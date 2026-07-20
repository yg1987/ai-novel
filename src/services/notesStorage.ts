// Shared notes data access layer.
// Used by NotesPanel (list + CRUD) and ChapterManager (sidebar + badges).

import { listProjectFiles, readProjectFile, writeProjectFile, deleteProjectFile } from '../api/tauri'

// ─── Types ───────────────────────────────────────

export type NoteType = 'note' | 'todo' | 'question'
export type FilterView = 'all' | 'note' | 'todo' | 'done' | 'question' | 'resolved'

export interface BrainstormNoteSource {
  type: 'brainstorm'
  sessionId: string
  ideaId: string
}

export interface NoteEntry {
  id: string
  content: string
  type: NoteType
  chapterRef: string
  done: boolean
  resolved: boolean
  createdAt: string
  source?: BrainstormNoteSource
}

// ─── Constants ───────────────────────────────────

export const NOTES_DIR = 'notes'
const NOTES_LEGACY_FILE = 'notes.json'

// ─── Helpers ─────────────────────────────────────

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

function parseSingleNote(raw: string): NoteEntry | null {
  if (!raw.trim()) return null
  try { return JSON.parse(raw) as NoteEntry }
  catch { return null }
}

// ─── Migration ───────────────────────────────────

async function migrateLegacyNotes(projectId: string): Promise<boolean> {
  const raw = await readProjectFile(projectId, NOTES_DIR, NOTES_LEGACY_FILE)
  if (!raw.trim()) return false

  let legacy: NoteEntry[]
  try { legacy = JSON.parse(raw) as NoteEntry[] }
  catch { return false }

  if (!Array.isArray(legacy) || legacy.length === 0) return false

  for (const entry of legacy) {
    if (entry.resolved === undefined) entry.resolved = false
    await writeProjectFile(projectId, NOTES_DIR, `${entry.id}.json`, JSON.stringify(entry, null, 2))
  }

  await deleteProjectFile(projectId, NOTES_DIR, NOTES_LEGACY_FILE)
  return true
}

// ─── Load ────────────────────────────────────────

/**
 * Load all notes for a project from individual files.
 * Auto-migrates legacy notes.json on first access (idempotent).
 */
export async function loadAllNotes(projectId: string): Promise<NoteEntry[]> {
  await migrateLegacyNotes(projectId)

  const files = await listProjectFiles(projectId, NOTES_DIR)
  const notes: NoteEntry[] = []

  for (const file of files) {
    if (!file.name.endsWith('.json')) continue
    if (file.name === NOTES_LEGACY_FILE) continue
    const raw = await readProjectFile(projectId, NOTES_DIR, file.name)
    const note = parseSingleNote(raw)
    if (note) {
      if (note.resolved === undefined) note.resolved = false
      notes.push(note)
    }
  }

  notes.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return notes
}

// ─── Write / Delete ──────────────────────────────

export async function saveNote(projectId: string, note: NoteEntry): Promise<void> {
  await writeProjectFile(projectId, NOTES_DIR, `${note.id}.json`, JSON.stringify(note, null, 2))
}

export async function deleteNote(projectId: string, noteId: string): Promise<void> {
  await deleteProjectFile(projectId, NOTES_DIR, `${noteId}.json`)
}

// ─── Filter ──────────────────────────────────────

export function applyFilter(notes: NoteEntry[], filter: FilterView): NoteEntry[] {
  switch (filter) {
    case 'note':
      return notes.filter((n) => n.type === 'note')
    case 'todo':
      return notes.filter((n) => n.type === 'todo' && !n.done)
    case 'done':
      return notes.filter((n) => n.type === 'todo' && n.done)
    case 'question':
      return notes.filter((n) => n.type === 'question' && !n.resolved)
    case 'resolved':
      return notes.filter((n) => n.type === 'question' && n.resolved)
    default:
      return notes
  }
}

// ─── Chapter queries ─────────────────────────────

/** Parse chapterRef string (format: "volume/chapterId") into parts, or null if project-level. */
export function parseChapterRef(ref: string): { volume: string; chapterId: string } | null {
  if (!ref) return null
  const idx = ref.indexOf('/')
  if (idx === -1) return null
  return { volume: ref.slice(0, idx), chapterId: ref.slice(idx + 1) }
}

/** Build chapterRef string from volume and chapterId. */
export function buildChapterRef(volume: string, chapterId: string): string {
  return `${volume}/${chapterId}`
}

/** Get notes that are associated with a specific chapter. */
export function getNotesForChapter(notes: NoteEntry[], chapterRef: string): NoteEntry[] {
  if (!chapterRef) return []
  return notes.filter((n) => n.chapterRef === chapterRef)
}

/** Count pending (not done) todos for a specific chapter. */
export function countPendingTodos(notes: NoteEntry[], chapterRef: string): number {
  return notes.filter((n) => n.type === 'todo' && !n.done && n.chapterRef === chapterRef).length
}
