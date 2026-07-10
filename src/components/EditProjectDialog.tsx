import { useState, type SyntheticEvent } from 'react'
import type { ProjectMeta, UpdateProjectInput } from '../types/project'

interface Props {
  project: ProjectMeta
  onConfirm: (data: UpdateProjectInput) => void
  onCancel: () => void
}

const GENRES = ['玄幻', '都市', '言情', '科幻', '悬疑', '历史', '游戏', '轻小说']
const STATUSES = ['连载中', '完结', '搁置']

export default function EditProjectDialog({ project, onConfirm, onCancel }: Props) {
  const [name, setName] = useState(project.name)
  const [genre, setGenre] = useState(project.genre)
  const [description, setDescription] = useState(project.description)
  const [status, setStatus] = useState(project.status)
  const [targetWords, setTargetWords] = useState(project.target_words)

  const handleSubmit = (e: SyntheticEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    onConfirm({
      projectId: project.id,
      name: name.trim(),
      genre,
      description: description.trim(),
      status,
      targetWords,
    })
  }

  return (
    <div className="dialog-overlay">
      <div className="dialog" onClick={(e) => { e.stopPropagation() }}>
        <h2>编辑项目</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-field">
            <label>书名 *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value) }}
              placeholder="输入书名"
              autoFocus
              required
            />
          </div>
          <div className="form-row">
            <div className="form-field">
              <label>类型</label>
              <select value={genre} onChange={(e) => { setGenre(e.target.value) }}>
                {GENRES.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label>状态</label>
              <select value={status} onChange={(e) => { setStatus(e.target.value) }}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-field">
            <label>简介</label>
            <textarea
              value={description}
              onChange={(e) => { setDescription(e.target.value) }}
              placeholder="一句话简介（限200字）"
              rows={3}
              maxLength={200}
            />
          </div>
          <div className="form-field">
            <label>目标字数</label>
            <input
              type="number"
              value={targetWords}
              onChange={(e) => { setTargetWords(Number(e.target.value)) }}
              min={0}
              step={10000}
            />
          </div>
          <div className="dialog-actions">
            <button type="button" className="btn-secondary" onClick={onCancel}>取消</button>
            <button type="submit" className="btn-primary" disabled={!name.trim()}>保存</button>
          </div>
        </form>
      </div>
    </div>
  )
}
