import { describe, expect, it } from 'vitest'
import { applyGraphFilters } from '../../lib/graph-filters'
import type { CharacterModuleConfig, CharacterRelationship } from '../../types/character'
import type { GraphNode, RelationshipLink } from '../../types/novel'
import { appendEvidenceToCurrentManualRelationship, buildManualRelationshipLinks } from '../relationshipStore'

const config: CharacterModuleConfig = {
  schemaVersion: 1,
  revision: 0,
  stances: [],
  statuses: [],
  organizationKinds: [],
  relationshipTypes: [
    { id: 'friend', label: '朋友', order: 0, tier: 2, weight: 2, color: '#3498db', defaultDirection: 'undirected' },
    { id: 'enemy', label: '仇敌', order: 1, tier: 1, weight: 3, color: '#e74c3c', defaultDirection: 'a-to-b' },
  ],
  updatedAt: '',
}

function relationship(periods: CharacterRelationship['periods']): CharacterRelationship {
  return {
    id: 'relationship-1',
    characterAId: 'character-a',
    characterBId: 'character-b',
    direction: 'b-to-a',
    periods,
    notes: '关系备注',
    createdAt: '',
    updatedAt: '',
  }
}

function node(id: string): GraphNode {
  return { id, label: id, type: 'character', group: 'character', community: -1, linkCount: 0, firstAppearance: 0, lastAppearance: 0, appearanceCount: 0, tags: [] }
}

function edge(overrides: Partial<RelationshipLink>): RelationshipLink {
  return {
    source: 'character:character-a',
    target: 'character:character-b',
    type: 'friend',
    tier: 2,
    weight: 2,
    strength: 0.5,
    firstMentioned: 0,
    lastMentioned: 0,
    mentions: 1,
    kind: 'relationship',
    ...overrides,
  }
}

describe('relationship graph history', () => {
  it('keeps the real current period separate from historical periods', () => {
    const links = buildManualRelationshipLinks([relationship([
      {
        id: 'period-old',
        typeId: 'enemy',
        status: 'ended',
        startChapter: { volume: '卷一', chapterId: 'ch001' },
        endChapter: { volume: '卷一', chapterId: 'ch003' },
        description: '曾经敌对',
      },
      {
        id: 'period-current',
        typeId: 'friend',
        status: 'active',
        startChapter: { volume: '卷一', chapterId: 'ch004' },
        description: '当前合作',
      },
    ])], config)

    expect(links).toHaveLength(2)
    expect(links[0]).toMatchObject({
      source: 'character:character-b',
      target: 'character:character-a',
      periodId: 'period-current',
      temporalStatus: 'current',
      direction: 'a-to-b',
      label: '朋友',
    })
    expect(links[1]).toMatchObject({ periodId: 'period-old', temporalStatus: 'historical', relationshipStatus: 'ended' })
  })

  it('does not promote the last ended period to current', () => {
    const links = buildManualRelationshipLinks([relationship([
      { id: 'period-ended', typeId: 'enemy', status: 'ended', description: '已经结束' },
    ])], config)

    expect(links).toHaveLength(1)
    expect(links[0]?.temporalStatus).toBe('historical')
  })

  it('hides history and inferred co-occurrence evidence by default', () => {
    const nodes = [node('character:character-a'), node('character:character-b')]
    const links = [
      edge({ periodId: 'current', sourceKind: 'manual', temporalStatus: 'current' }),
      edge({ periodId: 'history', sourceKind: 'manual', temporalStatus: 'historical' }),
      edge({ sourceKind: 'snapshot' }),
      edge({ kind: 'appearance', sourceKind: 'co-occurrence' }),
    ]
    const baseFilters = {
      hiddenTypes: new Set<GraphNode['type']>(),
      hiddenNodeIds: new Set<string>(),
      hideStructural: false,
      hideIsolated: false,
    }

    const defaults = applyGraphFilters(nodes, links, baseFilters)
    expect(defaults.edges.map((item) => item.sourceKind)).toEqual(['manual', 'snapshot'])

    const expanded = applyGraphFilters(nodes, links, {
      ...baseFilters,
      showHistoricalRelationships: true,
      showInferredEvidence: true,
    })
    expect(expanded.edges).toHaveLength(4)
  })

  it('appends snapshot evidence to the current manual relationship without replacing it', () => {
    const manual = edge({
      source: 'character:character-b',
      target: 'character:character-a',
      type: 'enemy',
      direction: 'a-to-b',
      sourceKind: 'manual',
      temporalStatus: 'current',
      evidence: ['作者确认'],
    })
    const evidence = edge({ sourceKind: 'snapshot', evidence: ['第5章'], mentions: 2 })

    expect(appendEvidenceToCurrentManualRelationship([manual], evidence)).toBe(true)
    expect(manual).toMatchObject({ type: 'enemy', direction: 'a-to-b', sourceKind: 'manual', mentions: 3 })
    expect(manual.evidence).toEqual(['作者确认', '第5章'])
  })

  it('leaves snapshot evidence separate when there is no current manual relationship', () => {
    const historical = edge({ sourceKind: 'manual', temporalStatus: 'historical' })
    expect(appendEvidenceToCurrentManualRelationship([historical], edge({ sourceKind: 'snapshot' }))).toBe(false)
  })
})
