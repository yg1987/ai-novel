import { useState, useCallback } from 'react'
import type { SearchSource } from '../services/search'
import { hybridSearch } from '../services/search'
import type { SearchResult } from '../api/tauri'

interface Props {
  projectId: string
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

export default function SearchPanel({ projectId }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Array<SearchResult & { rrfScore: number }>>([])
  const [searching, setSearching] = useState(false)
  const [includeVector, setIncludeVector] = useState(true)
  const [sourceFilter, setSourceFilter] = useState<string>('all')

  const doSearch = useCallback(async () => {
    if (!query.trim()) return
    setSearching(true)
    try {
      const sources = sourceFilter === 'all' ? [] : [sourceFilter as SearchSource]
      const res = await hybridSearch(projectId, query.trim(), { sources, includeVector, topK: 30 })
      setResults(res)
    } catch (e) {
      console.error('Search failed:', e)
    } finally {
      setSearching(false)
    }
  }, [query, projectId, sourceFilter, includeVector])

  return (
    <div className="panel-layout">
      <div className="panel-sidebar" style={{ width: 200 }}>
        <div className="panel-sidebar-header">
          <h3>搜索范围</h3>
        </div>
        <div className="panel-list">
          {['all', 'characters', 'worldview', 'chapters', 'notes', 'outline', 'memory', 'resources'].map((s) => (
            <div
              key={s}
              className={`panel-item${sourceFilter === s ? ' active' : ''}`}
              onClick={() => { setSourceFilter(s) }}
            >
              {s === 'all' ? '全部' : SOURCE_LABELS[s] ?? s}
            </div>
          ))}
        </div>
        <div style={{ padding: '8px', borderTop: '1px solid var(--border)' }}>
          <label style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={includeVector} onChange={(e) => { setIncludeVector(e.target.checked) }} />
            向量搜索
          </label>
        </div>
      </div>
      <div className="panel-editor">
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8 }}>
          <input
            className="notes-input"
            style={{ flex: 1 }}
            value={query}
            onChange={(e) => { setQuery(e.target.value) }}
            onKeyDown={(e) => { if (e.key === 'Enter') doSearch() }}
            placeholder="搜索角色、世界观、章节、备注…"
          />
          <button className="btn-primary" onClick={doSearch} disabled={searching || !query.trim()}>
            {searching ? '搜索中…' : '搜索'}
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          {results.length === 0 && !searching && (
            <div className="panel-placeholder" style={{ height: 200 }}>输入关键词开始搜索</div>
          )}
          {results.map((r, i) => (
            <div key={`${r.path}-${i}`} className="foreshadow-item normal" style={{ marginBottom: 8 }}>
              <div className="foreshadow-item-header">
                <span className="note-type-badge">{SOURCE_LABELS[r.source] ?? r.source}</span>
                <span className="foreshadow-name">{r.filename}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>RRF: {r.rrfScore.toFixed(3)}</span>
              </div>
              <div className="foreshadow-desc">{r.snippet}</div>
            </div>
          ))}
          {searching && <div className="panel-placeholder">搜索中…</div>}
        </div>
      </div>
    </div>
  )
}
