import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import { saveChapterContent } from '../api/tauri'
import { buildContext } from '../contextEngine'
import { generateChapter, stopGeneration } from '../services/aiProvider'
import { checkBannedWords, type CheckResult } from '../services/bannedWords'
import RewritePreview from './RewritePreview'
import { analyzeChapter } from '../services/chapterIngest'
import { saveChapterSnapshot } from '../services/memorySync'
import { logChapterSaved, logAIGenerated, logSessionStart } from '../services/stats'
import { chunkMarkdown } from '../services/textChunker'
import { embedChunks } from '../services/embeddings'
import { vectorUpsertChunks } from '../api/tauri'
import { runAndSaveLightCheck, runDeepReview } from '../services/reviewService'

interface Props {
  projectId: string
  chapterId: string
  initialContent: string
  targetWords?: number
  onContentChange?: (content: string) => void
  chapterNumber?: number
}

const AUTOSAVE_DELAY = 3000

export default function Editor({ projectId, chapterId, initialContent, targetWords = 1200, onContentChange, chapterNumber = 1 }: Props) {
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSaved = useRef(initialContent)
  const generateStartTime = useRef(0)
  const deepReviewCount = useRef(0)
  const lastDeepReviewTime = useRef(0)
  const DEEP_REVIEW_INTERVAL_MS = 30 * 60 * 1000 // 30 min
  const DEEP_REVIEW_SAVE_THRESHOLD = 5 // every 5 saves
  const [generating, setGenerating] = useState(false)
  const [bannedCheck, setBannedCheck] = useState<CheckResult | null>(null)
  const [showBannedDetail, setShowBannedDetail] = useState(false)
  const [ingesting, setIngesting] = useState(false)
  const [rewriteState, setRewriteState] = useState<{
    selectedText: string
    beforeText: string
    afterText: string
  } | null>(null)
  const [lastLightCheckResult, setLastLightCheckResult] = useState<{ passed: boolean; issues: number } | null>(null)

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
          saveChapterContent(projectId, chapterId, html)
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
        saveChapterContent(projectId, chapterId, editor.getHTML())
          .catch((e: unknown) => { console.error('Final save failed:', e) })
      }
    }
  }, [editor, projectId, chapterId])

  const runBannedCheck = useCallback((html: string) => {
    const text = html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ')
    const result = checkBannedWords(text)
    setBannedCheck(result)
  }, [])

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
    if (editor) {
      const html = editor.getHTML()
      if (html !== lastSaved.current) {
        lastSaved.current = html
        saveChapterContent(projectId, chapterId, html)
          .then(() => {
            runBannedCheck(html)
            void runIngest(html)
          })
          .then(() => {
            logChapterSaved(projectId, chapterNumber, html)
          })
          .then(async () => {
            try {
              const text = html.replace(/<[^>]*>/g, '').trim()
              if (text.length > 100) {
                const chunks = chunkMarkdown(text, chapterId, { maxChunkChars: 1500 })
                const results = await embedChunks(chunks)
                if (results) {
                  await vectorUpsertChunks(projectId, results.map((r) => ({
                    chunk_id: r.chunk.chunkId,
                    page_id: r.chunk.pageId,
                    chunk_index: r.chunk.chunkIndex,
                    heading_path: r.chunk.headingPath,
                    chunk_text: r.chunk.content,
                    embedding: Array.from(r.embedding),
                  })))
                }
              }
            } catch (e) {
              console.error('Vector indexing failed:', e)
            }
          })
          .then(async () => {
            const plainText = html.replace(/<[^>]*>/g, '').trim()
            if (plainText.length > 50) {
              try {
                const result = await runAndSaveLightCheck(projectId, chapterId, html)
                setLastLightCheckResult({ passed: result.passed, issues: result.checks.reduce((sum, c) => sum + c.issues.length, 0) })
              } catch (e) {
                console.error('Light check failed:', e)
              }
            }
          })
          .then(async () => {
            // Auto-trigger deep review with throttle (设计文档 §四.6 Phase 2)
            deepReviewCount.current++
            const now = Date.now()
            const timeSinceLast = now - lastDeepReviewTime.current
            const text = html.replace(/<[^>]*>/g, '').trim()
            if (
              text.length > 200 &&
              (deepReviewCount.current >= DEEP_REVIEW_SAVE_THRESHOLD || timeSinceLast >= DEEP_REVIEW_INTERVAL_MS) &&
              !chapterId.startsWith('new-')
            ) {
              deepReviewCount.current = 0
              lastDeepReviewTime.current = now
              try {
                await runDeepReview(projectId, chapterId, html)
              } catch (e) {
                console.error('Auto deep review failed:', e)
              }
            }
          })
          .catch((e: unknown) => { console.error('Manual save failed:', e) })
      }
    }
  }, [editor, projectId, chapterId, runBannedCheck, runIngest])

  const handleGenerate = useCallback(async () => {
    if (!editor || generating) return
    setGenerating(true)
    generateStartTime.current = Date.now()
    editor.commands.focus()
    try {
      const ctx = await buildContext(projectId, chapterId, targetWords)
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
  }, [editor, generating, projectId, chapterId, targetWords, handleSaveNow])

  const handleStop = useCallback(() => { stopGeneration(); setGenerating(false) }, [])

  const handleRewrite = useCallback(() => {
    if (!editor) return
    const { from, to } = editor.state.selection
    if (from === to) return // no selection
    const selectedText = editor.state.doc.textBetween(from, to)
    // Get context: 200 chars before and after
    const fullText = editor.state.doc.textBetween(0, editor.state.doc.content.size)
    const beforeText = fullText.slice(Math.max(0, from - 200), from)
    const afterText = fullText.slice(to, Math.min(fullText.length, to + 200))
    setRewriteState({ selectedText, beforeText, afterText })
  }, [editor])

  const handleRewriteAccept = useCallback((newText: string) => {
    if (!editor) return
    const { from, to } = editor.state.selection
    editor.chain().focus().deleteRange({ from, to }).insertContent(newText).run()
    setRewriteState(null)
    // Trigger save
    handleSaveNow()
  }, [editor, handleSaveNow])

  if (!editor) return <div className="editor-loading">加载编辑器…</div>

  return (
    <div className="editor-wrapper">
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

        {/* Rewrite - only visible when text is selected */}
        {editor.state.selection.from !== editor.state.selection.to && (
          <button className="toolbar-btn" onClick={handleRewrite} title="AI 改写/扩写">✏️ 改写</button>
        )}

        {/* Banned words indicator */}
        {bannedCheck && (
          <div className="banned-indicator" onClick={() => { setShowBannedDetail(!showBannedDetail) }} title={`AI味${String(bannedCheck.score)}/100，点击查看详情`}>
            <span className={`banned-dot ${bannedCheck.level}`} />
            <span className="banned-score">{bannedCheck.score}</span>
          </div>
        )}

        {/* Light check indicator */}
        {lastLightCheckResult && (
          <span
            className={`light-check-indicator ${lastLightCheckResult.passed ? 'passed' : 'failed'}`}
            title={`轻量检查：${lastLightCheckResult.passed ? '通过' : `${lastLightCheckResult.issues} 个问题`}`}
          >
            {lastLightCheckResult.passed ? '✓' : '⚠'} 检查
          </span>
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
          onAccept={handleRewriteAccept}
          onReject={() => setRewriteState(null)}
        />
      )}
    </div>
  )
}
