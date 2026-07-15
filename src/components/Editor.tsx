import { useCallback, useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { saveChapterContent, getChapterContent } from '../api/tauri'
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
import Button from './Button'
import { logAIGenerated, logSessionStart } from '../services/stats'
import { runSavePipeline, runReview } from '../services/savePipeline'
import { type RewriteMode } from '../services/rewriteService'
import SelectionContextMenu, { type ContextMenuAction } from './SelectionContextMenu'

interface Props {
  projectId: string
  volume: string
  chapterId: string
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

interface EditorInnerProps extends Props {
  initialContent: string
}

const EditorInner = forwardRef<EditorHandle, EditorInnerProps>(({ projectId, volume, chapterId, initialContent, onContentChange, chapterNumber = 1, onNavigateToReview }, ref) => {
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSaved = useRef(initialContent)
  const generateStartTime = useRef(0)
  const [generating, setGenerating] = useState(false)
  const [bannedCheck, setBannedCheck] = useState<CheckResult | null>(null)
  const [showBannedDetail, setShowBannedDetail] = useState(false)
  const [rewriteState, setRewriteState] = useState<{
    selectedText: string
    beforeText: string
    afterText: string
    mode: RewriteMode
  } | null>(null)
  const [lastLightCheckResult, setLastLightCheckResult] = useState<{ passed: boolean; issues: number } | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [generationComplete, setGenerationComplete] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const paragraphBuf = useRef('')

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
    extensions: [StarterKit, Placeholder.configure({ placeholder: '开始写作…' })],
    content: initialContent,
    editorProps: { attributes: { class: 'editor-content' } },
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML()
      onContentChange?.(html)
      setGenerationComplete(false)
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        if (html !== lastSaved.current) {
          lastSaved.current = html
          console.log(`[Editor] 自动保存 ${chapterId}，内容长度: ${html.length}，前100字符: ${html.slice(0, 100)}`)
          saveChapterContent(projectId, volume, chapterId, html)
            .catch((e: unknown) => { console.error('Auto-save failed:', e) })
        }
      }, AUTOSAVE_DELAY)
    },
  })

  // Reset UI state on mount
  useEffect(() => {
    setGenerationComplete(false)
    setSaveFeedback(null)
  }, [chapterId])

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
        const html = editor.getHTML()
        console.log(`[Editor] 卸载保存 ${chapterId}，内容长度: ${html.length}，前100字符: ${html.slice(0, 100)}`)
        saveChapterContent(projectId, volume, chapterId, html)
          .catch((e: unknown) => { console.error('Final save failed:', e) })
      } else {
        console.log(`[Editor] 卸载 ${chapterId}，无需保存 (内容未变化)`)
      }
    }
  }, [editor, projectId, chapterId])

  const handleSaveNow = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    if (!editor) return
    const html = editor.getHTML()
    lastSaved.current = html
    setSaving(true)
    setGenerationComplete(false)
    setSaveFeedback(null)

    runSavePipeline({ projectId, volume, chapterId, chapterNumber: chapterNumber, html })
      .then(() => { showFeedback('✅ 已保存') })
      .catch((e: unknown) => { console.error('Save failed:', e); showFeedback('保存失败') })
      .finally(() => { setSaving(false) })
  }, [editor, projectId, chapterId, chapterNumber])

  const showFeedback = useCallback((msg: string) => {
    setSaveFeedback(msg)
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current)
    feedbackTimer.current = setTimeout(() => setSaveFeedback(null), 2000)
  }, [])

  const handleGenerate = useCallback(async () => {
    if (!editor || generating) return
    setGenerating(true)
    setGenerationComplete(false)
    generateStartTime.current = Date.now()
    paragraphBuf.current = ''
    editor.commands.focus()
    try {
      const ctx = await buildContext(projectId, volume, chapterId, effectiveWordCount)
      const { from } = editor.state.selection
      editor.commands.insertContentAt(from, '<p></p>')
      await generateChapter(ctx.systemPrompt, {
        onToken: (text) => {
          paragraphBuf.current += text
          let idx: number
          while ((idx = paragraphBuf.current.indexOf('\n\n')) !== -1) {
            const para = paragraphBuf.current.slice(0, idx).trim()
            paragraphBuf.current = paragraphBuf.current.slice(idx + 2)
            if (para) {
              editor.commands.insertContent(para)
            }
            editor.commands.insertContent('<p></p>')
          }
        },
        onDone: () => {
          // Flush remaining buffer
          if (paragraphBuf.current.trim()) {
            editor.commands.insertContent(paragraphBuf.current.trim())
          }
          paragraphBuf.current = ''
          // Strip leftover markdown heading prefixes
          stripMarkdownHeadings()
          setGenerating(false)
          setGenerationComplete(true)
          const elapsed = Date.now() - generateStartTime.current
          logAIGenerated(projectId, chapterNumber, elapsed)
        },
        onError: (err) => { console.error('Generation error:', err); setGenerating(false); paragraphBuf.current = '' },
      })
    } catch (e) {
      console.error('Generation failed:', e)
      setGenerating(false)
      paragraphBuf.current = ''
    }
  }, [editor, generating, projectId, chapterId, effectiveWordCount, chapterNumber])

  /**
   * Remove markdown heading prefixes (#, ##) and list markers (-) from the
   * beginning of each paragraph.  TipTap's paragraph nodes don't expect raw
   * markdown syntax — headings should use the actual heading node.
   */
  const stripMarkdownHeadings = useCallback(() => {
    if (!editor) return
    const { doc } = editor.state
    doc.descendants((node, pos) => {
      if (node.type.name !== 'paragraph') return
      const text = node.textContent
      const stripped = text.replace(/^#{1,3}\s+/, '').replace(/^-\s+/, '')
      if (stripped !== text) {
        editor.commands.setTextSelection({ from: pos + 1, to: pos + 1 + node.nodeSize - 2 })
        editor.commands.insertContent(stripped)
      }
    })
  }, [editor])

  const handleStop = useCallback(() => { stopGeneration(); setGenerating(false); paragraphBuf.current = '' }, [])

  const handleReview = useCallback(() => {
    if (!editor || reviewing) return
    const html = editor.getHTML()
    const plainText = html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ')
    if (plainText.trim().length < 50) {
      showFeedback('内容太短，无需审查')
      return
    }
    setReviewing(true)
    runReview({ projectId, volume, chapterId, chapterNumber: chapterNumber, html })
      .then((result) => {
        setBannedCheck(result.bannedCheck)
        setLastLightCheckResult(result.lightCheckResult)
      })
      .catch((e: unknown) => { console.error('Review failed:', e) })
      .finally(() => { setReviewing(false) })
  }, [editor, reviewing, projectId, chapterId, chapterNumber, showFeedback])

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
        <Button variant="ghost" size="sm" onClick={() => { editor.chain().focus().toggleBold().run() }} data-active={editor.isActive('bold')} title="加粗">B</Button>
        <Button variant="ghost" size="sm" onClick={() => { editor.chain().focus().toggleItalic().run() }} data-active={editor.isActive('italic')} title="斜体">I</Button>
        <Button variant="ghost" size="sm" onClick={() => { editor.chain().focus().toggleUnderline().run() }} data-active={editor.isActive('underline')} title="下划线">U</Button>
        <span className="toolbar-sep" />
        <Button variant="ghost" size="sm" onClick={() => { editor.chain().focus().toggleHeading({ level: 2 }).run() }} data-active={editor.isActive('heading', { level: 2 })} title="标题">H2</Button>
        <Button variant="ghost" size="sm" onClick={() => { editor.chain().focus().toggleHeading({ level: 3 }).run() }} data-active={editor.isActive('heading', { level: 3 })} title="小标题">H3</Button>
        <span className="toolbar-sep" />
        <Button variant="ghost" size="sm" onClick={() => { editor.chain().focus().toggleBulletList().run() }} data-active={editor.isActive('bulletList')} title="列表">≡</Button>
        <Button variant="ghost" size="sm" onClick={() => { editor.chain().focus().toggleBlockquote().run() }} data-active={editor.isActive('blockquote')} title="引用">"</Button>
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
            <Button
              variant="ghost" size="xs"
              title="重置为默认字数"
              onClick={async () => {
                await deleteChapterWordCountOverride(projectId, chapterId)
                void refreshWordCount()
              }}
            >↩</Button>
          )}
        </div>

        <RewriteButtons
          enabled={editor.state.selection.from !== editor.state.selection.to}
          loading={rewriteState !== null}
          onRewrite={() => handleRewrite('rewrite')}
          onExpand={() => handleRewrite('expand')}
          onPolish={() => handleRewrite('polish')}
        />

        {generationComplete && (
          <span className="generation-complete-badge">✅ 生成完成，可以保存</span>
        )}

        <Button
          variant="text" size="sm"
          icon="🔍"
          onClick={handleReview}
          disabled={reviewing}
          title="审查"
        >
          {reviewing ? '审查中…' : '审查'}
        </Button>

        {/* Banned words indicator */}
        {bannedCheck && (
          <div className="banned-indicator" onClick={() => { setShowBannedDetail(!showBannedDetail) }} title={`AI味${String(bannedCheck.score)}/100，点击查看详情`}>
            <span className={`banned-dot ${bannedCheck.level}`} />
            <span className="banned-score">{bannedCheck.score}</span>
          </div>
        )}

        {/* Light check indicator */}
        {lastLightCheckResult && !lastLightCheckResult.passed && (
          <Button
            variant="text" size="sm"
            className={`light-check-indicator ${lastLightCheckResult.passed ? 'passed' : 'failed'}`}
            title={`轻量检查发现 ${lastLightCheckResult.issues} 个问题，点击查看详情`}
            onClick={() => onNavigateToReview?.(chapterId)}
          >
            ⚠ 检查
          </Button>
        )}

        {generating ? (
          <Button variant="danger" size="sm" icon="■" onClick={handleStop} title="停止生成">停止</Button>
        ) : (
          <Button variant="primary" size="sm" icon="✨" onClick={() => { void handleGenerate() }} title="AI 生成">生成</Button>
        )}
        <Button variant="primary" size="sm" onClick={handleSaveNow} disabled={saving} title="保存">
          {saving ? '保存中…' : '保存'}
        </Button>
        {saveFeedback && <span className="save-feedback">{saveFeedback}</span>}
      </div>

      {/* Banned words detail panel */}
      {showBannedDetail && bannedCheck && bannedCheck.matches.length > 0 && (
        <div className="banned-detail">
          <div className="banned-detail-header">
            <span>AI 味检测 ({bannedCheck.score}/100)</span>
            <Button variant="ghost" size="sm" onClick={() => { setShowBannedDetail(false) }}>✕</Button>
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

      <EditorContent editor={editor} className="editor-content-wrapper" />

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

/**
 * Editor wrapper — loads chapter content before mounting EditorInner.
 * This ensures TipTap is never initialized with stale content.
 */
const Editor = forwardRef<EditorHandle, Props>((props, ref) => {
  const [content, setContent] = useState<string | null>(null)

  useEffect(() => {
    setContent(null)
    getChapterContent(props.projectId, props.volume, props.chapterId)
      .then((c) => {
        console.log(`[Editor] 加载章节 ${props.chapterId} 完成，内容长度: ${c.length}，前100字符: ${c.slice(0, 100)}`)
        setContent(c)
      })
      .catch(() => setContent(''))
  }, [props.projectId, props.volume, props.chapterId])

  if (content === null) {
    return <div className="editor-loading">加载章节…</div>
  }

  return <EditorInner ref={ref} {...props} initialContent={content} />
})

export default Editor
