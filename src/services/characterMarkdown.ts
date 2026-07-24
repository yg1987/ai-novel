import type { CharacterGender, CharacterModuleConfig, CharacterRecord, OrganizationRecord } from '../types/character'
import { characterNameKey } from './characterNames'

export const CHARACTER_MARKDOWN_FIELDS = ['角色', '性别', '身份/职业', '立场', '角色状态', '标签', '所属组织'] as const
export type CharacterMarkdownField = typeof CHARACTER_MARKDOWN_FIELDS[number]

export interface CharacterMarkdownProjection {
  name: string
  gender: CharacterGender
  identity: string
  stance: string
  status: string
  tags: string[]
  organizations: string[]
  duplicateFields: CharacterMarkdownField[]
}

export interface CharacterMarkdownDiagnostics {
  duplicateFields: CharacterMarkdownField[]
  invalidStance?: string
  invalidStatus?: string
  unknownOrganizations: string[]
}

const fieldExpression = /^\s*(角色|性别|身份\/职业|立场|角色状态|标签|所属组织)[：:]\s*(.*?)\s*$/

function listValue(value: string): string[] {
  const trimmed = value.trim()
  if (!trimmed) return []
  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
      return parsed.map((item) => item.trim()).filter(Boolean)
    }
  } catch { /* fall through to comma-separated input */ }
  return trimmed.replace(/^\[|\]$/g, '').split(/[，,]/).map((item) => item.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
}

function formatList(values: readonly string[]): string {
  return `[${values.map((value) => JSON.stringify(value)).join(', ')}]`
}

/** Only exact, standard field names participate in the structured projection. */
export function parseCharacterMarkdown(content: string): CharacterMarkdownProjection {
  const fields = new Map<CharacterMarkdownField, string>()
  const duplicateFields: CharacterMarkdownField[] = []
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(fieldExpression)
    if (!match) continue
    const key = match[1] as CharacterMarkdownField
    if (fields.has(key)) {
      duplicateFields.push(key)
      continue
    }
    fields.set(key, match[2] ?? '')
  }
  const gender = fields.get('性别')
  return {
    name: fields.get('角色')?.trim() ?? '',
    gender: gender === '男' || gender === '女' || gender === '未知' ? gender : '未知',
    identity: fields.get('身份/职业')?.trim() ?? '',
    stance: fields.get('立场')?.trim() ?? '',
    status: fields.get('角色状态')?.trim() ?? '',
    tags: listValue(fields.get('标签') ?? ''),
    organizations: listValue(fields.get('所属组织') ?? ''),
    duplicateFields,
  }
}

export function diagnoseCharacterMarkdown(
  content: string,
  config: CharacterModuleConfig,
  organizations: readonly OrganizationRecord[],
): CharacterMarkdownDiagnostics {
  const projection = parseCharacterMarkdown(content)
  const matchesOption = (value: string, options: readonly { id: string; label: string }[]) => !value || options.some((option) => option.id === value || option.label === value)
  const knownOrganizationNames = new Set(organizations.flatMap((organization) => [organization.name, ...organization.aliases]).map(characterNameKey))
  return {
    duplicateFields: projection.duplicateFields,
    invalidStance: matchesOption(projection.stance, config.stances) ? undefined : projection.stance,
    invalidStatus: matchesOption(projection.status, config.statuses) ? undefined : projection.status,
    unknownOrganizations: projection.organizations.filter((name) => !knownOrganizationNames.has(characterNameKey(name))),
  }
}

export function updateCharacterMarkdownField(content: string, field: CharacterMarkdownField, value: string | readonly string[]): string {
  const rendered = Array.isArray(value) ? formatList(value) : value
  const expression = new RegExp(`^\\s*${field.replace('/', '\\/')}[：:].*$`, 'm')
  if (expression.test(content)) return content.replace(expression, `${field}：${rendered}`)
  const lines = content.split(/\r?\n/)
  const roleIndex = lines.findIndex((line) => /^\s*角色[：:]/.test(line))
  const at = roleIndex === -1 ? 0 : roleIndex + 1
  lines.splice(at, 0, `${field}：${rendered}`)
  return lines.join('\n')
}

export function projectCharacterRecord(record: CharacterRecord, organizationNames: ReadonlyMap<string, string>): Record<CharacterMarkdownField, string | string[]> {
  const currentOrganizations = record.affiliations.flatMap((affiliation) => {
    const current = affiliation.periods.some((period) => !period.endChapter && period.status !== 'former')
    const name = organizationNames.get(affiliation.organizationId)
    return current && name ? [name] : []
  })
  return {
    角色: record.name,
    性别: record.gender,
    '身份/职业': record.identity,
    立场: record.stanceId,
    角色状态: record.statusId,
    标签: record.tags,
    所属组织: currentOrganizations,
  }
}

export function applyCharacterProjection(content: string, projection: Record<CharacterMarkdownField, string | string[]>): string {
  return CHARACTER_MARKDOWN_FIELDS.reduce((next, field) => updateCharacterMarkdownField(next, field, projection[field]), content)
}
