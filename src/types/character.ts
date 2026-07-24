import type { ChapterRef } from './chapter'

export type CharacterGender = '男' | '女' | '未知'

export interface OptionDefinition {
  id: string
  label: string
  order: number
}

export interface RelationshipTypeDefinition extends OptionDefinition {
  tier: 1 | 2 | 3
  weight: number
  color: string
  defaultDirection: 'undirected' | 'a-to-b'
}

export interface CharacterModuleConfig {
  schemaVersion: 1
  stances: OptionDefinition[]
  statuses: OptionDefinition[]
  organizationKinds: OptionDefinition[]
  relationshipTypes: RelationshipTypeDefinition[]
  updatedAt: string
  revision: number
}

export type AffiliationStatus = 'active' | 'former' | 'hidden'

/** One organization can have several non-overlapping membership periods. */
export interface AffiliationPeriod {
  id: string
  role: string
  status: AffiliationStatus
  startChapter?: ChapterRef
  endChapter?: ChapterRef
  notes: string
}

export interface CharacterAffiliation {
  organizationId: string
  periods: AffiliationPeriod[]
}

export interface CharacterRecord {
  id: string
  name: string
  fileName: string
  aliases: string[]
  identity: string
  stanceId: string
  statusId: string
  gender: CharacterGender
  tags: string[]
  affiliations: CharacterAffiliation[]
  contentHash: string
  projectionHash: string
  createdAt: string
  updatedAt: string
}

export interface CharacterCatalog {
  schemaVersion: 1
  revision: number
  records: CharacterRecord[]
  updatedAt: string
}

export interface CharacterOrder {
  schemaVersion: 2
  characterIds: string[]
}

export interface OrganizationRecord {
  id: string
  name: string
  aliases: string[]
  kindId: string
  parentId?: string
  description: string
  status: 'active' | 'dissolved'
  createdAt: string
  updatedAt: string
}

export interface OrganizationStore {
  schemaVersion: 1
  revision: number
  organizations: OrganizationRecord[]
  updatedAt: string
}

export interface RelationshipPeriod {
  id: string
  typeId: string
  status: 'active' | 'ended' | 'uncertain'
  startChapter?: ChapterRef
  endChapter?: ChapterRef
  description: string
}

export interface CharacterRelationship {
  id: string
  characterAId: string
  characterBId: string
  direction: 'undirected' | 'a-to-b' | 'b-to-a'
  periods: RelationshipPeriod[]
  notes: string
  createdAt: string
  updatedAt: string
}

export interface CharacterRelationshipStore {
  schemaVersion: 1
  revision: number
  relationships: CharacterRelationship[]
  updatedAt: string
}

export interface ReferenceDiagnostic {
  value: string
  kind: 'unresolved' | 'ambiguous'
  candidates?: string[]
}
