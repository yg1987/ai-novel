import { describe, expect, it } from 'vitest'
import type { ChapterMeta } from '../../types/chapter'
import type { ForeshadowEntry } from '../../types/novel'
import { buildChapterFlow } from '../chapterFlowService'

const chapters: ChapterMeta[] = [
  { volume: '卷10', id: 'ch001', order: 1, title: '十卷一章' },
  { volume: '卷2', id: 'ch001', order: 1, title: '二卷一章' },
  { volume: '卷2', id: 'ch068', order: 68, title: '回收' },
  { volume: '卷2', id: 'ch070', order: 70, title: '当前' },
]

function entry(patch: Partial<ForeshadowEntry> = {}): ForeshadowEntry {
  return {
    id: 'f1', name: '身世', description: '身份线', status: 'planted', category: 'identity', importance: 0.8,
    plantedChapter: { volume: '卷2', chapterId: 'ch001' },
    progress: [], relatedCharacters: [], relatedCharacterIds: [], notes: '', createdAt: '', updatedAt: '', ...patch,
  }
}

describe('chapter flow execution checks', () => {
  it('keeps same chapter ids isolated across volumes', () => {
    const result = buildChapterFlow([entry({ plannedResolutionChapter: { volume: '卷2', chapterId: 'ch068' }, recordedResolutionChapter: { volume: '卷2', chapterId: 'ch068' }, status: 'resolved' })], chapters)
    expect(result[0]!.check.state).toBe('on-schedule')
  })

  it('distinguishes early, late, overdue, and pending', () => {
    expect(buildChapterFlow([entry({ plannedResolutionChapter: { volume: '卷2', chapterId: 'ch068' }, recordedResolutionChapter: { volume: '卷2', chapterId: 'ch001' }, status: 'resolved' })], chapters)[0]!.check.state).toBe('early')
    expect(buildChapterFlow([entry({ plannedResolutionChapter: { volume: '卷2', chapterId: 'ch068' } })], chapters)[0]!.check.state).toBe('overdue')
    expect(buildChapterFlow([entry({ plannedResolutionChapter: { volume: '卷10', chapterId: 'ch050' } })], chapters)[0]!.check.state).toBe('pending')
  })

  it('gives record errors priority over timing states', () => {
    expect(buildChapterFlow([entry({ status: 'advanced', plannedResolutionChapter: { volume: '卷2', chapterId: 'ch068' } })], chapters)[0]!.check.state).toBe('record-incomplete')
  })

  it('rejects a missing planned reference behind the written boundary', () => {
    const result = buildChapterFlow([entry({ plannedResolutionChapter: { volume: '卷2', chapterId: 'ch050' } })], chapters)
    expect(result[0]!.check.state).toBe('invalid-reference')
  })
})
