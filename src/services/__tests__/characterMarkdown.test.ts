import { describe, expect, it } from 'vitest'
import type { CharacterModuleConfig, OrganizationRecord } from '../../types/character'
import { applyCharacterProjection, diagnoseCharacterMarkdown, parseCharacterMarkdown, updateCharacterMarkdownField } from '../characterMarkdown'

const config: CharacterModuleConfig = {
  schemaVersion: 1,
  revision: 0,
  stances: [{ id: 'neutral', label: '中立', order: 0 }],
  statuses: [{ id: 'active', label: '活跃', order: 0 }],
  organizationKinds: [],
  relationshipTypes: [],
  updatedAt: '',
}

const organization: OrganizationRecord = {
  id: 'organization-1',
  name: '玄天宗',
  aliases: ['玄宗'],
  kindId: 'faction',
  description: '',
  status: 'active',
  createdAt: '',
  updatedAt: '',
}

describe('characterMarkdown', () => {
  it('only projects exact standard fields and reports duplicates', () => {
    const parsed = parseCharacterMarkdown('角色：林烬\n角色设定：不应匹配\n标签：["剑修", "主角"]\n标签：重复')
    expect(parsed.name).toBe('林烬')
    expect(parsed.tags).toEqual(['剑修', '主角'])
    expect(parsed.duplicateFields).toEqual(['标签'])
  })

  it('updates the first standard field without touching free-form prose', () => {
    const source = '角色：林烬\n身份/职业：剑修\n\n身份/职业补充：这是正文'
    expect(updateCharacterMarkdownField(source, '身份/职业', '宗主')).toContain('身份/职业：宗主\n\n身份/职业补充：这是正文')
  })

  it('adds all missing standard fields as a Markdown projection', () => {
    const result = applyCharacterProjection('角色：林烬\n\n自由正文', {
      角色: '林烬', 性别: '男', '身份/职业': '剑修', 立场: 'protagonist', 角色状态: 'active', 标签: ['剑修'], 所属组织: ['玄天宗'],
    })
    expect(result).toContain('性别：男')
    expect(result).toContain('所属组织：["玄天宗"]')
    expect(result).toContain('自由正文')
  })

  it('reports invalid configured values and unknown organizations', () => {
    const diagnostics = diagnoseCharacterMarkdown('立场：混乱\n角色状态：失踪\n所属组织：["陌生组织"]', config, [organization])

    expect(diagnostics).toMatchObject({
      invalidStance: '混乱',
      invalidStatus: '失踪',
      unknownOrganizations: ['陌生组织'],
    })
  })

  it('accepts configured IDs, labels, and organization aliases', () => {
    const byId = diagnoseCharacterMarkdown('立场：neutral\n角色状态：active\n所属组织：["玄宗"]', config, [organization])
    const byLabel = diagnoseCharacterMarkdown('立场：中立\n角色状态：活跃\n所属组织：["玄天宗"]', config, [organization])

    expect(byId).toMatchObject({ unknownOrganizations: [] })
    expect(byId.invalidStance).toBeUndefined()
    expect(byId.invalidStatus).toBeUndefined()
    expect(byLabel.invalidStance).toBeUndefined()
    expect(byLabel.invalidStatus).toBeUndefined()
  })
})
