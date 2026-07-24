import type { NoteEntry } from '../../services/notesStorage'
import type { ChapterRef } from '../../types/chapter'
import NoteItem from './NoteItem'

type GroupedItem =
  | { kind: 'group-header'; key: string; title: string; count: number }
  | { kind: 'note'; note: NoteEntry }

interface Props {
  loading: boolean
  viewMode: 'timeline' | 'grouped'
  timelineItems: NoteEntry[]
  groupedItems: GroupedItem[] | null
  filterEmptyLabel: string
  collapsedGroups: Set<string>
  editContent: string
  editingId: string | null
  resolveChapterName: (chapterRef: string) => string
  onToggleGroup: (key: string) => void
  onNavigateToChapter?: (chapterRef: ChapterRef) => void
  onStartEdit: (note: NoteEntry) => void
  onEditContentChange: (content: string) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onToggleDone: (id: string) => void
  onToggleResolved: (id: string) => void
  onDelete: (note: NoteEntry) => void
}

export default function NotesList({
  loading,
  viewMode,
  timelineItems,
  groupedItems,
  filterEmptyLabel,
  collapsedGroups,
  editContent,
  editingId,
  resolveChapterName,
  onToggleGroup,
  onNavigateToChapter,
  onStartEdit,
  onEditContentChange,
  onSaveEdit,
  onCancelEdit,
  onToggleDone,
  onToggleResolved,
  onDelete,
}: Props) {
  const renderNote = (note: NoteEntry) => (
    <NoteItem
      key={note.id}
      note={note}
      chapterLabel={note.chapterRef ? resolveChapterName(note.chapterRef) : undefined}
      editing={editingId === note.id}
      editContent={editContent}
      onNavigateToChapter={onNavigateToChapter}
      onStartEdit={onStartEdit}
      onEditContentChange={onEditContentChange}
      onSaveEdit={onSaveEdit}
      onCancelEdit={onCancelEdit}
      onToggleDone={onToggleDone}
      onToggleResolved={onToggleResolved}
      onDelete={onDelete}
    />
  )

  return (
    <div className="notes-list">
      {loading ? (
        <p className="notes-empty">加载中…</p>
      ) : viewMode === 'grouped' && groupedItems ? (
        groupedItems.length === 0 ? (
          <p className="notes-empty">暂无{filterEmptyLabel}</p>
        ) : (
          groupedItems.map((item) => {
            if (item.kind === 'group-header') {
              const isCollapsed = collapsedGroups.has(item.key)
              return (
                <div key={`gh-${item.key}`} className="notes-group-header" data-notes-group={item.key} onClick={() => { onToggleGroup(item.key) }}>
                  <span className="notes-group-caret">{isCollapsed ? '▶' : '▼'}</span>
                  <span className="notes-group-title">{item.title}</span>
                  <span className="notes-group-count">{item.count}</span>
                </div>
              )
            }
            return renderNote(item.note)
          })
        )
      ) : (
        <>
          {timelineItems.map(renderNote)}
          {timelineItems.length === 0 && !loading && <p className="notes-empty">暂无{filterEmptyLabel}</p>}
        </>
      )}
    </div>
  )
}
