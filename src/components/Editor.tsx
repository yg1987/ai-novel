import { useCallback, useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import { saveChapterContent } from '../api/tauri'
import { buildContext } from '../contextEngine'
import { generateChapter, stopGeneration } from '../services/aiProvider'
import {
  resolveChapterWordCount,
  saveChapterWordCountOverride,
  deleteChapterWordCountOverride,
} from '../services/settings'
import type { ChapterWordCountResolution } from '../services/settings'
import type { CheckResult } from '../services/bannedWords'
import RewritePreview from './RewritePreview'
import RewriteButtons from './RewriteButtons'
import { analyzeChapter } from '../services/chapterIngest'
import { saveChapterSnapshot } from '../services/memorySync'
import { logAIGenerated, logSessionStart } from '../services/stats'
import { runSavePipeline } from '../services/savePipeline'
import { type RewriteMode } from '../services/rewriteService'
import SelectionContextMenu, { type ContextMenuAction } from './SelectionContextMenu'

interface Props {
  projectId: string
  volume: string
  chapterId: string
  initialContent: string
  onContentChange?: (content: string) => void
  chapterNumber?: number
  onNavigateToReview?: (chapterId: string) => void
}

const AUTOSAVE_DELAY = 3000

const SourceLabel: Record<string, string> = {
  manual: '📝 手动',
  outline: '📋 大纲',
  system: '⚙ 系统',
  fallback: '📦 默认',
}

export interface EditorHandle {
  insertAtCursor: (text: string) => void
}

const Editor = forwardRef<EditorHandle, Props>(({ projectId, volume, chapterId, initialContent, onContentChange, chapterNumber = 1, onNavigateToReview }, ref) => {
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSaved = useRef(initialContent)
  const generateStartTime = useRef(0)
  const [generating, setGenerating] = useState(false)
  const [bannedCheck, setBannedCheck] = useState<CheckResult | null>(null)
  const [showBannedDetail, setShowBannedDetail] = useState(false)
  const [ingesting, setIngesting] = useState(false)
  const [rewriteState, setRewriteState] = useState<{
    selectedText: string
    beforeText: string
    afterText: string
    mode: RewriteMode
  } | null>(null)
  const [lastLightCheckResult, setLastLightCheckResult] = useState<{ passed: boolean; issues: number } | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)

  // ─── Word count resolution ──────────────────────

  const [effectiveWordCount, setEffectiveWordCount] = useState(4000)
  const [wordCountSource, setWordCountSource] = useState<ChapterWordCountResolution['source']>('system')
  const wordCountTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refreshWordCount = useCallback(async () => {
    try {
      const resolved = await resolveChapterWordCount(projectId, chapterId)
      setEffectiveWordCount(resolved.value)
      setWordCountSource(resolved.source)
    } catch {
      setEffectiveWordCount(4000)
      setWordCountSource('fallback')
    }
  }, [projectId, chapterId])

  useEffect(() => {
    void refreshWordCount()
  }, [refreshWordCount])

  const editor = useEditor({
    extensions: [StarterKit, Underline, Placeholder.configure({ placeholder: '开始写作…' })],
    content: initialContent,
    editorProps: { attributes: { class: 'editor-content' } },
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML()
      onContentChange?.(html)
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        if (html !== lastSaved.current) {
          lastSaved.current = html
          saveChapterContent(projectId, volume, chapterId, html)
            .catch((e: unknown) => { console.error('Auto-save failed:', e) })
        }
      }, AUTOSAVE_DELAY)
    },
  })

  // Update content when chapter changes
  useEffect(() => {
    if (editor && initialContent !== editor.getHTML()) {
      editor.commands.setContent(initialContent)
      lastSaved.current = initialContent
    }
  }, [editor, initialContent, chapterId])

  // Log session start on mount
  useEffect(() => {
    logSessionStart(projectId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  // Save on unmount
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      if (editor && editor.getHTML() !== lastSaved.current) {
        saveChapterContent(projectId, volume, chapterId, editor.getHTML())
          .catch((e: unknown) => { console.error('Final save failed:', e) })
      }
    }
  }, [editor, projectId, chapterId])

  const runIngest = useCallback(async (html: string) => {
    if (ingesting) return
    setIngesting(true)
    try {
      const text = html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ')
      if (text.trim().length < 100) return
      const snapshot = await analyzeChapter(chapterNumber, chapterId, html)
      await saveChapterSnapshot(projectId, snapshot)
    } catch (e) {
      console.error('Chapter ingest failed:', e)
    } finally {
      setIngesting(false)
    }
  }, [projectId, chapterId, chapterNumber, ingesting])

  const handleSaveNow = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    if (!editor) return
    const html = editor.getHTML()
    if (html === lastSaved.current) return
    lastSaved.current = html

    // Fire ingest in parallel (it has its own UI state: ingesting spinner)
    const plainText = html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ')
    if (plainText.trim().length >= 100) {
      void runIngest(html)
    }

    // Run the save pipeline (sequential, awaited internally)
    runSavePipeline({ projectId, volume, chapterId, chapterNumber, html })
      .then((result) => {
        setBannedCheck(result.bannedCheck)
        setLastLightCheckResult(result.lightCheckResult)
      })
      .catch((e: unknown) => { console.error('Save failed:', e) })
  }, [editor, projectId, chapterId, chapterNumber, runIngest])

  const handleGenerate = useCallback(async () => {
    if (!editor || generating) return
    setGenerating(true)
    generateStartTime.current = Date.now()
    editor.commands.focus()
    try {
      const ctx = await buildContext(projectId, volume, chapterId, effectiveWordCount)
      const { from } = editor.state.selection
      editor.commands.insertContentAt(from, '<p></p>')
      await generateChapter(ctx.systemPrompt, {
        onToken: (text) => { editor.commands.insertContentAt(editor.state.selection.from, text) },
        onDone: () => {
          setGenerating(false)
          const elapsed = Date.now() - generateStartTime.current
          logAIGenerated(projectId, chapterNumber, elapsed)
          handleSaveNow()
        },
        onError: (err) => { console.error('Generation error:', err); setGenerating(false) },
      })
    } catch (e) {
      console.error('Generation failed:', e)
      setGenerating(false)
    }
  }, [editor, generating, projectId, chapterId, effectiveWordCount, handleSaveNow, chapterNumber])

  const handleStop = useCallback(() => { stopGeneration(); setGenerating(false) }, [])

  const handleRewrite = useCallback((mode: RewriteMode) => {
    if (!editor) return
    const { from, to } = editor.state.selection
    if (from === to) return // no selection
    const selectedText = editor.state.doc.textBetween(from, to)
    // Get context: 200 chars before and after
    const fullText = editor.state.doc.textBetween(0, editor.state.doc.content.size)
    const beforeText = fullText.slice(Math.max(0, from - 200), from)
    const afterText = fullText.slice(to, Math.min(fullText.length, to + 200))
    // Store mode + selection info for the pending rewrite
    setRewriteState({ selectedText, beforeText, afterText, mode })
  }, [editor])

  const handleRewriteAccept = useCallback((newText: string) => {
    if (!editor) return
    const { from, to } = editor.state.selection
    editor.chain().focus().deleteRange({ from, to }).insertContent(newText).run()
    setRewriteState(null)
    // Trigger save
    handleSaveNow()
  }, [editor, handleSaveNow])

  const menuItems: ContextMenuAction[] = contextMenu ? [
    { label: '✏️ AI 改写', onClick: () => handleRewrite('rewrite') },
    { label: '📝 AI 扩写', onClick: () => handleRewrite('expand') },
    { label: '✨ AI 润色', onClick: () => handleRewrite('polish') },
  ] : []

  useImperativeHandle(ref, () => ({
    insertAtCursor: (text: string) => {
      if (!editor) return
      editor.commands.focus()
      editor.commands.insertContentAt(editor.state.selection.from, text)
    },
  }))

  if (!editor) return <div className="editor-loading">加载编辑器…</div>

  return (
    <div className="editor-wrapper" onContextMenu={(e) => {
        if (editor.state.selection.from !== editor.state.selection.to) {
          e.preventDefault()
          setContextMenu({ x: e.clientX, y: e.clientY })
        }
      }}>
      <div className="editor-toolbar">
        <button className="toolbar-btn" onClick={() => { editor.chain().focus().toggleBold().run() }} data-active={editor.isActive('bold')} title="加粗">B</button>
        <button className="toolbar-btn" onClick={() => { editor.chain().focus().toggleItalic().run() }} data-active={editor.isActive('italic')} title="斜体">I</button>
        <button className="toolbar-btn" onClick={() => { editor.chain().focus().toggleUnderline().run() }} data-active={editor.isActive('underline')} title="下划线">U</button>
        <span className="toolbar-sep" />
        <button className="toolbar-btn" onClick={() => { editor.chain().focus().toggleHeading({ level: 2 }).run() }} data-active={editor.isActive('heading', { level: 2 })} title="标题">H2</button>
        <button className="toolbar-btn" onClick={() => { editor.chain().focus().toggleHeading({ level: 3 }).run() }} data-active={editor.isActive('heading', { level: 3 })} title="小标题">H3</button>
        <span className="toolbar-sep" />
        <button className="toolbar-btn" onClick={() => { editor.chain().focus().toggleBulletList().run() }} data-active={editor.isActive('bulletList')} title="列表">≡</button>
        <button className="toolbar-btn" onClick={() => { editor.chain().focus().toggleBlockquote().run() }} data-active={editor.isActive('blockquote')} title="引用">"</button>
        <div className="toolbar-spacer" />

        <div className="wordcount-input-group" title={`来源: ${SourceLabel[wordCountSource]}`}>
          <span className="wordcount-label">预计字数:</span>
          <input
            type="number"
            className="wordcount-input"
            value={effectiveWordCount}
            min={500}
            max={50000}
            step={100}
            onChange={(e) => {
              const v = Math.max(500, parseInt(e.target.value, 10) || 500)
              setEffectiveWordCount(v)
              setWordCountSource('manual')
              // Debounce save
              if (wordCountTimer.current) clearTimeout(wordCountTimer.current)
              wordCountTimer.current = setTimeout(() => {
                saveChapterWordCountOverride(projectId, chapterId, v).catch(console.error)
              }, 600)
            }}
            onBlur={() => {
              if (wordCountTimer.current) clearTimeout(wordCountTimer.current)
              saveChapterWordCountOverride(projectId, chapterId, effectiveWordCount).catch(console.error)
            }}
          />
          {wordCountSource === 'manual' && (
            <button
              className="wordcount-reset-btn"
              title="重置为默认字数"
              onClick={async () => {
                await deleteChapterWordCountOverride(projectId, chapterId)
                void refreshWordCount()
              }}
            >↩</button>
          )}
        </div>

        <RewriteButtons
          enabled={editor.state.selection.from !== editor.state.selection.to}
          loading={rewriteState !== null}
          onRewrite={() => handleRewrite('rewrite')}
          onExpand={() => handleRewrite('expand')}
          onPolish={() => handleRewrite('polish')}
        />

        {/* Banned words indicator */}
        {bannedCheck && (
          <div className="banned-indicator" onClick={() => { setShowBannedDetail(!showBannedDetail) }} title={`AI味${String(bannedCheck.score)}/100，点击查看详情`}>
            <span className={`banned-dot ${bannedCheck.level}`} />
            <span className="banned-score">{bannedCheck.score}</span>
          </div>
        )}

        {/* Light check indicator */}
        {lastLightCheckResult && !lastLightCheckResult.passed && (
          <button
            className={`light-check-indicator ${lastLightCheckResult.passed ? 'passed' : 'failed'}`}
            title={`轻量检查发现 ${lastLightCheckResult.issues} 个问题，点击查看详情`}
            onClick={() => onNavigateToReview?.(chapterId)}
          >
            ⚠ 检查
          </button>
        )}

        {generating ? (
          <button className="toolbar-btn stop-btn" onClick={handleStop} title="停止生成">■ 停止</button>
        ) : (
          <button className="toolbar-btn generate-btn" onClick={() => { void handleGenerate() }} title="AI 生成">✨ 生成</button>
        )}
        <button className="toolbar-btn save-btn" onClick={handleSaveNow} title="保存">
          {ingesting ? '分析中…' : '保存'}
        </button>
      </div>

      {/* Banned words detail panel */}
      {showBannedDetail && bannedCheck && bannedCheck.matches.length > 0 && (
        <div className="banned-detail">
          <div className="banned-detail-header">
            <span>AI 味检测 ({bannedCheck.score}/100)</span>
            <button className="btn-text" onClick={() => { setShowBannedDetail(false) }}>✕</button>
          </div>
          <div className="banned-detail-list">
            {bannedCheck.matches.map((m, i) => (
              <div key={i} className="banned-match">
                <span className={`banned-severity severity-${String(m.severity)}`}>
                  {'★'.repeat(m.severity)}
                </span>
                <span className="banned-pattern">{m.pattern}</span>
                <code className="banned-context">{m.context}</code>
                {m.suggestion && <span className="banned-suggestion">→ {m.suggestion}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <EditorContent editor={editor} />

      {rewriteState && (
        <RewritePreview
          selectedText={rewriteState.selectedText}
          beforeText={rewriteState.beforeText}
          afterText={rewriteState.afterText}
          defaultMode={rewriteState.mode}
          onAccept={handleRewriteAccept}
          onReject={() => setRewriteState(null)}
        />
      )}

      {contextMenu && (
        <SelectionContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={menuItems}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
})

export default Editor
