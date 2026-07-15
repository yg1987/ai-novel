// src/services/search.ts
import { searchProjectFiles, vectorSearchChunks, searchResourceFiles } from '../api/tauri'
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

export type SearchSource = 'characters' | 'worldview' | 'chapters' | 'notes' | 'outline' | 'memory' | 'resources'

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

  // Determine whether a specific source filter is active (not "all")
  const hasSourceFilter = sources.length > 0

  // 1. Keyword search (always) — expand query with CJK bigrams
  const expandedTokens = tokenizeQuery(query)
  const keywordQuery = expandedTokens.length > 0 ? expandedTokens.join(' ') : query
  const keywordPromise = searchProjectFiles(projectId, keywordQuery, sources as string[], topK)

  // 2. Vector search (optional) — filter by source if active
  let vectorPromise: Promise<Array<{ path: string; score: number; heading_path: string; chunk_text: string }> | null> = Promise.resolve(null)
  if (includeVector) {
    vectorPromise = (async () => {
      try {
        const embedding = await embedText(query)
        if (!embedding) return null
        // Over-fetch a bit to compensate for post-filtering
        const fetchK = hasSourceFilter ? topK * 3 : topK
        const results = await vectorSearchChunks(projectId, embedding, fetchK)
        // Filter by source prefix if specific source is selected
        const filtered = hasSourceFilter
          ? results.filter(r => sources.some(s => r.page_id.startsWith(s + '/')))
          : results
        return filtered.map((r) => ({ path: r.page_id, score: r.score, heading_path: r.heading_path, chunk_text: r.chunk_text }))
      } catch { return null }
    })()
  }

  // 3. Resource workspace-level search (skip if a specific non-resource source is selected)
  let resourcePromise: Promise<SearchResult[]> = Promise.resolve([])
  if (!hasSourceFilter || sources.includes('resources')) {
    resourcePromise = searchResourceFiles(query, topK).catch(() => [] as SearchResult[])
  }

  // 4. Run all three
  const [keywordResults, vectorResults, resourceResults] = await Promise.all([
    keywordPromise,
    vectorPromise,
    resourcePromise,
  ])

  // 5. RRF fusion (3 ranks)
  const rankMap = new Map<string, { keywordRank: number | null; vectorRank: number | null; resourceRank: number | null }>()

  keywordResults?.forEach((r, i) => {
    const key = r.path
    if (!rankMap.has(key)) rankMap.set(key, { keywordRank: null, vectorRank: null, resourceRank: null })
    rankMap.get(key)!.keywordRank = i + 1
  })

  vectorResults?.forEach((r, i) => {
    const key = r.path
    if (!rankMap.has(key)) rankMap.set(key, { keywordRank: null, vectorRank: null, resourceRank: null })
    rankMap.get(key)!.vectorRank = i + 1
  })

  resourceResults?.forEach((r, i) => {
    const key = r.path
    if (!rankMap.has(key)) rankMap.set(key, { keywordRank: null, vectorRank: null, resourceRank: null })
    rankMap.get(key)!.resourceRank = i + 1
  })

  // 6. Compute RRF score with proper data for vector-only results
  const merged: HybridResult[] = []
  for (const [path, ranks] of rankMap) {
    let rrfScore = 0
    if (ranks.keywordRank !== null) rrfScore += 1 / (RRF_K + ranks.keywordRank)
    if (ranks.vectorRank !== null) rrfScore += 1 / (RRF_K + ranks.vectorRank)
    if (ranks.resourceRank !== null) rrfScore += 1 / (RRF_K + ranks.resourceRank)

    // Find best source data: keyword > resource > vector
    const keywordHit = keywordResults?.find((r) => r.path === path)
    const resourceHit = resourceResults?.find((r) => r.path === path)
    const vectorHit = vectorResults?.find((r) => r.path === path)

    if (keywordHit) {
      merged.push({
        path: keywordHit.path,
        filename: keywordHit.filename,
        snippet: keywordHit.snippet ?? '',
        score: keywordHit.score,
        source: keywordHit.source,
        rrfScore,
      })
    } else if (resourceHit) {
      merged.push({
        path: resourceHit.path,
        filename: resourceHit.filename,
        snippet: resourceHit.snippet ?? '',
        score: resourceHit.score,
        source: resourceHit.source,
        rrfScore,
      })
    } else if (vectorHit) {
      // Vector-only result: use chunk_text and heading_path as fallback display data
      merged.push({
        path: vectorHit.path,
        filename: vectorHit.heading_path || vectorHit.path.split('/').pop() || '',
        snippet: vectorHit.chunk_text?.slice(0, 200) ?? '',
        score: vectorHit.score,
        source: 'vector',
        rrfScore,
      })
    }
  }

  merged.sort((a, b) => b.rrfScore - a.rrfScore)
  return merged.slice(0, topK)
}