// src/contextEngine/budget.ts
import type { DataSourceResult } from './dataSource'
import { DEFAULT_CHAPTER_PROMPT } from './chapterPrompt'

export { DEFAULT_CHAPTER_PROMPT, applyChapterPromptTemplate } from './chapterPrompt'

/** CJK-aware token estimation */
export function estimateTokens(text: string): number {
  const cjkCount = (text.match(/[\u3000-\u9fff\uff00-\uffef]/g) || []).length
  const nonCjkCount = text.length - cjkCount
  return Math.ceil(cjkCount * 0.7 + nonCjkCount * 0.25)
}

/** Truncate results to fit within maxTokens, dropping lowest priority first */
export function truncateToBudget(
  results: DataSourceResult[],
  maxTokens: number,
): DataSourceResult[] {
  // results are already sorted by priority ascending
  let total = 0
  const kept: DataSourceResult[] = []
  for (const r of results) {
    const tokens = estimateTokens(r.content)
    if (total + tokens <= maxTokens) {
      kept.push(r)
      total += tokens
    } else {
      // Truncate content using estimateTokens to find correct cut point
      const remaining = maxTokens - total
      if (remaining > 20) {
        // Iteratively find the longest prefix fitting within remaining tokens
        let lo = 0
        let hi = r.content.length
        let best = 0
        while (lo <= hi) {
          const mid = Math.floor((lo + hi) / 2)
          if (estimateTokens(r.content.slice(0, mid)) <= remaining) {
            best = mid
            lo = mid + 1
          } else {
            hi = mid - 1
          }
        }
        kept.push({ ...r, content: r.content.slice(0, best) })
      }
      break
    }
  }
  return kept
}

export function getDefaultSystemPrompt(): string {
  return DEFAULT_CHAPTER_PROMPT
}
