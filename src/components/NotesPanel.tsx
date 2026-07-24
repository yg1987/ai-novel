import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { listChapters } from '../api/tauri'
import type { ChapterMeta, ChapterRef } from '../types/chapter'
import {
  loadAllNotes,
  saveNote,
  deleteNote,
  applyFilter,
  generateId,
  parseChapterRef,
  type NoteEntry,
  type NoteType,
  type FilterView,
} from '../services/notesStorage'
import ConfirmDialog from './ConfirmDialog'
import Pagination from './Pagination'
import { usePagination } from '../hooks/usePagination'
import NotesComposer from './notes-panel/NotesComposer'
import NotesToolbar from './notes-panel/NotesToolbar'
import NotesList from './notes-panel/NotesList'
import './notes-panel/NotesPanel.css'

type ViewMode = 'timeline' | 'grouped'

interface Props {
  projectId: string
  onNavigateToChapter?: (chapterRef: ChapterRef) => void
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
  const [currentTime] = useState(() => Date.now())

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
  }, [initialChapterRef, initialFilter, loading, onHighlightComplete])

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
    const week = 7 * 24 * 60 * 60 * 1000
    return notes.filter((n) => {
      if (n.type !== 'todo' || n.done) return false
      const created = new Date(n.createdAt).getTime()
      return !isNaN(created) && (currentTime - created) > week
    }).length
  }, [currentTime, notes])

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

  // ─── Render ─────────────────────────────────────

  return (
    <div className="notes-panel">
      <NotesComposer
        content={newContent}
        type={newType}
        chapterRef={newChapterRef}
        chapterVolumes={chapterVolumes}
        onContentChange={setNewContent}
        onTypeChange={setNewType}
        onChapterRefChange={setNewChapterRef}
        onAdd={() => { handleAdd().catch(console.error) }}
      />

      <NotesToolbar
        notes={notes}
        filter={filter}
        viewMode={viewMode}
        options={FILTER_OPTIONS}
        countFiltered={countFiltered}
        onFilterChange={handleFilterChange}
        onViewModeChange={handleViewModeChange}
      />

      {overdueCount > 0 && (
        <div className="notes-overdue-banner">
          ⚠️ {overdueCount} 条待办超过 7 天未完成
        </div>
      )}

      <NotesList
        loading={loading}
        viewMode={viewMode}
        timelineItems={paged}
        groupedItems={viewMode === 'grouped' && groupedPaged ? groupedPaged.items : null}
        filterEmptyLabel={filterEmptyLabel()}
        collapsedGroups={collapsedGroups}
        editContent={editContent}
        editingId={editingId}
        resolveChapterName={(ref) => resolveChapterName(ref, chapterList)}
        onToggleGroup={toggleGroupCollapse}
        onNavigateToChapter={onNavigateToChapter}
        onStartEdit={startEdit}
        onEditContentChange={setEditContent}
        onSaveEdit={() => { saveEdit().catch(console.error) }}
        onCancelEdit={cancelEdit}
        onToggleDone={(id) => { handleToggleDone(id).catch(console.error) }}
        onToggleResolved={(id) => { handleToggleResolved(id).catch(console.error) }}
        onDelete={setDeleteTarget}
      />

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
