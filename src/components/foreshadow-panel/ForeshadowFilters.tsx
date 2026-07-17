import type { ForeshadowCategory } from '../../types/novel'
import { CATEGORY_LABELS } from './foreshadowPanelUtils'

interface Props {
  statusFilter: string
  categoryFilter: string
  inspireCount: number
  onStatusFilter: (status: string) => void
  onCategoryFilter: (category: string) => void
}

export default function ForeshadowFilters({ statusFilter, categoryFilter, inspireCount, onStatusFilter, onCategoryFilter }: Props) {
  return (
    <div className="foreshadow-filters">
      <div className="notes-filter">
        <button className={`tab-btn${statusFilter === 'all' ? ' active' : ''}`} onClick={() => onStatusFilter('all')}>全部</button>
        <button className={`tab-btn${statusFilter === 'planted' ? ' active' : ''}`} onClick={() => onStatusFilter('planted')}>待处理</button>
        <button className={`tab-btn${statusFilter === 'advanced' ? ' active' : ''}`} onClick={() => onStatusFilter('advanced')}>推进中</button>
        <button className={`tab-btn${statusFilter === 'resolved' ? ' active' : ''}`} onClick={() => onStatusFilter('resolved')}>已回收</button>
        <button className={`tab-btn${statusFilter === 'abandoned' ? ' active' : ''}`} onClick={() => onStatusFilter('abandoned')}>已废弃</button>
        <button className={`tab-btn${statusFilter === 'inspire' ? ' active' : ''}`} onClick={() => onStatusFilter('inspire')} style={statusFilter === 'inspire' ? {} : { color: inspireCount > 0 ? 'var(--accent)' : undefined }}>
          💡 灵感建议{inspireCount > 0 ? ` (${inspireCount})` : ''}
        </button>
      </div>
      <div className="notes-filter category-filter">
        <button className={`tab-btn${categoryFilter === 'all' ? ' active' : ''}`} onClick={() => onCategoryFilter('all')}>全部分类</button>
        {(Object.entries(CATEGORY_LABELS) as [ForeshadowCategory, string][]).map(([key, label]) => (
          <button
            key={key}
            className={`tab-btn${categoryFilter === key ? ' active' : ''}`}
            onClick={() => onCategoryFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
