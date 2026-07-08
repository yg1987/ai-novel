import { useState, useEffect, useCallback, useRef } from 'react'
import type { ChapterMeta } from '../types/chapter'
import { listChapters, getChapterContent, saveChapterContent } from '../api/tauri'
import Editor, { type EditorHandle } from './Editor'
import VersionHistoryPanel from './VersionHistoryPanel'
import MaterialSidebar from './MaterialSidebar'

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
  const editorRef = useRef<EditorHandle>(null)

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
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
    if (!activeChapterId) {
      setChapterContent('')
      return
    }
    getChapterContent(projectId, activeChapterId)
      .then((content) => { setChapterContent(content) })
      .catch((e: unknown) => { console.error('Failed to load content:', e) })
  }, [projectId, activeChapterId])

  const handleCreateChapter = () => {
    const nextNum = chapters.length + 1
    const id = `ch${String(nextNum).padStart(3, '0')}`
    const title = `第${String(nextNum)}章`

    saveChapterContent(projectId, id, '').then(() => {
      const newMeta: ChapterMeta = { id, title, order: nextNum }
      setChapters((prev) => [...prev, newMeta])
      setActiveChapterId(id)
      setChapterContent('')
    }).catch((e: unknown) => {
      console.error('Failed to create chapter:', e)
    })
  }

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
        </div>
        <div className="chapter-list">
          {chapters.map((ch) => (
            <div
              key={ch.id}
              className={`chapter-item${ch.id === activeChapterId ? ' active' : ''}`}
              onClick={() => { setActiveChapterId(ch.id) }}
            >
              {ch.title}
            </div>
          ))}
          {chapters.length === 0 && (
            <p className="chapter-empty">暂无章节，点击 + 创建</p>
          )}
        </div>
      </div>
      <div className="chapter-editor-area">
        {showVersionHistory && activeChapterId ? (
          <VersionHistoryPanel
            projectId={projectId}
            chapterId={activeChapterId}
            onRestore={() => {
              setShowVersionHistory(false)
              if (activeChapterId) {
                getChapterContent(projectId, activeChapterId)
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
                key={activeChapterId}
                projectId={projectId}
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
    </div>
  )
}
