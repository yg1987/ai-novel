import { describe, expect, it } from 'vitest'
import type { CharacterRelationship } from '../../types/character'
import { mergeDuplicateRelationships, validateRelationship } from '../characterRelations'

function relationship(periods: CharacterRelationship['periods']): CharacterRelationship {
  return { id: 'r1', characterAId: 'a', characterBId: 'b', direction: 'undirected', periods, notes: '', createdAt: '', updatedAt: '' }
}

describe('characterRelations', () => {
  it('rejects more than one current relationship period', () => {
    expect(() => validateRelationship(relationship([
      { id: 'p1', typeId: 'friend', status: 'active', description: '' },
      { id: 'p2', typeId: 'enemy', status: 'uncertain', description: '' },
    ]), new Set(['a', 'b']))).toThrow('最多只能有一个')
  })

  it('rejects a relationship to the same or missing character', () => {
    const self = relationship([])
    self.characterBId = 'a'
    expect(() => validateRelationship(self, new Set(['a', 'b']))).toThrow('自己')
    expect(() => validateRelationship(relationship([]), new Set(['a']))).toThrow('不存在')
  })

  it('rejects duplicate history stage IDs', () => {
    expect(() => validateRelationship(relationship([
      { id: 'same', typeId: 'friend', status: 'ended', description: '' },
      { id: 'same', typeId: 'enemy', status: 'ended', description: '' },
    ]), new Set(['a', 'b']))).toThrow('ID 不能重复')
  })

  it('merges duplicate records for the same character pair', () => {
    const first = relationship([{ id: 'p1', typeId: 'friend', status: 'ended', description: '旧阶段' }])
    const second = { ...relationship([{ id: 'p2', typeId: 'enemy', status: 'active', description: '当前阶段' }]), id: 'r2', notes: '补充备注' }

    expect(mergeDuplicateRelationships([first, second])).toEqual([expect.objectContaining({
      id: 'r1',
      periods: [first.periods[0], second.periods[0]],
      notes: '补充备注',
    })])
  })

  it('normalizes reverse endpoints and direction before merging', () => {
    const first = { ...relationship([]), direction: 'a-to-b' as const }
    const second = {
      ...relationship([{ id: 'p2', typeId: 'friend', status: 'ended' as const, description: '' }]),
      id: 'r2',
      characterAId: 'b',
      characterBId: 'a',
      direction: 'b-to-a' as const,
    }

    expect(mergeDuplicateRelationships([first, second])).toHaveLength(1)
    expect(mergeDuplicateRelationships([first, second])[0]).toMatchObject({ direction: 'a-to-b', periods: second.periods })
  })

  it('rejects direction and period ID conflicts while merging', () => {
    const directed = { ...relationship([{ id: 'p1', typeId: 'friend', status: 'ended', description: '' }]), direction: 'a-to-b' as const }
    const opposite = { ...relationship([]), id: 'r2', direction: 'b-to-a' as const }
    const duplicatePeriod = { ...relationship([{ id: 'p1', typeId: 'enemy', status: 'ended', description: '' }]), id: 'r3', direction: 'a-to-b' as const }

    expect(() => mergeDuplicateRelationships([directed, opposite])).toThrow('方向冲突')
    expect(() => mergeDuplicateRelationships([directed, duplicatePeriod])).toThrow('阶段 ID')
  })
})
