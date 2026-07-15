import { useState, type SyntheticEvent } from 'react'

import Button from './Button'

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
    <div className="dialog-overlay">
      <div className="dialog">
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
          <div className="dialog-footer">
            <Button variant="secondary" size="md" type="button" onClick={onCancel}>取消</Button>
            <Button variant="primary" size="md" type="submit" disabled={!name.trim()}>创建</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
