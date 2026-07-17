// src/services/foreshadowStorage.ts
import { readProjectFile, writeProjectFile } from '../api/tauri'
import type {
  ForeshadowEntry,
  ForeshadowStore,
  ForeshadowStatus,
  ForeshadowConfig,
  ForeshadowInspiration,
  ForeshadowCategory,
} from '../types/novel'
import { DEFAULT_FORESHADOW_CONFIG } from '../types/novel'
import { asNumber, asString, asStringArray, isRecord } from '../utils/unknown'

const DIR = 'memory'
const STORE_FILE = 'foreshadows.json'
const CONFIG_FILE = 'foreshadow-config.json'
const INSPIRE_FILE = 'foreshadow-inspiration.json'

function asForeshadowStatus(value: unknown): ForeshadowStatus {
  return value === 'advanced' || value === 'resolved' || value === 'abandoned'
    ? value
    : 'planted'
}

function asForeshadowCategory(value: unknown): ForeshadowCategory {
  return value === 'identity'
    || value === 'item'
    || value === 'relationship'
    || value === 'event'
    || value === 'ability'
    || value === 'power'
    ? value
    : 'mystery'
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function legacyChapterId(value: unknown): string {
  const chapter = typeof value === 'number' || typeof value === 'string' ? String(value) : '0'
  return `ch${chapter.padStart(3, '0')}`
}

function normalizeForeshadowEntry(value: unknown, now: string): ForeshadowEntry | null {
  if (!isRecord(value)) return null
  const resolvedChapterId = asOptionalString(value.resolvedChapterId)
    ?? (value.resolvedChapter === undefined ? undefined : legacyChapterId(value.resolvedChapter))
  const clues = Array.isArray(value.clues)
    ? value.clues.filter(isRecord).map((clue) => ({
      chapterId: asString(clue.chapterId),
      description: asString(clue.description),
      timestamp: asString(clue.timestamp, now),
    }))
    : []

  return {
    id: asString(value.id, createForeshadowId()),
    name: asString(value.name),
    description: asString(value.description),
    status: asForeshadowStatus(value.status),
    category: asForeshadowCategory(value.category),
    importance: asNumber(value.importance, 0.6),
    plantedChapterId: asOptionalString(value.plantedChapterId) ?? legacyChapterId(value.plantedChapter),
    targetChapterId: asOptionalString(value.targetChapterId),
    resolvedChapterId,
    resolutionPlan: asOptionalString(value.resolutionPlan),
    clues,
    relatedCharacters: asStringArray(value.relatedCharacters),
    notes: asString(value.notes),
    createdAt: asString(value.createdAt, now),
    updatedAt: asString(value.updatedAt, now),
  }
}

function isForeshadowInspiration(value: unknown): value is ForeshadowInspiration {
  return isRecord(value)
    && typeof value.summary === 'string'
    && Array.isArray(value.suggestions)
    && value.suggestions.every((suggestion) => isRecord(suggestion))
}

// ─── ID ──────────────────────────────────────

export function createForeshadowId(): string {
  return crypto.randomUUID()
}

// ─── Store CRUD ──────────────────────────────

export async function loadForeshadows(
  projectId: string,
): Promise<ForeshadowStore> {
  try {
    const raw = await readProjectFile(projectId, DIR, STORE_FILE)
    if (raw.trim()) {
      const parsed: unknown = JSON.parse(raw)
      if (isRecord(parsed) && Array.isArray(parsed.entries)) {
        // Normalize old entries to new format
        const now = new Date().toISOString().slice(0, 16)
        const entries = parsed.entries
          .map((entry) => normalizeForeshadowEntry(entry, now))
          .filter((entry): entry is ForeshadowEntry => entry !== null)
        return { entries, updatedAt: asString(parsed.updatedAt, now) }
      }
    }
  } catch {
    /* file doesn't exist or is corrupted */
  }
  return { entries: [], updatedAt: '' }
}

export async function saveForeshadows(
  projectId: string,
  store: ForeshadowStore,
): Promise<void> {
  store.updatedAt = new Date().toISOString().slice(0, 16)
  await writeProjectFile(projectId, DIR, STORE_FILE, JSON.stringify(store, null, 2))
}

export async function addForeshadow(
  projectId: string,
  entry: ForeshadowEntry,
): Promise<void> {
  const store = await loadForeshadows(projectId)
  store.entries.push(entry)
  await saveForeshadows(projectId, store)
}

export async function updateForeshadow(
  projectId: string,
  id: string,
  patch: Partial<ForeshadowEntry>,
): Promise<void> {
  const store = await loadForeshadows(projectId)
  const idx = store.entries.findIndex((e) => e.id === id)
  if (idx === -1) return
  store.entries[idx] = {
    ...store.entries[idx]!,
    ...patch,
    updatedAt: new Date().toISOString().slice(0, 16),
  }
  await saveForeshadows(projectId, store)
}

export async function changeStatus(
  projectId: string,
  id: string,
  status: ForeshadowStatus,
  clue?: { chapterId: string; description: string },
): Promise<void> {
  const store = await loadForeshadows(projectId)
  const entry = store.entries.find((e) => e.id === id)
  if (!entry) return

  entry.status = status
  entry.updatedAt = new Date().toISOString().slice(0, 16)

  if (status === 'advanced' && clue) {
    entry.clues.push({
      chapterId: clue.chapterId,
      description: clue.description,
      timestamp: new Date().toISOString(),
    })
  }

  if (status === 'resolved') {
    entry.resolvedChapterId = clue?.chapterId
  }

  if (status === 'planted') {
    // re-open: clear resolved chapter
    entry.resolvedChapterId = undefined
  }

  await saveForeshadows(projectId, store)
}

export async function deleteForeshadow(
  projectId: string,
  id: string,
): Promise<void> {
  const store = await loadForeshadows(projectId)
  store.entries = store.entries.filter((e) => e.id !== id)
  await saveForeshadows(projectId, store)
}

// ─── Config ──────────────────────────────────

export async function loadForeshadowConfig(
  projectId: string,
): Promise<ForeshadowConfig> {
  try {
    const raw = await readProjectFile(projectId, DIR, CONFIG_FILE)
    if (raw.trim()) {
      const parsed: unknown = JSON.parse(raw)
      if (isRecord(parsed)) {
        return {
          dormantThreshold: asNumber(parsed.dormantThreshold, DEFAULT_FORESHADOW_CONFIG.dormantThreshold),
          upcomingWindow: asNumber(parsed.upcomingWindow, DEFAULT_FORESHADOW_CONFIG.upcomingWindow),
          densityWarningThreshold: asNumber(parsed.densityWarningThreshold, DEFAULT_FORESHADOW_CONFIG.densityWarningThreshold),
          densityLowThreshold: asNumber(parsed.densityLowThreshold, DEFAULT_FORESHADOW_CONFIG.densityLowThreshold),
        }
      }
    }
  } catch {
    /* file doesn't exist */
  }
  return { ...DEFAULT_FORESHADOW_CONFIG }
}

export async function saveForeshadowConfig(
  projectId: string,
  config: ForeshadowConfig,
): Promise<void> {
  await writeProjectFile(projectId, DIR, CONFIG_FILE, JSON.stringify(config, null, 2))
}

// ─── Inspiration persistence ──────────────

export async function saveInspiration(
  projectId: string,
  inspiration: ForeshadowInspiration | null,
): Promise<void> {
  await writeProjectFile(projectId, DIR, INSPIRE_FILE, JSON.stringify(inspiration, null, 2))
}

export async function loadInspiration(
  projectId: string,
): Promise<ForeshadowInspiration | null> {
  try {
    const raw = await readProjectFile(projectId, DIR, INSPIRE_FILE)
    if (raw.trim()) {
      const parsed: unknown = JSON.parse(raw)
      if (isForeshadowInspiration(parsed)) return parsed
    }
  } catch { /* file doesn't exist */ }
  return null
}
