import { deleteProjectFile, listProjectFiles, readProjectFile, writeProjectFile } from '../api/tauri'
import {
  DEFAULT_BRAINSTORM_PREFERENCES,
  type BrainstormProjectPreferences,
  type BrainstormSession,
  type BrainstormSessionHistoryEntry,
} from '../types/brainstorm'
import { asString, asStringArray, isRecord } from '../utils/unknown'

const DIR = 'brainstorm'
const SESSION_DIR = 'brainstorm/sessions'
const PREFERENCES_FILE = 'preferences.json'

function isMode(value: unknown): value is BrainstormProjectPreferences['mode'] {
  return value === 'plot_twist' || value === 'scene_idea' || value === 'character_dev' || value === 'world_expand'
}

function isCreativityLevel(value: unknown): value is BrainstormProjectPreferences['creativityLevel'] {
  return value === 'safe' || value === 'balanced' || value === 'bold'
}

function isContextSource(value: string): value is BrainstormProjectPreferences['enabledContextSources'][number] {
  return ['project_meta', 'chapter_content', 'chapter_snapshot', 'outline', 'characters', 'relationships', 'worldview', 'foreshadows', 'notes'].includes(value)
}

function isSession(value: unknown): value is BrainstormSession {
  return isRecord(value)
    && value.schemaVersion === 1
    && typeof value.id === 'string'
    && typeof value.projectId === 'string'
    && typeof value.createdAt === 'string'
    && isRecord(value.request)
    && isRecord(value.response)
    && Array.isArray(value.response.ideas)
    && Array.isArray(value.contextManifest)
    && Array.isArray(value.contextWarnings)
    && isRecord(value.generation)
}

function sessionCreatedAt(value: unknown): string | undefined {
  return isRecord(value) && typeof value.createdAt === 'string' ? value.createdAt : undefined
}

function parseSessionEntry(sessionId: string, raw: string, projectId: string): BrainstormSessionHistoryEntry {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (isRecord(parsed) && typeof parsed.schemaVersion === 'number' && parsed.schemaVersion > 1) {
      return { kind: 'newer_schema', sessionId, createdAt: sessionCreatedAt(parsed) }
    }
    if (isSession(parsed) && parsed.projectId === projectId) return { kind: 'valid', session: parsed }
    return { kind: 'corrupted', sessionId, createdAt: sessionCreatedAt(parsed) }
  } catch {
    return { kind: 'corrupted', sessionId }
  }
}

function entryCreatedAt(entry: BrainstormSessionHistoryEntry): string {
  return entry.kind === 'valid' ? entry.session.createdAt : entry.createdAt ?? ''
}

export async function loadBrainstormPreferences(projectId: string): Promise<BrainstormProjectPreferences> {
  try {
    const raw = await readProjectFile(projectId, DIR, PREFERENCES_FILE)
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || parsed.schemaVersion !== 1 || !isMode(parsed.mode) || !isCreativityLevel(parsed.creativityLevel)) {
      return { ...DEFAULT_BRAINSTORM_PREFERENCES }
    }
    const resultCount = typeof parsed.resultCount === 'number' && parsed.resultCount >= 3 && parsed.resultCount <= 6
      ? parsed.resultCount
      : DEFAULT_BRAINSTORM_PREFERENCES.resultCount
    return {
      schemaVersion: 1,
      mode: parsed.mode,
      creativityLevel: parsed.creativityLevel,
      resultCount,
      enabledContextSources: asStringArray(parsed.enabledContextSources).filter(isContextSource),
    }
  } catch {
    return { ...DEFAULT_BRAINSTORM_PREFERENCES }
  }
}

export async function saveBrainstormPreferences(projectId: string, preferences: BrainstormProjectPreferences): Promise<void> {
  await writeProjectFile(projectId, DIR, PREFERENCES_FILE, JSON.stringify(preferences, null, 2))
}

export function createBrainstormSession(session: Omit<BrainstormSession, 'id' | 'createdAt' | 'schemaVersion'>): BrainstormSession {
  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...session,
  }
}

export async function saveBrainstormSession(projectId: string, session: BrainstormSession): Promise<void> {
  await writeProjectFile(projectId, SESSION_DIR, `${session.id}.json`, JSON.stringify(session, null, 2))
}

export async function loadBrainstormSession(projectId: string, sessionId: string): Promise<BrainstormSession | null> {
  try {
    const raw = await readProjectFile(projectId, SESSION_DIR, `${sessionId}.json`)
    if (!raw.trim()) return null
    const entry = parseSessionEntry(sessionId, raw, projectId)
    return entry.kind === 'valid' ? entry.session : null
  } catch {
    return null
  }
}

export async function listBrainstormSessionIds(projectId: string): Promise<string[]> {
  const files = await listProjectFiles(projectId, SESSION_DIR)
  return files.map((file) => file.name).filter((name) => name.endsWith('.json')).map((name) => name.replace(/\.json$/, ''))
}

export async function listBrainstormSessions(projectId: string): Promise<BrainstormSessionHistoryEntry[]> {
  const sessionIds = await listBrainstormSessionIds(projectId)
  const entries = await Promise.all(sessionIds.map(async (sessionId) => {
    try {
      const raw = await readProjectFile(projectId, SESSION_DIR, `${sessionId}.json`)
      return parseSessionEntry(sessionId, raw, projectId)
    } catch {
      return { kind: 'corrupted' as const, sessionId }
    }
  }))
  return entries.sort((left, right) => entryCreatedAt(right).localeCompare(entryCreatedAt(left)))
}

export async function deleteBrainstormSession(projectId: string, sessionId: string): Promise<void> {
  await deleteProjectFile(projectId, SESSION_DIR, `${sessionId}.json`)
}

export function sessionProblemSummary(session: BrainstormSession): string {
  return asString(session.request.problem).slice(0, 120)
}
