import { describe, expect, it } from 'vitest'
import { checkWorldviewRules } from '../worldviewRuleChecks'
import type { WorldviewRule } from '../worldviewRules'

const sections = [{ key: 'power', label: '力量体系', file: 'power.md', hint: '', subs: [] }]

function rule(overrides: Partial<WorldviewRule> = {}): WorldviewRule {
  return {
    id: 'rule_1',
    name: '灵力上限',
    statement: '每人灵力有限。',
    strength: 'hard',
    applicableTo: '',
    aliases: [],
    status: 'active',
    sourceSectionKey: 'power',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('checkWorldviewRules', () => {
  it('reports conflicting aliases and duplicate hard-rule names', () => {
    const findings = checkWorldviewRules({
      rules: [rule({ aliases: ['灵压'] }), rule({ id: 'rule_2', name: '灵力上限', aliases: ['灵压'] })],
      sections,
      sources: [],
    })

    expect(findings.map((finding) => finding.kind)).toEqual(expect.arrayContaining(['alias_conflict', 'duplicate_hard_rule']))
  })

  it('reports archived rules still mentioned in configured worldview sections', () => {
    const findings = checkWorldviewRules({
      rules: [rule({ status: 'archived', name: '旧王都', aliases: ['王城'] })],
      sections,
      sources: [{ sectionKey: 'power', label: '力量体系', content: '旧王都已经废弃，但王城遗址仍然存在。' }],
    })

    const archivedReference = findings.find((finding) => finding.kind === 'archived_rule_reference')
    expect(archivedReference?.sourceLabel).toBe('力量体系')
    expect(archivedReference?.excerpt).toContain('旧王都')
  })

  it('reports deleted sources and secret rules supplied to ordinary AI context', () => {
    const findings = checkWorldviewRules({
      rules: [
        rule({ sourceSectionKey: 'deleted' }),
        rule({ id: 'secret', name: '终局真相', status: 'secret' }),
      ],
      sections,
      sources: [],
      ordinaryAiRuleIds: ['secret'],
    })

    expect(findings.map((finding) => finding.kind)).toEqual(expect.arrayContaining(['missing_source_section', 'secret_rule_in_ai_context']))
  })
})
