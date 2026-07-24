import type { CharacterRecord, OrganizationRecord, OrganizationStore } from '../types/character'
import { characterNameKey } from './characterNames'
import { validateOrganizationStore } from './organizationStore'

export interface OrganizationDeletionPlan {
  records: CharacterRecord[]
  organizations: OrganizationRecord[]
  affectedCharacterIds: string[]
}

export function descendantOrganizationIds(organizations: readonly OrganizationRecord[], organizationId: string): ReadonlySet<string> {
  const descendants = new Set<string>()
  let changed = true
  while (changed) {
    changed = false
    for (const organization of organizations) {
      if (organization.parentId !== organizationId && (!organization.parentId || !descendants.has(organization.parentId))) continue
      if (descendants.has(organization.id)) continue
      descendants.add(organization.id)
      changed = true
    }
  }
  return descendants
}

export function buildOrganizationDeletionPlan(
  records: readonly CharacterRecord[],
  organizations: readonly OrganizationRecord[],
  sourceId: string,
  targetId?: string,
): OrganizationDeletionPlan {
  const source = organizations.find((organization) => organization.id === sourceId)
  if (!source) throw new Error('待删除组织不存在，请刷新后重试。')
  const target = targetId ? organizations.find((organization) => organization.id === targetId) : undefined
  if (targetId && !target) throw new Error('迁移目标组织不存在，请重新选择。')
  if (targetId === sourceId || (targetId && descendantOrganizationIds(organizations, sourceId).has(targetId))) {
    throw new Error('不能将引用迁移到待删除组织自身或其子组织。')
  }

  const affectedCharacterIds: string[] = []
  const nextRecords = records.map((record) => {
    const sourceAffiliation = record.affiliations.find((affiliation) => affiliation.organizationId === sourceId)
    if (!sourceAffiliation) return record
    if (targetId && record.affiliations.some((affiliation) => affiliation.organizationId === targetId)) {
      throw new Error(`角色「${record.name}」已关联目标组织，请先处理该角色的重叠归属履历。`)
    }
    affectedCharacterIds.push(record.id)
    return {
      ...record,
      affiliations: targetId
        ? record.affiliations.map((affiliation) => affiliation.organizationId === sourceId
          ? { ...affiliation, organizationId: targetId, periods: affiliation.periods.map((period) => ({ ...period })) }
          : affiliation)
        : record.affiliations.filter((affiliation) => affiliation.organizationId !== sourceId),
    }
  })

  const replacementParentId = targetId ?? source.parentId
  const nextOrganizations = organizations
    .filter((organization) => organization.id !== sourceId)
    .map((organization) => organization.parentId === sourceId ? { ...organization, parentId: replacementParentId } : organization)
  const validationStore: OrganizationStore = { schemaVersion: 1, revision: 0, organizations: nextOrganizations, updatedAt: '' }
  validateOrganizationStore(validationStore)
  return { records: nextRecords, organizations: nextOrganizations, affectedCharacterIds }
}

export function organizationProjectionAfterDeletion(
  names: readonly string[],
  source: OrganizationRecord,
  target?: OrganizationRecord,
  ensureTarget = false,
): string[] {
  const sourceNames = new Set([source.name, ...source.aliases].map(characterNameKey))
  const hadSourceName = names.some((name) => sourceNames.has(characterNameKey(name)))
  const remaining = names.filter((name) => !sourceNames.has(characterNameKey(name)))
  if (target && (hadSourceName || ensureTarget) && !remaining.some((name) => characterNameKey(name) === characterNameKey(target.name))) remaining.push(target.name)
  return remaining
}

export function organizationProjectionAfterRename(
  names: readonly string[],
  previousNames: readonly string[],
  nextName: string,
): string[] {
  const previousKeys = new Set(previousNames.map(characterNameKey))
  return [...new Set(names.map((name) => previousKeys.has(characterNameKey(name)) ? nextName : name))]
}
