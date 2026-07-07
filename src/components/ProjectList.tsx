import type { ProjectMeta } from '../types/project'

interface Props {
  projects: ProjectMeta[]
  activeId: string | null
  onSelect: (id: string) => void
}

const STATUS_COLORS: Record<string, string> = {
  '连载中': '#e67e22',
  '完结': '#27ae60',
  '搁置': '#95a5a6',
}

export default function ProjectList({ projects, activeId, onSelect }: Props) {
  if (projects.length === 0) {
    return (
      <div className="project-list-empty">
        <p>暂无项目</p>
        <p className="hint">点击右上角 + 新建项目</p>
      </div>
    )
  }

  return (
    <div className="project-list">
      {projects.map((p) => (
        <div
          key={p.id}
          className={`project-item${p.id === activeId ? ' active' : ''}`}
          onClick={() => { onSelect(p.id) }}
        >
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
      ))}
    </div>
  )
}
