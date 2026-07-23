import { describe, expect, it } from 'vitest'
import { parseWorldviewAuditResponse, type WorldviewAuditSource } from '../worldviewAudit'

const sources: WorldviewAuditSource[] = [
  { type: 'rule', id: 'rule_1', label: '复活限制' },
  { type: 'chapter', id: '1:chapter_2', label: '第一卷第 2 章' },
]
const context = '【复活限制】除非付出记忆，不可复活。\n【第一卷第 2 章】主角毫无代价地复活了。'

describe('parseWorldviewAuditResponse', () => {
  it('keeps a blocker with two verified evidence excerpts', () => {
    const result = parseWorldviewAuditResponse(JSON.stringify({
      schemaVersion: 1,
      summary: '发现一处冲突',
      findings: [{
        severity: 'blocker',
        title: '复活规则冲突',
        risk: '削弱限制',
        suggestedRevision: '补充代价。',
        evidence: [
          { sourceType: 'rule', sourceId: 'rule_1', excerpt: '除非付出记忆，不可复活。' },
          { sourceType: 'chapter', sourceId: '1:chapter_2', excerpt: '主角毫无代价地复活了。' },
        ],
      }],
    }), sources, context)

    expect(result.response.findings[0]?.severity).toBe('blocker')
    expect(result.response.findings[0]?.evidence).toHaveLength(2)
  })

  it('downgrades findings without verifiable evidence to info', () => {
    const result = parseWorldviewAuditResponse(JSON.stringify({
      schemaVersion: 1,
      summary: '可能有问题',
      findings: [{
        severity: 'warning',
        title: '未知问题',
        risk: '风险未知',
        suggestedRevision: '请确认。',
        evidence: [{ sourceType: 'chapter', sourceId: '1:chapter_2', excerpt: '不存在的摘录' }],
      }],
    }), sources, context)

    expect(result.response.findings[0]?.severity).toBe('info')
    expect(result.ignored).toHaveLength(1)
  })

  it('uses a default summary when the AI omits it', () => {
    const result = parseWorldviewAuditResponse(JSON.stringify({
      schemaVersion: 1,
      findings: [],
    }), sources, context)

    expect(result.response.summary).toBe('AI 已完成一致性审查。')
  })
})
