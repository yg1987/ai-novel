import { describe, expect, it } from 'vitest'
import { chapterOrder, compareRefs, compareVolumes, outlineChapterFile, outlineVolumeFile, volumeOrder } from '../chapterCatalog'
import { chapterRefKey } from '../chapterDisplay'

describe('chapter catalog positions', () => {
  it('keeps same chapter ids isolated by volume', () => {
    expect(chapterRefKey({ volume: '卷1', chapterId: 'ch001' })).toBe('卷1:ch001')
    expect(chapterRefKey({ volume: '卷2', chapterId: 'ch001' })).toBe('卷2:ch001')
  })

  it('builds fixed outline paths from positions', () => {
    expect(outlineVolumeFile('卷2')).toBe('卷2.md')
    expect(outlineChapterFile({ volume: '卷2', chapterId: 'ch031' })).toBe('outline/chapters/卷2/ch031.md')
  })

  it('sorts numeric volumes and chapters naturally', () => {
    expect(volumeOrder('卷10')).toBe(10)
    expect(chapterOrder('ch156')).toBe(156)
    expect(compareVolumes('卷2', '卷10')).toBeLessThan(0)
    expect(compareRefs({ volume: '卷2', chapterId: 'ch010' }, { volume: '卷2', chapterId: 'ch100' })).toBeLessThan(0)
  })
})
