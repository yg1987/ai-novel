import { useMemo, useState } from 'react'
import Button from '../Button'
import type { ChapterRef } from '../../types/chapter'
import { chapterRefKey } from '../../services/chapterDisplay'

export interface OutlineChapterItem {
  ref: ChapterRef
  hasWriting: boolean
  hasOutline: boolean
}

export interface OutlineVolumeItem {
  volume: string
  hasVolumeOutline: boolean
  chapters: OutlineChapterItem[]
}

type OutlineOpenSelection =
  | { type: 'outline' }
  | { type: 'volume'; volume: string }
  | { type: 'chapter'; ref: ChapterRef }

interface Props {
  volumes: OutlineVolumeItem[]
  activeSelection: string | null
  onOpen: (selection: OutlineOpenSelection) => void
  onCreateVolume: () => void
  onCreateVolumeOutline: (volume: string) => void
  onCreateChapter: (volume: string) => void
  onCreateOutlineForChapter: (ref: ChapterRef) => void
  onStartWriting: (ref: ChapterRef) => void
  onDeleteVolume: (volume: string) => void
  onDeleteChapter: (ref: ChapterRef) => void
}

export default function OutlineSidebar({
  volumes,
  activeSelection,
  onOpen,
  onCreateVolume,
  onCreateVolumeOutline,
  onCreateChapter,
  onCreateOutlineForChapter,
  onStartWriting,
  onDeleteVolume,
  onDeleteChapter,
}: Props) {
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return volumes
    return volumes.map((item) => ({
      ...item,
      chapters: item.chapters.filter((chapter) => `${chapter.ref.volume} ${chapter.ref.chapterId}`.toLowerCase().includes(normalized)),
    })).filter((item) => item.volume.toLowerCase().includes(normalized) || item.chapters.length > 0)
  }, [query, volumes])

  return <div className="panel-sidebar">
    <div className="panel-sidebar-header"><h3>大纲</h3><Button variant="primary" size="xs" onClick={onCreateVolume} title="新建规划卷">+</Button></div>
    <div className="panel-search"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索卷或章节位置" aria-label="搜索卷或章节位置" /></div>
    <div className="panel-list">
      <button className={`panel-item${activeSelection === 'outline' ? ' active' : ''}`} onClick={() => onOpen({ type: 'outline' })}>📋 总纲</button>
      {filtered.map((item) => {
        const volumeSelection = `volume:${item.volume}`
        const isCollapsed = collapsed[item.volume] ?? false
        return <div key={item.volume}>
          <div className={`panel-item${activeSelection === volumeSelection ? ' active' : ''}`}>
            <button className="panel-item-main" onClick={() => onOpen({ type: 'volume', volume: item.volume })}>📖 {item.volume}</button>
            <span className="panel-item-status">{item.chapters.filter((chapter) => chapter.hasWriting && chapter.hasOutline).length}/{item.chapters.length}</span>
            <Button variant="ghost" size="xs" onClick={() => setCollapsed((previous) => ({ ...previous, [item.volume]: !isCollapsed }))} title={isCollapsed ? '展开卷' : '折叠卷'}>{isCollapsed ? '▶' : '▼'}</Button>
            {!item.hasVolumeOutline && <Button variant="ghost" size="xs" onClick={() => onCreateVolumeOutline(item.volume)} title="创建分卷纲">＋</Button>}
            <Button variant="ghost" size="xs" onClick={() => onCreateChapter(item.volume)} title="添加章节细纲">＋章</Button>
            {item.hasVolumeOutline && <Button variant="danger" size="xs" onClick={() => onDeleteVolume(item.volume)} title="删除分卷纲">✕</Button>}
          </div>
          {!isCollapsed && item.chapters.map((chapter) => {
            const key = chapterRefKey(chapter.ref)
            const selection = `chapter:${key}`
            return <div key={key} className="panel-sub-item-row">
              <button className={`panel-sub-item${activeSelection === selection ? ' active' : ''}`} onClick={() => chapter.hasOutline ? onOpen({ type: 'chapter', ref: chapter.ref }) : undefined} disabled={!chapter.hasOutline}>
                📝 第{chapter.ref.chapterId.replace(/^ch0*/, '') || '0'}章
                <span className="outline-state">{chapter.hasWriting && chapter.hasOutline ? '正文·细纲' : chapter.hasWriting ? '只有正文' : '只有细纲'}</span>
              </button>
              <span className="panel-sub-actions">
                {!chapter.hasOutline && <Button variant="ghost" size="xs" onClick={() => onCreateOutlineForChapter(chapter.ref)} title="从正文创建细纲">建纲</Button>}
                {!chapter.hasWriting && <Button variant="ghost" size="xs" onClick={() => onStartWriting(chapter.ref)} title="从细纲开始写作">写作</Button>}
                {chapter.hasOutline && <Button variant="danger" size="xs" onClick={() => onDeleteChapter(chapter.ref)} title="删除章节细纲">✕</Button>}
              </span>
            </div>
          })}
        </div>
      })}
      {filtered.length === 0 && <p className="panel-empty">没有匹配的位置</p>}
    </div>
  </div>
}
