import type { MouseEvent } from 'react'
import Button from '../Button'

interface Props {
  files: string[]
  activeFile: string | null
  newName: string
  generating: boolean
  aiError: string | null
  isNameDuplicate: boolean
  dragPreview: { index: number; offset: number } | null
  onNewNameChange: (name: string) => void
  onCreate: () => void
  onRandomName: () => void
  onAICreate: () => void
  onSelect: (name: string) => void
  onDelete: (name: string) => void
  onDragStart: (event: MouseEvent, index: number) => void
}

export default function CharacterSidebar({
  files,
  activeFile,
  newName,
  generating,
  aiError,
  isNameDuplicate,
  dragPreview,
  onNewNameChange,
  onCreate,
  onRandomName,
  onAICreate,
  onSelect,
  onDelete,
  onDragStart,
}: Props) {
  return (
    <div className="panel-sidebar">
      <div className="panel-sidebar-header">
        <h3>角色</h3>
      </div>
      <div className="panel-new-item">
        <input
          value={newName}
          onChange={(e) => { onNewNameChange(e.target.value) }}
          placeholder="角色名"
          onKeyDown={(e) => { if (e.key === 'Enter' && !generating) { onCreate() } }}
        />
        <Button variant="primary" size="xs" onClick={onCreate} disabled={!newName.trim() || isNameDuplicate} title="创建空白角色卡">+</Button>
      </div>
      <div className="panel-new-actions">
        <Button variant="secondary" size="xs" onClick={onRandomName} title="随机起名">🎲 起名</Button>
        <Button variant="primary" size="xs" onClick={onAICreate} disabled={generating || (newName.trim().length > 0 && isNameDuplicate)} title="AI 生成完整角色卡" loading={generating}>
          {generating ? '生成中' : '✨ AI 创建'}
        </Button>
      </div>
      {aiError && (
        <div style={{ padding: '4px 8px', fontSize: '0.78rem', color: 'var(--danger)', background: 'var(--bg)' }}>
          {aiError}
        </div>
      )}
      {isNameDuplicate && (
        <div style={{ padding: '4px 8px', fontSize: '0.78rem', color: 'var(--text-muted)', background: 'var(--bg)' }}>
          该角色名已存在
        </div>
      )}
      <div className="panel-list">
        {files.map((f, idx) => (
          <div
            key={f}
            className={`panel-item${f === activeFile ? ' active' : ''}${dragPreview?.index === idx ? ' dragging' : ''}`}
            onClick={() => { onSelect(f) }}
          >
            <span
              data-drag-handle
              style={{ cursor: 'grab', userSelect: 'none' }}
              onMouseDown={(e) => onDragStart(e, idx)}
            >⠿ {f}</span>
            <Button variant="danger" size="xs" onClick={(e) => { e.stopPropagation(); onDelete(f) }} title="删除角色">✕</Button>
          </div>
        ))}
        {files.length === 0 && <p className="panel-empty">暂无角色</p>}
      </div>
    </div>
  )
}
