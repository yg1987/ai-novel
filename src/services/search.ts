// src/services/search.ts
import { searchProjectFiles, vectorSearchChunks } from '../api/tauri'
import type { SearchResult } from '../api/tauri'
import { embedText } from './embeddings'

const RRF_K = 60

export interface HybridResult extends SearchResult {
  rrfScore: number
}

/** CJK-aware tokenizer for keyword expansion */
export function tokenizeQuery(query: string): string[] {
  const tokens = query.toLowerCase().split(/[\s,，。！？、；：""''（）()\-_/\\·~～…]+/)
    .filter((t) => t.length > 1)
    .filter((t) => !['的', '了', '是', '在', '有', '和', '就', '不', '人', '都', '一', '个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没', '看', '好', '自己', '这', '那', '什么', '怎么', '如何', '哪个', '哪些', '为什么'].includes(t))

  const expanded: string[] = []
  for (const token of tokens) {
    const hasCJK = /[\u4e00-\u9fff]/.test(token)
    if (hasCJK && token.length > 2) {
      const chars = [...token]
      for (let i = 0; i < chars.length - 1; i++) expanded.push(chars[i]! + chars[i + 1]!)
      expanded.push(token)
    } else {
      expanded.push(token)
    }
  }

  return [...new Set([...tokens, ...expanded])]
}

export type SearchSource = 'characters' | 'worldview' | 'chapters' | 'notes' | 'outline' | 'memory'

export interface HybridSearchOptions {
  sources?: SearchSource[]
  topK?: number
  includeVector?: boolean
}

export async function hybridSearch(
  projectId: string,
  query: string,
  options: HybridSearchOptions = {},
): Promise<HybridResult[]> {
  const { sources = [], topK = 20, includeVector = true } = options

  // 1. Keyword search (always) — expand query with CJK bigrams
  const expandedTokens = tokenizeQuery(query)
  const keywordQuery = expandedTokens.length > 0 ? expandedTokens.join(' ') : query
  const keywordPromise = searchProjectFiles(projectId, keywordQuery, sources as string[], topK)

  // 2. Vector search (optional)
  let vectorPromise: Promise<Array<{ path: string; score: number }> | null> = Promise.resolve(null)
  if (includeVector) {
    vectorPromise = (async () => {
      try {
        const embedding = await embedText(query)
        if (!embedding) return null
        const results = await vectorSearchChunks(projectId, embedding, topK)
        return results.map((r) => ({ path: r.page_id, score: r.score }))
      } catch { return null }
    })()
  }

  // 3. Run both
  const [keywordResults, vectorResults] = await Promise.all([
    keywordPromise,
    vectorPromise,
  ])

  // 4. RRF fusion
  const rankMap = new Map<string, { keywordRank: number | null; vectorRank: number | null }>()

  keywordResults?.forEach((r, i) => {
    const key = r.path
    if (!rankMap.has(key)) rankMap.set(key, { keywordRank: null, vectorRank: null })
    rankMap.get(key)!.keywordRank = i + 1
  })

  vectorResults?.forEach((r, i) => {
    const key = r.path
    if (!rankMap.has(key)) rankMap.set(key, { keywordRank: null, vectorRank: null })
    rankMap.get(key)!.vectorRank = i + 1
  })

  // 5. Compute RRF score
  const merged: HybridResult[] = []
  for (const [path, ranks] of rankMap) {
    let rrfScore = 0
    if (ranks.keywordRank !== null) rrfScore += 1 / (RRF_K + ranks.keywordRank)
    if (ranks.vectorRank !== null) rrfScore += 1 / (RRF_K + ranks.vectorRank)

    const kr = keywordResults?.find((r) => r.path === path)
    merged.push({
      path: kr?.path ?? path,
      filename: kr?.filename ?? '',
      snippet: kr?.snippet ?? '',
      score: kr?.score ?? 0,
      source: kr?.source ?? 'vector',
      rrfScore,
    })
  }

  merged.sort((a, b) => b.rrfScore - a.rrfScore)
  return merged.slice(0, topK)
}