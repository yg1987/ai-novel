import { useState, useCallback, useRef, useMemo } from 'react'
import type { SearchSource } from '../services/search'
import { hybridSearch } from '../services/search'
import type { HybridResult } from '../services/search'
import Pagination from './Pagination'
import Button from './Button'
import { usePagination } from '../hooks/usePagination'
import HighlightText from './HighlightText'

interface Props {
  projectId: string
  onOpenFile?: (path: string, source: string) => void
}

const SOURCE_LABELS: Record<string, string> = {
  characters: '角色',
  worldview: '世界观',
  chapters: '章节',
  notes: '备注',
  outline: '大纲',
  memory: '记忆',
  resources: '素材',
}

const DEFAULT_PAGE_SIZE = 15
const HISTORY_KEY_PREFIX = 'search_history_'
const MAX_HISTORY = 10

export default function SearchPanel({ projectId, onOpenFile }: Props) {
  const [query, setQuery] = useState('')
  // allResults 保留搜索返回的完整结果（未过滤），给客户端过滤用
  const [allResults, setAllResults] = useState<HybridResult[]>([])
  const [searching, setSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [includeVector, setIncludeVector] = useState(true)
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [searchHistory, setSearchHistory] = useState<string[]>(() => loadHistory())

  const resultsRef = useRef<HTMLDivElement>(null)

  // 客户端过滤：根据来源筛选已返回的结果，不重新搜索
  const filteredResults = useMemo(() => {
    if (sourceFilter === 'all') return allResults
    return allResults.filter((r) => r.source === sourceFilter)
  }, [allResults, sourceFilter])

  const { paged, page, setPage, totalPages, reset } = usePagination(filteredResults, pageSize)

  function loadHistory(): string[] {
    try {
      const raw = localStorage.getItem(HISTORY_KEY_PREFIX + projectId)
      return raw ? JSON.parse(raw) as string[] : []
    } catch { return [] }
  }

  const saveHistory = useCallback((q: string) => {
    try {
      const current = loadHistory()
      const filtered = current.filter((h) => h !== q)
      const updated = [q, ...filtered].slice(0, MAX_HISTORY)
      localStorage.setItem(HISTORY_KEY_PREFIX + projectId, JSON.stringify(updated))
      setSearchHistory(updated)
    } catch { /* localStorage not available */ }
  }, [projectId])

  const doSearchWithQuery = useCallback(async (q: string) => {
    if (!q.trim()) return
    setSearching(true)
    setHasSearched(true)
    try {
      const sources = sourceFilter === 'all' ? [] : [sourceFilter as SearchSource]
      const res = await hybridSearch(projectId, q.trim(), { sources, includeVector, topK: 30 })
      setAllResults(res)
      reset()
      saveHistory(q.trim())
    } catch (e) {
      console.error('Search failed:', e)
    } finally {
      setSearching(false)
    }
  }, [projectId, sourceFilter, includeVector, reset, saveHistory])

  const doSearch = useCallback(() => {
    doSearchWithQuery(query.trim())
  }, [query, doSearchWithQuery])

  const handleSourceChange = (s: string) => { setSourceFilter(s); reset() }
  const handlePageSizeChange = (ps: number) => { setPageSize(ps); reset() }

  const handleOpenFile = useCallback((result: HybridResult) => {
    if (onOpenFile) {
      onOpenFile(result.path, result.source)
    }
  }, [onOpenFile])

  return (
    <div className="panel-layout">
      <div className="panel-sidebar">
        <div className="panel-sidebar-header">
          <h3>搜索范围</h3>
        </div>
        <div className="panel-list">
          {['all', 'characters', 'worldview', 'chapters', 'notes', 'outline', 'memory', 'resources'].map((s) => (
            <div
              key={s}
              className={`panel-item${sourceFilter === s ? ' active' : ''}`}
              onClick={() => handleSourceChange(s)}
            >
              {s === 'all' ? '全部' : SOURCE_LABELS[s] ?? s}
            </div>
          ))}
        </div>
        <div style={{ padding: '8px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <label style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={includeVector} onChange={(e) => { setIncludeVector(e.target.checked) }} />
            向量搜索
          </label>
        </div>
      </div>
      <div className="panel-editor">
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, flexShrink: 0 }}>
          <input
            className="notes-input"
            style={{ flex: 1 }}
            value={query}
            onChange={(e) => { setQuery(e.target.value) }}
            onKeyDown={(e) => { if (e.key === 'Enter') doSearch() }}
            placeholder="搜索角色、世界观、章节、备注…"
          />
          <Button variant="primary" size="md" onClick={doSearch} disabled={searching || !query.trim()}>
            {searching ? '搜索中…' : '搜索'}
          </Button>
        </div>

        {/* Search history pills — show before first search */}
        {!hasSearched && searchHistory.length > 0 && !query.trim() && (
          <div style={{ padding: '8px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6 }}>最近搜索</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {searchHistory.map((h, i) => (
                <span
                  key={i}
                  className="search-history-tag"
                  onClick={() => { setQuery(h); doSearchWithQuery(h) }}
                >
                  {h}
                </span>
              ))}
            </div>
          </div>
        )}

        <div ref={resultsRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          {/* Empty state: not yet searched */}
          {!hasSearched && allResults.length === 0 && !searching && (
            <div className="panel-placeholder">输入关键词开始搜索</div>
          )}

          {/* Empty state: searched but current filter yields no results */}
          {hasSearched && filteredResults.length === 0 && !searching && (
            <div className="panel-placeholder">
              {allResults.length > 0
                ? `当前筛选条件下无结果（共 ${allResults.length} 条匹配，无"${SOURCE_LABELS[sourceFilter] ?? sourceFilter}"来源的结果）`
                : `未找到匹配"${query}"的结果`}
            </div>
          )}

          {/* Result cards */}
          {paged.map((r, i) => (
            <div
              key={`${r.path}-${i}`}
              className="search-result-item"
              style={{ marginBottom: 8 }}
              onClick={() => handleOpenFile(r)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') handleOpenFile(r) }}
            >
              <div className="search-result-header">
                <span className="note-type-badge">{SOURCE_LABELS[r.source] ?? r.source}</span>
                <span className="search-result-filename">
                  <HighlightText text={r.filename} query={query} />
                </span>
              </div>
              <div className="search-result-snippet">
                <HighlightText text={r.snippet} query={query} />
              </div>
              <div className="search-result-path">{r.path}</div>
            </div>
          ))}

          {searching && <div className="panel-placeholder">搜索中…</div>}

          <Pagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={filteredResults.length}
            pageSize={pageSize}
            pageSizeOptions={[15, 30, 50]}
            onPageChange={(p) => {
              setPage(p)
              resultsRef.current?.scrollTo(0, 0)
            }}
            onPageSizeChange={handlePageSizeChange}
          />
        </div>
      </div>
    </div>
  )
}
