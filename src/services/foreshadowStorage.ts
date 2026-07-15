// src/services/foreshadowStorage.ts
import { readProjectFile, writeProjectFile } from '../api/tauri'
import type {
  ForeshadowEntry,
  ForeshadowStore,
  ForeshadowStatus,
  ForeshadowConfig,
  ForeshadowInspiration,
} from '../types/novel'
import { DEFAULT_FORESHADOW_CONFIG } from '../types/novel'

const DIR = 'memory'
const STORE_FILE = 'foreshadows.json'
const CONFIG_FILE = 'foreshadow-config.json'
const INSPIRE_FILE = 'foreshadow-inspiration.json'

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
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed.entries)) {
        // Normalize old entries to new format
        const now = new Date().toISOString().slice(0, 16)
        const entries: ForeshadowEntry[] = parsed.entries.map((e: any) => ({
          id: e.id ?? createForeshadowId(),
          name: e.name ?? '',
          description: e.description ?? '',
          status: e.status ?? 'planted',
          category: e.category ?? 'mystery',
          importance: e.importance ?? 0.6,
          plantedChapterId: e.plantedChapterId ?? `ch${String(e.plantedChapter ?? 0).padStart(3, '0')}`,
          targetChapterId: e.targetChapterId ?? undefined,
          resolvedChapterId: e.resolvedChapterId
            ?? (e.resolvedChapter ? `ch${String(e.resolvedChapter).padStart(3, '0')}` : undefined),
          resolutionPlan: e.resolutionPlan ?? undefined,
          clues: Array.isArray(e.clues) ? e.clues : [],
          relatedCharacters: Array.isArray(e.relatedCharacters) ? e.relatedCharacters : [],
          notes: e.notes ?? '',
          createdAt: e.createdAt ?? now,
          updatedAt: e.updatedAt ?? now,
        }))
        return { entries, updatedAt: parsed.updatedAt ?? now }
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
      return { ...DEFAULT_FORESHADOW_CONFIG, ...JSON.parse(raw) }
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
    if (raw.trim()) return JSON.parse(raw) as ForeshadowInspiration
  } catch { /* file doesn't exist */ }
  return null
}
