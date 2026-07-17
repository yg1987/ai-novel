import type { NoteEntry } from '../../services/notesStorage'
import Button from '../Button'

interface Props {
  note: NoteEntry
  chapterLabel?: string
  editing: boolean
  editContent: string
  onNavigateToChapter?: (chapterRef: string) => void
  onStartEdit: (note: NoteEntry) => void
  onEditContentChange: (content: string) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onToggleDone: (id: string) => void
  onToggleResolved: (id: string) => void
  onDelete: (note: NoteEntry) => void
}

function typeIcon(note: NoteEntry): string {
  if (note.type === 'question') return '❓'
  if (note.type === 'todo') return '☐'
  return '📝'
}

export default function NoteItem({
  note,
  chapterLabel,
  editing,
  editContent,
  onNavigateToChapter,
  onStartEdit,
  onEditContentChange,
  onSaveEdit,
  onCancelEdit,
  onToggleDone,
  onToggleResolved,
  onDelete,
}: Props) {
  const stateButton = () => {
    if (note.type === 'todo') {
      return <Button variant="text" size="sm" onClick={() => { onToggleDone(note.id) }}>{note.done ? '↩ 重开' : '✓ 完成'}</Button>
    }
    if (note.type === 'question') {
      return <Button variant="text" size="sm" onClick={() => { onToggleResolved(note.id) }}>{note.resolved ? '↩ 重开' : '✓ 解决'}</Button>
    }
    return null
  }

  return (
    <div className={`note-item ${note.type}${note.done ? ' done' : ''}${note.resolved ? ' resolved' : ''}`}>
      <div className="note-item-header">
        <span className="note-type-badge">{typeIcon(note)}</span>
        {note.chapterRef && (
          <span className="note-chapter-tag" onClick={(e) => { e.stopPropagation(); onNavigateToChapter?.(note.chapterRef) }} title="点击跳转到该章节">
            📖 {chapterLabel ?? note.chapterRef}
          </span>
        )}
        <span className="note-date">{note.createdAt}</span>
        <div className="note-item-actions">
          {stateButton()}
          <Button variant="text" size="sm" onClick={(e) => { e.stopPropagation(); onDelete(note) }} style={{ color: 'var(--danger)' }}>✕</Button>
        </div>
      </div>
      {editing ? (
        <div className="note-edit-area">
          <textarea
            className="note-edit-textarea"
            value={editContent}
            onChange={(e) => { onEditContentChange(e.target.value) }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSaveEdit() }
              if (e.key === 'Escape') onCancelEdit()
            }}
            autoFocus
            rows={3}
          />
          <div className="dialog-footer" style={{ borderTop: 'none', paddingTop: 0, marginTop: 6 }}>
            <Button variant="text" size="sm" onClick={onCancelEdit}>取消</Button>
            <Button variant="text" size="sm" onClick={onSaveEdit}>保存</Button>
          </div>
        </div>
      ) : (
        <div className={`note-content${note.done ? ' done-text' : ''}${note.resolved ? ' resolved-text' : ''}`} onClick={() => { onStartEdit(note) }} title="点击编辑">
          {note.content}
        </div>
      )}
    </div>
  )
}
