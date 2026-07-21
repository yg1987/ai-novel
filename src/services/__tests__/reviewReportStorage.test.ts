import { describe, expect, it } from 'vitest'
import { reviewReportStem } from '../reviewReportStorage'

describe('review report positions', () => {
  it('includes volume and chapter id in report stems', () => {
    expect(reviewReportStem({ volume: '卷1', chapterId: 'ch001' })).not.toBe(reviewReportStem({ volume: '卷2', chapterId: 'ch001' }))
    expect(reviewReportStem({ volume: '卷2', chapterId: 'ch001' })).toContain('ch001')
  })
})
