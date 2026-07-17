import type { KeyboardEvent, MouseEvent, RefObject } from 'react'
import Button from '../Button'
import RewriteButtons from '../RewriteButtons'
import RewritePreview from '../RewritePreview'
import SelectionContextMenu, { type ContextMenuAction } from '../SelectionContextMenu'
import { getExample, type SectionDef } from '../../services/worldviewConfig'
import type { RewriteMode } from '../../services/rewriteService'
import type { TextareaSelection } from '../../services/rewriteUtils'

type RewriteState = (TextareaSelection & { mode: RewriteMode; subKey?: string }) | null

interface Props {
  activeSection: SectionDef
  previewContent: string
  content: string
  subValues: Record<string, string>
  editing: boolean
  dirty: boolean
  showExample: string | null
  showPrompt: boolean
  editingPrompt: string
  savingPrompt: boolean
  aiError: string | null
  generatingAi: boolean
  hasSelection: boolean
  rewriteState: RewriteState
  isFreeform: boolean
  contextMenu: { x: number; y: number } | null
  menuItems: ContextMenuAction[]
  genre: string
  activeSectionHint: string
  rewriteTextareaRef: RefObject<HTMLTextAreaElement | null>
  subFieldEndRef: RefObject<HTMLDivElement | null>
  addingSubToKey: string | null
  newSubFieldName: string
  editingSubKey: string | null
  editingSubLabel: string
  onStartEdit: () => void
  onSave: () => void
  onGenerateAi: () => void
  onTogglePrompt: () => void
  onPromptChange: (value: string) => void
  onResetPrompt: () => void
  onSavePrompt: () => void
  onToggleExample: (key: string) => void
  onContentChange: (value: string) => void
  onUpdateSubField: (key: string, value: string) => void
  onSelectionCheck: (event: MouseEvent<HTMLTextAreaElement> | KeyboardEvent<HTMLTextAreaElement>) => void
  onSelectionContextMenu: (event: MouseEvent<HTMLTextAreaElement>) => void
  onStartAddSubField: (sectionKey: string) => void
  onNewSubFieldNameChange: (value: string) => void
  onAddSubField: (sectionKey: string) => void
  onCancelAddSubField: () => void
  onStartRenameSubField: (subKey: string, label: string) => void
  onRenameSubFieldLabelChange: (value: string) => void
  onCommitRenameSubField: (sectionKey: string, subKey: string) => void
  onCancelRenameSubField: () => void
  onDeleteSubField: (sectionKey: string, subKey: string) => void
  onRewriteMode: (mode: RewriteMode) => void
  onRewriteAccept: (text: string) => void
  onRewriteReject: () => void
  onContextMenuClose: () => void
}

export default function WorldviewEditor({
  activeSection,
  previewContent,
  content,
  subValues,
  editing,
  dirty,
  showExample,
  showPrompt,
  editingPrompt,
  savingPrompt,
  aiError,
  generatingAi,
  hasSelection,
  rewriteState,
  isFreeform,
  contextMenu,
  menuItems,
  genre,
  activeSectionHint,
  rewriteTextareaRef,
  subFieldEndRef,
  addingSubToKey,
  newSubFieldName,
  editingSubKey,
  editingSubLabel,
  onStartEdit,
  onSave,
  onGenerateAi,
  onTogglePrompt,
  onPromptChange,
  onResetPrompt,
  onSavePrompt,
  onToggleExample,
  onContentChange,
  onUpdateSubField,
  onSelectionCheck,
  onSelectionContextMenu,
  onStartAddSubField,
  onNewSubFieldNameChange,
  onAddSubField,
  onCancelAddSubField,
  onStartRenameSubField,
  onRenameSubFieldLabelChange,
  onCommitRenameSubField,
  onCancelRenameSubField,
  onDeleteSubField,
  onRewriteMode,
  onRewriteAccept,
  onRewriteReject,
  onContextMenuClose,
}: Props) {
  const hasSubs = activeSection.subs.length > 0

  return (
    <div className="panel-editor">
      <div className="panel-editor-header">
        <h3>{activeSection.label}</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {dirty && <span style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>未保存</span>}
          {editing && (
            <>
              <Button variant="text" size="sm" onClick={onGenerateAi} disabled={generatingAi} loading={generatingAi}>
                {generatingAi ? '生成中…' : '✨ AI 辅助'}
              </Button>
              <RewriteButtons
                enabled={hasSelection}
                loading={rewriteState !== null}
                onRewrite={() => onRewriteMode('rewrite')}
                onExpand={() => onRewriteMode('expand')}
                onPolish={() => onRewriteMode('polish')}
              />
              <Button variant="text" size="sm" onClick={onTogglePrompt}>
                {showPrompt ? '关闭提示词' : '✎ 提示词'}
              </Button>
            </>
          )}
          {editing ? (
            <Button variant="primary" size="md" onClick={onSave}>保存</Button>
          ) : (
            <Button variant="secondary" size="md" onClick={onStartEdit}>编辑</Button>
          )}
        </div>
      </div>

      {showPrompt && editing && (
        <div className="prompt-editor">
          <div className="prompt-editor-header">
            <span>提示词（AI 辅助使用，修改后自动保存到本项目的提示词库，换项目不影响）</span>
            <Button variant="text" size="sm" onClick={onResetPrompt}>恢复默认</Button>
          </div>
          <textarea
            className="prompt-editor-textarea"
            value={editingPrompt}
            onChange={(e) => onPromptChange(e.target.value)}
            placeholder="在此编写自定义提示词…"
          />
          <div className="prompt-editor-footer">
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              {editingPrompt.trim() ? '已保存自定义提示词' : '修改后点保存，AI 将使用你的提示词'}
            </span>
            <Button variant="primary" size="sm" disabled={savingPrompt} onClick={onSavePrompt}>
              {savingPrompt ? '保存中…' : '保存提示词'}
            </Button>
          </div>
        </div>
      )}

      {aiError && (
        <div style={{ padding: '8px 24px', fontSize: '0.85rem', color: 'var(--danger)', background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
          AI 生成失败：{aiError}
        </div>
      )}

      {editing ? (
        isFreeform ? (
          <div className="panel-editor-inner">
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
              💡 {activeSectionHint}
              <Button variant="text" size="sm" onClick={() => onStartAddSubField(activeSection.key)}>+ 添加子字段</Button>
            </p>
            <div className="sub-field">
              <div className="sub-field-label-row">
                <label className="sub-field-label">{activeSection.label}</label>
                {(() => {
                  const ex = getExample(genre, activeSection.key, '_default')
                  const showThis = showExample === '__freeform__'
                  return ex ? (
                    <Button variant="text" size="sm" onClick={() => onToggleExample('__freeform__')}>
                      {showThis ? '收起示例' : '📖 看示例'}
                    </Button>
                  ) : null
                })()}
              </div>
              {showExample === '__freeform__' && (() => {
                const ex = getExample(genre, activeSection.key, '_default')
                return ex ? (
                  <div className="sub-field-example">
                    <pre>{ex}</pre>
                  </div>
                ) : null
              })()}
              <textarea
                ref={rewriteTextareaRef}
                className="sub-field-textarea"
                style={{ minHeight: 300 }}
                value={content}
                onChange={(e) => onContentChange(e.target.value)}
                onMouseUp={onSelectionCheck}
                onKeyUp={onSelectionCheck}
                onContextMenu={onSelectionContextMenu}
                placeholder={activeSectionHint + '…'}
              />
            </div>
            {addingSubToKey === activeSection.key && (
              <div style={{ marginTop: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  className="notes-input"
                  style={{ flex: 1 }}
                  value={newSubFieldName}
                  onChange={(e) => onNewSubFieldNameChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) onAddSubField(activeSection.key)
                    if (e.key === 'Escape') onCancelAddSubField()
                  }}
                  placeholder="子字段名称…"
                  autoFocus
                />
                <Button variant="text" size="sm" onClick={() => onAddSubField(activeSection.key)} disabled={!newSubFieldName.trim()}>✓</Button>
                <Button variant="text" size="sm" onClick={onCancelAddSubField}>✕</Button>
              </div>
            )}
          </div>
        ) : (
          <div className="panel-editor-inner">
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
              💡 {activeSectionHint}
              <Button variant="text" size="sm" onClick={() => onStartAddSubField(activeSection.key)}>+ 添加子字段</Button>
            </p>
            {activeSection.subs.map((sub) => {
              const example = getExample(genre, activeSection.key, sub.key)
              const showThis = showExample === sub.key
              return (
                <div key={sub.key} className="sub-field">
                  <div className="sub-field-label-row">
                    {editingSubKey === sub.key ? (
                      <input
                        className="notes-input"
                        style={{ flex: 1, fontSize: '0.85rem' }}
                        value={editingSubLabel}
                        onChange={(e) => onRenameSubFieldLabelChange(e.target.value)}
                        onBlur={() => onCommitRenameSubField(activeSection.key, sub.key)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') onCommitRenameSubField(activeSection.key, sub.key)
                          if (e.key === 'Escape') onCancelRenameSubField()
                        }}
                        autoFocus
                      />
                    ) : (
                      <label
                        className="sub-field-label"
                        onDoubleClick={() => onStartRenameSubField(sub.key, sub.label)}
                        title="双击重命名"
                      >
                        {sub.label}
                      </label>
                    )}
                    {!editingSubKey && (
                      <Button variant="ghost" size="xs" title="删除此子字段" onClick={() => onDeleteSubField(activeSection.key, sub.key)}>✕</Button>
                    )}
                    <div style={{ flex: 1 }} />
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      {example && (
                        <Button variant="text" size="sm" onClick={() => onToggleExample(sub.key)}>
                          {showThis ? '收起示例' : '📖 看示例'}
                        </Button>
                      )}
                    </div>
                  </div>
                  <span className="sub-field-hint">{sub.hint}</span>
                  {showThis && example && (
                    <div className="sub-field-example">
                      <pre>{example}</pre>
                    </div>
                  )}
                  <textarea
                    className="sub-field-textarea"
                    data-subkey={sub.key}
                    value={subValues[sub.key] ?? ''}
                    onChange={(e) => onUpdateSubField(sub.key, e.target.value)}
                    onMouseUp={onSelectionCheck}
                    onKeyUp={onSelectionCheck}
                    onContextMenu={onSelectionContextMenu}
                    placeholder="在这里填写…"
                  />
                </div>
              )
            })}

            {addingSubToKey === activeSection.key && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: -8, marginBottom: 16 }}>
                <input
                  className="notes-input"
                  style={{ flex: 1 }}
                  value={newSubFieldName}
                  onChange={(e) => onNewSubFieldNameChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) onAddSubField(activeSection.key)
                    if (e.key === 'Escape') onCancelAddSubField()
                  }}
                  placeholder="子字段名称…"
                  autoFocus
                />
                <Button variant="text" size="sm" onClick={() => onAddSubField(activeSection.key)} disabled={!newSubFieldName.trim()}>✓</Button>
                <Button variant="text" size="sm" onClick={onCancelAddSubField}>✕</Button>
              </div>
            )}
            <div ref={subFieldEndRef} />
          </div>
        )
      ) : (
        <div className="panel-preview">
          {previewContent.trim() || (
            <span style={{ color: 'var(--text-muted)' }}>
              暂无内容，点击编辑添加
              {hasSubs && '（可填写 ' + activeSection.subs.map((s) => s.label).join('、') + '）'}
            </span>
          )}
        </div>
      )}

      {rewriteState && (
        <RewritePreview
          selectedText={rewriteState.selectedText}
          beforeText={rewriteState.beforeText}
          afterText={rewriteState.afterText}
          defaultMode={rewriteState.mode}
          onAccept={onRewriteAccept}
          onReject={onRewriteReject}
        />
      )}

      {contextMenu && (
        <SelectionContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={menuItems}
          onClose={onContextMenuClose}
        />
      )}
    </div>
  )
}
