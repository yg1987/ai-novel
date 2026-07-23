import type { RefObject } from 'react'
import RewriteButtons from '../RewriteButtons'
import Button from '../Button'
import type { CharacterGender } from '../../services/characterProfiles'

interface Props {
  activeFile: string | null
  content: string
  gender: CharacterGender
  editing: boolean
  loading: boolean
  saving: boolean
  generating: boolean
  hasSelection: boolean
  rewriteLoading: boolean
  showPrompt: boolean
  promptMode: 'create' | 'complete'
  editingPrompt: string
  savingPrompt: boolean
  showExample: boolean
  example: string
  textareaRef: RefObject<HTMLTextAreaElement | null>
  onContentChange: (content: string) => void
  onGenderChange: (gender: CharacterGender) => void
  onEdit: () => void
  onSave: () => void
  onAIComplete: () => void
  onRewrite: () => void
  onExpand: () => void
  onPolish: () => void
  onTogglePrompt: () => void
  onPromptModeChange: (mode: 'create' | 'complete') => void
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
  gender,
  editing,
  loading,
  saving,
  generating,
  hasSelection,
  rewriteLoading,
  showPrompt,
  promptMode,
  editingPrompt,
  savingPrompt,
  showExample,
  example,
  textareaRef,
  onContentChange,
  onGenderChange,
  onEdit,
  onSave,
  onAIComplete,
  onRewrite,
  onExpand,
  onPolish,
  onTogglePrompt,
  onPromptModeChange,
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
                  <Button variant="text" size="sm" onClick={onAIComplete} disabled={generating || loading || saving} loading={generating}>
                    {generating ? '生成中…' : '✨ AI 补全'}
                  </Button>
                  <RewriteButtons enabled={hasSelection} loading={rewriteLoading} onRewrite={onRewrite} onExpand={onExpand} onPolish={onPolish} />
                  <Button variant="text" size="sm" onClick={onTogglePrompt}>
                    {showPrompt ? '关闭提示词' : '✎ 提示词'}
                  </Button>
                </>
              )}
              {editing ? (
                <Button variant="primary" size="md" onClick={onSave} disabled={loading || saving} loading={saving}>保存</Button>
              ) : (
                <Button variant="secondary" size="md" onClick={onEdit} disabled={loading}>编辑</Button>
              )}
            </div>
          </div>
          {showPrompt && editing && (
            <div className="prompt-editor">
              <div className="prompt-editor-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>提示词（修改后保存到本项目的提示词库）</span>
                  <Button variant={promptMode === 'create' ? 'secondary' : 'text'} size="xs" onClick={() => onPromptModeChange('create')}>创建角色</Button>
                  <Button variant={promptMode === 'complete' ? 'secondary' : 'text'} size="xs" onClick={() => onPromptModeChange('complete')}>补全角色</Button>
                </div>
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
                  {editingPrompt.trim() ? '已保存自定义提示词' : '留空时 AI 将使用内置默认提示词'}
                </span>
                <Button variant="primary" size="sm" disabled={savingPrompt} onClick={onSavePrompt}>{savingPrompt ? '保存中…' : '保存提示词'}</Button>
              </div>
            </div>
          )}
          {loading ? (
            <div className="panel-placeholder"><p>正在加载角色资料…</p></div>
          ) : editing ? (
            <div className="panel-editor-inner">
              <div className="sub-field" style={{ marginBottom: 0 }}>
                <div className="sub-field-label-row">
                  <label className="sub-field-label">角色信息</label>
                  <select className="notes-input" value={gender} onChange={(event) => onGenderChange(event.target.value as CharacterGender)}>
                    <option value="男">男</option>
                    <option value="女">女</option>
                    <option value="未知">未知</option>
                  </select>
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
                  placeholder={`角色：${activeFile}\n身份/职业：\n外貌特征：\n性格特点：\n背景经历：\n动机目标：\n说话风格：\n标签：[标签1, 标签2, ...]\n\n💡 每行填一项就行，不确定的可以空着，或者点 ✨ AI 补全生成草稿`}
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
