import type { ChapterRef } from '../types/chapter'
import type { CharacterAffiliation } from '../types/character'

export type AffiliationChapterPosition = (reference: ChapterRef) => number | undefined

export function cloneAffiliations(affiliations: readonly CharacterAffiliation[]): CharacterAffiliation[] {
  return affiliations.map((affiliation) => ({
    ...affiliation,
    periods: affiliation.periods.map((period) => ({
      ...period,
      startChapter: period.startChapter ? { ...period.startChapter } : undefined,
      endChapter: period.endChapter ? { ...period.endChapter } : undefined,
    })),
  }))
}
export function validateCharacterAffiliations(
  affiliations: readonly CharacterAffiliation[],
  organizationIds: ReadonlySet<string>,
  chapterPosition?: AffiliationChapterPosition,
): void {
  const seenOrganizations = new Set<string>()
  for (const affiliation of affiliations) {
    if (seenOrganizations.has(affiliation.organizationId)) throw new Error('同一组织只能保留一条归属记录，请把履历合并到该组织。')
    seenOrganizations.add(affiliation.organizationId)
    if (!organizationIds.has(affiliation.organizationId)) throw new Error('归属履历引用了不存在的组织。')

    const periodIds = new Set<string>()
    const currentPeriods = affiliation.periods.filter((period) => !period.endChapter && period.status !== 'former')
    if (currentPeriods.length > 1) throw new Error('同一组织最多只能有一个未结束的当前归属。')

    const ranges = affiliation.periods.map((period) => {
      if (periodIds.has(period.id)) throw new Error('同一组织的归属时间段 ID 不能重复。')
      periodIds.add(period.id)
      const start = period.startChapter ? chapterPosition?.(period.startChapter) : undefined
      const end = period.endChapter ? chapterPosition?.(period.endChapter) : undefined
      if (chapterPosition && period.startChapter && start === undefined) throw new Error('归属履历的开始章节不存在。')
      if (chapterPosition && period.endChapter && end === undefined) throw new Error('归属履历的结束章节不存在。')
      if (start !== undefined && end !== undefined && start > end) throw new Error('归属履历的结束章节不能早于开始章节。')
      return { start, end }
    })

    if (!chapterPosition) continue
    const sorted = ranges.slice().sort((left, right) => (left.start ?? -Infinity) - (right.start ?? -Infinity))
    for (let index = 1; index < sorted.length; index++) {
      const previous = sorted[index - 1]!
      const current = sorted[index]!
      if (previous.end === undefined || current.start === undefined || previous.end >= current.start) {
        throw new Error('同一组织的归属时间段不能重叠。')
      }
    }
  }
}
