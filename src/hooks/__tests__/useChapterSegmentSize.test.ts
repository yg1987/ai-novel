import { describe, expect, it, vi } from 'vitest'
import {
  CHAPTER_SEGMENT_SIZE_OPTIONS,
  loadChapterSegmentSize,
  saveChapterSegmentSize,
} from '../useChapterSegmentSize'

describe('chapter segment size settings', () => {
  it('supports the shared 25, 50, and 100 chapter options', () => {
    expect(CHAPTER_SEGMENT_SIZE_OPTIONS).toEqual([25, 50, 100])
  })

  it.each([
    [null, 50],
    ['invalid', 50],
    ['10', 50],
    ['25', 25],
    ['50', 50],
    ['100', 100],
  ] as const)('normalizes stored value %s to %i', (stored, expected) => {
    const storage = { getItem: vi.fn(() => stored) }

    expect(loadChapterSegmentSize('project-1', storage)).toBe(expected)
    expect(storage.getItem).toHaveBeenCalledWith('chapter-segment-size:project-1')
  })

  it('saves the value under the project-scoped key', () => {
    const storage = { setItem: vi.fn() }

    saveChapterSegmentSize('project-2', 25, storage)

    expect(storage.setItem).toHaveBeenCalledWith('chapter-segment-size:project-2', '25')
  })
})
