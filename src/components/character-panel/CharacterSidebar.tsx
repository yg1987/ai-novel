import type { MouseEvent } from 'react'
import Button from '../Button'
import type { CharacterGender } from '../../services/characterProfiles'

interface Props {
  files: string[]
  genderByFile: Record<string, CharacterGender>
  genderCounts: Record<CharacterGender, number>
  genderFilter: CharacterGender | '全部'
  activeFile: string | null
  newName: string
  creating: boolean
  generating: boolean
  deletingName: string | null
  error: string | null
  notice: string | null
  isNameDuplicate: boolean
  dragPreview: { index: number; offset: number } | null
  onNewNameChange: (name: string) => void
  onGenderFilterChange: (filter: CharacterGender | '全部') => void
  onCreate: () => void
  onRandomName: () => void
  onAICreate: () => void
  onSelect: (name: string) => void
  onDelete: (name: string) => void
  onDragStart: (event: MouseEvent, index: number) => void
}

export default function CharacterSidebar({
  files,
  genderByFile,
  genderCounts,
  genderFilter,
  activeFile,
  newName,
  creating,
  generating,
  deletingName,
  error,
  notice,
  isNameDuplicate,
  dragPreview,
  onNewNameChange,
  onGenderFilterChange,
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
          onKeyDown={(e) => { if (e.key === 'Enter' && !generating && !creating) { onCreate() } }}
        />
        <Button variant="primary" size="xs" onClick={onCreate} loading={creating} disabled={!newName.trim() || isNameDuplicate || generating || creating} title="创建空白角色卡">+</Button>
      </div>
      <div className="panel-new-actions">
        <Button variant="secondary" size="xs" onClick={onRandomName} disabled={generating || creating} title="随机起名">🎲 起名</Button>
        <Button variant="primary" size="xs" onClick={onAICreate} disabled={generating || creating || (newName.trim().length > 0 && isNameDuplicate)} title="AI 生成完整角色卡" loading={generating}>
          {generating ? '生成中' : '✨ AI 创建'}
        </Button>
      </div>
      <div className="panel-new-actions" style={{ flexWrap: 'wrap' }}>
        {(['全部', '男', '女', '未知'] as const).map((filter) => (
          <Button key={filter} variant={genderFilter === filter ? 'secondary' : 'text'} size="xs" onClick={() => onGenderFilterChange(filter)}>
            {filter}{filter === '全部' ? '' : ` ${genderCounts[filter]}`}
          </Button>
        ))}
      </div>
      {error && (
        <div style={{ padding: '4px 8px', fontSize: '0.78rem', color: 'var(--danger)', background: 'var(--bg)' }}>
          {error}
        </div>
      )}
      {notice && <div style={{ padding: '4px 8px', fontSize: '0.78rem', color: 'var(--success)', background: 'var(--bg)' }}>{notice}</div>}
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
            >⠿ {f} <small style={{ color: 'var(--text-muted)' }}>{genderByFile[f]}</small></span>
            <Button variant="danger" size="xs" onClick={(e) => { e.stopPropagation(); onDelete(f) }} loading={deletingName === f} disabled={deletingName !== null} title="删除角色">✕</Button>
          </div>
        ))}
        {files.length === 0 && <p className="panel-empty">暂无角色</p>}
      </div>
    </div>
  )
}
