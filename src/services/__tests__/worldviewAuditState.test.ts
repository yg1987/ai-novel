import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ readProjectFile: vi.fn(), writeProjectFile: vi.fn() }))

vi.mock('../../api/tauri', () => ({ readProjectFile: mocks.readProjectFile, writeProjectFile: mocks.writeProjectFile }))

import { fingerprintWorldviewAuditFinding, loadWorldviewAuditResult, saveWorldviewAuditResult } from '../worldviewAuditState'

describe('fingerprintWorldviewAuditFinding', () => {
  beforeEach(() => {
    mocks.readProjectFile.mockReset()
    mocks.writeProjectFile.mockReset()
  })

  it('is stable for equivalent evidence and changes when evidence changes', () => {
    const finding = { id: 'a', severity: 'warning' as const, title: '冲突', risk: '风险', suggestedRevision: '修订', evidence: [{ type: 'rule' as const, id: 'r1', label: '规则', excerpt: '原文' }] }
    expect(fingerprintWorldviewAuditFinding(finding)).toBe(fingerprintWorldviewAuditFinding({ ...finding, id: 'b' }))
    expect(fingerprintWorldviewAuditFinding(finding)).not.toBe(fingerprintWorldviewAuditFinding({ ...finding, evidence: [{ ...finding.evidence[0]!, excerpt: '新原文' }] }))
  })

  it('keeps the latest audit result in project storage', async () => {
    const result = {
      response: {
        schemaVersion: 1 as const,
        summary: '发现一处冲突',
        findings: [{ id: 'audit_1', severity: 'warning' as const, title: '复活规则冲突', risk: '削弱限制', suggestedRevision: '补充代价。', evidence: [{ type: 'rule' as const, id: 'rule_1', label: '复活限制', excerpt: '不可复活。' }] }],
      },
      ignored: [],
    }

    await saveWorldviewAuditResult('project-1', result)
    const saved = mocks.writeProjectFile.mock.calls[0]?.[3] as string
    expect(mocks.writeProjectFile).toHaveBeenCalledWith('project-1', 'worldview', '_worldview_audit_result.json', saved)

    mocks.readProjectFile.mockResolvedValue(saved)
    await expect(loadWorldviewAuditResult('project-1')).resolves.toEqual(result)
  })
})
