import { describe, expect, it } from 'vitest'
import type { CharacterAffiliation } from '../../types/character'
import { validateCharacterAffiliations } from '../characterAffiliations'

const positions = new Map([
  ['v1:c1', 1],
  ['v1:c2', 2],
  ['v1:c3', 3],
])

const chapterPosition = (ref: { volume: string; chapterId: string }) => positions.get(`${ref.volume}:${ref.chapterId}`)

function affiliation(periods: CharacterAffiliation['periods']): CharacterAffiliation {
  return { organizationId: 'org-1', periods }
}

describe('characterAffiliations', () => {
  it('accepts ordered non-overlapping periods', () => {
    expect(() => validateCharacterAffiliations([affiliation([
      { id: 'p1', role: '学徒', status: 'former', startChapter: { volume: 'v1', chapterId: 'c1' }, endChapter: { volume: 'v1', chapterId: 'c2' }, notes: '' },
      { id: 'p2', role: '导师', status: 'active', startChapter: { volume: 'v1', chapterId: 'c3' }, notes: '' },
    ])], new Set(['org-1']), chapterPosition)).not.toThrow()
  })

  it('rejects overlapping periods and multiple current periods', () => {
    expect(() => validateCharacterAffiliations([affiliation([
      { id: 'p1', role: '', status: 'former', startChapter: { volume: 'v1', chapterId: 'c1' }, endChapter: { volume: 'v1', chapterId: 'c2' }, notes: '' },
      { id: 'p2', role: '', status: 'active', startChapter: { volume: 'v1', chapterId: 'c2' }, endChapter: { volume: 'v1', chapterId: 'c3' }, notes: '' },
    ])], new Set(['org-1']), chapterPosition)).toThrow('不能重叠')

    expect(() => validateCharacterAffiliations([affiliation([
      { id: 'p1', role: '', status: 'active', notes: '' },
      { id: 'p2', role: '', status: 'hidden', notes: '' },
    ])], new Set(['org-1']))).toThrow('最多只能有一个')
  })

  it('rejects missing organization and chapter references', () => {
    expect(() => validateCharacterAffiliations([affiliation([])], new Set())).toThrow('不存在的组织')
    expect(() => validateCharacterAffiliations([affiliation([
      { id: 'p1', role: '', status: 'former', startChapter: { volume: 'v9', chapterId: 'c9' }, notes: '' },
    ])], new Set(['org-1']), chapterPosition)).toThrow('开始章节不存在')
  })
})
