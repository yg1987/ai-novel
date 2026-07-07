import { useState, useEffect, useCallback } from 'react'
import { readProjectFile, writeProjectFile } from '../api/tauri'

interface Props {
  projectId: string
}

interface NoteEntry {
  id: string
  content: string
  type: 'note' | 'todo'
  chapterRef: string
  done: boolean
  createdAt: string
}

const NOTES_FILE = 'notes.json'
const NOTES_DIR = 'notes'

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

function loadNotes(raw: string): NoteEntry[] {
  if (!raw.trim()) return []
  try { return JSON.parse(raw) as NoteEntry[] }
  catch { return [] }
}

export default function NotesPanel({ projectId }: Props) {
  const [notes, setNotes] = useState<NoteEntry[]>([])
  const [newContent, setNewContent] = useState('')
  const [newType, setNewType] = useState<'note' | 'todo'>('note')
  const [filter, setFilter] = useState<'all' | 'note' | 'todo'>('all')

  const refresh = useCallback(async () => {
    const raw = await readProjectFile(projectId, NOTES_DIR, NOTES_FILE)
    setNotes(loadNotes(raw))
  }, [projectId])

  useEffect(() => {
    refresh().catch((e: unknown) => { console.error(e) })
  }, [refresh])

  const saveNotes = async (updated: NoteEntry[]) => {
    setNotes(updated)
    await writeProjectFile(projectId, NOTES_DIR, NOTES_FILE, JSON.stringify(updated, null, 2))
  }

  const handleAdd = () => {
    if (!newContent.trim()) return
    const entry: NoteEntry = {
      id: generateId(),
      content: newContent.trim(),
      type: newType,
      chapterRef: '',
      done: false,
      createdAt: new Date().toISOString().slice(0, 16),
    }
    saveNotes([entry, ...notes]).catch((e: unknown) => { console.error(e) })
    setNewContent('')
  }

  const handleToggleDone = (id: string) => {
    const updated = notes.map((n) => n.id === id ? { ...n, done: !n.done } : n)
    saveNotes(updated).catch((e: unknown) => { console.error(e) })
  }

  const handleDelete = (id: string) => {
    saveNotes(notes.filter((n) => n.id !== id)).catch((e: unknown) => { console.error(e) })
  }

  const filtered = filter === 'all' ? notes : notes.filter((n) => n.type === filter)

  return (
    <div className="notes-panel">
      <div className="notes-input-area">
        <div className="notes-input-row">
          <input
            className="notes-input"
            value={newContent}
            onChange={(e) => { setNewContent(e.target.value) }}
            placeholder="添加备注或待办…"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { handleAdd() } }}
          />
          <select value={newType} onChange={(e) => { setNewType(e.target.value as 'note' | 'todo') }}>
            <option value="note">备注</option>
            <option value="todo">待办</option>
          </select>
          <button className="btn-primary" onClick={() => { handleAdd() }}>添加</button>
        </div>
      </div>

      <div className="notes-filter">
        <button className={`tab-btn${filter === 'all' ? ' active' : ''}`} onClick={() => { setFilter('all') }}>全部</button>
        <button className={`tab-btn${filter === 'note' ? ' active' : ''}`} onClick={() => { setFilter('note') }}>备注</button>
        <button className={`tab-btn${filter === 'todo' ? ' active' : ''}`} onClick={() => { setFilter('todo') }}>待办</button>
      </div>

      <div className="notes-list">
        {filtered.map((n) => (
          <div key={n.id} className={`note-item ${n.type}${n.done ? ' done' : ''}`}>
            <div className="note-item-header">
              <span className="note-type-badge">{n.type === 'todo' ? '☐' : '📝'}</span>
              <span className="note-date">{n.createdAt}</span>
              <div className="note-item-actions">
                {n.type === 'todo' && (
                  <button className="btn-text" onClick={() => { handleToggleDone(n.id) }}>
                    {n.done ? '↩ 重开' : '✓ 完成'}
                  </button>
                )}
                <button className="btn-text" onClick={() => { handleDelete(n.id) }} style={{ color: 'var(--danger)' }}>✕</button>
              </div>
            </div>
            <div className={`note-content${n.done ? ' done-text' : ''}`}>{n.content}</div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="notes-empty">暂无{filter === 'all' ? '' : filter === 'note' ? '备注' : '待办'}</p>
        )}
      </div>
    </div>
  )
}
