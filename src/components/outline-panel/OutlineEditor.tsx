import Button from '../Button'
import RewriteButtons from '../RewriteButtons'
import SelectionContextMenu, { type ContextMenuAction } from '../SelectionContextMenu'
import RewritePreview from '../RewritePreview'
import type { RefObject } from 'react'
import type { RewriteMode } from '../../services/rewriteService'
import type { TextareaSelection } from '../../services/rewriteUtils'

interface Props {
  activeFile: string | null
  activeType: 'outline' | 'volume' | 'chapter'
  content: string
  editing: boolean
  dirty: boolean
  generatingAi: boolean
  aiError: string | null
  showPrompt: boolean
  editingPrompt: string
  savingPrompt: boolean
  showExample: boolean
  expectedWords: number | null
  activeChapterId: string | null
  example: string
  textareaRef: RefObject<HTMLTextAreaElement | null>
  onContentChange: (content: string) => void
  onEdit: () => void
  onSave: () => void
  onAIGenerate: () => void
  onTogglePrompt: () => void
  onPromptChange: (prompt: string) => void
  onResetPrompt: () => void
  onSavePrompt: () => void
  onToggleExample: () => void
  onExpectedWordsChange: (value: number | null) => void
  onExpectedWordsCommit: (value: number) => void
  onSelectionCheck: () => void
  onSelectionContextMenu: (event: React.MouseEvent<HTMLTextAreaElement>) => void
  rewriteState: (TextareaSelection & { mode: RewriteMode }) | null
  hasSelection: boolean
  onRewrite: (mode: RewriteMode) => void
  onRewriteAccept: (text: string) => void
  onRewriteReject: () => void
  contextMenu: { x: number; y: number } | null
  onContextMenuClose: () => void
  menuItems: ContextMenuAction[]
}

export default function OutlineEditor({
  activeFile,
  activeType,
  content,
  editing,
  dirty,
  generatingAi,
  aiError,
  showPrompt,
  editingPrompt,
  savingPrompt,
  showExample,
  expectedWords,
  activeChapterId,
  example,
  textareaRef,
  onContentChange,
  onEdit,
  onSave,
  onAIGenerate,
  onTogglePrompt,
  onPromptChange,
  onResetPrompt,
  onSavePrompt,
  onToggleExample,
  onExpectedWordsChange,
  onExpectedWordsCommit,
  onSelectionCheck,
  onSelectionContextMenu,
  rewriteState,
  hasSelection,
  onRewrite,
  onRewriteAccept,
  onRewriteReject,
  contextMenu,
  onContextMenuClose,
  menuItems,
}: Props) {
  return (
    <div className="panel-editor">
      {activeFile ? (
        <>
          <div className="panel-editor-header">
            <h3>{activeFile === 'outline.md' ? '📋 总纲' : activeType === 'chapter' ? `📝 ${activeFile.replace(/\.md$/, '')}` : `📖 ${activeFile.replace(/\.md$/, '')}`}</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {dirty && <span style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>未保存</span>}
              {editing && (
                <>
                  <Button variant="text" size="sm" onClick={onAIGenerate} disabled={generatingAi} loading={generatingAi}>{generatingAi ? '生成中…' : '✨ AI 辅助'}</Button>
                  <RewriteButtons enabled={hasSelection} loading={rewriteState !== null} onRewrite={() => onRewrite('rewrite')} onExpand={() => onRewrite('expand')} onPolish={() => onRewrite('polish')} />
                  <Button variant="text" size="sm" onClick={onToggleExample}>{showExample ? '收起示例' : '📖 看示例'}</Button>
                  <Button variant="text" size="sm" onClick={onTogglePrompt}>{showPrompt ? '关闭提示词' : '✎ 提示词'}</Button>
                </>
              )}
              {editing ? <Button variant="primary" size="md" onClick={onSave}>保存</Button> : <Button variant="secondary" size="md" onClick={onEdit}>编辑</Button>}
            </div>
          </div>
          {showPrompt && editing && (
            <div className="prompt-editor">
              <div className="prompt-editor-header">
                <span>提示词（AI 辅助使用，修改后自动保存到本项目）</span>
                <Button variant="text" size="sm" onClick={onResetPrompt}>恢复默认</Button>
              </div>
              <textarea className="prompt-editor-textarea" value={editingPrompt} onChange={(e) => onPromptChange(e.target.value)} placeholder="在此编写自定义提示词…" />
              <div className="prompt-editor-footer">
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{editingPrompt.trim() ? '已保存自定义提示词' : '修改后点保存，AI 将使用你的提示词'}</span>
                <Button variant="primary" size="sm" disabled={savingPrompt} onClick={onSavePrompt}>{savingPrompt ? '保存中…' : '保存提示词'}</Button>
              </div>
            </div>
          )}
          {aiError && <div style={{ padding: '8px 24px', fontSize: '0.85rem', color: 'var(--danger)', background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>AI 生成失败：{aiError}</div>}
          {showExample && editing && <div className="sub-field-example" style={{ margin: '8px 24px' }}><pre>{example}</pre></div>}
          {editing && activeType === 'chapter' && activeChapterId && (
            <div style={{ padding: '8px 24px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>预计字数:</span>
              <input type="number" className="notes-input" style={{ width: 100 }} value={expectedWords ?? ''} placeholder="4000" min={500} max={50000} step={100} onChange={(e) => onExpectedWordsChange(e.target.value ? Math.max(500, parseInt(e.target.value, 10) || 500) : null)} onBlur={() => { const v = expectedWords; if (v != null) onExpectedWordsCommit(v) }} />
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>字</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 8 }}>💡 AI 生成时将使用此预计字数目标</span>
            </div>
          )}
          {editing ? (
            <textarea
              ref={textareaRef}
              className="panel-textarea"
              value={content}
              onChange={(e) => onContentChange(e.target.value)}
              onMouseUp={onSelectionCheck}
              onKeyUp={onSelectionCheck}
              onContextMenu={onSelectionContextMenu}
              placeholder={activeType === 'outline' ? '撰写全书总纲…' : activeType === 'volume' ? '撰写本卷大纲…' : '撰写章节细纲，3-5 个情节点…'}
            />
          ) : (
            <div className="panel-preview">{content || '暂无内容'}</div>
          )}
        </>
      ) : (
        <div className="panel-placeholder">选择或创建大纲</div>
      )}
      {rewriteState && (
        <RewritePreview selectedText={rewriteState.selectedText} beforeText={rewriteState.beforeText} afterText={rewriteState.afterText} defaultMode={rewriteState.mode} onAccept={onRewriteAccept} onReject={onRewriteReject} />
      )}
      {contextMenu && <SelectionContextMenu x={contextMenu.x} y={contextMenu.y} items={menuItems} onClose={onContextMenuClose} />}
    </div>
  )
}
