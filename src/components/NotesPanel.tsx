import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { listChapters } from '../api/tauri'
import type { ChapterMeta } from '../types/chapter'
import {
  loadAllNotes,
  saveNote,
  deleteNote,
  applyFilter,
  generateId,
  parseChapterRef,
  buildChapterRef,
  type NoteEntry,
  type NoteType,
  type FilterView,
} from '../services/notesStorage'
import ConfirmDialog from './ConfirmDialog'
import Pagination from './Pagination'
import Button from './Button'
import { usePagination } from '../hooks/usePagination'

type ViewMode = 'timeline' | 'grouped'

interface Props {
  projectId: string
  onNavigateToChapter?: (chapterRef: string) => void
  initialChapterRef?: string | null
  initialFilter?: string | null
  onHighlightComplete?: () => void
}

const DEFAULT_PAGE_SIZE = 15

const FILTER_OPTIONS: { value: FilterView; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'note', label: '备注' },
  { value: 'todo', label: '待办⏳' },
  { value: 'done', label: '已办✓' },
  { value: 'question', label: '疑问❓' },
  { value: 'resolved', label: '已解决✅' },
]

function countFiltered(notes: NoteEntry[], filter: FilterView): number {
  return applyFilter(notes, filter).length
}

function groupChaptersByVolume(chapters: ChapterMeta[]): Map<string, ChapterMeta[]> {
  const map = new Map<string, ChapterMeta[]>()
  for (const ch of chapters) {
    const list = map.get(ch.volume) ?? []
    list.push(ch)
    if (!map.has(ch.volume)) map.set(ch.volume, list)
  }
  return map
}

function resolveChapterName(chapterRef: string, chapters: ChapterMeta[]): string {
  const parsed = parseChapterRef(chapterRef)
  if (!parsed) return chapterRef
  const found = chapters.find((c) => c.volume === parsed.volume && c.id === parsed.chapterId)
  return found ? found.title : chapterRef
}

export default function NotesPanel({ projectId, onNavigateToChapter, initialChapterRef, initialFilter, onHighlightComplete }: Props) {
  const [notes, setNotes] = useState<NoteEntry[]>([])
  const [chapterList, setChapterList] = useState<ChapterMeta[]>([])
  const [newContent, setNewContent] = useState('')
  const [newType, setNewType] = useState<NoteType>('note')
  const [newChapterRef, setNewChapterRef] = useState('')
  const [filter, setFilter] = useState<FilterView>('all')
  const [viewMode, setViewMode] = useState<ViewMode>('timeline')
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [deleteTarget, setDeleteTarget] = useState<NoteEntry | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    const [all, chs] = await Promise.all([
      loadAllNotes(projectId),
      listChapters(projectId).catch(() => [] as ChapterMeta[]),
    ])
    setNotes(all)
    setChapterList(chs)
    setLoading(false)
  }, [projectId])

  useEffect(() => { refresh().catch(console.error) }, [refresh])

  // ─── Initial chapter ref navigation ────────────

  const hasNavigatedRef = useRef(false)

  useEffect(() => {
    if (!initialChapterRef || loading) return
    if (hasNavigatedRef.current) return
    hasNavigatedRef.current = true

    // Switch to grouped view and expand the target chapter group
    setViewMode('grouped')
    setFilter((initialFilter || 'all') as FilterView)
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      next.delete(initialChapterRef)
      return next
    })

    // Scroll to the group header after a short delay for render
    setTimeout(() => {
      const el = document.querySelector(`[data-notes-group="${CSS.escape(initialChapterRef)}"]`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
      onHighlightComplete?.()
    }, 150)
  }, [initialChapterRef, loading])

  // Reset flag when initialChapterRef clears
  useEffect(() => {
    if (!initialChapterRef) {
      hasNavigatedRef.current = false
    }
  }, [initialChapterRef])

  // ─── CRUD ───────────────────────────────────────

  const handleAdd = async () => {
    if (!newContent.trim()) return
    const entry: NoteEntry = {
      id: generateId(),
      content: newContent.trim(),
      type: newType,
      chapterRef: newChapterRef,
      done: false,
      resolved: false,
      createdAt: new Date().toISOString().slice(0, 16),
    }
    await saveNote(projectId, entry)
    setNewContent('')
    await refresh()
  }

  const handleToggleDone = async (id: string) => {
    const note = notes.find((n) => n.id === id)
    if (!note) return
    await saveNote(projectId, { ...note, done: !note.done })
    await refresh()
  }

  const handleToggleResolved = async (id: string) => {
    const note = notes.find((n) => n.id === id)
    if (!note) return
    await saveNote(projectId, { ...note, resolved: !note.resolved })
    await refresh()
  }

  const handleDelete = async (id: string) => {
    await deleteNote(projectId, id)
    setDeleteTarget(null)
    await refresh()
  }

  // ─── Inline editing ─────────────────────────────

  const startEdit = (note: NoteEntry) => {
    setEditingId(note.id)
    setEditContent(note.content)
  }

  const saveEdit = async () => {
    if (editingId === null) return
    const note = notes.find((n) => n.id === editingId)
    if (!note || !editContent.trim()) { setEditingId(null); return }
    await saveNote(projectId, { ...note, content: editContent.trim() })
    setEditingId(null)
    await refresh()
  }

  const cancelEdit = () => setEditingId(null)

  // ─── Filter & Pagination ────────────────────────

  const filtered = useMemo(() => applyFilter(notes, filter), [notes, filter])
  const { paged, page, setPage, totalPages, reset } = usePagination(filtered, pageSize)

  const handleFilterChange = (f: FilterView) => { setFilter(f); reset() }
  const handleViewModeChange = (mode: ViewMode) => { setViewMode(mode); reset() }
  const handlePageSizeChange = (ps: number) => { setPageSize(ps); reset() }

  // ─── Overdue banner ─────────────────────────────

  const overdueCount = useMemo(() => {
    const now = Date.now()
    const week = 7 * 24 * 60 * 60 * 1000
    return notes.filter((n) => {
      if (n.type !== 'todo' || n.done) return false
      const created = new Date(n.createdAt).getTime()
      return !isNaN(created) && (now - created) > week
    }).length
  }, [notes])

  // ─── Grouped view ───────────────────────────────

  const groupedNotes = useMemo(() => {
    if (viewMode !== 'grouped') return null
    const groups = new Map<string, { ref: string; volume: string; chapterId: string; title: string; notes: NoteEntry[] }>()

    for (const note of filtered) {
      if (!note.chapterRef) {
        const g = groups.get('__project__') ?? { ref: '__project__', volume: '', chapterId: '', title: '📌 项目级', notes: [] }
        g.notes.push(note)
        if (!groups.has('__project__')) groups.set('__project__', g)
      } else {
        const key = note.chapterRef
        if (!groups.has(key)) {
          groups.set(key, {
            ref: key,
            volume: parseChapterRef(key)?.volume ?? '',
            chapterId: parseChapterRef(key)?.chapterId ?? '',
            title: resolveChapterName(key, chapterList),
            notes: [],
          })
        }
        groups.get(key)!.notes.push(note)
      }
    }

    const entries = [...groups.entries()]
    entries.sort(([, a], [, b]) => {
      if (!a.chapterId && !b.chapterId) return 0
      if (!a.chapterId) return -1
      if (!b.chapterId) return 1
      return a.volume.localeCompare(b.volume) || a.chapterId.localeCompare(b.chapterId)
    })
    return entries.map(([, g]) => g)
  }, [viewMode, filtered, chapterList])

  const toggleGroupCollapse = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  const groupedPaged = useMemo(() => {
    if (!groupedNotes) return null
    const allItems: Array<
      { kind: 'group-header'; key: string; title: string; count: number }
      | { kind: 'note'; note: NoteEntry }
    > = []

    for (const g of groupedNotes) {
      allItems.push({ kind: 'group-header', key: g.ref, title: g.title, count: g.notes.length })
      if (!collapsedGroups.has(g.ref)) {
        for (const n of g.notes) allItems.push({ kind: 'note', note: n })
      }
    }

    const groupedTotalPages = Math.max(1, Math.ceil(allItems.length / pageSize))
    const groupedSafePage = Math.min(page, groupedTotalPages)
    const start = (groupedSafePage - 1) * pageSize
    return { items: allItems.slice(start, start + pageSize), totalPages: groupedTotalPages }
  }, [groupedNotes, collapsedGroups, page, pageSize])

  // ─── Render helpers ─────────────────────────────

  const typeIcon = (n: NoteEntry): string => {
    if (n.type === 'question') return '❓'
    if (n.type === 'todo') return '☐'
    return '📝'
  }

  const stateButton = (n: NoteEntry) => {
    if (n.type === 'todo') {
      return (
        <Button variant="text" size="sm" onClick={() => { handleToggleDone(n.id).catch(console.error) }}>
          {n.done ? '↩ 重开' : '✓ 完成'}
        </Button>
      )
    }
    if (n.type === 'question') {
      return (
        <Button variant="text" size="sm" onClick={() => { handleToggleResolved(n.id).catch(console.error) }}>
          {n.resolved ? '↩ 重开' : '✓ 解决'}
        </Button>
      )
    }
    return null
  }

  const filterEmptyLabel = (): string => {
    switch (filter) {
      case 'note': return '备注'
      case 'todo': return '待办'
      case 'done': return '已完成待办'
      case 'question': return '疑问'
      case 'resolved': return '已解决疑问'
      default: return ''
    }
  }

  const chapterVolumes = useMemo(() => groupChaptersByVolume(chapterList), [chapterList])

  const renderNoteItem = (n: NoteEntry) => (
    <div key={n.id} className={`note-item ${n.type}${n.done ? ' done' : ''}${n.resolved ? ' resolved' : ''}`}>
      <div className="note-item-header">
        <span className="note-type-badge">{typeIcon(n)}</span>
        {n.chapterRef && (
          <span
            className="note-chapter-tag"
            onClick={(e) => { e.stopPropagation(); onNavigateToChapter?.(n.chapterRef) }}
            title="点击跳转到该章节"
          >
            📖 {resolveChapterName(n.chapterRef, chapterList)}
          </span>
        )}
        <span className="note-date">{n.createdAt}</span>
        <div className="note-item-actions">
          {stateButton(n)}
          <Button variant="text" size="sm" onClick={(e) => { e.stopPropagation(); setDeleteTarget(n) }} style={{ color: 'var(--danger)' }}>✕</Button>
        </div>
      </div>
      {editingId === n.id ? (
        <div className="note-edit-area">
          <textarea
            className="note-edit-textarea"
            value={editContent}
            onChange={(e) => { setEditContent(e.target.value) }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit().catch(console.error) }
              if (e.key === 'Escape') cancelEdit()
            }}
            autoFocus
            rows={3}
          />
          <div className="dialog-footer" style={{ borderTop: 'none', paddingTop: 0, marginTop: 6 }}>
            <Button variant="text" size="sm" onClick={cancelEdit}>取消</Button>
            <Button variant="text" size="sm" onClick={() => { saveEdit().catch(console.error) }}>保存</Button>
          </div>
        </div>
      ) : (
        <div
          className={`note-content${n.done ? ' done-text' : ''}${n.resolved ? ' resolved-text' : ''}`}
          onClick={() => { startEdit(n) }}
          title="点击编辑"
        >
          {n.content}
        </div>
      )}
    </div>
  )

  // ─── Render ─────────────────────────────────────

  return (
    <div className="notes-panel">
      <div className="notes-input-area">
        <div className="notes-input-row">
          <textarea
            className="notes-input"
            value={newContent}
            onChange={(e) => { setNewContent(e.target.value) }}
            placeholder="添加备注、待办或疑问…"
            rows={2}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAdd().catch(console.error) }
            }}
          />
          <select value={newType} onChange={(e) => { setNewType(e.target.value as NoteType) }}>
            <option value="note">备注</option>
            <option value="todo">待办</option>
            <option value="question">疑问</option>
          </select>
          <Button variant="primary" size="md" onClick={() => { handleAdd().catch(console.error) }}>添加</Button>
        </div>
        {chapterVolumes.size > 0 && (
          <div className="notes-chapter-row">
            <select value={newChapterRef} onChange={(e) => { setNewChapterRef(e.target.value) }}>
              <option value="">项目级（不关联章节）</option>
              {[...chapterVolumes.entries()].map(([volume, chs]) => (
                <optgroup key={volume} label={volume}>
                  {chs.map((ch) => (
                    <option key={buildChapterRef(ch.volume, ch.id)} value={buildChapterRef(ch.volume, ch.id)}>
                      {ch.title}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="notes-toolbar">
        <div className="notes-filter">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`tab-btn${filter === opt.value ? ' active' : ''}`}
              onClick={() => { handleFilterChange(opt.value) }}
            >
              {opt.label}
              <span className="notes-filter-count">
                {' '}{opt.value === 'all' ? notes.length : countFiltered(notes, opt.value)}
              </span>
            </button>
          ))}
        </div>
        <div className="notes-view-toggle">
          <button
            className={`tab-btn${viewMode === 'timeline' ? ' active' : ''}`}
            onClick={() => { handleViewModeChange('timeline') }}
          >📋 时间线</button>
          <button
            className={`tab-btn${viewMode === 'grouped' ? ' active' : ''}`}
            onClick={() => { handleViewModeChange('grouped') }}
          >📂 按章节</button>
        </div>
      </div>

      {overdueCount > 0 && (
        <div className="notes-overdue-banner">
          ⚠️ {overdueCount} 条待办超过 7 天未完成
        </div>
      )}

      <div className="notes-list">
        {loading ? (
          <p className="notes-empty">加载中…</p>
        ) : viewMode === 'grouped' && groupedPaged ? (
          groupedPaged.items.length === 0 ? (
            <p className="notes-empty">暂无{filterEmptyLabel()}</p>
          ) : (
            groupedPaged.items.map((item) => {
              if (item.kind === 'group-header') {
                const isCollapsed = collapsedGroups.has(item.key)
                return (
                  <div
                    key={`gh-${item.key}`}
                    className="notes-group-header"
                    data-notes-group={item.key}
                    onClick={() => { toggleGroupCollapse(item.key) }}
                  >
                    <span className="notes-group-caret">{isCollapsed ? '▶' : '▼'}</span>
                    <span className="notes-group-title">{item.title}</span>
                    <span className="notes-group-count">{item.count}</span>
                  </div>
                )
              }
              return renderNoteItem(item.note)
            })
          )
        ) : (
          <>
            {paged.map(renderNoteItem)}
            {filtered.length === 0 && !loading && (
              <p className="notes-empty">暂无{filterEmptyLabel()}</p>
            )}
          </>
        )}
      </div>

      <Pagination
        currentPage={page}
        totalPages={viewMode === 'grouped' && groupedPaged ? groupedPaged.totalPages : totalPages}
        totalItems={viewMode === 'grouped' && groupedPaged
          ? groupedNotes?.reduce((sum, g) => sum + g.notes.length + 1, 0) ?? 0
          : filtered.length}
        pageSize={pageSize}
        pageSizeOptions={[15, 30, 50]}
        onPageChange={(p) => {
          setPage(p)
          document.querySelector('.notes-list')?.scrollTo(0, 0)
        }}
        onPageSizeChange={handlePageSizeChange}
      />

      {deleteTarget && (
        <ConfirmDialog
          title="确认删除"
          message={`确定要删除这条${deleteTarget.type === 'todo' ? '待办' : deleteTarget.type === 'question' ? '疑问' : '备注'}吗？\n\n"${deleteTarget.content.length > 60 ? deleteTarget.content.slice(0, 60) + '…' : deleteTarget.content}"\n\n删除后无法恢复。`}
          confirmText="删除"
          danger
          onConfirm={() => { handleDelete(deleteTarget.id).catch(console.error) }}
          onCancel={() => { setDeleteTarget(null) }}
        />
      )}
    </div>
  )
}
