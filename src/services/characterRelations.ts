import { atomicWriteProjectFile, readProjectFile } from '../api/tauri'
import type { ChapterRef } from '../types/chapter'
import type { CharacterRelationship, CharacterRelationshipStore, RelationshipPeriod } from '../types/character'
import { isRecord } from '../utils/unknown'

const DIRECTORY = 'characters'
const FILE = 'relationships.json'

function isChapterRef(value: unknown): value is ChapterRef {
  return isRecord(value) && typeof value.volume === 'string' && typeof value.chapterId === 'string'
}

function isPeriod(value: unknown): value is RelationshipPeriod {
  return isRecord(value) && typeof value.id === 'string' && typeof value.typeId === 'string'
    && (value.status === 'active' || value.status === 'ended' || value.status === 'uncertain')
    && (value.startChapter === undefined || isChapterRef(value.startChapter))
    && (value.endChapter === undefined || isChapterRef(value.endChapter))
    && typeof value.description === 'string'
}

function isRelationship(value: unknown): value is CharacterRelationship {
  return isRecord(value) && typeof value.id === 'string' && typeof value.characterAId === 'string' && typeof value.characterBId === 'string'
    && (value.direction === 'undirected' || value.direction === 'a-to-b' || value.direction === 'b-to-a')
    && Array.isArray(value.periods) && value.periods.every(isPeriod) && typeof value.notes === 'string'
    && typeof value.createdAt === 'string' && typeof value.updatedAt === 'string'
}

export function isCharacterRelationshipStore(value: unknown): value is CharacterRelationshipStore {
  return isRecord(value) && value.schemaVersion === 1 && typeof value.revision === 'number'
    && Array.isArray(value.relationships) && value.relationships.every(isRelationship) && typeof value.updatedAt === 'string'
}

export type ChapterPosition = (reference: ChapterRef) => number | undefined

function rangeStart(period: RelationshipPeriod, chapterPosition?: ChapterPosition): number | undefined {
  return period.startChapter ? chapterPosition?.(period.startChapter) : undefined
}

function rangeEnd(period: RelationshipPeriod, chapterPosition?: ChapterPosition): number | undefined {
  return period.endChapter ? chapterPosition?.(period.endChapter) : undefined
}

export function validateRelationship(record: CharacterRelationship, characterIds: ReadonlySet<string>, chapterPosition?: ChapterPosition): void {
  if (record.characterAId === record.characterBId) throw new Error('角色不能与自己建立关系。')
  if (!characterIds.has(record.characterAId) || !characterIds.has(record.characterBId)) throw new Error('关系引用了不存在的角色。')
  const openPeriods = record.periods.filter((period) => !period.endChapter && period.status !== 'ended')
  if (openPeriods.length > 1) throw new Error('同一关系最多只能有一个未结束的当前阶段。')
  const periodIds = new Set<string>()
  for (const period of record.periods) {
    if (periodIds.has(period.id)) throw new Error('同一关系的历史阶段 ID 不能重复。')
    periodIds.add(period.id)
    const start = rangeStart(period, chapterPosition)
    const end = rangeEnd(period, chapterPosition)
    if (start !== undefined && end !== undefined && start > end) throw new Error('关系阶段的结束章节不能早于开始章节。')
  }
  if (chapterPosition) {
    const sorted = record.periods.slice().sort((left, right) => (rangeStart(left, chapterPosition) ?? -Infinity) - (rangeStart(right, chapterPosition) ?? -Infinity))
    for (let index = 1; index < sorted.length; index++) {
      const previous = sorted[index - 1]!
      const current = sorted[index]!
      const previousEnd = rangeEnd(previous, chapterPosition)
      const currentStart = rangeStart(current, chapterPosition)
      if (previousEnd === undefined || currentStart === undefined || previousEnd >= currentStart) throw new Error('同一关系的历史阶段不能重叠。')
    }
  }
}

export function validateRelationshipStore(store: CharacterRelationshipStore, characterIds: ReadonlySet<string>, chapterPosition?: ChapterPosition): void {
  const pairKeys = new Set<string>()
  for (const relationship of store.relationships) {
    validateRelationship(relationship, characterIds, chapterPosition)
    const key = [relationship.characterAId, relationship.characterBId].sort().join('::')
    if (pairKeys.has(key)) throw new Error('同一对角色只能保留一条关系记录，请将阶段合并到该记录。')
    pairKeys.add(key)
  }
}

function reverseDirection(direction: CharacterRelationship['direction']): CharacterRelationship['direction'] {
  if (direction === 'a-to-b') return 'b-to-a'
  if (direction === 'b-to-a') return 'a-to-b'
  return direction
}

export function mergeDuplicateRelationships(records: readonly CharacterRelationship[]): CharacterRelationship[] {
  const merged: CharacterRelationship[] = []
  const byPair = new Map<string, CharacterRelationship>()
  for (const record of records) {
    const key = [record.characterAId, record.characterBId].sort().join('::')
    const existing = byPair.get(key)
    if (!existing) {
      const clone = { ...record, periods: record.periods.map((period) => ({ ...period })) }
      byPair.set(key, clone)
      merged.push(clone)
      continue
    }
    const sameOrientation = existing.characterAId === record.characterAId && existing.characterBId === record.characterBId
    const direction = sameOrientation ? record.direction : reverseDirection(record.direction)
    if (existing.direction !== direction) throw new Error('同一对角色存在方向冲突的重复关系记录，请先确认关系方向。')
    const periodIds = new Set(existing.periods.map((period) => period.id))
    for (const period of record.periods) {
      if (periodIds.has(period.id)) throw new Error('重复关系记录包含冲突的阶段 ID，请先修复关系数据。')
      existing.periods.push({ ...period })
      periodIds.add(period.id)
    }
    if (record.notes && !existing.notes.includes(record.notes)) existing.notes = existing.notes ? `${existing.notes}\n${record.notes}` : record.notes
    if (record.updatedAt > existing.updatedAt) existing.updatedAt = record.updatedAt
  }
  return merged
}

export async function loadCharacterRelationships(projectId: string): Promise<CharacterRelationshipStore> {
  const raw = await readProjectFile(projectId, DIRECTORY, FILE)
  if (!raw.trim()) return { schemaVersion: 1, revision: 0, relationships: [], updatedAt: '' }
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { throw new Error('角色关系文件不是有效的 JSON，原文件已保留。') }
  if (!isCharacterRelationshipStore(parsed)) throw new Error('角色关系文件字段不完整或版本不受支持，原文件已保留。')
  return { ...parsed, relationships: mergeDuplicateRelationships(parsed.relationships) }
}

export async function saveCharacterRelationships(
  projectId: string,
  store: CharacterRelationshipStore,
  expectedRevision: number,
  characterIds: ReadonlySet<string>,
  chapterPosition?: ChapterPosition,
): Promise<CharacterRelationshipStore> {
  const current = await loadCharacterRelationships(projectId)
  if (current.revision !== expectedRevision) throw new Error('角色关系已被其他页面修改，请刷新后重试。')
  const relationships = mergeDuplicateRelationships(store.relationships)
  const normalized = { ...store, relationships }
  validateRelationshipStore(normalized, characterIds, chapterPosition)
  const next: CharacterRelationshipStore = { ...normalized, schemaVersion: 1, revision: expectedRevision + 1, updatedAt: new Date().toISOString() }
  await atomicWriteProjectFile(projectId, DIRECTORY, FILE, JSON.stringify(next, null, 2))
  return next
}

export function currentRelationshipPeriod(record: CharacterRelationship): RelationshipPeriod | undefined {
  return record.periods.find((period) => !period.endChapter && period.status !== 'ended')
}
