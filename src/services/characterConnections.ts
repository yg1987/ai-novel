import type { ChapterSnapshot, ForeshadowEntry } from '../types/novel'
import type { CharacterCatalog, CharacterRelationship, OrganizationStore, ReferenceDiagnostic } from '../types/character'
import { resolveCharacterName } from './characterCatalog'

export interface CharacterConnections {
  relationships: CharacterRelationship[]
  organizationIds: string[]
  foreshadows: ForeshadowEntry[]
  chapterNumbers: number[]
  diagnostics: ReferenceDiagnostic[]
}

/** Centralized cross-module projection; consumers no longer parse Markdown independently. */
export function getCharacterConnections(
  characterId: string,
  catalog: CharacterCatalog,
  organizations: OrganizationStore,
  relationships: readonly CharacterRelationship[],
  foreshadows: readonly ForeshadowEntry[],
  snapshots: readonly ChapterSnapshot[],
): CharacterConnections {
  const record = catalog.records.find((item) => item.id === characterId)
  const diagnostics: ReferenceDiagnostic[] = []
  if (!record) return { relationships: [], organizationIds: [], foreshadows: [], chapterNumbers: [], diagnostics: [{ value: characterId, kind: 'unresolved' }] }
  const organizationIds = record.affiliations.map((item) => item.organizationId).filter((id) => organizations.organizations.some((organization) => organization.id === id))
  const relatedForeshadows = foreshadows.filter((entry) => {
    if (entry.relatedCharacterIds.includes(characterId)) return true
    const resolved = entry.relatedCharacters.map((name) => resolveCharacterName(catalog.records, name))
    resolved.flatMap((item) => item.diagnostic ? [item.diagnostic] : []).forEach((item) => diagnostics.push(item))
    return resolved.some((item) => item.characterId === characterId)
  })
  const chapterNumbers: number[] = []
  for (const snapshot of snapshots) {
    const resolved = snapshot.characters.map((name) => resolveCharacterName(catalog.records, name))
    resolved.flatMap((item) => item.diagnostic ? [item.diagnostic] : []).forEach((item) => diagnostics.push(item))
    if (resolved.some((item) => item.characterId === characterId)) chapterNumbers.push(snapshot.chapterNumber)
  }
  return {
    relationships: relationships.filter((item) => item.characterAId === characterId || item.characterBId === characterId),
    organizationIds,
    foreshadows: relatedForeshadows,
    chapterNumbers,
    diagnostics,
  }
}
