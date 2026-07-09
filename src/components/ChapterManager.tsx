import { useState, useEffect, useCallback, useRef } from 'react'
import type { ChapterMeta } from '../types/chapter'
import { listChapters, getChapterContent, saveChapterContent } from '../api/tauri'
import Editor, { type EditorHandle } from './Editor'
import VersionHistoryPanel from './VersionHistoryPanel'
import MaterialSidebar from './MaterialSidebar'
import FocusModeOverlay from './FocusModeOverlay'

interface Props {
  projectId: string
  targetWords?: number
}

export default function ChapterManager({ projectId, targetWords = 1200 }: Props) {
  const [chapters, setChapters] = useState<ChapterMeta[]>([])
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null)
  const [chapterContent, setChapterContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [showVersionHistory, setShowVersionHistory] = useState(false)
  const [showMaterial, setShowMaterial] = useState(false)
  const [showFocus, setShowFocus] = useState(false)
  const [createVolume, setCreateVolume] = useState('卷1')
  const editorRef = useRef<EditorHandle>(null)

  // Derive volumes from chapters, or provide default
  const volumes = chapters.length > 0
    ? [...new Set(chapters.map((c) => c.volume))].sort()
    : ['卷1']

  // Current active chapter's volume
  const activeChapter = chapters.find((c) => c.id === activeChapterId)
  const activeVolume = activeChapter?.volume ?? volumes[0]!

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

  useEffect(() => {
    refresh()
      .then((list) => {
        if (list.length > 0) {
          setActiveChapterId(list[0]!.id)
        }
        setLoading(false)
      })
      .catch(() => { setLoading(false) })
  }, [refresh])

  // Load chapter content when active chapter changes
  useEffect(() => {
    if (!activeChapterId || !activeVolume) {
      setChapterContent('')
      return
    }
    getChapterContent(projectId, activeVolume, activeChapterId)
      .then((content) => { setChapterContent(content) })
      .catch((e: unknown) => { console.error('Failed to load content:', e) })
  }, [projectId, activeVolume, activeChapterId])

  const handleCreateChapter = () => {
    const volChapters = chapters.filter((c) => c.volume === createVolume)
    const nextNum = volChapters.length + 1
    const id = `ch${String(nextNum).padStart(3, '0')}`

    saveChapterContent(projectId, createVolume, id, '').then(() => {
      const newMeta: ChapterMeta = { id, title: `第${String(nextNum)}章`, order: nextNum, volume: createVolume }
      setChapters((prev) => [...prev, newMeta])
      setActiveChapterId(id)
      setChapterContent('')
    }).catch((e: unknown) => {
      console.error('Failed to create chapter:', e)
    })
  }

  // Group chapters by volume
  const chaptersByVolume = volumes.map((vol) => ({
    volume: vol,
    chapters: chapters.filter((c) => c.volume === vol).sort((a, b) => a.order - b.order),
  }))

  // Auto-set createVolume when active chapter changes
  useEffect(() => {
    if (activeVolume) setCreateVolume(activeVolume)
  }, [activeVolume])

  if (loading) {
    return <div className="chapter-loading">加载章节…</div>
  }

  return (
    <div className="chapter-manager">
      <div className="chapter-sidebar">
        <div className="chapter-sidebar-header">
          <h3>章节</h3>
          <button className="btn-small" onClick={handleCreateChapter}>+</button>
          {activeChapterId && (
            <button className="btn-small" onClick={() => setShowVersionHistory((v) => !v)} title="版本历史">
              🕐
            </button>
          )}
          <button className="btn-small" onClick={() => setShowMaterial((v) => !v)} title="素材库">
            📦
          </button>
          {activeChapterId && (
            <button className="btn-small" onClick={() => setShowFocus(true)} title="专注模式">
              🎯
            </button>
          )}
        </div>
        <div className="panel-new-item" style={{ padding: '4px 8px', gap: 4, border: 'none' }}>
          <select
            value={createVolume}
            onChange={(e) => { setCreateVolume(e.target.value) }}
            style={{ flex: 1, padding: '4px 6px', fontSize: '0.82rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontFamily: 'inherit' }}
          >
            {volumes.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>新建</span>
        </div>
        <div className="chapter-list">
          {chaptersByVolume.map(({ volume: vol, chapters: volChs }) => (
            <div key={vol}>
              <div className="chapter-volume-label">{vol}</div>
              {volChs.map((ch) => (
                <div
                  key={ch.id}
                  className={`chapter-item${ch.id === activeChapterId ? ' active' : ''}`}
                  onClick={() => { setActiveChapterId(ch.id) }}
                  style={{ paddingLeft: 24 }}
                >
                  {ch.title}
                </div>
              ))}
            </div>
          ))}
          {chapters.length === 0 && (
            <p className="chapter-empty">暂无章节，选择分卷后点击 + 创建</p>
          )}
        </div>
      </div>
      <div className="chapter-editor-area">
        {showVersionHistory && activeChapterId ? (
          <VersionHistoryPanel
            projectId={projectId}
            volume={activeVolume}
            chapterId={activeChapterId}
            onRestore={() => {
              setShowVersionHistory(false)
              if (activeChapterId && activeVolume) {
                getChapterContent(projectId, activeVolume, activeChapterId)
                  .then((content) => setChapterContent(content))
                  .catch(console.error)
              }
            }}
          />
        ) : activeChapterId ? (
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <Editor
                ref={editorRef}
                key={`${activeVolume}-${activeChapterId}`}
                projectId={projectId}
                volume={activeVolume}
                chapterId={activeChapterId}
                initialContent={chapterContent}
                targetWords={targetWords}
                chapterNumber={Number(activeChapterId.replace('ch', ''))}
              />
            </div>
            {showMaterial && (
              <MaterialSidebar onInsert={(text) => editorRef.current?.insertAtCursor(text)} />
            )}
          </div>
        ) : (
          <div className="editor-placeholder">
            <p>选择或创建一个章节开始写作</p>
          </div>
        )}
      </div>

      {showFocus && activeChapterId && (
        <FocusModeOverlay
          wordCount={0}
          targetWords={targetWords}
          onExit={() => setShowFocus(false)}
        />
      )}
    </div>
  )
}
