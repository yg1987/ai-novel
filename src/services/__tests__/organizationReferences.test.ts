import { describe, expect, it } from 'vitest'
import type { CharacterRecord, OrganizationRecord } from '../../types/character'
import { buildOrganizationDeletionPlan, descendantOrganizationIds, organizationProjectionAfterDeletion, organizationProjectionAfterRename } from '../organizationReferences'

function organization(id: string, name: string, parentId?: string): OrganizationRecord {
  return { id, name, aliases: [], kindId: 'faction', parentId, description: '', status: 'active', createdAt: '', updatedAt: '' }
}

function character(affiliationIds: string[]): CharacterRecord {
  return {
    id: 'character-1',
    name: '林烬',
    fileName: '林烬.md',
    aliases: [],
    identity: '',
    stanceId: 'neutral',
    statusId: 'active',
    gender: '未知',
    tags: [],
    affiliations: affiliationIds.map((organizationId) => ({
      organizationId,
      periods: [{ id: `${organizationId}-period`, role: '成员', status: 'former', notes: '保留履历' }],
    })),
    contentHash: '',
    projectionHash: '',
    createdAt: '',
    updatedAt: '',
  }
}

describe('organizationReferences', () => {
  const organizations = [
    organization('root', '总会'),
    organization('source', '旧组织', 'root'),
    organization('child', '分部', 'source'),
    organization('target', '新组织'),
  ]

  it('migrates member history and reparents children to the target', () => {
    const plan = buildOrganizationDeletionPlan([character(['source'])], organizations, 'source', 'target')

    expect(plan.records[0]?.affiliations[0]).toMatchObject({ organizationId: 'target' })
    expect(plan.records[0]?.affiliations[0]?.periods[0]).toMatchObject({ notes: '保留履历' })
    expect(plan.organizations.find((item) => item.id === 'child')?.parentId).toBe('target')
    expect(plan.organizations.some((item) => item.id === 'source')).toBe(false)
  })

  it('detaches members and promotes children to the deleted organization parent', () => {
    const plan = buildOrganizationDeletionPlan([character(['source'])], organizations, 'source')

    expect(plan.records[0]?.affiliations).toEqual([])
    expect(plan.organizations.find((item) => item.id === 'child')?.parentId).toBe('root')
  })

  it('rejects descendant targets and existing target affiliations', () => {
    expect(descendantOrganizationIds(organizations, 'source')).toEqual(new Set(['child']))
    expect(() => buildOrganizationDeletionPlan([character(['source'])], organizations, 'source', 'child')).toThrow('子组织')
    expect(() => buildOrganizationDeletionPlan([character(['source', 'target'])], organizations, 'source', 'target')).toThrow('重叠归属')
  })

  it('updates only structured organization names in the markdown projection', () => {
    const source = { ...organizations[1]!, aliases: ['旧称'] }
    expect(organizationProjectionAfterDeletion(['旧称', '旁观者'], source, organizations[3])).toEqual(['旁观者', '新组织'])
    expect(organizationProjectionAfterDeletion(['旧组织', '旁观者'], source)).toEqual(['旁观者'])
  })

  it('replaces only old names and aliases when an organization is renamed', () => {
    expect(organizationProjectionAfterRename(['旧组织', '旁观者', '旧称'], ['旧组织', '旧称'], '新组织')).toEqual(['新组织', '旁观者'])
  })
})
