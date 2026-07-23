import type { SectionDef } from './worldviewConfig'
import type { WorldviewRule } from './worldviewRules'

export type WorldviewRuleCheckKind =
  | 'alias_conflict'
  | 'duplicate_hard_rule'
  | 'archived_rule_reference'
  | 'missing_source_section'
  | 'secret_rule_in_ai_context'

export type WorldviewRuleCheckSeverity = 'warning' | 'info'

export interface WorldviewRuleCheckFinding {
  id: string
  kind: WorldviewRuleCheckKind
  severity: WorldviewRuleCheckSeverity
  title: string
  detail: string
  ruleIds: string[]
  sourceLabel?: string
  excerpt?: string
}

export interface WorldviewRuleCheckSource {
  sectionKey: string
  label: string
  content: string
}

export interface WorldviewRuleCheckInput {
  rules: WorldviewRule[]
  sections: SectionDef[]
  sources: WorldviewRuleCheckSource[]
  ordinaryAiRuleIds?: readonly string[]
}

function normalizeTerm(value: string): string {
  return value.trim().toLocaleLowerCase()
}

function excerptAround(content: string, term: string): string {
  const index = content.toLocaleLowerCase().indexOf(term.toLocaleLowerCase())
  if (index < 0) return ''
  const start = Math.max(0, index - 24)
  const end = Math.min(content.length, index + term.length + 48)
  return `${start > 0 ? '…' : ''}${content.slice(start, end).replace(/\s+/gu, ' ').trim()}${end < content.length ? '…' : ''}`
}

function findingId(kind: WorldviewRuleCheckKind, values: string[]): string {
  return `${kind}:${[...values].sort().join(',')}`
}

export function checkWorldviewRules({ rules, sections, sources, ordinaryAiRuleIds = [] }: WorldviewRuleCheckInput): WorldviewRuleCheckFinding[] {
  const findings: WorldviewRuleCheckFinding[] = []
  const sectionKeys = new Set(sections.map((section) => section.key))
  const terms = new Map<string, WorldviewRule[]>()

  for (const rule of rules) {
    const uniqueTerms = new Set([rule.name, ...rule.aliases].map(normalizeTerm).filter(Boolean))
    for (const term of uniqueTerms) {
      const related = terms.get(term) ?? []
      related.push(rule)
      terms.set(term, related)
    }

    if (rule.sourceSectionKey && !sectionKeys.has(rule.sourceSectionKey)) {
      findings.push({
        id: findingId('missing_source_section', [rule.id]),
        kind: 'missing_source_section',
        severity: 'warning',
        title: `“${rule.name}” 的来源栏目已不存在`,
        detail: '请重新选择来源栏目，或清除来源信息。',
        ruleIds: [rule.id],
      })
    }
  }

  for (const [term, related] of terms) {
    if (related.length < 2) continue
    findings.push({
      id: findingId('alias_conflict', related.map((rule) => rule.id)),
      kind: 'alias_conflict',
      severity: 'warning',
      title: `术语“${term}”被多个规则使用`,
      detail: `涉及规则：${related.map((rule) => rule.name).join('、')}。请确认它们是否指向同一设定。`,
      ruleIds: related.map((rule) => rule.id),
    })
  }

  const hardRulesByName = new Map<string, WorldviewRule[]>()
  for (const rule of rules.filter((item) => item.strength === 'hard')) {
    const name = normalizeTerm(rule.name)
    const related = hardRulesByName.get(name) ?? []
    related.push(rule)
    hardRulesByName.set(name, related)
  }
  for (const related of hardRulesByName.values()) {
    if (related.length < 2) continue
    findings.push({
      id: findingId('duplicate_hard_rule', related.map((rule) => rule.id)),
      kind: 'duplicate_hard_rule',
      severity: 'warning',
      title: `硬规则“${related[0]!.name}”存在多个版本`,
      detail: '同名硬规则可能包含相互矛盾的陈述；请合并、改名或调整强度。',
      ruleIds: related.map((rule) => rule.id),
    })
  }

  for (const rule of rules.filter((item) => item.status === 'archived')) {
    const ruleTerms = [rule.name, ...rule.aliases].map((term) => term.trim()).filter(Boolean)
    const reference = sources.find((source) => ruleTerms.some((term) => source.content.includes(term)))
    if (!reference) continue
    const matchedTerm = ruleTerms.find((term) => reference.content.includes(term)) ?? rule.name
    findings.push({
      id: findingId('archived_rule_reference', [rule.id, reference.sectionKey]),
      kind: 'archived_rule_reference',
      severity: 'info',
      title: `已废弃规则“${rule.name}”仍在栏目中被引用`,
      detail: '这可能是历史设定保留，也可能需要更新对应的 Markdown 内容。',
      ruleIds: [rule.id],
      sourceLabel: reference.label,
      excerpt: excerptAround(reference.content, matchedTerm),
    })
  }

  const ordinaryAiRuleIdSet = new Set(ordinaryAiRuleIds)
  for (const rule of rules.filter((item) => item.status === 'secret' && ordinaryAiRuleIdSet.has(item.id))) {
    findings.push({
      id: findingId('secret_rule_in_ai_context', [rule.id]),
      kind: 'secret_rule_in_ai_context',
      severity: 'warning',
      title: `保密规则“${rule.name}”被加入普通 AI 上下文`,
      detail: '请从普通 AI 上下文中排除该规则，只在明确允许的剧情保密流程中使用。',
      ruleIds: [rule.id],
    })
  }

  return findings
}
