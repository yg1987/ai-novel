import { useEffect, useMemo, useState } from 'react'
import Button from '../Button'
import type { ChapterRef } from '../../types/chapter'
import { chapterRefKey } from '../../services/chapterDisplay'
import { chapterOrder } from '../../services/chapterCatalog'
import type { ChapterSegmentSize } from '../../hooks/useChapterSegmentSize'
import ChapterSegmentSizeSelect from '../ChapterSegmentSizeSelect'

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

type StatusFilter = 'all' | 'outline-only' | 'writing-only'

interface Props {
  volumes: OutlineVolumeItem[]
  activeSelection: string | null
  segmentSize: ChapterSegmentSize
  onSegmentSizeChange: (value: ChapterSegmentSize) => void
  onOpen: (selection: OutlineOpenSelection) => void
  onCreateVolume: () => void
  onCreateVolumeOutline: (volume: string) => void
  onCreateChapter: (volume: string) => void
  onCreateOutlineForChapter: (ref: ChapterRef) => void
  onStartWriting: (ref: ChapterRef) => void
  onDeleteVolume: (volume: string) => void
  onDeleteChapter: (ref: ChapterRef) => void
}

function stateLabel(chapter: OutlineChapterItem): string {
  return chapter.hasWriting && chapter.hasOutline ? '正文·细纲' : chapter.hasWriting ? '只有正文' : '只有细纲'
}

export default function OutlineSidebar({
  volumes,
  activeSelection,
  segmentSize,
  onSegmentSizeChange,
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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [collapsedSegments, setCollapsedSegments] = useState<Record<string, boolean>>({})
  const [jumpVolume, setJumpVolume] = useState('')
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const activeChapterKey = activeSelection?.startsWith('chapter:') ? activeSelection.slice('chapter:'.length) : null

  const visibleVolumes = useMemo(() => volumes.map((item) => {
    const volumeMatches = item.volume.toLocaleLowerCase().includes(normalizedQuery)
    const chapters = item.chapters.filter((chapter) => {
      const order = chapterOrder(chapter.ref.chapterId)
      const matchesQuery = !normalizedQuery || volumeMatches || `${chapter.ref.chapterId} ${order} 第${order}章`.toLocaleLowerCase().includes(normalizedQuery)
      const matchesStatus = statusFilter === 'all'
        || (statusFilter === 'outline-only' && chapter.hasOutline && !chapter.hasWriting)
        || (statusFilter === 'writing-only' && chapter.hasWriting && !chapter.hasOutline)
      return matchesQuery && matchesStatus
    })
    return { ...item, chapters }
  }).filter((item) => item.chapters.length > 0 || (!normalizedQuery && statusFilter === 'all')), [normalizedQuery, statusFilter, volumes])

  useEffect(() => {
    if (!activeChapterKey) return
    const timer = window.setTimeout(() => document.querySelector<HTMLElement>(`[data-outline-chapter-key="${CSS.escape(activeChapterKey)}"]`)?.scrollIntoView({ block: 'nearest' }), 0)
    return () => window.clearTimeout(timer)
  }, [activeChapterKey, normalizedQuery, statusFilter])

  const openChapter = (chapter: OutlineChapterItem) => {
    setCollapsed((previous) => ({ ...previous, [chapter.ref.volume]: false }))
    setCollapsedSegments((previous) => ({ ...previous, [`${chapter.ref.volume}:${Math.floor((chapterOrder(chapter.ref.chapterId) - 1) / segmentSize)}`]: false }))
    if (chapter.hasOutline) onOpen({ type: 'chapter', ref: chapter.ref })
  }

  const handleSegmentSizeChange = (value: ChapterSegmentSize) => {
    onSegmentSizeChange(value)
    setCollapsedSegments({})
  }

  return <div className="panel-sidebar">
    <div className="panel-sidebar-header"><h3>大纲</h3><Button variant="primary" size="xs" onClick={onCreateVolume} title="新建规划卷">+</Button></div>
    <div className="panel-search"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索卷或章节位置" aria-label="搜索卷或章节位置" /></div>
    <div className="outline-navigation-controls">
      <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} aria-label="筛选章节状态"><option value="all">全部状态</option><option value="outline-only">只有细纲</option><option value="writing-only">只有正文</option></select>
      <select value={jumpVolume} onChange={(event) => setJumpVolume(event.target.value)} aria-label="选择卷"><option value="">跳转到卷…</option>{volumes.map((item) => <option key={item.volume} value={item.volume}>{item.volume}</option>)}</select>
      <select value="" disabled={!jumpVolume} onChange={(event) => {
        const target = volumes.find((item) => item.volume === jumpVolume)?.chapters.find((chapter) => chapterRefKey(chapter.ref) === event.target.value)
        if (target) openChapter(target)
      }} aria-label="选择章节"><option value="">跳转到章节…</option>{jumpVolume && volumes.find((item) => item.volume === jumpVolume)?.chapters.map((chapter) => <option key={chapterRefKey(chapter.ref)} value={chapterRefKey(chapter.ref)}>第{chapterOrder(chapter.ref.chapterId)}章</option>)}</select>
      <ChapterSegmentSizeSelect value={segmentSize} onChange={handleSegmentSizeChange} />
    </div>
    <div className="panel-list">
      <button className={`panel-item${activeSelection === 'outline' ? ' active' : ''}`} onClick={() => onOpen({ type: 'outline' })}>📋 总纲</button>
      {visibleVolumes.map((item) => {
        const volumeSelection = `volume:${item.volume}`
        const activeInVolume = activeSelection === volumeSelection || activeChapterKey?.startsWith(`${item.volume}:`)
        const isCollapsed = normalizedQuery || statusFilter !== 'all' ? false : (collapsed[item.volume] ?? !activeInVolume)
        const segments = Array.from({ length: Math.ceil(item.chapters.length / segmentSize) }, (_, index) => ({
          key: `${item.volume}:${index}`,
          chapters: item.chapters.slice(index * segmentSize, (index + 1) * segmentSize),
        }))
        return <div key={item.volume}>
          <div className={`panel-item outline-volume-row${activeSelection === volumeSelection ? ' active' : ''}`}>
            <Button className="outline-volume-toggle" variant="ghost" size="xs" onClick={() => setCollapsed((previous) => ({ ...previous, [item.volume]: !isCollapsed }))} title={isCollapsed ? '展开卷' : '折叠卷'}>{isCollapsed ? '▶' : '▼'}</Button>
            <button className="panel-item-main" onClick={() => onOpen({ type: 'volume', volume: item.volume })}>📖 {item.volume}</button>
            <span className="panel-item-status">{item.chapters.filter((chapter) => chapter.hasWriting && chapter.hasOutline).length}/{item.chapters.length}</span>
            {!item.hasVolumeOutline && <Button variant="ghost" size="xs" onClick={() => onCreateVolumeOutline(item.volume)} title="创建分卷纲">＋</Button>}
            <Button className="outline-add-chapter" variant="ghost" size="xs" onClick={() => onCreateChapter(item.volume)} title="添加章节细纲">＋章</Button>
            {item.hasVolumeOutline && <Button variant="danger" size="xs" onClick={() => onDeleteVolume(item.volume)} title="删除分卷纲">✕</Button>}
          </div>
          {!isCollapsed && (item.chapters.length <= segmentSize ? item.chapters.map((chapter) => <OutlineChapterRow key={chapterRefKey(chapter.ref)} chapter={chapter} active={activeChapterKey === chapterRefKey(chapter.ref)} onOpen={openChapter} onCreateOutline={onCreateOutlineForChapter} onStartWriting={onStartWriting} onDelete={onDeleteChapter} />) : segments.map((segment) => {
            const containsActive = segment.chapters.some((chapter) => chapterRefKey(chapter.ref) === activeChapterKey)
            const segmentCollapsed = normalizedQuery || statusFilter !== 'all' ? false : (collapsedSegments[segment.key] ?? !containsActive)
            const first = chapterOrder(segment.chapters[0]?.ref.chapterId ?? '')
            const last = chapterOrder(segment.chapters.at(-1)?.ref.chapterId ?? '')
            return <div key={segment.key} className="outline-segment"><button className="outline-segment-header" onClick={() => setCollapsedSegments((previous) => ({ ...previous, [segment.key]: !segmentCollapsed }))}>{segmentCollapsed ? '▶' : '▼'} 第 {first}–{last} 章</button>{!segmentCollapsed && segment.chapters.map((chapter) => <OutlineChapterRow key={chapterRefKey(chapter.ref)} chapter={chapter} active={activeChapterKey === chapterRefKey(chapter.ref)} onOpen={openChapter} onCreateOutline={onCreateOutlineForChapter} onStartWriting={onStartWriting} onDelete={onDeleteChapter} />)}</div>
          }))}
        </div>
      })}
      {visibleVolumes.length === 0 && <p className="panel-empty">没有匹配的位置</p>}
    </div>
  </div>
}

function OutlineChapterRow({ chapter, active, onOpen, onCreateOutline, onStartWriting, onDelete }: {
  chapter: OutlineChapterItem
  active: boolean
  onOpen: (chapter: OutlineChapterItem) => void
  onCreateOutline: (ref: ChapterRef) => void
  onStartWriting: (ref: ChapterRef) => void
  onDelete: (ref: ChapterRef) => void
}) {
  const key = chapterRefKey(chapter.ref)
  return <div data-outline-chapter-key={key} className={`panel-sub-item-row${active ? ' active' : ''}`}>
    <button className={`panel-sub-item${active ? ' active' : ''}`} onClick={() => onOpen(chapter)} disabled={!chapter.hasOutline}><span className="outline-chapter-label">📝 第{chapterOrder(chapter.ref.chapterId)}章</span>{chapter.hasWriting && <span className="outline-state">{stateLabel(chapter)}</span>}</button>
    <span className="panel-sub-actions">
      {!chapter.hasOutline && <Button variant="ghost" size="xs" onClick={() => onCreateOutline(chapter.ref)} title="从正文创建细纲">建纲</Button>}
      {!chapter.hasWriting && <Button variant="ghost" size="xs" onClick={() => onStartWriting(chapter.ref)} title="从细纲开始写作">写作</Button>}
      {chapter.hasOutline && <Button variant="danger" size="xs" onClick={() => onDelete(chapter.ref)} title="删除章节细纲">✕</Button>}
    </span>
  </div>
}
