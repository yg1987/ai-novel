import { describe, expect, it } from 'vitest'
import { chapterFileKey, normalizeChapterContent } from '../chapterFlowHash'

describe('chapter flow hash inputs', () => {
  it('normalizes equivalent html content', () => {
    expect(normalizeChapterContent('<p>第一段</p>\r\n<p>第二段&nbsp;</p>')).toBe('第一段\n第二段')
  })

  it('uses a Windows-safe key for cross-volume refs', () => {
    const key = chapterFileKey({ volume: '卷2', chapterId: 'ch001' })
    expect(key).not.toContain(':')
    expect(key).not.toContain('/')
    expect(key).not.toContain('=')
    expect(chapterFileKey({ volume: '卷10', chapterId: 'ch001' })).not.toBe(key)
  })
})
