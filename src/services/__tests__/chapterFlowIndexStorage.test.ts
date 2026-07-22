import { describe, expect, it } from 'vitest'
import { emptyChapterFlowIndex, resolveAnalysisStatus } from '../chapterFlowIndexStorage'

describe('chapter flow index status', () => {
  it('starts with a schema-versioned empty index', () => {
    expect(emptyChapterFlowIndex()).toEqual({ schemaVersion: 1, revision: 0, updatedAt: '', chapters: [], findings: [] })
  })

  it('recomputes ready, stale, failed, and missing states from hashes', () => {
    const base = { ref: { volume: '卷1', chapterId: 'ch001' }, status: 'missing' as const }
    expect(resolveAnalysisStatus({ ...base, analysisInputHash: 'a', analyzedInputHash: 'a' })).toBe('ready')
    expect(resolveAnalysisStatus({ ...base, analysisInputHash: 'b', analyzedInputHash: 'a' })).toBe('stale')
    expect(resolveAnalysisStatus({ ...base, analysisInputHash: 'a', lastAttemptInputHash: 'a', error: 'failed' })).toBe('failed')
    expect(resolveAnalysisStatus({ ...base, analysisInputHash: 'a', lastAttemptInputHash: 'b', error: 'failed' })).toBe('missing')
  })
})
