import { describe, expect, it } from 'vitest'
import type { CharacterConfigReferenceStores } from '../characterConfigReferences'
import { countCharacterConfigUsage, migrateCharacterConfigReferences } from '../characterConfigReferences'

const stores: CharacterConfigReferenceStores = {
  catalog: {
    schemaVersion: 1,
    revision: 2,
    updatedAt: '',
    records: [{
      id: 'character-1', name: '林烬', fileName: '林烬.md', aliases: [], identity: '', stanceId: 'old-stance', statusId: 'old-status', gender: '未知', tags: [], affiliations: [], contentHash: '', projectionHash: '', createdAt: '', updatedAt: '',
    }],
  },
  organizations: {
    schemaVersion: 1,
    revision: 3,
    updatedAt: '',
    organizations: [{ id: 'organization-1', name: '旧组织', aliases: [], kindId: 'old-kind', description: '', status: 'active', createdAt: '', updatedAt: '' }],
  },
  relationships: {
    schemaVersion: 1,
    revision: 4,
    updatedAt: '',
    relationships: [{
      id: 'relationship-1', characterAId: 'character-1', characterBId: 'character-2', direction: 'undirected', notes: '', createdAt: '', updatedAt: '',
      periods: [{ id: 'period-1', typeId: 'old-relation', status: 'active', description: '' }],
    }],
  },
}

describe('characterConfigReferences', () => {
  it('counts every project-level configuration reference', () => {
    const counts = countCharacterConfigUsage(stores)
    expect(counts.get('stances:old-stance')).toBe(1)
    expect(counts.get('statuses:old-status')).toBe(1)
    expect(counts.get('organizationKinds:old-kind')).toBe(1)
    expect(counts.get('relationshipTypes:old-relation')).toBe(1)
  })

  it('migrates all reference stores without changing their revisions', () => {
    const migrated = migrateCharacterConfigReferences(stores, {
      stances: { 'old-stance': 'new-stance' },
      statuses: { 'old-status': 'new-status' },
      organizationKinds: { 'old-kind': 'new-kind' },
      relationshipTypes: { 'old-relation': 'new-relation' },
    })

    expect(migrated.catalog.records[0]).toMatchObject({ stanceId: 'new-stance', statusId: 'new-status' })
    expect(migrated.organizations.organizations[0]?.kindId).toBe('new-kind')
    expect(migrated.relationships.relationships[0]?.periods[0]?.typeId).toBe('new-relation')
    expect([migrated.catalog.revision, migrated.organizations.revision, migrated.relationships.revision]).toEqual([2, 3, 4])
  })
})
