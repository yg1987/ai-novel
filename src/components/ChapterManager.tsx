import { lazy, Suspense, useState, useEffect, useCallback, useRef, useMemo } from 'react'
import type { ChapterMeta } from '../types/chapter'
import {
  listChapters,
  saveChapterContent,
  deleteProjectFile,
  readProjectFile,
  writeProjectFile,
} from '../api/tauri'
import { loadAllNotes, getNotesForChapter, buildChapterRef, parseChapterRef, type NoteEntry } from '../services/notesStorage'
import { copyChapterForPlatform } from '../services/exportService'
import { PLATFORM_LABELS, type PublishPlatform } from '../utils/formatAdapter'
import { showToast } from '../utils/toast'
import PopupMenu from './PopupMenu'
import Editor, { type EditorHandle } from './Editor'
import ConfirmDialog from './ConfirmDialog'
import Button from './Button'
import './ChapterManager.css'

const VersionHistoryPanel = lazy(() => import('./VersionHistoryPanel'))
const MaterialSidebar = lazy(() => import('./MaterialSidebar'))

interface Props {
  projectId: string
  projectName: string
  onNavigateToReview?: (chapterId: string) => void
  onNavigateToNotes?: (chapterRef: string, filter: string) => void
  initialChapterRef?: string | null
  onChapterSelect?: (chapterId: string) => void
}

export default function ChapterManager({ projectId, projectName, onNavigateToReview, onNavigateToNotes, initialChapterRef, onChapterSelect }: Props) {
  const [chapters, setChapters] = useState<ChapterMeta[]>([])
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null)
  const [contentVersion, setContentVersion] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showVersionHistory, setShowVersionHistory] = useState(false)
  const [showMaterial, setShowMaterial] = useState(false)
  const [collapsedVolumes, setCollapsedVolumes] = useState<Record<string, boolean>>({})
  const [customVolumes, setCustomVolumes] = useState<string[]>([])
  const [deleteConfirm, setDeleteConfirm] = useState<{ kind: 'chapter'; chapter: ChapterMeta } | { kind: 'volume'; volume: string } | null>(null)
  const [chapterTitles, setChapterTitles] = useState<Record<string, string>>({})
  const [volumeNames, setVolumeNames] = useState<Record<string, string>>({})
  const [editingVolumeName, setEditingVolumeName] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState(false)
  const [exportMenuChapterId, setExportMenuChapterId] = useState<string | null>(null)
  const [notesMenuChapterId, setNotesMenuChapterId] = useState<string | null>(null)
  const [allNotes, setAllNotes] = useState<NoteEntry[]>([])
  const volumeNameInputRef = useRef<HTMLInputElement>(null)
  const chapterTitleInputRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef<EditorHandle>(null)

  // ─── Volumes ───────────────────────────────────

  const volumes = (() => {
    const fromChapters = chapters.length > 0
      ? [...new Set(chapters.map((c) => c.volume))]
      : []
    const merged = [...new Set([...fromChapters, ...customVolumes])]
    return merged.sort()
  })()

  const activeChapter = chapters.find((c) => c.id === activeChapterId)
  const activeVolume = activeChapter?.volume ?? volumes[0] ?? ''

  const getVolumeDisplay = (vol: string) => volumeNames[vol] || vol

  // ─── Chapter title helpers ────────────────────

  const getChapterDisplay = (ch: ChapterMeta): string => {
    const custom = chapterTitles[ch.id]
    if (custom && custom.trim()) return `第${ch.order}章 - ${custom}`
    return ch.title
  }

  const activeChapterTitle = activeChapter
    ? (chapterTitles[activeChapter.id] || activeChapter.title)
    : ''

  // ─── Data loading ─────────────────────────────

  const refresh = useCallback(async () => {
    try {
      const list = await listChapters(projectId)
      setChapters(list)
      return list
    } catch (e) {
      console.error('Failed to load chapters:', e)
      return [] as ChapterMeta[]
    }
  }, [projectId])

  const loadMeta = useCallback(async () => {
    try {
      const raw = await readProjectFile(projectId, 'memory', '_chapter_titles.json')
      if (raw.trim()) setChapterTitles(JSON.parse(raw) as Record<string, string>)
    } catch { /* file may not exist */ }
    try {
      const raw = await readProjectFile(projectId, 'memory', '_volume_names.json')
      if (raw.trim()) setVolumeNames(JSON.parse(raw) as Record<string, string>)
    } catch { /* file may not exist */ }
  }, [projectId])

  useEffect(() => {
    Promise.all([refresh(), loadMeta()])
      .then(([list]) => {
        if (list.length > 0 && !activeChapterId) {
          setActiveChapterId(list[0]!.id)
          onChapterSelect?.(list[0]!.id)
        }
        setLoading(false)
      })
      .catch(() => { setLoading(false) })
  }, [refresh, loadMeta])

  // Auto-select chapter from initialChapterRef (e.g. navigating from NotesPanel)
  useEffect(() => {
    if (!initialChapterRef) return
    const parsed = parseChapterRef(initialChapterRef)
    if (!parsed) return
    const target = chapters.find((c) => c.volume === parsed.volume && c.id === parsed.chapterId)
    if (target) {
      setActiveChapterId(target.id)
      onChapterSelect?.(target.id)
      // Expand the volume so the chapter is visible
      setCollapsedVolumes((prev) => ({ ...prev, [target.volume]: false }))
    }
  }, [initialChapterRef, chapters])

  // ─── Notes data for badges & sidebar ────────────

  useEffect(() => {
    let cancelled = false
    loadAllNotes(projectId)
      .then((n) => { if (!cancelled) setAllNotes(n) })
      .catch(console.error)
    return () => { cancelled = true }
  }, [projectId])

  const notesByType = useMemo(() => {
    const map = new Map<string, { note: number; todo: number; question: number }>()
    for (const ch of chapters) {
      const ref = buildChapterRef(ch.volume, ch.id)
      const chapterNotes = getNotesForChapter(allNotes, ref)
      map.set(ch.id, {
        note: chapterNotes.filter((n) => n.type === 'note').length,
        todo: chapterNotes.filter((n) => n.type === 'todo' && !n.done).length,
        question: chapterNotes.filter((n) => n.type === 'question' && !n.resolved).length,
      })
    }
    return map
  }, [chapters, allNotes])

  // Focus inputs
  useEffect(() => {
    if (editingVolumeName) setTimeout(() => volumeNameInputRef.current?.focus(), 50)
  }, [editingVolumeName])
  useEffect(() => {
    if (editingTitle) setTimeout(() => chapterTitleInputRef.current?.focus(), 50)
  }, [editingTitle])

  // ─── Handlers ─────────────────────────────────

  const persistTitles = async (titles: Record<string, string>) => {
    try {
      await writeProjectFile(projectId, 'memory', '_chapter_titles.json', JSON.stringify(titles, null, 2))
    } catch { /* ignore */ }
  }

  const persistVolumeNames = async (names: Record<string, string>) => {
    try {
      await writeProjectFile(projectId, 'memory', '_volume_names.json', JSON.stringify(names, null, 2))
    } catch { /* ignore */ }
  }

  const handleCreateVolume = () => {
    const nums = volumes
      .map((v) => { const m = v.match(/卷(\d+)/); return m ? parseInt(m[1]!, 10) : 0 })
      .filter((n) => n > 0)
    const next = nums.length > 0 ? Math.max(...nums) + 1 : 1
    const name = `卷${next}`
    setCustomVolumes((prev) => [...prev.filter((v) => v !== name), name])
    setCollapsedVolumes((prev) => ({ ...prev, [name]: false }))
  }

  const handleCreateChapter = (volume: string) => {
    const volChapters = chapters.filter((c) => c.volume === volume)
    const maxOrder = volChapters.reduce((max, c) => Math.max(max, c.order), 0)
    const nextNum = maxOrder + 1
    const id = `ch${String(nextNum).padStart(3, '0')}`

    saveChapterContent(projectId, volume, id, '').then(() => {
      const newMeta: ChapterMeta = { id, title: `第${String(nextNum)}章`, order: nextNum, volume }
      setChapters((prev) => [...prev, newMeta])
      setActiveChapterId(id)
      setShowVersionHistory(false)
    }).catch((e: unknown) => {
      console.error('Failed to create chapter:', e)
    })
  }

  const handleClickChapter = (ch: ChapterMeta) => {
    setActiveChapterId(ch.id)
    setShowVersionHistory(false)
    onChapterSelect?.(ch.id)
  }

  const handleViewVersionHistory = (ch: ChapterMeta) => {
    if (activeChapterId === ch.id && showVersionHistory) {
      setShowVersionHistory(false)
    } else {
      setActiveChapterId(ch.id)
      setShowVersionHistory(true)
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirm) return
    if (deleteConfirm.kind === 'chapter') {
      const { volume, id } = deleteConfirm.chapter
      try {
        await deleteProjectFile(projectId, `chapters/${volume}`, `${id}.md`)
        setChapters((prev) => prev.filter((c) => c.id !== id))
        if (id === activeChapterId) {
          setActiveChapterId(null)
          setShowVersionHistory(false)
        }
      } catch (e) {
        console.error('Failed to delete chapter:', e)
      }
    } else {
      const volume = deleteConfirm.volume
      // Delete all chapters in this volume
      const volChapters = chapters.filter((c) => c.volume === volume)
      for (const ch of volChapters) {
        try {
          await deleteProjectFile(projectId, `chapters/${volume}`, `${ch.id}.md`)
        } catch { /* try best-effort */ }
      }
      // Remove volume from state
      setChapters((prev) => prev.filter((c) => c.volume !== volume))
      setCustomVolumes((prev) => prev.filter((v) => v !== volume))
      // Clean up volume name override
      const updated = { ...volumeNames }
      delete updated[volume]
      setVolumeNames(updated)
      void persistVolumeNames(updated)
      // Clear active chapter if needed
      if (activeChapter?.volume === volume) {
        setActiveChapterId(null)
        setShowVersionHistory(false)
      }
    }
    setDeleteConfirm(null)
  }

  const toggleVolume = (vol: string) => {
    setCollapsedVolumes((prev) => ({ ...prev, [vol]: !prev[vol] }))
  }

  // ─── Volume rename ────────────────────────────

  const handleStartRenameVolume = (vol: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingVolumeName(vol)
  }

  const handleConfirmVolumeName = (oldName: string) => {
    const input = volumeNameInputRef.current
    const newName = input?.value.trim() || oldName
    const updated = { ...volumeNames }
    if (newName !== oldName) {
      updated[oldName] = newName
    } else {
      delete updated[oldName]
    }
    setVolumeNames(updated)
    void persistVolumeNames(updated)
    setEditingVolumeName(null)
  }

  // ─── Chapter title edit ───────────────────────

  const handleConfirmChapterTitle = () => {
    if (!activeChapter) return
    const input = chapterTitleInputRef.current
    const newTitle = input?.value.trim() || ''
    const updated = { ...chapterTitles }
    if (newTitle && newTitle !== activeChapter.title) {
      updated[activeChapter.id] = newTitle
    } else {
      delete updated[activeChapter.id]
    }
    setChapterTitles(updated)
    void persistTitles(updated)
    setEditingTitle(false)
  }

  const buildExportItems = (ch: ChapterMeta) =>
    (Object.entries(PLATFORM_LABELS) as [PublishPlatform, string][]).map(([platform, label]) => ({
      key: platform,
      label,
      onClick: () => {
        copyChapterForPlatform(projectId, ch.volume, ch.id, platform)
          .then(() => showToast(`已复制为${label}格式`))
          .catch((e) => console.error('Failed to copy chapter:', e))
      },
    }))

  const buildNotesItems = (ch: ChapterMeta) => {
    const counts = notesByType.get(ch.id) ?? { note: 0, todo: 0, question: 0 }
    const ref = buildChapterRef(ch.volume, ch.id)
    return [
      { key: 'note', label: `📝 备注 (${counts.note})`, onClick: () => onNavigateToNotes?.(ref, 'note') },
      { key: 'todo', label: `☐ 待办 (${counts.todo})`, onClick: () => onNavigateToNotes?.(ref, 'todo') },
      { key: 'question', label: `❓ 疑问 (${counts.question})`, onClick: () => onNavigateToNotes?.(ref, 'question') },
    ]
  }

  // ─── Computed ─────────────────────────────────

  const chaptersByVolume = volumes.map((vol) => ({
    volume: vol,
    chapters: chapters.filter((c) => c.volume === vol).sort((a, b) => a.order - b.order),
  }))

  if (loading) {
    return <div className="chapter-loading">加载章节…</div>
  }

  return (
    <div className="chapter-manager">
      {/* ─── Sidebar ─────────────────────────────── */}
      <div className="chapter-sidebar">
        <div className="chapter-sidebar-header">
          <h3>{projectName}</h3>
        </div>

        <div className="chapter-sidebar-toolbar">
          <button className="chapter-new-volume-btn" onClick={handleCreateVolume}>
            + 新建分卷
          </button>
        </div>

        <div className="chapter-list">
          {chaptersByVolume.map(({ volume: vol, chapters: volChs }) => {
            const isCollapsed = collapsedVolumes[vol] ?? false
            const isRenaming = editingVolumeName === vol
            return (
              <div key={vol} className="chapter-volume-group">
                <div
                  className="chapter-volume-header"
                  onClick={() => toggleVolume(vol)}
                >
                  <span className={`chapter-volume-chevron${isCollapsed ? ' collapsed' : ''}`}>▼</span>
                  {isRenaming ? (
                    <input
                      ref={volumeNameInputRef}
                      className="chapter-volume-rename-input"
                      defaultValue={getVolumeDisplay(vol)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleConfirmVolumeName(vol)
                        if (e.key === 'Escape') setEditingVolumeName(null)
                      }}
                      onBlur={() => handleConfirmVolumeName(vol)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span
                      className="chapter-volume-name"
                      onClick={(e) => handleStartRenameVolume(vol, e)}
                      title="点击修改卷名"
                    >
                      {getVolumeDisplay(vol)}
                    </span>
                  )}
                  <span className="chapter-volume-count">{volChs.length} 章</span>
                  {!isRenaming && (
                    <button
                      className="volume-delete-btn"
                      onClick={(e) => { e.stopPropagation(); setDeleteConfirm({ kind: 'volume', volume: vol }) }}
                      title="删除分卷"
                    >✕</button>
                  )}
                </div>

                {!isCollapsed && (
                  <div className="chapter-volume-body">
                    {volChs.map((ch) => (
                      <div
                        key={ch.id}
                        className={`chapter-item${ch.id === activeChapterId ? ' active' : ''}`}
                      >
                        <span
                          className="chapter-item-title"
                          onClick={() => handleClickChapter(ch)}
                        >
                          {getChapterDisplay(ch)}
                        </span>
                        <span className="chapter-item-actions">
                          <PopupMenu
                            trigger={
                              <Button variant="ghost" size="xs"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setNotesMenuChapterId(
                                    notesMenuChapterId === ch.id ? null : ch.id,
                                  )
                                }}
                                title="章节备注"
                              >📝</Button>
                            }
                            items={buildNotesItems(ch)}
                            open={notesMenuChapterId === ch.id}
                            onClose={() => setNotesMenuChapterId(null)}
                          />
                          <PopupMenu
                            trigger={
                              <Button variant="ghost" size="xs"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setExportMenuChapterId(
                                    exportMenuChapterId === ch.id ? null : ch.id,
                                  )
                                }}
                                title="发布复制"
                              >📋</Button>
                            }
                            items={buildExportItems(ch)}
                            open={exportMenuChapterId === ch.id}
                            onClose={() => setExportMenuChapterId(null)}
                          />
                          <Button variant="ghost" size="xs"
                            onClick={(e) => { e.stopPropagation(); handleViewVersionHistory(ch) }}
                            title="版本历史"
                          >🕐</Button>
                          <Button variant="ghost" size="xs" className="btn-tiny-danger"
                            onClick={(e) => { e.stopPropagation(); setDeleteConfirm({ kind: 'chapter', chapter: ch }) }}
                            title="删除章节"
                          >✕</Button>
                        </span>
                      </div>
                    ))}
                    {volChs.length === 0 && (
                      <div className="chapter-volume-empty">暂无章节</div>
                    )}
                    <button
                      className="chapter-add-btn"
                      onClick={() => handleCreateChapter(vol)}
                    >+ 新建章节</button>
                  </div>
                )}
              </div>
            )
          })}
          {chapters.length === 0 && customVolumes.length === 0 && (
            <p className="chapter-empty">暂无分卷，点击「+ 新建分卷」开始</p>
          )}
        </div>

        <div className="chapter-sidebar-footer">
          <div className="chapter-footer-actions">
            <Button variant="ghost" size="xs" onClick={() => setShowMaterial((v) => !v)} title="素材库">📦 素材库</Button>
          </div>
        </div>
      </div>

      {/* ─── Editor area ─────────────────────────── */}
      <div className="chapter-editor-area">
        {showVersionHistory && activeChapterId ? (
          <Suspense fallback={<div className="editor-loading">加载版本历史…</div>}>
            <VersionHistoryPanel
              projectId={projectId}
              volume={activeVolume}
              chapterId={activeChapterId}
              onRestore={() => {
                setShowVersionHistory(false)
                setContentVersion((v) => v + 1)
              }}
            />
          </Suspense>
        ) : activeChapterId ? (
          <div style={{ display: 'flex', flex: 1, flexDirection: 'column', overflow: 'hidden' }}>
            {/* Chapter title bar */}
            <div className="chapter-title-bar">
              {editingTitle ? (
                <input
                  ref={chapterTitleInputRef}
                  className="chapter-title-input"
                  defaultValue={activeChapterTitle !== activeChapter?.title ? activeChapterTitle : ''}
                  placeholder={activeChapter?.title}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConfirmChapterTitle()
                    if (e.key === 'Escape') setEditingTitle(false)
                  }}
                  onBlur={() => handleConfirmChapterTitle()}
                />
              ) : (
                <h2
                  className="chapter-title-text"
                  onClick={() => setEditingTitle(true)}
                  title="点击修改章节标题"
                >
                  {activeChapterTitle}
                </h2>
              )}
            </div>
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <Editor
                  ref={editorRef}
                  key={`${activeVolume}-${activeChapterId}-${contentVersion}`}
                  projectId={projectId}
                  volume={activeVolume}
                  chapterId={activeChapterId}
                  chapterNumber={activeChapter?.order ?? 1}
                  onNavigateToReview={onNavigateToReview}
                />
              </div>
              {showMaterial && (
                <Suspense fallback={<div className="material-sidebar"><div className="editor-loading">加载素材…</div></div>}>
                  <MaterialSidebar projectId={projectId} onInsert={(text) => editorRef.current?.insertAtCursor(text)} />
                </Suspense>
              )}
            </div>
          </div>
        ) : activeChapterId ? (
          <div className="editor-loading">加载章节…</div>
        ) : (
          <div className="editor-placeholder">
            <p>选择或创建一个章节开始写作</p>
          </div>
        )}
      </div>

      {deleteConfirm && (
        <ConfirmDialog
          title={deleteConfirm.kind === 'chapter' ? '删除章节' : '删除分卷'}
          message={
            deleteConfirm.kind === 'chapter'
              ? `确定删除「${getChapterDisplay(deleteConfirm.chapter)}」？\n此操作不可恢复。`
              : `确定删除分卷「${getVolumeDisplay(deleteConfirm.volume)}」？\n该分卷下的所有章节也将被删除，此操作不可恢复。`
          }
          confirmText="删除"
          danger
          onConfirm={() => { void handleDelete() }}
          onCancel={() => { setDeleteConfirm(null) }}
        />
      )}
    </div>
  )
}
