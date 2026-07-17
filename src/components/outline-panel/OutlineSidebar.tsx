import Button from '../Button'

interface ChapterInfo {
  filename: string
  label: string
  volumeLabel: string
}

interface Props {
  volumes: string[]
  chapters: ChapterInfo[]
  activeFile: string | null
  onOpen: (file: string, type: 'outline' | 'volume' | 'chapter') => void
  onCreateVolume: () => void
  onCreateChapter: (volumeLabel: string) => void
  onDeleteVolume: (name: string, label: string) => void
  onDeleteChapter: (name: string, label: string) => void
}

export default function OutlineSidebar({
  volumes,
  chapters,
  activeFile,
  onOpen,
  onCreateVolume,
  onCreateChapter,
  onDeleteVolume,
  onDeleteChapter,
}: Props) {
  const chaptersByVolume = (volLabel: string) =>
    chapters.filter((c) => c.volumeLabel === volLabel)

  return (
    <div className="panel-sidebar">
      <div className="panel-sidebar-header">
        <h3>大纲</h3>
        <Button variant="primary" size="xs" onClick={onCreateVolume} title="添加分卷">+</Button>
      </div>
      <div className="panel-list">
        <div
          className={`panel-item${activeFile === 'outline.md' ? ' active' : ''}`}
          onClick={() => onOpen('outline.md', 'outline')}
        >
          📋 总纲
        </div>
        {volumes.map((v) => {
          const volLabel = v.replace(/\.md$/, '')
          const volChapters = chaptersByVolume(volLabel)
          const isVolActive = activeFile === v
          return (
            <div key={v}>
              <div className={`panel-item${isVolActive ? ' active' : ''}`}>
                <div className="panel-item-main" onClick={() => onOpen(v, 'volume')}>
                  📖 {volLabel}
                </div>
                <div style={{ display: 'flex', gap: 2 }}>
                  <Button variant="ghost" size="xs" className="panel-item-add" onClick={(e) => { e.stopPropagation(); onCreateChapter(volLabel) }} title="添加章节细纲">+</Button>
                  <Button variant="danger" size="xs" className="panel-item-add" onClick={(e) => { e.stopPropagation(); onDeleteVolume(v, volLabel) }} title="删除分卷">✕</Button>
                </div>
              </div>
              {volChapters.map((c) => (
                <div key={c.filename} className="panel-sub-item-row">
                  <div className={`panel-sub-item${activeFile === c.filename ? ' active' : ''}`} onClick={() => onOpen(c.filename, 'chapter')}>
                    📝 {c.label}
                  </div>
                  <Button variant="danger" size="xs" className="panel-item-add" onClick={() => onDeleteChapter(c.filename, c.label)} title="删除章节细纲">✕</Button>
                </div>
              ))}
            </div>
          )
        })}
        {volumes.length === 0 && <p className="panel-empty">暂无分卷，点击 + 添加</p>}
      </div>
    </div>
  )
}
