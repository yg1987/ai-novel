import { atomicWriteProjectFile, listProjectFiles, readProjectFile } from '../api/tauri'
import type {
  CharacterCatalog,
  CharacterModuleConfig,
  CharacterOrder,
  CharacterRecord,
  OrganizationRecord,
  ReferenceDiagnostic,
} from '../types/character'
import { characterNameKey } from './characterNames'
import { parseCharacterMarkdown } from './characterMarkdown'
import { isRecord } from '../utils/unknown'
import type { ChapterRef } from '../types/chapter'

const DIRECTORY = 'characters'
const CATALOG_FILE = 'catalog.json'
const ORDER_FILE = 'order.json'

function now(): string {
  return new Date().toISOString()
}

export async function hashText(content: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isChapterRef(value: unknown): value is ChapterRef {
  return isRecord(value) && typeof value.volume === 'string' && typeof value.chapterId === 'string'
}

function isAffiliations(value: unknown): value is CharacterRecord['affiliations'] {
  return Array.isArray(value) && value.every((affiliation) => isRecord(affiliation)
    && typeof affiliation.organizationId === 'string'
    && Array.isArray(affiliation.periods)
    && affiliation.periods.every((period) => isRecord(period)
      && typeof period.id === 'string' && typeof period.role === 'string'
      && (period.status === 'active' || period.status === 'former' || period.status === 'hidden')
      && (period.startChapter === undefined || isChapterRef(period.startChapter))
      && (period.endChapter === undefined || isChapterRef(period.endChapter))
      && typeof period.notes === 'string'))
}

function isRecordShape(value: unknown): value is CharacterRecord {
  return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string'
    && typeof value.fileName === 'string' && isStringArray(value.aliases)
    && typeof value.identity === 'string' && typeof value.stanceId === 'string' && typeof value.statusId === 'string'
    && (value.gender === '男' || value.gender === '女' || value.gender === '未知')
    && isStringArray(value.tags) && isAffiliations(value.affiliations)
    && typeof value.contentHash === 'string' && typeof value.projectionHash === 'string'
    && typeof value.createdAt === 'string' && typeof value.updatedAt === 'string'
}

export function isCharacterCatalog(value: unknown): value is CharacterCatalog {
  return isRecord(value) && value.schemaVersion === 1 && typeof value.revision === 'number'
    && Array.isArray(value.records) && value.records.every(isRecordShape) && typeof value.updatedAt === 'string'
}

function labelToId(options: readonly { id: string; label: string }[], label: string, fallback: string): string {
  return options.find((item) => item.label === label || item.id === label)?.id ?? fallback
}

const legacyStanceValues = new Set(['主角', '核心', '配角', '反派', '中立'])

function legacyField(content: string, names: readonly string[]): string {
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([^：:]+)[：:]\s*(.*?)\s*$/)
    if (match && names.includes(match[1]?.trim() ?? '')) return match[2]?.trim() ?? ''
  }
  return ''
}

export interface CatalogInitialization {
  catalog: CharacterCatalog
  organizationCandidates: string[]
  diagnostics: ReferenceDiagnostic[]
}

export async function initializeCharacterCatalog(projectId: string, config: CharacterModuleConfig): Promise<CatalogInitialization> {
  const files = (await listProjectFiles(projectId, DIRECTORY)).filter((entry) => entry.name.toLocaleLowerCase().endsWith('.md'))
  const records: CharacterRecord[] = []
  const organizationCandidates = new Set<string>()
  const diagnostics: ReferenceDiagnostic[] = []
  const timestamp = now()
  for (const file of files) {
    const content = await readProjectFile(projectId, DIRECTORY, file.name)
    const projection = parseCharacterMarkdown(content)
    const fileName = file.name
    const fallbackName = fileName.replace(/\.md$/i, '')
    const name = projection.name || fallbackName
    const identityStance = legacyStanceValues.has(projection.identity) ? projection.identity : ''
    const legacyFaction = legacyField(content, ['阵营'])
    const explicitStance = projection.stance || identityStance || (legacyStanceValues.has(legacyFaction) ? legacyFaction : '')
    const legacyOrganizations = [
      ...projection.organizations,
      ...legacyField(content, ['势力', '组织']).split(/[，,]/),
      ...(legacyFaction && !legacyStanceValues.has(legacyFaction) ? [legacyFaction] : []),
    ].map((item) => item.trim()).filter(Boolean)
    legacyOrganizations.forEach((item) => organizationCandidates.add(item))
    const projectionHash = await hashText(JSON.stringify(projection))
    records.push({
      id: crypto.randomUUID(),
      name,
      fileName,
      aliases: name === fallbackName ? [] : [fallbackName],
      identity: projection.identity,
      stanceId: labelToId(config.stances, explicitStance, 'neutral'),
      statusId: labelToId(config.statuses, projection.status, 'active'),
      gender: projection.gender,
      tags: projection.tags,
      affiliations: [],
      contentHash: await hashText(content),
      projectionHash,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    for (const field of projection.duplicateFields) diagnostics.push({ value: `${name}：${field}`, kind: 'ambiguous' })
  }
  assertUniqueCharacterNames(records)
  const catalog: CharacterCatalog = { schemaVersion: 1, revision: 1, records, updatedAt: timestamp }
  await atomicWriteProjectFile(projectId, DIRECTORY, CATALOG_FILE, JSON.stringify(catalog, null, 2))
  return { catalog, organizationCandidates: Array.from(organizationCandidates), diagnostics }
}

/** A malformed non-empty catalog is never replaced with an empty default. */
export async function loadCharacterCatalog(projectId: string, config: CharacterModuleConfig): Promise<CatalogInitialization> {
  const raw = await readProjectFile(projectId, DIRECTORY, CATALOG_FILE)
  if (!raw.trim()) return initializeCharacterCatalog(projectId, config)
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { throw new Error('角色目录不是有效的 JSON，原文件已保留。') }
  if (!isCharacterCatalog(parsed)) throw new Error('角色目录字段不完整或版本不受支持，原文件已保留。')
  assertUniqueCharacterNames(parsed.records)
  return { catalog: parsed, organizationCandidates: [], diagnostics: [] }
}

export async function saveCharacterCatalog(projectId: string, catalog: CharacterCatalog, expectedRevision: number): Promise<CharacterCatalog> {
  const current = await loadCharacterCatalogRaw(projectId)
  if (current.revision !== expectedRevision) throw new Error('角色目录已被其他页面修改，请刷新后重试。')
  assertUniqueCharacterNames(catalog.records)
  const next: CharacterCatalog = { ...catalog, schemaVersion: 1, revision: expectedRevision + 1, updatedAt: now() }
  await atomicWriteProjectFile(projectId, DIRECTORY, CATALOG_FILE, JSON.stringify(next, null, 2))
  return next
}

/** Builds, but does not persist, the catalog projection that belongs in a character bundle transaction. */
export async function syncCharacterCatalogRecord(
  catalog: CharacterCatalog,
  filename: string,
  content: string,
  config: CharacterModuleConfig,
  organizations?: readonly OrganizationRecord[],
): Promise<CharacterCatalog> {
  const projection = parseCharacterMarkdown(content)
  const fileName = filename
  const fallbackName = filename.replace(/\.md$/i, '')
  const existing = catalog.records.find((record) => record.fileName === fileName)
  const timestamp = now()
  let affiliations = (existing?.affiliations ?? []).map((affiliation) => ({
    ...affiliation,
    periods: affiliation.periods.map((period) => ({ ...period })),
  }))
  if (organizations) {
    const selectedIds = new Set(projection.organizations.flatMap((name) => {
      const key = characterNameKey(name)
      const organization = organizations.find((item) => [item.name, ...item.aliases].some((value) => characterNameKey(value) === key))
      return organization ? [organization.id] : []
    }))
    affiliations = affiliations.map((affiliation) => selectedIds.has(affiliation.organizationId) ? affiliation : {
      ...affiliation,
      periods: affiliation.periods.map((period) => !period.endChapter && period.status !== 'former' ? { ...period, status: 'former' as const } : period),
    })
    for (const organizationId of selectedIds) {
      const existingAffiliation = affiliations.find((item) => item.organizationId === organizationId)
      if (existingAffiliation) {
        if (!existingAffiliation.periods.some((period) => !period.endChapter && period.status !== 'former')) {
          existingAffiliation.periods.push({ id: crypto.randomUUID(), role: '', status: 'active', notes: '' })
        }
      } else {
        affiliations.push({ organizationId, periods: [{ id: crypto.randomUUID(), role: '', status: 'active', notes: '' }] })
      }
    }
  }
  const record: CharacterRecord = {
    id: existing?.id ?? crypto.randomUUID(),
    name: projection.name || existing?.name || fallbackName,
    fileName,
    aliases: existing?.aliases ?? [],
    identity: projection.identity,
    stanceId: labelToId(config.stances, projection.stance, existing?.stanceId ?? 'neutral'),
    statusId: labelToId(config.statuses, projection.status, existing?.statusId ?? 'active'),
    gender: projection.gender,
    tags: projection.tags,
    affiliations,
    contentHash: await hashText(content),
    projectionHash: await hashText(JSON.stringify(projection)),
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
  }
  const nextRecords = existing
    ? catalog.records.map((item) => item.id === existing.id ? record : item)
    : [...catalog.records, record]
  assertUniqueCharacterNames(nextRecords)
  return { ...catalog, records: nextRecords, revision: catalog.revision + 1, updatedAt: timestamp }
}

async function loadCharacterCatalogRaw(projectId: string): Promise<CharacterCatalog> {
  const raw = await readProjectFile(projectId, DIRECTORY, CATALOG_FILE)
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { throw new Error('角色目录不是有效的 JSON，原文件已保留。') }
  if (!isCharacterCatalog(parsed)) throw new Error('角色目录字段不完整或版本不受支持，原文件已保留。')
  return parsed
}

export function assertUniqueCharacterNames(records: readonly CharacterRecord[]): void {
  const ownerByKey = new Map<string, string>()
  for (const record of records) {
    for (const value of [record.name, ...record.aliases]) {
      const key = characterNameKey(value)
      const owner = ownerByKey.get(key)
      if (owner && owner !== record.id) throw new Error(`角色名称或别名冲突：${value}`)
      ownerByKey.set(key, record.id)
    }
  }
}

export function resolveCharacterReferenceAsAlias(
  records: readonly CharacterRecord[],
  value: string,
  targetCharacterId: string,
): CharacterRecord[] {
  const alias = value.trim()
  if (!alias) throw new Error('待修复的角色名称不能为空。')
  if (!records.some((record) => record.id === targetCharacterId)) throw new Error('所选角色不存在，请刷新后重试。')
  const aliasKey = characterNameKey(alias)
  if (records.some((record) => record.id !== targetCharacterId && characterNameKey(record.name) === aliasKey)) {
    throw new Error('该名称已经是其他角色的正式名称，不能登记为别名。')
  }
  const nextRecords = records.map((record) => {
    const aliases = record.aliases.filter((candidate) => characterNameKey(candidate) !== aliasKey)
    if (record.id === targetCharacterId && characterNameKey(record.name) !== aliasKey) aliases.push(alias)
    return { ...record, aliases }
  })
  assertUniqueCharacterNames(nextRecords)
  return nextRecords
}

export function resolveCharacterName(records: readonly CharacterRecord[], value: string): { characterId?: string; diagnostic?: ReferenceDiagnostic } {
  const key = characterNameKey(value)
  const matches = records.filter((record) => [record.name, ...record.aliases].some((name) => characterNameKey(name) === key))
  if (matches.length === 1) return { characterId: matches[0]!.id }
  if (matches.length === 0) return { diagnostic: { value, kind: 'unresolved' } }
  return { diagnostic: { value, kind: 'ambiguous', candidates: matches.map((record) => record.id) } }
}

export async function loadCharacterOrder(projectId: string, records: readonly CharacterRecord[]): Promise<{ order: CharacterOrder; upgraded: boolean }> {
  const raw = await readProjectFile(projectId, DIRECTORY, ORDER_FILE)
  if (!raw.trim()) return { order: { schemaVersion: 2, characterIds: records.map((record) => record.id) }, upgraded: false }
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { throw new Error('角色排序文件不是有效的 JSON，原文件已保留。') }
  let ids: string[]
  let upgraded = false
  if (Array.isArray(parsed) && parsed.every((value) => typeof value === 'string')) {
    ids = parsed.flatMap((name) => resolveCharacterName(records, name).characterId ?? [])
    upgraded = true
  } else if (isRecord(parsed) && parsed.schemaVersion === 2 && isStringArray(parsed.characterIds)) {
    ids = parsed.characterIds
  } else {
    throw new Error('角色排序文件格式错误，原文件已保留。')
  }
  const existing = new Set(records.map((record) => record.id))
  const seen = new Set<string>()
  const normalized = ids.filter((id) => existing.has(id) && !seen.has(id) && Boolean(seen.add(id)))
  for (const record of records) if (!seen.has(record.id)) normalized.push(record.id)
  return { order: { schemaVersion: 2, characterIds: normalized }, upgraded }
}

export async function saveCharacterOrder(projectId: string, order: CharacterOrder): Promise<void> {
  await atomicWriteProjectFile(projectId, DIRECTORY, ORDER_FILE, JSON.stringify(order, null, 2))
}
