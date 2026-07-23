import { deleteProjectFile, readProjectFile, writeProjectFile } from '../api/tauri'
import { isRecord } from '../utils/unknown'

const DRAFT_DIR = 'worldview/.drafts'

export interface WorldviewDraft {
  schemaVersion: 1
  sectionFile: string
  savedAt: string
  baseContentHash: string
  content: string
  subValues: Record<string, string>
}

function draftFilename(sectionFile: string): string {
  return `${encodeURIComponent(sectionFile)}.json`
}

function parseSubValues(value: unknown): Record<string, string> | null {
  if (!isRecord(value)) return null
  const entries = Object.entries(value)
  if (entries.some(([, entry]) => typeof entry !== 'string')) return null
  return Object.fromEntries(entries) as Record<string, string>
}

function parseDraft(value: unknown): WorldviewDraft | null {
  if (!isRecord(value) || value.schemaVersion !== 1) return null
  if (
    typeof value.sectionFile !== 'string'
    || typeof value.savedAt !== 'string'
    || typeof value.baseContentHash !== 'string'
    || typeof value.content !== 'string'
  ) return null
  const subValues = parseSubValues(value.subValues)
  if (!subValues) return null
  return {
    schemaVersion: 1,
    sectionFile: value.sectionFile,
    savedAt: value.savedAt,
    baseContentHash: value.baseContentHash,
    content: value.content,
    subValues,
  }
}

export async function contentHash(content: string): Promise<string> {
  const data = new TextEncoder().encode(content)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function loadWorldviewDraft(projectId: string, sectionFile: string): Promise<WorldviewDraft | null> {
  try {
    const raw = await readProjectFile(projectId, DRAFT_DIR, draftFilename(sectionFile))
    if (!raw.trim()) return null
    const draft = parseDraft(JSON.parse(raw))
    return draft?.sectionFile === sectionFile ? draft : null
  } catch {
    return null
  }
}

export async function saveWorldviewDraft(projectId: string, draft: WorldviewDraft): Promise<void> {
  await writeProjectFile(projectId, DRAFT_DIR, draftFilename(draft.sectionFile), JSON.stringify(draft, null, 2))
}

export async function deleteWorldviewDraft(projectId: string, sectionFile: string): Promise<void> {
  try {
    await deleteProjectFile(projectId, DRAFT_DIR, draftFilename(sectionFile))
  } catch {
    // Missing drafts are already in the desired state.
  }
}
