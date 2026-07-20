import { describe, expect, it } from 'vitest'
import { chapterContextLabel, compareChapters, scopeDisplaySummary, selectedChapterSummary } from '../chapterDisplay'
import type { ChapterMeta } from '../../types/chapter'

const chapters: ChapterMeta[] = [
  { id: 'ch001', title: '第1章', order: 1, volume: '卷2' },
  { id: 'ch002', title: '第2章', order: 2, volume: '卷2' },
  { id: 'ch004', title: '第4章', order: 4, volume: '卷2' },
  { id: 'ch001', title: '第1章', order: 1, volume: '卷10' },
]

const metadata = {
  volumeNames: { '卷2': '第一卷 风起', '卷10': '第二卷 入局' },
  chapterTitles: {},
}

describe('chapter display helpers', () => {
  it('sorts by natural volume order and then by the real in-volume chapter number', () => {
    expect([...chapters].sort(compareChapters).map((chapter) => `${chapter.volume}:${chapter.order}`)).toEqual([
      '卷2:1', '卷2:2', '卷2:4', '卷10:1',
    ])
  })

  it('formats selected chapters as volume-specific number ranges without duplicate titles', () => {
    const refs = [chapters[0]!, chapters[1]!, chapters[3]!].map((chapter) => ({
      volume: chapter.volume,
      chapterId: chapter.id,
      chapterTitle: chapter.title,
    }))
    expect(selectedChapterSummary(refs, chapters, metadata)).toBe('第一卷 风起：第 1-2 章；第二卷 入局：第 1 章')
    expect(scopeDisplaySummary({ type: 'current_chapter', chapter: refs[1]! }, chapters, metadata)).toBe('第一卷 风起 · 第 2 章')
  })

  it('does not repeat a Chinese-number placeholder title', () => {
    expect(chapterContextLabel({ ...chapters[0]!, title: '第一章' }, metadata)).toBe('第一卷 风起 · 第 1 章')
  })
})
