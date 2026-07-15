import { useState } from 'react'
import type { ProjectMeta } from '../types/project'
import ConfirmDialog from './ConfirmDialog'
import Button from './Button'

interface Props {
  projects: ProjectMeta[]
  activeId: string | null
  onSelect: (id: string) => void
  onEdit?: (project: ProjectMeta) => void
  onDelete?: (id: string) => void
}

const STATUS_COLORS: Record<string, string> = {
  '连载中': '#e67e22',
  '完结': '#27ae60',
  '搁置': '#95a5a6',
}

export default function ProjectList({ projects, activeId, onSelect, onEdit, onDelete }: Props) {
  const [deleteTarget, setDeleteTarget] = useState<ProjectMeta | null>(null)

  if (projects.length === 0) {
    return (
      <div className="project-list-empty">
        <p>暂无项目</p>
        <p className="hint">点击右上角 + 新建项目</p>
      </div>
    )
  }

  // Sort by created_at descending (newest first)
  const sorted = [...projects].sort((a, b) => {
    return parseInt(b.created_at) - parseInt(a.created_at)
  })

  return (
    <div className="project-list">
      {sorted.map((p) => (
        <div
          key={p.id}
          className={`project-item${p.id === activeId ? ' active' : ''}`}
        >
          <div className="project-item-main" onClick={() => { onSelect(p.id) }}>
            <div className="project-item-header">
              <span className="project-name">{p.name}</span>
              <span
                className="project-status"
                style={{ background: STATUS_COLORS[p.status] ?? '#95a5a6' }}
              >
                {p.status}
              </span>
            </div>
            <div className="project-item-meta">
              <span>{p.genre}</span>
              <span>{p.target_words.toLocaleString()} 字</span>
            </div>
          </div>
          <div className="project-item-actions">
            {onEdit && (
              <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onEdit(p) }} title="编辑">✎</Button>
            )}
            {onDelete && (
              <Button variant="ghost" size="sm" className="btn-icon-danger" onClick={(e) => {
                e.stopPropagation()
                setDeleteTarget(p)
              }} title="删除">✕</Button>
            )}
          </div>
        </div>
      ))}

      {deleteTarget && (
        <ConfirmDialog
          title="删除项目"
          message={`确定删除项目「${deleteTarget.name}」？\n此操作不可恢复，所有章节和设定将被永久删除。`}
          confirmText="删除"
          danger
          onConfirm={() => {
            onDelete!(deleteTarget.id)
            setDeleteTarget(null)
          }}
          onCancel={() => { setDeleteTarget(null) }}
        />
      )}
    </div>
  )
}
