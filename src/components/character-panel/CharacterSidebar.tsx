import type { MouseEvent } from 'react'
import Button from '../Button'
import type { CharacterGender } from '../../services/characterProfiles'
import type { OptionDefinition, OrganizationRecord } from '../../types/character'

interface Props {
  files: string[]
  genderByFile: Record<string, CharacterGender>
  genderCounts: Record<CharacterGender, number>
  genderFilter: CharacterGender | '全部'
  searchQuery: string
  stanceFilter: string
  tagFilters: string[]
  organizationFilter: string
  stances: OptionDefinition[]
  organizations: OrganizationRecord[]
  availableTags: string[]
  hasActiveFilters: boolean
  totalFiles: number
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
  onSearchQueryChange: (query: string) => void
  onStanceFilterChange: (stanceId: string) => void
  onTagFiltersChange: (tags: string[]) => void
  onOrganizationFilterChange: (organizationId: string) => void
  onClearFilters: () => void
  onOpenConfig: () => void
  onCreate: () => void
  onRandomName: () => void
  onAICreate: () => void
  onSelect: (name: string) => void
  onDelete: (name: string) => void
  onRename: (name: string) => void
  onDragStart: (event: MouseEvent, index: number) => void
}

export default function CharacterSidebar({
  files,
  genderByFile,
  genderCounts,
  genderFilter,
  searchQuery,
  stanceFilter,
  tagFilters,
  organizationFilter,
  stances,
  organizations,
  availableTags,
  hasActiveFilters,
  totalFiles,
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
  onSearchQueryChange,
  onStanceFilterChange,
  onTagFiltersChange,
  onOrganizationFilterChange,
  onClearFilters,
  onOpenConfig,
  onCreate,
  onRandomName,
  onAICreate,
  onSelect,
  onDelete,
  onRename,
  onDragStart,
}: Props) {
  return (
    <div className="panel-sidebar">
      <div className="panel-sidebar-header">
        <h3>角色</h3>
        <Button variant="ghost" size="xs" title="角色模块预设" onClick={onOpenConfig}>设置</Button>
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
      <div className="character-sidebar-filters">
        <input
          className="notes-input"
          type="search"
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          placeholder="搜索名称、身份或标签"
          aria-label="搜索角色"
        />
        <div className="character-filter-grid">
          <select className="notes-input" value={stanceFilter} onChange={(event) => onStanceFilterChange(event.target.value)} aria-label="按立场筛选">
            <option value="">全部立场</option>
            {stances.slice().sort((left, right) => left.order - right.order).map((stance) => <option key={stance.id} value={stance.id}>{stance.label}</option>)}
          </select>
          <select className="notes-input" value={organizationFilter} onChange={(event) => onOrganizationFilterChange(event.target.value)} aria-label="按组织筛选">
            <option value="">全部组织</option>
            {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
          </select>
        </div>
        {availableTags.length > 0 && (
          <details className="character-tag-filter">
            <summary>标签{tagFilters.length > 0 ? `（已选 ${tagFilters.length}）` : ''}</summary>
            <div>
              {availableTags.map((tag) => <label key={tag}><input type="checkbox" checked={tagFilters.includes(tag)} onChange={(event) => onTagFiltersChange(event.target.checked ? [...tagFilters, tag] : tagFilters.filter((item) => item !== tag))} />{tag}</label>)}
            </div>
          </details>
        )}
        {hasActiveFilters && <Button variant="text" size="xs" onClick={onClearFilters}>清空筛选</Button>}
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
            <div style={{ display: 'flex', gap: 4 }}>
              <Button variant="text" size="xs" onClick={(e) => { e.stopPropagation(); onRename(f) }} disabled={deletingName !== null} title="重命名角色">✎</Button>
              <Button variant="danger" size="xs" onClick={(e) => { e.stopPropagation(); onDelete(f) }} loading={deletingName === f} disabled={deletingName !== null} title="删除角色">✕</Button>
            </div>
          </div>
        ))}
        {files.length === 0 && (
          <div className="panel-empty">
            <p>{totalFiles > 0 ? '没有符合筛选条件的角色' : '暂无角色'}</p>
            {totalFiles > 0 && <Button variant="text" size="xs" onClick={onClearFilters}>清空筛选</Button>}
          </div>
        )}
      </div>
    </div>
  )
}
