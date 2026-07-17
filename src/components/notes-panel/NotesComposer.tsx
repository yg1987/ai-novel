import type { ChapterMeta } from '../../types/chapter'
import { buildChapterRef, type NoteType } from '../../services/notesStorage'
import Button from '../Button'

interface Props {
  content: string
  type: NoteType
  chapterRef: string
  chapterVolumes: Map<string, ChapterMeta[]>
  onContentChange: (value: string) => void
  onTypeChange: (value: NoteType) => void
  onChapterRefChange: (value: string) => void
  onAdd: () => void
}

export default function NotesComposer({
  content,
  type,
  chapterRef,
  chapterVolumes,
  onContentChange,
  onTypeChange,
  onChapterRefChange,
  onAdd,
}: Props) {
  return (
    <div className="notes-input-area">
      <div className="notes-input-row">
        <textarea
          className="notes-input"
          value={content}
          onChange={(e) => { onContentChange(e.target.value) }}
          placeholder="添加备注、待办或疑问…"
          rows={2}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onAdd() }
          }}
        />
        <select value={type} onChange={(e) => { onTypeChange(e.target.value as NoteType) }}>
          <option value="note">备注</option>
          <option value="todo">待办</option>
          <option value="question">疑问</option>
        </select>
        <Button variant="primary" size="md" onClick={onAdd}>添加</Button>
      </div>
      {chapterVolumes.size > 0 && (
        <div className="notes-chapter-row">
          <select value={chapterRef} onChange={(e) => { onChapterRefChange(e.target.value) }}>
            <option value="">项目级（不关联章节）</option>
            {[...chapterVolumes.entries()].map(([volume, chs]) => (
              <optgroup key={volume} label={volume}>
                {chs.map((ch) => (
                  <option key={buildChapterRef(ch.volume, ch.id)} value={buildChapterRef(ch.volume, ch.id)}>
                    {ch.title}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}
