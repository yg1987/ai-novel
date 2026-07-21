import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChapterKey, ChapterMeta, ChapterRef } from '../types/chapter'
import {
  createMaterial,
  createMaterialUsage,
  deleteProjectFile,
  initializeMaterialLibrary,
  listChapters,
  listMaterialCategories,
  listMaterialKinds,
  writeProjectFile,
} from '../api/tauri'
import {
  createNewWritingVolume,
  createNextWritingChapter,
  loadWritingNames,
  sortChapters,
} from '../services/chapterCatalog'
import { chapterRefKey } from '../services/chapterDisplay'
import { archiveChapterReviews } from '../services/reviewReportStorage'
import { buildChapterRef, getNotesForChapter, loadAllNotes, type NoteEntry } from '../services/notesStorage'
import { copyChapterForPlatform } from '../services/exportService'
import { PLATFORM_LABELS, type PublishPlatform } from '../utils/formatAdapter'
import { showToast } from '../utils/toast'
import PopupMenu from './PopupMenu'
import Editor, { type EditorHandle } from './Editor'
import ConfirmDialog from './ConfirmDialog'
import Button from './Button'
import Modal from './Modal'
import type { CurrentChapterRef, MaterialCategory, MaterialContextSelection, MaterialKindDefinition } from '../types/material'
import './ChapterManager.css'

const VersionHistoryPanel = lazy(() => import('./VersionHistoryPanel'))
const MaterialSidebar = lazy(() => import('./MaterialSidebar'))

interface Props {
  projectId: string
  projectName: string
  onNavigateToReview?: (ref: ChapterRef) => void
  onNavigateToNotes?: (chapterRef: string, filter: string) => void
  initialChapterRef?: string | null
  onChapterSelect?: (chapter: CurrentChapterRef) => void
  currentChapter: CurrentChapterRef | null
  materialContextSelections: MaterialContextSelection[]
  onMaterialContextChange: (selections: MaterialContextSelection[]) => void
  onOpenMaterial: (materialId: string) => void
}

type CreateDialog = { kind: 'volume' } | { kind: 'chapter'; volume: string }

export default function ChapterManager({
  projectId,
  projectName,
  onNavigateToReview,
  onNavigateToNotes,
  initialChapterRef,
  onChapterSelect,
  currentChapter,
  materialContextSelections,
  onMaterialContextChange,
  onOpenMaterial,
}: Props) {
  const [chapters, setChapters] = useState<ChapterMeta[]>([])
  const [activeChapterKey, setActiveChapterKey] = useState<ChapterKey | null>(null)
  const [contentVersion, setContentVersion] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showVersionHistory, setShowVersionHistory] = useState(false)
  const [showMaterial, setShowMaterial] = useState(false)
  const [collapsedVolumes, setCollapsedVolumes] = useState<Record<string, boolean>>({})
  const [collapsedSegments, setCollapsedSegments] = useState<Record<string, boolean>>({})
  const [chapterQuery, setChapterQuery] = useState('')
  const [jumpVolume, setJumpVolume] = useState('')
  const [segmentSize, setSegmentSize] = useState<25 | 50 | 100>(() => {
    const stored = Number(window.localStorage.getItem(`chapter-segment-size:${projectId}`))
    return stored === 25 || stored === 100 ? stored : 50
  })
  const [chapterTitles, setChapterTitles] = useState<Record<ChapterKey, string>>({})
  const [volumeNames, setVolumeNames] = useState<Record<string, string>>({})
  const [editingVolumeName, setEditingVolumeName] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState(false)
  const [chapterMenuKey, setChapterMenuKey] = useState<ChapterKey | null>(null)
  const [allNotes, setAllNotes] = useState<NoteEntry[]>([])
  const [deleteConfirm, setDeleteConfirm] = useState<{ kind: 'chapter'; chapter: ChapterMeta } | { kind: 'volume'; volume: string } | null>(null)
  const [createDialog, setCreateDialog] = useState<CreateDialog | null>(null)
  const [volumeNameInput, setVolumeNameInput] = useState('')
  const [chapterNameInput, setChapterNameInput] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const volumeNameInputRef = useRef<HTMLInputElement>(null)
  const chapterTitleInputRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef<EditorHandle>(null)
  const [captureText, setCaptureText] = useState<string | null>(null)
  const [captureTitle, setCaptureTitle] = useState('')
  const [captureKinds, setCaptureKinds] = useState<MaterialKindDefinition[]>([])
  const [captureCategories, setCaptureCategories] = useState<MaterialCategory[]>([])
  const [captureKindId, setCaptureKindId] = useState('')
  const [captureTags, setCaptureTags] = useState('')
  const [captureSaving, setCaptureSaving] = useState(false)

  const activeChapter = chapters.find((chapter) => chapterRefKey(chapter) === activeChapterKey) ?? null
  const activeRef = activeChapter ? { volume: activeChapter.volume, chapterId: activeChapter.id } : null
  const volumes = useMemo(
    () => [...new Set(chapters.map((chapter) => chapter.volume))].sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true })),
    [chapters],
  )
  const chaptersByVolume = useMemo(
    () => volumes.map((volume) => ({ volume, chapters: sortChapters(chapters.filter((chapter) => chapter.volume === volume)) })),
    [chapters, volumes],
  )

  const refresh = useCallback(async () => {
    const list = await listChapters(projectId)
    const names = await loadWritingNames(projectId)
    setChapters(sortChapters(list))
    setChapterTitles(names.chapterTitles)
    setVolumeNames(names.volumeNames)
    return sortChapters(list)
  }, [projectId])

  const reportChapter = useCallback((chapter: ChapterMeta) => {
    const key = chapterRefKey(chapter)
    onChapterSelect?.({
      projectId,
      volume: chapter.volume,
      chapterId: chapter.id,
      chapterTitle: chapterTitles[key] || chapter.title,
    })
  }, [chapterTitles, onChapterSelect, projectId])

  useEffect(() => {
    let mounted = true
    const timer = window.setTimeout(() => {
      void refresh()
        .then((list) => { if (mounted) setActiveChapterKey((current) => current ?? (list[0] ? chapterRefKey(list[0]) : null)) })
        .catch((error: unknown) => { console.error('Failed to load chapters:', error) })
        .finally(() => { if (mounted) setLoading(false) })
    }, 0)
    return () => { mounted = false; window.clearTimeout(timer) }
  }, [refresh])

  useEffect(() => {
    if (!initialChapterRef) return
    const [volume, chapterId] = initialChapterRef.split(':')
    const target = chapters.find((chapter) => chapter.volume === volume && chapter.id === chapterId)
    if (!target) return
    const timer = window.setTimeout(() => {
      setActiveChapterKey(chapterRefKey(target))
      setCollapsedVolumes((previous) => ({ ...previous, [target.volume]: false }))
      setCollapsedSegments((previous) => ({ ...previous, [`${target.volume}:${Math.floor((target.order - 1) / segmentSize)}`]: false }))
      reportChapter(target)
      window.setTimeout(() => document.querySelector<HTMLElement>(`[data-chapter-key="${CSS.escape(chapterRefKey(target))}"]`)?.scrollIntoView({ block: 'nearest' }), 0)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [chapters, initialChapterRef, reportChapter, segmentSize])

  useEffect(() => {
    void initializeMaterialLibrary()
    void Promise.all([listMaterialCategories(), listMaterialKinds()])
      .then(([categories, kinds]) => {
        setCaptureCategories(categories)
        setCaptureKinds(kinds)
        setCaptureKindId(kinds.find((kind) => kind.presetKey === 'inspiration' && !kind.archived)?.id ?? kinds.find((kind) => !kind.archived)?.id ?? '')
      })
      .catch((error: unknown) => { console.error('Failed to load material settings:', error) })
  }, [])

  useEffect(() => {
    void loadAllNotes(projectId).then(setAllNotes).catch(console.error)
  }, [projectId])

  useEffect(() => {
    if (editingVolumeName) window.setTimeout(() => volumeNameInputRef.current?.focus(), 50)
  }, [editingVolumeName])
  useEffect(() => {
    if (editingTitle) window.setTimeout(() => chapterTitleInputRef.current?.focus(), 50)
  }, [editingTitle])

  const notesByChapter = useMemo(() => {
    const values = new Map<ChapterKey, { note: number; todo: number; question: number }>()
    for (const chapter of chapters) {
      const notes = getNotesForChapter(allNotes, buildChapterRef(chapter.volume, chapter.id))
      values.set(chapterRefKey(chapter), {
        note: notes.filter((note) => note.type === 'note').length,
        todo: notes.filter((note) => note.type === 'todo' && !note.done).length,
        question: notes.filter((note) => note.type === 'question' && !note.resolved).length,
      })
    }
    return values
  }, [allNotes, chapters])

  const getVolumeDisplay = (volume: string) => volumeNames[volume] ? `${volume} · ${volumeNames[volume]}` : volume
  const getChapterDisplay = (chapter: ChapterMeta) => chapterTitles[chapterRefKey(chapter)] ? `第${chapter.order}章 · ${chapterTitles[chapterRefKey(chapter)]}` : `第${chapter.order}章`
  const activeChapterTitle = activeChapter ? chapterTitles[chapterRefKey(activeChapter)] || `第${activeChapter.order}章` : ''
  const normalizedChapterQuery = chapterQuery.trim().toLocaleLowerCase()
  const matchesChapterQuery = (chapter: ChapterMeta) => {
    if (!normalizedChapterQuery) return true
    const title = chapterTitles[chapterRefKey(chapter)] || ''
    return `${chapter.volume} ${chapter.order} ${chapter.id} ${title}`.toLocaleLowerCase().includes(normalizedChapterQuery)
  }
  const scrollToChapter = (chapter: ChapterMeta) => {
    const key = chapterRefKey(chapter)
    setActiveChapterKey(key)
    setCollapsedVolumes((previous) => ({ ...previous, [chapter.volume]: false }))
    setCollapsedSegments((previous) => ({ ...previous, [`${chapter.volume}:${Math.floor((chapter.order - 1) / segmentSize)}`]: false }))
    window.setTimeout(() => document.querySelector<HTMLElement>(`[data-chapter-key="${CSS.escape(key)}"]`)?.scrollIntoView({ block: 'nearest' }), 0)
  }
  const handleSegmentSizeChange = (value: 25 | 50 | 100) => {
    setSegmentSize(value)
    window.localStorage.setItem(`chapter-segment-size:${projectId}`, String(value))
    setCollapsedSegments({})
  }

  const renderChapterRow = (chapter: ChapterMeta) => {
    const key = chapterRefKey(chapter)
    return <div key={key} data-chapter-key={key} className={`chapter-item${key === activeChapterKey ? ' active' : ''}`}>
      <span className="chapter-item-title" onClick={() => handleClickChapter(chapter)}>{getChapterDisplay(chapter)}</span>
      <span className="chapter-item-actions">
        <PopupMenu trigger={<Button variant="ghost" size="xs" onClick={(event) => { event.stopPropagation(); setChapterMenuKey(chapterMenuKey === key ? null : key) }} title="更多章节操作">⋮</Button>} items={buildChapterMenuItems(chapter)} open={chapterMenuKey === key} onClose={() => setChapterMenuKey(null)} />
      </span>
    </div>
  }

  const openCreateDialog = (dialog: CreateDialog) => {
    setCreateDialog(dialog)
    setVolumeNameInput('')
    setChapterNameInput('')
    setCreateError(null)
  }

  const handleCreate = async () => {
    if (!createDialog) return
    setCreating(true)
    setCreateError(null)
    try {
      const chapter = createDialog.kind === 'volume'
        ? await createNewWritingVolume(projectId, { volumeName: volumeNameInput, firstChapterName: chapterNameInput })
        : await createNextWritingChapter(projectId, createDialog.volume, { chapterName: chapterNameInput })
      await refresh()
      scrollToChapter(chapter)
      reportChapter(chapter)
      setShowVersionHistory(false)
      setCreateDialog(null)
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : String(error))
    } finally {
      setCreating(false)
    }
  }

  const persistNames = async (nextVolumeNames: Record<string, string>, nextChapterTitles: Record<ChapterKey, string>) => {
    await Promise.all([
      writeProjectFile(projectId, 'memory', '_volume_names.json', JSON.stringify(nextVolumeNames, null, 2)),
      writeProjectFile(projectId, 'memory', '_chapter_titles.json', JSON.stringify(nextChapterTitles, null, 2)),
    ])
  }

  const handleConfirmVolumeName = async (volume: string) => {
    const value = volumeNameInputRef.current?.value.trim() || ''
    const next = { ...volumeNames }
    if (value) next[volume] = value
    else delete next[volume]
    try {
      await persistNames(next, chapterTitles)
      setVolumeNames(next)
    } catch (error) {
      console.error('Failed to save volume name:', error)
    } finally {
      setEditingVolumeName(null)
    }
  }

  const handleConfirmChapterTitle = async () => {
    if (!activeChapter) return
    const key = chapterRefKey(activeChapter)
    const value = chapterTitleInputRef.current?.value.trim() || ''
    const next = { ...chapterTitles }
    if (value) next[key] = value
    else delete next[key]
    try {
      await persistNames(volumeNames, next)
      setChapterTitles(next)
      reportChapter(activeChapter)
    } catch (error) {
      console.error('Failed to save chapter title:', error)
    } finally {
      setEditingTitle(false)
    }
  }

  const handleClickChapter = (chapter: ChapterMeta) => {
    scrollToChapter(chapter)
    setShowVersionHistory(false)
    reportChapter(chapter)
  }

  const handleDelete = async () => {
    if (!deleteConfirm) return
    const targets = deleteConfirm.kind === 'chapter'
      ? [deleteConfirm.chapter]
      : chapters.filter((chapter) => chapter.volume === deleteConfirm.volume)
    try {
      await Promise.all(targets.map((chapter) => archiveChapterReviews(projectId, { volume: chapter.volume, chapterId: chapter.id })))
      await Promise.all(targets.map((chapter) => deleteProjectFile(projectId, `chapters/${chapter.volume}`, `${chapter.id}.md`)))
      const nextTitles = { ...chapterTitles }
      for (const chapter of targets) delete nextTitles[chapterRefKey(chapter)]
      const nextVolumes = { ...volumeNames }
      if (deleteConfirm.kind === 'volume') delete nextVolumes[deleteConfirm.volume]
      await persistNames(nextVolumes, nextTitles)
      setChapterTitles(nextTitles)
      setVolumeNames(nextVolumes)
      const nextChapters = await refresh()
      const activeWasDeleted = activeChapter && targets.some((chapter) => chapterRefKey(chapter) === chapterRefKey(activeChapter))
      if (activeWasDeleted) {
        const next = nextChapters[0] ?? null
        setActiveChapterKey(next ? chapterRefKey(next) : null)
        if (next) reportChapter(next)
        setShowVersionHistory(false)
      }
    } catch (error) {
      console.error('Failed to delete chapters:', error)
    } finally {
      setDeleteConfirm(null)
    }
  }

  const buildExportItems = (chapter: ChapterMeta) =>
    (Object.entries(PLATFORM_LABELS) as [PublishPlatform, string][]).map(([platform, label]) => ({
      key: platform,
      label,
      onClick: () => { void copyChapterForPlatform(projectId, chapter.volume, chapter.id, platform).then(() => showToast(`已复制为${label}格式`)).catch(console.error) },
    }))

  const buildNotesItems = (chapter: ChapterMeta) => {
    const counts = notesByChapter.get(chapterRefKey(chapter)) ?? { note: 0, todo: 0, question: 0 }
    const ref = buildChapterRef(chapter.volume, chapter.id)
    return [
      { key: 'note', label: `📝 备注 (${counts.note})`, onClick: () => onNavigateToNotes?.(ref, 'note') },
      { key: 'todo', label: `☐ 待办 (${counts.todo})`, onClick: () => onNavigateToNotes?.(ref, 'todo') },
      { key: 'question', label: `❓ 疑问 (${counts.question})`, onClick: () => onNavigateToNotes?.(ref, 'question') },
    ]
  }

  const buildChapterMenuItems = (chapter: ChapterMeta) => [
    ...buildNotesItems(chapter),
    ...buildExportItems(chapter).map((item) => ({ ...item, key: `export-${item.key}`, label: `📋 ${item.label}` })),
    { key: 'history', label: '🕐 版本历史', onClick: () => { setActiveChapterKey(chapterRefKey(chapter)); setShowVersionHistory(true) } },
    { key: 'delete', label: '✕ 删除正文', onClick: () => setDeleteConfirm({ kind: 'chapter', chapter }) },
  ]

  const handleCaptureSelection = () => {
    const text = editorRef.current?.getSelectedText().trim() ?? ''
    if (!text) return
    setCaptureText(text)
    setCaptureTitle(text.slice(0, 30).replace(/\s+/g, ' '))
    setCaptureTags('')
  }

  const handleSaveCapture = async () => {
    const inbox = captureCategories.find((category) => category.systemKey === 'inbox')
    if (!captureText || !inbox || !captureKindId || !currentChapter) return
    setCaptureSaving(true)
    try {
      await createMaterial({ title: captureTitle.trim() || '章节摘录', kindId: captureKindId, content: captureText, categoryId: inbox.id, scope: 'projects', projectIds: [currentChapter.projectId], tags: captureTags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean) })
      setCaptureText(null)
      editorRef.current?.focus()
    } catch (error) {
      console.error('Failed to save material capture:', error)
    } finally {
      setCaptureSaving(false)
    }
  }

  const handleMaterialInsert = (materialId: string, text: string) => {
    editorRef.current?.insertAtCursor(text)
    if (!currentChapter) return
    void createMaterialUsage({ materialId, action: 'insert', ...currentChapter, excerpt: text }).catch(console.error)
  }

  if (loading) return <div className="chapter-loading">加载章节…</div>

  return (
    <div className="chapter-manager">
      <div className="chapter-sidebar">
        <div className="chapter-sidebar-header"><h3>{projectName}</h3></div>
        <div className="chapter-sidebar-toolbar">
          <button className="chapter-new-volume-btn" onClick={() => openCreateDialog({ kind: 'volume' })}>+ 新建分卷</button>
          <input className="chapter-navigation-search" value={chapterQuery} onChange={(event) => setChapterQuery(event.target.value)} placeholder="搜索章号或标题" aria-label="搜索章节" />
          <div className="chapter-navigation-controls">
            <select value={jumpVolume} onChange={(event) => setJumpVolume(event.target.value)} aria-label="选择卷">
              <option value="">跳转到卷…</option>
              {chaptersByVolume.map(({ volume }) => <option key={volume} value={volume}>{getVolumeDisplay(volume)}</option>)}
            </select>
            <select value="" disabled={!jumpVolume} onChange={(event) => {
              const target = chapters.find((chapter) => chapterRefKey(chapter) === event.target.value)
              if (target) handleClickChapter(target)
            }} aria-label="选择章节">
              <option value="">跳转到章节…</option>
              {jumpVolume && chaptersByVolume.find((item) => item.volume === jumpVolume)?.chapters.map((chapter) => <option key={chapterRefKey(chapter)} value={chapterRefKey(chapter)}>{getChapterDisplay(chapter)}</option>)}
            </select>
            <label className="chapter-segment-size">每段<select value={segmentSize} onChange={(event) => handleSegmentSizeChange(Number(event.target.value) as 25 | 50 | 100)} aria-label="章节段大小"><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select></label>
          </div>
        </div>
        <div className="chapter-list">
          {chaptersByVolume.map(({ volume, chapters: inVolume }) => {
            const visibleChapters = inVolume.filter(matchesChapterQuery)
            if (visibleChapters.length === 0) return null
            const collapsed = normalizedChapterQuery ? false : (collapsedVolumes[volume] ?? false)
            const renaming = editingVolumeName === volume
            const segments = Array.from({ length: Math.ceil(visibleChapters.length / segmentSize) }, (_, index) => ({
              key: `${volume}:${index}`,
              label: `第 ${visibleChapters[index * segmentSize]?.order ?? 0}–${visibleChapters[Math.min((index + 1) * segmentSize, visibleChapters.length) - 1]?.order ?? 0} 章`,
              chapters: visibleChapters.slice(index * segmentSize, (index + 1) * segmentSize),
            }))
            return <div key={volume} className="chapter-volume-group">
              <div className="chapter-volume-header" onClick={() => setCollapsedVolumes((previous) => ({ ...previous, [volume]: !previous[volume] }))}>
                <span className={`chapter-volume-chevron${collapsed ? ' collapsed' : ''}`}>▼</span>
                {renaming ? <input ref={volumeNameInputRef} className="chapter-volume-rename-input" defaultValue={volumeNames[volume] || ''} placeholder="卷名" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === 'Enter') void handleConfirmVolumeName(volume); if (event.key === 'Escape') setEditingVolumeName(null) }} onBlur={() => { void handleConfirmVolumeName(volume) }} /> : <span className="chapter-volume-name" onClick={(event) => { event.stopPropagation(); setEditingVolumeName(volume) }} title="点击修改卷名">{getVolumeDisplay(volume)}</span>}
                <span className="chapter-volume-count">{inVolume.length} 章</span>
                {!renaming && <button className="volume-delete-btn" onClick={(event) => { event.stopPropagation(); setDeleteConfirm({ kind: 'volume', volume }) }} title="删除正文卷">✕</button>}
              </div>
              {!collapsed && <div className="chapter-volume-body">
                {visibleChapters.length <= segmentSize
                  ? visibleChapters.map(renderChapterRow)
                  : segments.map((segment) => {
                    const containsActive = segment.chapters.some((chapter) => chapterRefKey(chapter) === activeChapterKey)
                    const isCollapsed = normalizedChapterQuery ? false : (collapsedSegments[segment.key] ?? !containsActive)
                    return <div key={segment.key} className="chapter-segment"><button className="chapter-segment-header" onClick={() => setCollapsedSegments((previous) => ({ ...previous, [segment.key]: !isCollapsed }))}>{isCollapsed ? '▶' : '▼'} {segment.label}</button>{!isCollapsed && segment.chapters.map(renderChapterRow)}</div>
                  })}
                <button className="chapter-add-btn" onClick={() => openCreateDialog({ kind: 'chapter', volume })}>+ 新建章节</button>
              </div>}
            </div>
          })}
          {normalizedChapterQuery && !chapters.some(matchesChapterQuery) && <p className="chapter-empty">没有匹配的章节</p>}
          {chapters.length === 0 && <p className="chapter-empty">暂无正文卷，点击「+ 新建分卷」创建第一章开始写作</p>}
        </div>
        <div className="chapter-sidebar-footer"><div className="chapter-footer-actions"><Button variant="ghost" size="xs" onClick={() => setShowMaterial((shown) => !shown)} title="素材库">📦 素材库</Button></div></div>
      </div>
      <div className="chapter-editor-area">
        {showVersionHistory && activeRef ? <Suspense fallback={<div className="editor-loading">加载版本历史…</div>}><VersionHistoryPanel projectId={projectId} volume={activeRef.volume} chapterId={activeRef.chapterId} onRestore={() => { setShowVersionHistory(false); setContentVersion((value) => value + 1) }} /></Suspense> : activeChapter && activeRef ? <div style={{ display: 'flex', flex: 1, flexDirection: 'column', overflow: 'hidden' }}>
          <div className="chapter-title-bar">{editingTitle ? <input ref={chapterTitleInputRef} className="chapter-title-input" defaultValue={chapterTitles[chapterRefKey(activeChapter)] || ''} placeholder="章节名" onKeyDown={(event) => { if (event.key === 'Enter') void handleConfirmChapterTitle(); if (event.key === 'Escape') setEditingTitle(false) }} onBlur={() => { void handleConfirmChapterTitle() }} /> : <h2 className="chapter-title-text" onClick={() => setEditingTitle(true)} title="点击修改章节标题">{activeChapterTitle}</h2>}</div>
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}><div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}><Editor ref={editorRef} key={`${activeRef.volume}-${activeRef.chapterId}-${contentVersion}`} projectId={projectId} volume={activeRef.volume} chapterId={activeRef.chapterId} chapterNumber={activeChapter.order} onNavigateToReview={onNavigateToReview ? () => onNavigateToReview(activeRef) : undefined} materialContextSelections={materialContextSelections} onMaterialContextUsed={(selections) => { if (!currentChapter) return; for (const selection of selections) void createMaterialUsage({ materialId: selection.materialId, action: 'ai_context', ...currentChapter, excerpt: selection.excerpt }).catch(console.error) }} onSaveSelection={handleCaptureSelection} /></div>{showMaterial && <Suspense fallback={<div className="material-sidebar"><div className="editor-loading">加载素材…</div></div>}><MaterialSidebar projectId={projectId} currentChapter={currentChapter} materialContextSelections={materialContextSelections} onMaterialContextChange={onMaterialContextChange} onInsert={handleMaterialInsert} onOpenMaterial={onOpenMaterial} /></Suspense>}</div>
        </div> : <div className="editor-placeholder"><p>选择或创建一个章节开始写作</p></div>}
      </div>
      {createDialog && <Modal className="chapter-create-modal"><h2>{createDialog.kind === 'volume' ? '新建分卷与第一章' : `新建 ${createDialog.volume} 的下一章`}</h2>{createDialog.kind === 'volume' && <label>卷名（可选）<input autoFocus value={volumeNameInput} onChange={(event) => setVolumeNameInput(event.target.value)} placeholder="留空显示默认卷名" /></label>}<label>章节名（可选）<input autoFocus={createDialog.kind === 'chapter'} value={chapterNameInput} onChange={(event) => setChapterNameInput(event.target.value)} placeholder="留空显示默认章节名" onKeyDown={(event) => { if (event.key === 'Enter') void handleCreate() }} /></label>{createError && <p className="error-bar">{createError}</p>}<div className="material-modal-footer"><Button variant="secondary" size="md" onClick={() => setCreateDialog(null)}>取消</Button><Button variant="primary" size="md" loading={creating} disabled={creating} onClick={() => { void handleCreate() }}>创建并开始写作</Button></div></Modal>}
      {deleteConfirm && <ConfirmDialog title={deleteConfirm.kind === 'chapter' ? '删除正文' : '删除正文卷'} message={deleteConfirm.kind === 'chapter' ? `确定删除正文「${getChapterDisplay(deleteConfirm.chapter)}」？\n同位置细纲会被保留。` : `确定删除正文卷「${getVolumeDisplay(deleteConfirm.volume)}」及其正文？\n同位置细纲会被保留。`} confirmText="删除正文" danger onConfirm={() => { void handleDelete() }} onCancel={() => setDeleteConfirm(null)} />}
      {captureText && <Modal className="material-editor-modal"><h2>存为素材</h2><label>标题<input value={captureTitle} onChange={(event) => setCaptureTitle(event.target.value)} /></label><label>类型<select value={captureKindId} onChange={(event) => setCaptureKindId(event.target.value)}>{captureKinds.filter((kind) => !kind.archived).map((kind) => <option key={kind.id} value={kind.id}>{kind.name}</option>)}</select></label><label>标签<input value={captureTags} onChange={(event) => setCaptureTags(event.target.value)} placeholder="用逗号分隔" /></label><pre>{captureText}</pre><div className="material-modal-footer"><Button variant="secondary" size="md" onClick={() => { setCaptureText(null); editorRef.current?.focus() }}>取消</Button><Button variant="primary" size="md" disabled={captureSaving || !captureKindId} onClick={() => { void handleSaveCapture() }}>{captureSaving ? '保存中…' : '保存到收件箱'}</Button></div></Modal>}
    </div>
  )
}
