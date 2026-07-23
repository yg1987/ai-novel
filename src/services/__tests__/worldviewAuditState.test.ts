import { describe, expect, it } from 'vitest'
import { fingerprintWorldviewAuditFinding } from '../worldviewAuditState'

describe('fingerprintWorldviewAuditFinding', () => {
  it('is stable for equivalent evidence and changes when evidence changes', () => {
    const finding = { id: 'a', severity: 'warning' as const, title: '冲突', risk: '风险', suggestedRevision: '修订', evidence: [{ type: 'rule' as const, id: 'r1', label: '规则', excerpt: '原文' }] }
    expect(fingerprintWorldviewAuditFinding(finding)).toBe(fingerprintWorldviewAuditFinding({ ...finding, id: 'b' }))
    expect(fingerprintWorldviewAuditFinding(finding)).not.toBe(fingerprintWorldviewAuditFinding({ ...finding, evidence: [{ ...finding.evidence[0]!, excerpt: '新原文' }] }))
  })
})
