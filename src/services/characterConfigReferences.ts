import type {
  CharacterCatalog,
  CharacterRelationshipStore,
  OrganizationStore,
} from '../types/character'

export type CharacterConfigSection = 'stances' | 'statuses' | 'organizationKinds' | 'relationshipTypes'
export type CharacterConfigReplacementMap = Partial<Record<CharacterConfigSection, Record<string, string>>>

export interface CharacterConfigReferenceStores {
  catalog: CharacterCatalog
  organizations: OrganizationStore
  relationships: CharacterRelationshipStore
}

export function countCharacterConfigUsage(stores: CharacterConfigReferenceStores): ReadonlyMap<string, number> {
  const counts = new Map<string, number>()
  const add = (section: CharacterConfigSection, id: string) => counts.set(`${section}:${id}`, (counts.get(`${section}:${id}`) ?? 0) + 1)
  stores.catalog.records.forEach((record) => { add('stances', record.stanceId); add('statuses', record.statusId) })
  stores.organizations.organizations.forEach((organization) => add('organizationKinds', organization.kindId))
  stores.relationships.relationships.forEach((relationship) => relationship.periods.forEach((period) => add('relationshipTypes', period.typeId)))
  return counts
}

export function migrateCharacterConfigReferences(
  stores: CharacterConfigReferenceStores,
  replacements: CharacterConfigReplacementMap,
): CharacterConfigReferenceStores {
  const stanceReplacements = replacements.stances ?? {}
  const statusReplacements = replacements.statuses ?? {}
  const kindReplacements = replacements.organizationKinds ?? {}
  const relationshipReplacements = replacements.relationshipTypes ?? {}
  return {
    catalog: {
      ...stores.catalog,
      records: stores.catalog.records.map((record) => ({
        ...record,
        stanceId: stanceReplacements[record.stanceId] ?? record.stanceId,
        statusId: statusReplacements[record.statusId] ?? record.statusId,
      })),
    },
    organizations: {
      ...stores.organizations,
      organizations: stores.organizations.organizations.map((organization) => ({
        ...organization,
        kindId: kindReplacements[organization.kindId] ?? organization.kindId,
      })),
    },
    relationships: {
      ...stores.relationships,
      relationships: stores.relationships.relationships.map((relationship) => ({
        ...relationship,
        periods: relationship.periods.map((period) => ({
          ...period,
          typeId: relationshipReplacements[period.typeId] ?? period.typeId,
        })),
      })),
    },
  }
}
