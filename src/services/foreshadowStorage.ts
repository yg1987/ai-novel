import {
  atomicWriteProjectFile,
  deleteProjectFile,
  readProjectFile,
  writeProjectFile,
} from '../api/tauri'
import type { ChapterRef } from '../types/chapter'
import type {
  ForeshadowCategory,
  ForeshadowConfig,
  ForeshadowEntry,
  ForeshadowInspiration,
  ForeshadowStatus,
  ForeshadowStore,
} from '../types/novel'
import { DEFAULT_FORESHADOW_CONFIG } from '../types/novel'
import { asNumber, isRecord } from '../utils/unknown'
import { defaultCharacterModuleConfig, loadCharacterModuleConfig } from './characterConfig'
import { loadCharacterCatalog, resolveCharacterName } from './characterCatalog'

const DIR = 'memory'
const STORE_FILE = 'foreshadows.json'
const CONFIG_FILE = 'foreshadow-config.json'
const INSPIRE_FILE = 'foreshadow-inspiration.json'
const LEGACY_BACKUP_DIR = 'memory/legacy-backups'

export type ForeshadowStoreErrorCode = 'legacy-schema' | 'unsupported-schema' | 'corrupt' | 'invalid-schema'

export class ForeshadowStoreError extends Error {
  readonly code: ForeshadowStoreErrorCode

  constructor(code: ForeshadowStoreErrorCode, message: string) {
    super(message)
    this.name = 'ForeshadowStoreError'
    this.code = code
  }
}

function isChapterRef(value: unknown): value is ChapterRef {
  return isRecord(value)
    && typeof value.volume === 'string' && value.volume.trim().length > 0
    && typeof value.chapterId === 'string' && value.chapterId.trim().length > 0
}

function isStatus(value: unknown): value is ForeshadowStatus {
  return value === 'planted' || value === 'advanced' || value === 'resolved' || value === 'abandoned'
}

function isCategory(value: unknown): value is ForeshadowCategory {
  return value === 'identity' || value === 'mystery' || value === 'item'
    || value === 'relationship' || value === 'event' || value === 'ability' || value === 'power'
}

function isEntry(value: unknown, requireStableIds: boolean): value is ForeshadowEntry {
  if (!isRecord(value)
    || typeof value.id !== 'string' || typeof value.name !== 'string' || typeof value.description !== 'string'
    || !isStatus(value.status) || !isCategory(value.category) || typeof value.importance !== 'number'
    || !isChapterRef(value.plantedChapter) || !Array.isArray(value.progress)
    || !value.progress.every((progress) => isRecord(progress)
      && isChapterRef(progress.chapter)
      && typeof progress.description === 'string'
      && typeof progress.recordedAt === 'string')
    || !Array.isArray(value.relatedCharacters) || !value.relatedCharacters.every((name) => typeof name === 'string')
    || (requireStableIds && (!Array.isArray(value.relatedCharacterIds) || !value.relatedCharacterIds.every((id) => typeof id === 'string')))
    || typeof value.notes !== 'string' || typeof value.createdAt !== 'string' || typeof value.updatedAt !== 'string') {
    return false
  }
  return (value.plannedResolutionChapter === undefined || isChapterRef(value.plannedResolutionChapter))
    && (value.recordedResolutionChapter === undefined || isChapterRef(value.recordedResolutionChapter))
    && (value.resolutionPlan === undefined || typeof value.resolutionPlan === 'string')
}

function isStoreV2(value: unknown): value is ForeshadowStore {
  return isRecord(value)
    && value.schemaVersion === 2
    && Array.isArray(value.entries)
    && value.entries.every((entry) => isEntry(entry, true))
    && typeof value.updatedAt === 'string'
}

function isStoreV1(value: unknown): value is { schemaVersion: 1; entries: Array<Omit<ForeshadowEntry, 'relatedCharacterIds'> & { relatedCharacterIds?: string[] }>; updatedAt: string } {
  return isRecord(value)
    && value.schemaVersion === 1
    && Array.isArray(value.entries)
    && value.entries.every((entry) => isEntry(entry, false))
    && typeof value.updatedAt === 'string'
}

function emptyStore(): ForeshadowStore {
  return { schemaVersion: 2, entries: [], updatedAt: '' }
}

function utcFileTimestamp(): string {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

async function contentHash(content: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function backupAndVerify(projectId: string, filename: string, content: string): Promise<void> {
  await atomicWriteProjectFile(projectId, LEGACY_BACKUP_DIR, filename, content)
  const copied = await readProjectFile(projectId, LEGACY_BACKUP_DIR, filename)
  if (await contentHash(copied) !== await contentHash(content)) {
    throw new Error(`备份校验失败：${filename}`)
  }
}

function isForeshadowInspiration(value: unknown): value is ForeshadowInspiration {
  return isRecord(value)
    && typeof value.summary === 'string'
    && Array.isArray(value.suggestions)
    && value.suggestions.every((suggestion) => isRecord(suggestion))
}

export function createForeshadowId(): string {
  return crypto.randomUUID()
}

/** Missing or empty files start clean; non-empty malformed and legacy files stay visible and untouched. */
export async function loadForeshadows(projectId: string): Promise<ForeshadowStore> {
  let raw: string
  try {
    raw = await readProjectFile(projectId, DIR, STORE_FILE)
  } catch (error) {
    throw new ForeshadowStoreError('corrupt', `读取伏笔数据失败：${String(error)}`)
  }
  if (!raw.trim()) return emptyStore()

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new ForeshadowStoreError('corrupt', '伏笔数据不是有效的 JSON。请先初始化新伏笔数据。')
  }
  if (!isRecord(parsed) || !('schemaVersion' in parsed)) {
    throw new ForeshadowStoreError('legacy-schema', '检测到旧版伏笔数据。请确认备份后初始化新伏笔数据。')
  }
  if (parsed.schemaVersion === 1) {
    if (!isStoreV1(parsed)) throw new ForeshadowStoreError('invalid-schema', '旧版伏笔数据字段不完整或格式错误，原文件已保留。')
    let records: Awaited<ReturnType<typeof loadCharacterCatalog>>['catalog']['records'] = []
    try {
      const config = await loadCharacterModuleConfig(projectId).catch(() => defaultCharacterModuleConfig())
      records = (await loadCharacterCatalog(projectId, config)).catalog.records
    } catch {
      // Migration preview remains usable even when the character catalog needs repair.
    }
    const unresolvedNames = new Set<string>()
    const entries = parsed.entries.map((entry) => {
      const resolvedIds = entry.relatedCharacterIds ?? entry.relatedCharacters.flatMap((name) => {
        const resolved = resolveCharacterName(records, name)
        if (!resolved.characterId) unresolvedNames.add(name)
        return resolved.characterId ? [resolved.characterId] : []
      })
      return { ...entry, relatedCharacterIds: [...new Set(resolvedIds)] }
    })
    return {
      schemaVersion: 2,
      entries,
      updatedAt: parsed.updatedAt,
      migration: { sourceSchemaVersion: 1, unresolvedNames: [...unresolvedNames] },
    }
  }
  if (parsed.schemaVersion !== 2) {
    const code: ForeshadowStoreErrorCode = typeof parsed.schemaVersion === 'number' && parsed.schemaVersion > 1
      ? 'unsupported-schema'
      : 'legacy-schema'
    throw new ForeshadowStoreError(code, `不支持的伏笔数据版本：${String(parsed.schemaVersion)}。请确认备份后初始化新伏笔数据。`)
  }
  if (!isStoreV2(parsed)) {
    throw new ForeshadowStoreError('invalid-schema', '伏笔数据字段不完整或格式错误。请确认备份后初始化新伏笔数据。')
  }
  return parsed
}

export async function initializeNewForeshadows(projectId: string): Promise<void> {
  const timestamp = utcFileTimestamp()
  const source = await readProjectFile(projectId, DIR, STORE_FILE)
  const inspiration = await readProjectFile(projectId, DIR, INSPIRE_FILE)

  if (source.trim()) {
    await backupAndVerify(projectId, `foreshadows-${timestamp}.json`, source)
  }
  if (inspiration.trim()) {
    await backupAndVerify(projectId, `foreshadow-inspiration-${timestamp}.json`, inspiration)
  }

  await atomicWriteProjectFile(projectId, DIR, STORE_FILE, JSON.stringify(emptyStore(), null, 2))
  if (inspiration.trim()) await deleteProjectFile(projectId, DIR, INSPIRE_FILE)
}

export async function saveForeshadows(projectId: string, store: ForeshadowStore): Promise<void> {
  const source = await readProjectFile(projectId, DIR, STORE_FILE)
  if (source.trim()) {
    try {
      const parsed = JSON.parse(source) as unknown
      if (isRecord(parsed) && parsed.schemaVersion === 1) {
        await backupAndVerify(projectId, `foreshadows-v1-${utcFileTimestamp()}.json`, source)
      }
    } catch {
      throw new ForeshadowStoreError('corrupt', '保存前发现原伏笔文件无法解析，未执行覆盖。')
    }
  }
  const next: ForeshadowStore = {
    schemaVersion: 2,
    entries: store.entries.map((entry) => ({ ...entry, relatedCharacterIds: [...entry.relatedCharacterIds] })),
    updatedAt: new Date().toISOString(),
  }
  if (!isStoreV2(next)) throw new ForeshadowStoreError('invalid-schema', '伏笔 v2 数据字段不完整，未执行保存。')
  await atomicWriteProjectFile(projectId, DIR, STORE_FILE, JSON.stringify(next, null, 2))
}

export async function addForeshadow(projectId: string, entry: ForeshadowEntry): Promise<void> {
  const store = await loadForeshadows(projectId)
  store.entries.push(entry)
  await saveForeshadows(projectId, store)
}

export async function updateForeshadow(projectId: string, id: string, patch: Partial<ForeshadowEntry>): Promise<void> {
  const store = await loadForeshadows(projectId)
  const index = store.entries.findIndex((entry) => entry.id === id)
  if (index === -1) return
  store.entries[index] = { ...store.entries[index]!, ...patch, updatedAt: new Date().toISOString() }
  await saveForeshadows(projectId, store)
}

export async function changeStatus(
  projectId: string,
  id: string,
  status: ForeshadowStatus,
  progress?: { chapter: ChapterRef; description: string },
): Promise<void> {
  const store = await loadForeshadows(projectId)
  const entry = store.entries.find((item) => item.id === id)
  if (!entry) return

  entry.status = status
  entry.updatedAt = new Date().toISOString()
  if (status === 'advanced' && progress) {
    entry.progress.push({ ...progress, recordedAt: new Date().toISOString() })
  }
  if (status === 'resolved') entry.recordedResolutionChapter = progress?.chapter
  if (status === 'planted') entry.recordedResolutionChapter = undefined
  await saveForeshadows(projectId, store)
}

export async function deleteForeshadow(projectId: string, id: string): Promise<void> {
  const store = await loadForeshadows(projectId)
  store.entries = store.entries.filter((entry) => entry.id !== id)
  await saveForeshadows(projectId, store)
}

export async function loadForeshadowConfig(projectId: string): Promise<ForeshadowConfig> {
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
  } catch { /* a missing project setting falls back to the preset */ }
  return { ...DEFAULT_FORESHADOW_CONFIG }
}

export async function saveForeshadowConfig(projectId: string, config: ForeshadowConfig): Promise<void> {
  await writeProjectFile(projectId, DIR, CONFIG_FILE, JSON.stringify(config, null, 2))
}

export async function saveInspiration(projectId: string, inspiration: ForeshadowInspiration | null): Promise<void> {
  await writeProjectFile(projectId, DIR, INSPIRE_FILE, JSON.stringify(inspiration, null, 2))
}

export async function loadInspiration(projectId: string): Promise<ForeshadowInspiration | null> {
  try {
    const raw = await readProjectFile(projectId, DIR, INSPIRE_FILE)
    if (raw.trim()) {
      const parsed: unknown = JSON.parse(raw)
      if (isForeshadowInspiration(parsed)) return parsed
    }
  } catch { /* no saved inspiration */ }
  return null
}
