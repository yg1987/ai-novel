import { useState, type SyntheticEvent } from 'react'

interface Props {
  onConfirm: (data: { name: string; genre: string; description: string; target_words: number }) => void
  onCancel: () => void
}

const GENRES = ['玄幻', '都市', '言情', '科幻', '悬疑', '历史', '游戏', '轻小说']

export default function CreateProjectDialog({ onConfirm, onCancel }: Props) {
  const [name, setName] = useState('')
  const [genre, setGenre] = useState(GENRES[0]!)
  const [description, setDescription] = useState('')
  const [targetWords, setTargetWords] = useState(100000)

  const handleSubmit = (e: SyntheticEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    onConfirm({ name: name.trim(), genre, description: description.trim(), target_words: targetWords })
  }

  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog" onClick={(e) => { e.stopPropagation() }}>
        <h2>新建项目</h2>
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
          <div className="form-field">
            <label>类型</label>
            <select value={genre} onChange={(e) => { setGenre(e.target.value) }}>
              {GENRES.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label>简介</label>
            <textarea
              value={description}
              onChange={(e) => { setDescription(e.target.value) }}
              placeholder="一句话简介"
              rows={3}
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
            <button type="submit" className="btn-primary" disabled={!name.trim()}>创建</button>
          </div>
        </form>
      </div>
    </div>
  )
}
