import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChapterRef } from '../types/chapter'
import { deleteProjectFile, listChapters, loadProviderConfig, readProjectFile, writeProjectFile } from '../api/tauri'
import {
  OUTLINE_DIR,
  OUTLINE_VOLUMES_DIR,
  chapterOrder,
  chapterRefFromMeta,
  compareRefs,
  createNextOutlineChapter,
  createOutlineChapter,
  createOutlineVolume,
  createOutlineVolumeAt,
  loadOutlineCatalog,
  outlineChapterDir,
  outlineChapterFilename,
  outlineVolumeFile,
  startWritingFromOutline,
} from '../services/chapterCatalog'
import { chapterRefKey } from '../services/chapterDisplay'
import { buildAIContext } from '../services/aiContext'
import { loadPrompt, resetPrompt, savePrompt } from '../services/aiPrompts'
import { loadChapterExpectedWords, loadSettings, saveChapterExpectedWords } from '../services/settings'
import type { TextareaSelection } from '../services/rewriteUtils'
import { applyTextareaRewrite, getTextareaSelection } from '../services/rewriteUtils'
import type { RewriteMode } from '../services/rewriteService'
import type { ContextMenuAction } from './SelectionContextMenu'
import ConfirmDialog from './ConfirmDialog'
import Modal from './Modal'
import OutlineSidebar, { type OutlineVolumeItem } from './outline-panel/OutlineSidebar'
import OutlineEditor from './outline-panel/OutlineEditor'

interface Props {
  projectId: string
  onNavigateToWriting: (chapterRef: string) => void
}

type OutlineSelection =
  | { type: 'outline' }
  | { type: 'volume'; volume: string }
  | { type: 'chapter'; ref: ChapterRef }

type DeletableSelection = Exclude<OutlineSelection, { type: 'outline' }>

const EXAMPLES: Record<OutlineSelection['type'], string> = {
  outline: '故事背景：\n\n主线剧情：\n\n核心冲突：\n\n结局走向：',
  volume: '概要：\n\n主要冲突：\n\n章节规划：\n\n本卷目标：',
  chapter: '情节点 1：\n描述：\n类型：\n字数：',
}

function selectionKey(selection: OutlineSelection): string {
  if (selection.type === 'outline') return 'outline'
  if (selection.type === 'volume') return `volume:${selection.volume}`
  return `chapter:${chapterRefKey(selection.ref)}`
}

function selectionFile(selection: OutlineSelection): { subdir: string; filename: string; label: string } {
  if (selection.type === 'outline') return { subdir: OUTLINE_DIR, filename: 'outline.md', label: '总纲' }
  if (selection.type === 'volume') return { subdir: OUTLINE_VOLUMES_DIR, filename: outlineVolumeFile(selection.volume), label: selection.volume }
  return { subdir: outlineChapterDir(selection.ref.volume), filename: outlineChapterFilename(selection.ref), label: `第${chapterOrder(selection.ref.chapterId)}章` }
}

function defaultPrompt(type: OutlineSelection['type'], label: string): string {
  if (type === 'outline') return '你是网文大纲助手。根据项目信息生成全书总纲，包含故事背景、主线剧情、核心冲突和结局走向。'
  if (type === 'volume') return `你是网文大纲助手。为「${label}」生成分卷纲，包含概要、主要冲突、章节规划和本卷目标。`
  return `你是网文大纲助手。为「${label}」生成 3 到 5 个章节情节点，写清发生什么、类型和字数预算。`
}

export default function OutlinePanel({ projectId, onNavigateToWriting }: Props) {
  const [volumes, setVolumes] = useState<OutlineVolumeItem[]>([])
  const [selection, setSelection] = useState<OutlineSelection>({ type: 'outline' })
  const [content, setContent] = useState('')
  const [editing, setEditing] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<DeletableSelection | null>(null)
  const [startTarget, setStartTarget] = useState<ChapterRef | null>(null)
  const [volumeName, setVolumeName] = useState('')
  const [chapterName, setChapterName] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [generatingAi, setGeneratingAi] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const [editingPrompt, setEditingPrompt] = useState('')
  const [savingPrompt, setSavingPrompt] = useState(false)
  const [showExample, setShowExample] = useState(false)
  const [rewriteState, setRewriteState] = useState<(TextareaSelection & { mode: RewriteMode }) | null>(null)
  const [hasSelection, setHasSelection] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [expectedWords, setExpectedWords] = useState<number | null>(null)
  const expectedWordsTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const activeRef = selection.type === 'chapter' ? selection.ref : null
  const activeFile = selectionFile(selection)
  const activeKey = selectionKey(selection)

  const refresh = useCallback(async () => {
    const [writing, catalog] = await Promise.all([listChapters(projectId), loadOutlineCatalog(projectId)])
    const byKey = new Map<string, { ref: ChapterRef; hasWriting: boolean; hasOutline: boolean }>()
    for (const chapter of writing) {
      const ref = chapterRefFromMeta(chapter)
      byKey.set(chapterRefKey(ref), { ref, hasWriting: true, hasOutline: catalog.outlineRefs.has(chapterRefKey(ref)) })
    }
    for (const refs of catalog.refsByVolume.values()) {
      for (const ref of refs) {
        const key = chapterRefKey(ref)
        const current = byKey.get(key)
        byKey.set(key, { ref, hasWriting: current?.hasWriting ?? false, hasOutline: true })
      }
    }
    const volumeNames = new Set<string>([
      ...writing.map((chapter) => chapter.volume),
      ...catalog.volumeOutlines,
      ...catalog.refsByVolume.keys(),
    ])
    setVolumes([...volumeNames].sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true })).map((volume) => ({
      volume,
      hasVolumeOutline: catalog.volumeOutlines.has(volume),
      chapters: [...byKey.values()].filter((item) => item.ref.volume === volume).sort((left, right) => compareRefs(left.ref, right.ref)),
    })))
  }, [projectId])

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh().catch(console.error) }, 0)
    return () => window.clearTimeout(timer)
  }, [refresh])

  useEffect(() => {
    let current = true
    const file = selectionFile(selection)
    void readProjectFile(projectId, file.subdir, file.filename)
      .then((value) => { if (current) { setContent(value); setDirty(false) } })
      .catch(() => { if (current) { setContent(''); setDirty(false) } })
    return () => { current = false }
  }, [projectId, selection])

  const promptKey = `outline_${selection.type}`
  useEffect(() => {
    void loadPrompt(projectId, promptKey).then((saved) => { setEditingPrompt(saved ?? ''); setShowPrompt(false) }).catch(console.error)
  }, [projectId, promptKey])

  useEffect(() => {
    if (!activeRef) return
    let current = true
    void loadChapterExpectedWords(projectId, activeRef)
      .then((value) => value ?? loadSettings().then((settings) => settings.default_word_count).catch(() => 4000))
      .then((value) => { if (current) setExpectedWords(value) })
      .catch(() => { if (current) setExpectedWords(null) })
    return () => { current = false }
  }, [activeRef, projectId])

  useEffect(() => () => { if (expectedWordsTimer.current) clearTimeout(expectedWordsTimer.current) }, [])

  const open = (next: OutlineSelection) => {
    if (dirty && !window.confirm('当前细纲有未保存修改，确定放弃并切换吗？')) return
    setSelection(next)
    setEditing(false)
    setRewriteState(null)
  }

  const save = async () => {
    await writeProjectFile(projectId, activeFile.subdir, activeFile.filename, content)
    setEditing(false)
    setDirty(false)
    await refresh()
  }

  const createVolume = async () => {
    try {
      const volume = await createOutlineVolume(projectId)
      await refresh()
      setSelection({ type: 'volume', volume })
      setEditing(true)
    } catch (error) { setActionError(error instanceof Error ? error.message : String(error)) }
  }

  const createVolumeOutline = async (volume: string) => {
    try {
      await createOutlineVolumeAt(projectId, volume)
      await refresh()
      setSelection({ type: 'volume', volume })
      setEditing(true)
    } catch (error) { setActionError(error instanceof Error ? error.message : String(error)) }
  }

  const createChapter = async (volume: string) => {
    try {
      const ref = await createNextOutlineChapter(projectId, volume)
      await refresh()
      setSelection({ type: 'chapter', ref })
      setEditing(true)
    } catch (error) { setActionError(error instanceof Error ? error.message : String(error)) }
  }

  const createOutlineForChapter = async (ref: ChapterRef) => {
    try {
      await createOutlineChapter(projectId, ref)
      await refresh()
      setSelection({ type: 'chapter', ref })
      setEditing(true)
    } catch (error) { setActionError(error instanceof Error ? error.message : String(error)) }
  }

  const startWriting = async () => {
    if (!startTarget) return
    setStarting(true)
    setActionError(null)
    try {
      await startWritingFromOutline(projectId, startTarget, { volumeName, chapterName })
      onNavigateToWriting(`${startTarget.volume}:${startTarget.chapterId}`)
      setStartTarget(null)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    } finally {
      setStarting(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    try {
      if (deleteTarget.type === 'chapter') {
        await deleteProjectFile(projectId, outlineChapterDir(deleteTarget.ref.volume), outlineChapterFilename(deleteTarget.ref))
      } else if (deleteTarget.type === 'volume') {
        const item = volumes.find((volume) => volume.volume === deleteTarget.volume)
        await Promise.all([
          deleteProjectFile(projectId, OUTLINE_VOLUMES_DIR, outlineVolumeFile(deleteTarget.volume)),
          ...(item?.chapters.filter((chapter) => chapter.hasOutline).map((chapter) => deleteProjectFile(projectId, outlineChapterDir(chapter.ref.volume), outlineChapterFilename(chapter.ref))) ?? []),
        ])
      }
      if (selectionKey(selection) === selectionKey(deleteTarget) || (deleteTarget.type === 'volume' && selection.type === 'chapter' && selection.ref.volume === deleteTarget.volume)) setSelection({ type: 'outline' })
      setDeleteTarget(null)
      await refresh()
    } catch (error) { setActionError(error instanceof Error ? error.message : String(error)) }
  }

  const aiGenerate = async () => {
    setGeneratingAi(true)
    setAiError(null)
    try {
      const config = await loadProviderConfig()
      const provider = config.providers.find((item) => item.name === config.active_profile)
      if (!provider?.models.analysis) throw new Error('未配置分析模型')
      const response = await fetch(`${provider.base_url.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.api_key}` },
        body: JSON.stringify({ model: provider.models.analysis, messages: [{ role: 'system', content: editingPrompt.trim() || defaultPrompt(selection.type, activeFile.label) }, { role: 'user', content: await buildAIContext(projectId) || '请生成大纲内容' }], temperature: 0.8, max_tokens: 2048 }),
      })
      if (!response.ok) throw new Error(`API ${response.status}`)
      const result = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
      const text = result.choices?.[0]?.message?.content?.trim()
      if (text) { setContent(text); setDirty(true) }
    } catch (error) { setAiError(error instanceof Error ? error.message : String(error)) } finally { setGeneratingAi(false) }
  }

  const menuItems: ContextMenuAction[] = contextMenu ? [
    { label: '✏️ AI 改写', onClick: () => { const value = getTextareaSelection(textareaRef.current, content); if (value) setRewriteState({ ...value, mode: 'rewrite' }) } },
    { label: '📝 AI 扩写', onClick: () => { const value = getTextareaSelection(textareaRef.current, content); if (value) setRewriteState({ ...value, mode: 'expand' }) } },
    { label: '✨ AI 润色', onClick: () => { const value = getTextareaSelection(textareaRef.current, content); if (value) setRewriteState({ ...value, mode: 'polish' }) } },
  ] : []

  const deleteMessage = deleteTarget
    ? deleteTarget.type === 'volume'
      ? `确定删除 ${deleteTarget.volume} 的分卷纲和细纲吗？\n正文不会被删除。`
      : `确定删除第${chapterOrder(deleteTarget.ref.chapterId)}章细纲吗？\n正文不会被删除。`
    : ''

  return <div className="panel-layout">
    <OutlineSidebar volumes={volumes} activeSelection={activeKey} onOpen={open} onCreateVolume={() => { void createVolume() }} onCreateVolumeOutline={(volume) => { void createVolumeOutline(volume) }} onCreateChapter={(volume) => { void createChapter(volume) }} onCreateOutlineForChapter={(ref) => { void createOutlineForChapter(ref) }} onStartWriting={(ref) => { setStartTarget(ref); setVolumeName(''); setChapterName(''); setActionError(null) }} onDeleteVolume={(volume) => setDeleteTarget({ type: 'volume', volume })} onDeleteChapter={(ref) => setDeleteTarget({ type: 'chapter', ref })} />
    <OutlineEditor activeFile={activeFile.label} activeType={selection.type} content={content} editing={editing} dirty={dirty} generatingAi={generatingAi} aiError={aiError} showPrompt={showPrompt} editingPrompt={editingPrompt} savingPrompt={savingPrompt} showExample={showExample} expectedWords={expectedWords} activeChapterRef={activeRef} example={EXAMPLES[selection.type]} textareaRef={textareaRef} onContentChange={(value) => { setContent(value); setDirty(true) }} onEdit={() => setEditing(true)} onSave={() => { void save().catch((error: unknown) => setActionError(error instanceof Error ? error.message : String(error))) }} onAIGenerate={() => { void aiGenerate() }} onTogglePrompt={() => { if (!showPrompt && !editingPrompt.trim()) setEditingPrompt(defaultPrompt(selection.type, activeFile.label)); setShowPrompt(!showPrompt) }} onPromptChange={setEditingPrompt} onResetPrompt={() => { setSavingPrompt(true); void resetPrompt(projectId, promptKey).then(() => { setEditingPrompt(''); setShowPrompt(false) }).catch(console.error).finally(() => setSavingPrompt(false)) }} onSavePrompt={() => { setSavingPrompt(true); void savePrompt(projectId, promptKey, editingPrompt).catch(console.error).finally(() => setSavingPrompt(false)) }} onToggleExample={() => setShowExample(!showExample)} onExpectedWordsChange={(value) => { setExpectedWords(value); if (expectedWordsTimer.current) clearTimeout(expectedWordsTimer.current); if (activeRef && value != null) expectedWordsTimer.current = setTimeout(() => { void saveChapterExpectedWords(projectId, activeRef, value).catch(console.error) }, 800) }} onExpectedWordsCommit={(value) => { if (expectedWordsTimer.current) clearTimeout(expectedWordsTimer.current); if (activeRef) void saveChapterExpectedWords(projectId, activeRef, value).catch(console.error) }} onSelectionCheck={() => { const target = textareaRef.current; if (target) setHasSelection(target.selectionStart !== target.selectionEnd) }} onSelectionContextMenu={(event) => { const target = event.currentTarget; if (target.selectionStart !== target.selectionEnd) { event.preventDefault(); setContextMenu({ x: event.clientX, y: event.clientY }) } }} rewriteState={rewriteState} hasSelection={hasSelection} onRewrite={(mode) => { const value = getTextareaSelection(textareaRef.current, content); if (value) setRewriteState({ ...value, mode }) }} onRewriteAccept={(text) => { if (!rewriteState) return; setContent((value) => applyTextareaRewrite(value, rewriteState.start, rewriteState.end, text)); setDirty(true); setRewriteState(null) }} onRewriteReject={() => setRewriteState(null)} contextMenu={contextMenu} onContextMenuClose={() => setContextMenu(null)} menuItems={menuItems} />
    {actionError && <div className="error-bar">{actionError}</div>}
    {deleteTarget && <ConfirmDialog title={deleteTarget.type === 'volume' ? '删除分卷纲' : '删除章节细纲'} message={deleteMessage} confirmText="删除细纲" danger onConfirm={() => { void confirmDelete() }} onCancel={() => setDeleteTarget(null)} />}
    {startTarget && <Modal className="chapter-create-modal"><h2>从细纲开始写作</h2><p>{startTarget.volume} / 第{chapterOrder(startTarget.chapterId)}章</p>{startTarget.chapterId === 'ch001' && <label>卷名<input autoFocus value={volumeName} onChange={(event) => setVolumeName(event.target.value)} placeholder="例如：风起" /></label>}<label>章节名<input autoFocus={startTarget.chapterId !== 'ch001'} value={chapterName} onChange={(event) => setChapterName(event.target.value)} placeholder="例如：晴空" onKeyDown={(event) => { if (event.key === 'Enter') void startWriting() }} /></label>{actionError && <p className="error-bar">{actionError}</p>}<div className="material-modal-footer"><button onClick={() => setStartTarget(null)}>取消</button><button disabled={starting || !chapterName.trim() || (startTarget.chapterId === 'ch001' && !volumeName.trim())} onClick={() => { void startWriting() }}>{starting ? '创建中…' : '创建正文并开始写作'}</button></div></Modal>}
  </div>
}
