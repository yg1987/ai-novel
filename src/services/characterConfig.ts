import { atomicWriteProjectFile, readProjectFile } from '../api/tauri'
import type { CharacterModuleConfig, OptionDefinition, RelationshipTypeDefinition } from '../types/character'
import { isRecord } from '../utils/unknown'

const DIRECTORY = 'characters'
const FILE = 'config.json'

const option = (id: string, label: string, order: number): OptionDefinition => ({ id, label, order })
const relationship = (id: string, label: string, order: number, tier: 1 | 2 | 3, weight: number, color: string, defaultDirection: 'undirected' | 'a-to-b'): RelationshipTypeDefinition => ({ id, label, order, tier, weight, color, defaultDirection })

export function defaultCharacterModuleConfig(): CharacterModuleConfig {
  return {
    schemaVersion: 1,
    revision: 1,
    stances: [option('protagonist', '主角', 1), option('supporting', '配角', 2), option('antagonist', '反派', 3), option('neutral', '中立', 4)],
    statuses: [option('active', '活跃', 1), option('missing', '失踪', 2), option('deceased', '已故', 3)],
    organizationKinds: [option('sect', '宗门', 1), option('family', '家族', 2), option('faction', '势力', 3), option('company', '组织', 4)],
    relationshipTypes: [
      relationship('ally', '盟友', 1, 1, 1.5, '#4f8cff', 'undirected'),
      relationship('enemy', '仇敌', 2, 1, 1.5, '#e05a5a', 'undirected'),
      relationship('rival', '对手', 3, 2, 1.2, '#f2a93b', 'undirected'),
      relationship('love', '恋情', 4, 2, 1.2, '#dd6c9d', 'undirected'),
      relationship('family', '血缘', 5, 2, 1.2, '#8c72d9', 'undirected'),
      relationship('mentor', '师徒', 6, 3, 0.5, '#38a169', 'a-to-b'),
      relationship('friend', '朋友', 7, 3, 0.5, '#4aa8a8', 'undirected'),
      relationship('ambiguous', '关联', 8, 3, 0.5, '#8892a0', 'undirected'),
    ],
    updatedAt: '',
  }
}

function isOption(value: unknown): value is OptionDefinition {
  return isRecord(value) && typeof value.id === 'string' && typeof value.label === 'string' && typeof value.order === 'number'
}

function isRelationshipType(value: unknown): value is RelationshipTypeDefinition {
  return isOption(value) && (value.tier === 1 || value.tier === 2 || value.tier === 3)
    && typeof value.weight === 'number' && typeof value.color === 'string'
    && (value.defaultDirection === 'undirected' || value.defaultDirection === 'a-to-b')
}

export function isCharacterModuleConfig(value: unknown): value is CharacterModuleConfig {
  return isRecord(value) && value.schemaVersion === 1 && typeof value.revision === 'number' && typeof value.updatedAt === 'string'
    && Array.isArray(value.stances) && value.stances.every(isOption)
    && Array.isArray(value.statuses) && value.statuses.every(isOption)
    && Array.isArray(value.organizationKinds) && value.organizationKinds.every(isOption)
    && Array.isArray(value.relationshipTypes) && value.relationshipTypes.every(isRelationshipType)
}

function validateOptions(label: string, options: readonly OptionDefinition[]): void {
  if (options.length === 0) throw new Error(`${label}至少保留一个选项。`)
  const ids = new Set<string>()
  for (const option of options) {
    if (!option.id.trim() || !option.label.trim()) throw new Error(`${label}的 ID 和名称不能为空。`)
    if (ids.has(option.id)) throw new Error(`${label}存在重复 ID：${option.id}`)
    ids.add(option.id)
  }
}

export function validateCharacterModuleConfig(config: CharacterModuleConfig): void {
  validateOptions('立场', config.stances)
  validateOptions('角色状态', config.statuses)
  validateOptions('组织类型', config.organizationKinds)
  validateOptions('关系类型', config.relationshipTypes)
}

export async function loadCharacterModuleConfig(projectId: string): Promise<CharacterModuleConfig> {
  const raw = await readProjectFile(projectId, DIRECTORY, FILE)
  if (!raw.trim()) return defaultCharacterModuleConfig()
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { throw new Error('角色预设文件不是有效的 JSON，已保留原文件。') }
  if (!isCharacterModuleConfig(parsed)) throw new Error('角色预设文件格式错误，已保留原文件。')
  validateCharacterModuleConfig(parsed)
  return parsed
}

export async function saveCharacterModuleConfig(projectId: string, config: CharacterModuleConfig, expectedRevision: number): Promise<CharacterModuleConfig> {
  if (!isCharacterModuleConfig(config)) throw new Error('角色预设格式错误，未执行保存。')
  validateCharacterModuleConfig(config)
  const current = await loadCharacterModuleConfig(projectId)
  if (current.revision !== expectedRevision) throw new Error('角色预设已被其他页面修改，请刷新后重试。')
  const next = { ...config, schemaVersion: 1 as const, revision: expectedRevision + 1, updatedAt: new Date().toISOString() }
  await atomicWriteProjectFile(projectId, DIRECTORY, FILE, JSON.stringify(next, null, 2))
  return next
}
