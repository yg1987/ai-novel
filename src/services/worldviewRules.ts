import { readProjectFile, writeProjectFile } from '../api/tauri'
import { asString, isRecord } from '../utils/unknown'

const DIR = 'worldview'
const FILE = '_worldview_rules.json'

export type WorldviewRuleStrength = 'hard' | 'convention' | 'pending'
export type WorldviewRuleStatus = 'active' | 'archived' | 'secret'

export interface WorldviewRule {
  id: string
  name: string
  statement: string
  strength: WorldviewRuleStrength
  applicableTo: string
  aliases: string[]
  status: WorldviewRuleStatus
  sourceSectionKey: string | null
  createdAt: string
  updatedAt: string
}

interface RuleStore {
  schemaVersion: 1
  rules: WorldviewRule[]
}

export interface WorldviewRuleInput {
  name: string
  statement: string
  strength: WorldviewRuleStrength
  applicableTo: string
  aliases: string[]
  status: WorldviewRuleStatus
  sourceSectionKey: string | null
}

function parseAliases(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  const aliases: unknown[] = value
  const normalized: string[] = []
  for (const alias of aliases) {
    if (typeof alias !== 'string') return null
    const trimmed = alias.trim()
    if (trimmed) normalized.push(trimmed)
  }
  return [...new Set(normalized)]
}

function parseRule(value: unknown): WorldviewRule | null {
  if (!isRecord(value)) return null
  const id = asString(value.id).trim()
  const name = asString(value.name).trim()
  const statement = asString(value.statement).trim()
  const aliases = parseAliases(value.aliases)
  const strength = value.strength
  const status = value.status
  if (!id || !name || !statement || !aliases) return null
  if (!['hard', 'convention', 'pending'].includes(String(strength))) return null
  if (!['active', 'archived', 'secret'].includes(String(status))) return null
  if (value.sourceSectionKey !== null && value.sourceSectionKey !== undefined && typeof value.sourceSectionKey !== 'string') return null
  const createdAt = asString(value.createdAt).trim()
  const updatedAt = asString(value.updatedAt).trim()
  if (!createdAt || !updatedAt) return null
  return {
    id,
    name,
    statement,
    strength: strength as WorldviewRuleStrength,
    applicableTo: asString(value.applicableTo),
    aliases,
    status: status as WorldviewRuleStatus,
    sourceSectionKey: typeof value.sourceSectionKey === 'string' && value.sourceSectionKey.trim() ? value.sourceSectionKey : null,
    createdAt,
    updatedAt,
  }
}

function normalizeInput(input: WorldviewRuleInput): WorldviewRuleInput {
  const name = input.name.trim()
  const statement = input.statement.trim()
  if (!name) throw new Error('请输入规则名称')
  if (!statement) throw new Error('请输入规则陈述')
  if (name.length > 80) throw new Error('规则名称最多 80 个字符')
  if (statement.length > 2_000) throw new Error('规则陈述最多 2000 个字符')
  return {
    ...input,
    name,
    statement,
    applicableTo: input.applicableTo.trim(),
    aliases: [...new Set(input.aliases.map((alias) => alias.trim()).filter(Boolean))],
    sourceSectionKey: input.sourceSectionKey?.trim() || null,
  }
}

async function saveRules(projectId: string, rules: WorldviewRule[]): Promise<void> {
  const store: RuleStore = { schemaVersion: 1, rules }
  await writeProjectFile(projectId, DIR, FILE, JSON.stringify(store, null, 2))
}

export async function loadWorldviewRules(projectId: string): Promise<WorldviewRule[]> {
  let raw: string
  try {
    raw = await readProjectFile(projectId, DIR, FILE)
  } catch {
    return []
  }
  if (!raw.trim()) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    throw new Error('世界观规则数据不是有效的 JSON')
  }
  if (!isRecord(parsed) || parsed.schemaVersion !== 1 || !Array.isArray(parsed.rules)) {
    throw new Error('世界观规则数据版本或结构不受支持')
  }
  const rules = parsed.rules.map(parseRule)
  if (rules.some((rule) => rule === null)) throw new Error('世界观规则包含无效条目')
  return rules as WorldviewRule[]
}

export async function createWorldviewRule(projectId: string, input: WorldviewRuleInput): Promise<WorldviewRule> {
  const normalized = normalizeInput(input)
  const rules = await loadWorldviewRules(projectId)
  const now = new Date().toISOString()
  const rule: WorldviewRule = {
    ...normalized,
    id: `rule_${String(Date.now())}`,
    createdAt: now,
    updatedAt: now,
  }
  await saveRules(projectId, [...rules, rule])
  return rule
}

export async function updateWorldviewRule(projectId: string, ruleId: string, input: WorldviewRuleInput): Promise<WorldviewRule> {
  const normalized = normalizeInput(input)
  const rules = await loadWorldviewRules(projectId)
  const existing = rules.find((rule) => rule.id === ruleId)
  if (!existing) throw new Error('未找到要更新的规则')
  const updated: WorldviewRule = { ...existing, ...normalized, updatedAt: new Date().toISOString() }
  await saveRules(projectId, rules.map((rule) => rule.id === ruleId ? updated : rule))
  return updated
}

export async function deleteWorldviewRule(projectId: string, ruleId: string): Promise<void> {
  const rules = await loadWorldviewRules(projectId)
  await saveRules(projectId, rules.filter((rule) => rule.id !== ruleId))
}
