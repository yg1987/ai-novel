import type { RefObject } from 'react'
import RewriteButtons from '../RewriteButtons'
import Button from '../Button'

interface Props {
  activeFile: string | null
  content: string
  editing: boolean
  generating: boolean
  hasSelection: boolean
  rewriteLoading: boolean
  showPrompt: boolean
  editingPrompt: string
  savingPrompt: boolean
  showExample: boolean
  example: string
  textareaRef: RefObject<HTMLTextAreaElement | null>
  onContentChange: (content: string) => void
  onEdit: () => void
  onSave: () => void
  onAICreate: () => void
  onRewrite: () => void
  onExpand: () => void
  onPolish: () => void
  onTogglePrompt: () => void
  onPromptChange: (prompt: string) => void
  onResetPrompt: () => void
  onSavePrompt: () => void
  onToggleExample: () => void
  onSelectionCheck: () => void
  onSelectionContextMenu: (event: React.MouseEvent<HTMLTextAreaElement>) => void
}

export default function CharacterEditor({
  activeFile,
  content,
  editing,
  generating,
  hasSelection,
  rewriteLoading,
  showPrompt,
  editingPrompt,
  savingPrompt,
  showExample,
  example,
  textareaRef,
  onContentChange,
  onEdit,
  onSave,
  onAICreate,
  onRewrite,
  onExpand,
  onPolish,
  onTogglePrompt,
  onPromptChange,
  onResetPrompt,
  onSavePrompt,
  onToggleExample,
  onSelectionCheck,
  onSelectionContextMenu,
}: Props) {
  return (
    <div className="panel-editor">
      {activeFile ? (
        <>
          <div className="panel-editor-header">
            <h3>{activeFile}</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {editing && (
                <>
                  <Button variant="text" size="sm" onClick={onAICreate} disabled={generating} loading={generating}>
                    {generating ? '生成中…' : '✨ AI 辅助'}
                  </Button>
                  <RewriteButtons enabled={hasSelection} loading={rewriteLoading} onRewrite={onRewrite} onExpand={onExpand} onPolish={onPolish} />
                  <Button variant="text" size="sm" onClick={onTogglePrompt}>
                    {showPrompt ? '关闭提示词' : '✎ 提示词'}
                  </Button>
                </>
              )}
              {editing ? (
                <Button variant="primary" size="md" onClick={onSave}>保存</Button>
              ) : (
                <Button variant="secondary" size="md" onClick={onEdit}>编辑</Button>
              )}
            </div>
          </div>
          {showPrompt && editing && (
            <div className="prompt-editor">
              <div className="prompt-editor-header">
                <span>提示词（AI 辅助使用，修改后自动保存到本项目的提示词库）</span>
                <Button variant="text" size="sm" onClick={onResetPrompt}>恢复默认</Button>
              </div>
              <textarea
                className="prompt-editor-textarea"
                value={editingPrompt}
                onChange={(e) => { onPromptChange(e.target.value) }}
                placeholder="在此编写自定义提示词…"
              />
              <div className="prompt-editor-footer">
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {editingPrompt.trim() ? '已保存自定义提示词' : '修改后点保存，AI 将使用你的提示词'}
                </span>
                <Button variant="primary" size="sm" disabled={savingPrompt} onClick={onSavePrompt}>{savingPrompt ? '保存中…' : '保存提示词'}</Button>
              </div>
            </div>
          )}
          {editing ? (
            <div className="panel-editor-inner">
              <div className="sub-field" style={{ marginBottom: 0 }}>
                <div className="sub-field-label-row">
                  <label className="sub-field-label">角色信息</label>
                  <Button variant="text" size="sm" onClick={onToggleExample}>
                    {showExample ? '收起示例' : '📖 看示例'}
                  </Button>
                </div>
                {showExample && (
                  <div className="sub-field-example">
                    <pre>{example}</pre>
                  </div>
                )}
                <textarea
                  ref={textareaRef}
                  className="sub-field-textarea"
                  style={{ minHeight: 350 }}
                  value={content}
                  onChange={(e) => { onContentChange(e.target.value) }}
                  onMouseUp={onSelectionCheck}
                  onKeyUp={onSelectionCheck}
                  onContextMenu={onSelectionContextMenu}
                  placeholder={`角色：${activeFile}\n身份/职业：\n外貌特征：\n性格特点：\n背景经历：\n动机目标：\n说话风格：\n标签：[标签1, 标签2, ...]\n\n💡 每行填一项就行，不确定的可以空着，或者点 ✨ AI 辅助 一键生成`}
                />
              </div>
            </div>
          ) : (
            <div className="panel-preview">{content || <span style={{ color: 'var(--text-muted)' }}>暂无内容，点击编辑填写角色信息</span>}</div>
          )}
        </>
      ) : (
        <div className="panel-placeholder">
          <p style={{ marginBottom: 8 }}>选择或创建角色</p>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            在左侧输入角色名，点击 🎲 起名 或 ✨ AI 创建
          </p>
        </div>
      )}
    </div>
  )
}
