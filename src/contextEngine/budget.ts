// src/contextEngine/budget.ts
import type { DataSourceResult } from './dataSource'

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

const DEFAULT_SYSTEM_PROMPT = `重要：不要输出章节标题，章节标题已由系统单独设置。

你是一位优秀的网络小说作家。请续写小说正文。

## 格式要求
- 只输出小说正文，不要添加解释、注释或元描述
- 段首空两格，段落自然换行即可
- 输出纯文本，禁止使用 markdown 语法（# ## ** * > - 等）`

export function getDefaultSystemPrompt(): string {
  return DEFAULT_SYSTEM_PROMPT
}
