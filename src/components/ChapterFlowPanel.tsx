import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import Pagination from './Pagination'
import Modal from './Modal'
import Button from './Button'
import ChapterSegmentSizeSelect from './ChapterSegmentSizeSelect'
import ChapterFlowDetailDrawer from './ChapterFlowDetailDrawer'
import ChapterFlowAnalysisDialog from './ChapterFlowAnalysisDialog'
import {
  loadChapterFlowView,
  type ChapterFlowEntry,
  type ChapterFlowVolume,
  type ChapterFlowView,
  type ForeshadowExecutionState,
} from '../services/chapterFlowService'
import { initializeNewForeshadows } from '../services/foreshadowStorage'
import { chapterRefKey } from '../services/chapterDisplay'
import { scanChapterContentChanges } from '../services/chapterFlowSaveCoordinator'
import { recoverChapterFlowIndex, type ChapterAnalysisStatus } from '../services/chapterFlowIndexStorage'
import { runChapterFlowAnalysis, type ChapterFlowAnalysisProgress, type ChapterFlowAnalysisResult } from '../services/chapterFlowAnalysis'
import type { ChapterSegmentSize } from '../hooks/useChapterSegmentSize'
import type { ChapterKey } from '../types/chapter'
import './ChapterFlowPanel.css'

interface Props {
  projectId: string
  segmentSize: ChapterSegmentSize
  onSegmentSizeChange: (value: ChapterSegmentSize) => void
  onNavigateToChapter: (ref: string) => void
  onNavigateToForeshadow: (id: string) => void
}

type Filter = 'all' | 'normal' | 'overdue' | 'late' | 'review' | 'abandoned'
const FILTER_LABELS: Record<Filter, string> = {
  all: '全部', normal: '正常', overdue: '逾期', late: '延迟', review: '待核对', abandoned: '已废弃',
}
const STATE_LABELS: Record<ForeshadowExecutionState, string> = {
  abandoned: '已废弃', unplanned: '未计划', pending: '待执行', 'on-schedule': '按计划', early: '提前',
  late: '延迟', overdue: '逾期', 'record-incomplete': '记录不完整', 'invalid-reference': '无效引用',
}
const ANALYSIS_LABELS: Record<ChapterAnalysisStatus, string> = {
  missing: '未分析', stale: '已过期', ready: '已分析', failed: '分析失败',
}
type TimelineRow =
  | { kind: 'volume'; volume: string; label: string; key: string }
  | { kind: 'segment'; volume: string; label: string; collapsed: boolean; key: string }
  | ({ kind: 'chapter'; key: ChapterKey } & ChapterFlowVolume['chapters'][number])
  | ({ kind: 'planned'; key: string } & ChapterFlowVolume['plannedPositions'][number])

function isNormal(entry: ChapterFlowEntry): boolean {
  return entry.check.state === 'pending' || entry.check.state === 'on-schedule'
    || entry.check.state === 'early' || entry.check.state === 'unplanned'
}

function matchesFilter(entry: ChapterFlowEntry, filter: Filter): boolean {
  if (filter === 'all') return true
  if (filter === 'normal') return isNormal(entry)
  if (filter === 'overdue') return entry.check.state === 'overdue'
  if (filter === 'late') return entry.check.state === 'late'
  if (filter === 'review') return entry.check.state === 'invalid-reference' || entry.check.state === 'record-incomplete' || entry.check.aiState === 'needs-review'
  return entry.check.state === 'abandoned'
}

export default function ChapterFlowPanel({ projectId, segmentSize, onSegmentSizeChange, onNavigateToChapter, onNavigateToForeshadow }: Props) {
  const [view, setView] = useState<ChapterFlowView | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [volumeFilter, setVolumeFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [resetOpen, setResetOpen] = useState(false)
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null)
  const [chapterQuery, setChapterQuery] = useState('')
  const [jumpVolume, setJumpVolume] = useState('')
  const [collapsedSegments, setCollapsedSegments] = useState<Record<string, boolean>>({})
  const [scanProgress, setScanProgress] = useState<{ completed: number; total: number } | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [analysisOpen, setAnalysisOpen] = useState(false)
  const [analysisProgress, setAnalysisProgress] = useState<ChapterFlowAnalysisProgress | null>(null)
  const [analysisResult, setAnalysisResult] = useState<ChapterFlowAnalysisResult | null>(null)
  const [analysisRunning, setAnalysisRunning] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const scanController = useRef<AbortController | null>(null)
  const analysisController = useRef<AbortController | null>(null)
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingScrollKey = useRef<string | null>(null)

  const showFeedback = useCallback((message: string) => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current)
    setFeedback(message)
    feedbackTimer.current = setTimeout(() => {
      setFeedback(null)
      feedbackTimer.current = null
    }, 4_000)
  }, [])

  const refresh = useCallback(async (recoverIndex = false) => {
    setLoading(true)
    setError(null)
    try {
      if (recoverIndex) await recoverChapterFlowIndex(projectId)
      setView(await loadChapterFlowView(projectId))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setView(null)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { void refresh(false) }, [refresh])
  useEffect(() => () => {
    scanController.current?.abort()
    analysisController.current?.abort()
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current)
  }, [])

  const filtered = useMemo(() => {
    if (!view) return []
    return view.checks.filter((entry) => matchesFilter(entry, filter))
      .filter((entry) => volumeFilter === 'all' || entry.entry.plantedChapter.volume === volumeFilter)
  }, [filter, view, volumeFilter])
  const pageSize = 12
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize)
  const volumeRows = useMemo<TimelineRow[]>(() => {
    if (!view) return []
    const query = chapterQuery.trim().toLocaleLowerCase()
    return view.volumes
      .filter((volume) => volumeFilter === 'all' || volume.volume === volumeFilter)
      .flatMap((volume) => {
        const chapters = volume.chapters.filter((chapter) => !query || `${chapter.label} ${chapter.meta.id}`.toLocaleLowerCase().includes(query))
        const planned = volume.plannedPositions.filter((position) => !query || `${position.ref.chapterId} ${position.entries.map((item) => item.entry.name).join(' ')}`.toLocaleLowerCase().includes(query))
        if (query && chapters.length === 0 && planned.length === 0) return []
        const rows: TimelineRow[] = [{ kind: 'volume', volume: volume.volume, label: volume.label, key: `volume:${volume.volume}` }]
        if (chapters.length <= segmentSize) {
          rows.push(...chapters.map((chapter) => ({ kind: 'chapter' as const, ...chapter, key: chapterRefKey(chapter.meta) })))
        } else {
          for (let index = 0; index < chapters.length; index += segmentSize) {
            const segmentChapters = chapters.slice(index, index + segmentSize)
            const segmentKey = `${volume.volume}:${Math.floor(index / segmentSize)}`
            const first = segmentChapters[0]!
            const last = segmentChapters.at(-1)!
            const collapsed = query ? false : (collapsedSegments[segmentKey] ?? true)
            rows.push({ kind: 'segment', volume: volume.volume, label: `第 ${first.meta.order}–${last.meta.order} 章`, collapsed, key: `segment:${segmentKey}` })
            if (!collapsed) rows.push(...segmentChapters.map((chapter) => ({ kind: 'chapter' as const, ...chapter, key: chapterRefKey(chapter.meta) })))
          }
        }
        rows.push(...planned.map((position) => ({ kind: 'planned' as const, ...position, key: `planned:${chapterRefKey(position.ref)}` })))
        return rows
      })
  }, [chapterQuery, collapsedSegments, segmentSize, view, volumeFilter])
  const rowVirtualizer = useVirtualizer({
    count: volumeRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => {
      const kind = volumeRows[index]?.kind
      return kind === 'volume' ? 38 : kind === 'segment' ? 34 : 76
    },
    overscan: 8,
  })
  const selectedRow = volumeRows.find((row) => row.key === selectedChapter && row.kind !== 'volume')
  const selectedRef = selectedRow?.kind === 'chapter'
    ? { volume: selectedRow.meta.volume, chapterId: selectedRow.meta.id }
    : selectedRow?.kind === 'planned' ? selectedRow.ref : null
  const selectedEntries = selectedRef
    ? (view?.checks ?? []).filter(({ entry }) => (
      chapterRefKey(entry.plantedChapter) === chapterRefKey(selectedRef)
      || (entry.plannedResolutionChapter && chapterRefKey(entry.plannedResolutionChapter) === chapterRefKey(selectedRef))
      || (entry.recordedResolutionChapter && chapterRefKey(entry.recordedResolutionChapter) === chapterRefKey(selectedRef))
      || entry.progress.some((progress) => chapterRefKey(progress.chapter) === chapterRefKey(selectedRef))
    ))
    : []
  const analysisStatusByRef = useMemo(() => new Map(
    (view?.analysisItems ?? []).map((item) => [chapterRefKey(item.ref), item.status]),
  ), [view])

  useEffect(() => { setPage(1) }, [filter, volumeFilter])
  useEffect(() => {
    const key = pendingScrollKey.current
    if (!key) return
    const index = volumeRows.findIndex((row) => row.key === key)
    if (index < 0) return
    pendingScrollKey.current = null
    window.setTimeout(() => rowVirtualizer.scrollToIndex(index, { align: key.startsWith('volume:') ? 'start' : 'center' }), 0)
  }, [rowVirtualizer, volumeRows])

  const handleReset = async () => {
    await initializeNewForeshadows(projectId)
    setResetOpen(false)
    await refresh(false)
  }

  const handleScan = async () => {
    if (scanController.current) {
      scanController.current.abort()
      return
    }
    const controller = new AbortController()
    scanController.current = controller
    setScanProgress({ completed: 0, total: 0 })
    try {
      let finalProgress = { completed: 0, total: 0 }
      await scanChapterContentChanges(projectId, controller.signal, (completed, total) => {
        finalProgress = { completed, total }
        setScanProgress(finalProgress)
      })
      await refresh(false)
      showFeedback(controller.signal.aborted
        ? `正文变更检查已取消，已完成 ${finalProgress.completed}/${finalProgress.total} 章。`
        : `正文变更检查完成，已检查 ${finalProgress.completed} 章。`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      scanController.current = null
      setScanProgress(null)
    }
  }

  const handleAnalysis = async (refs: Array<{ volume: string; chapterId: string }>) => {
    const controller = new AbortController()
    analysisController.current = controller
    setAnalysisRunning(true)
    setAnalysisResult(null)
    setAnalysisProgress({ completed: 0, total: refs.length, succeeded: 0, failed: 0 })
    setError(null)
    try {
      const result = await runChapterFlowAnalysis(projectId, refs, controller.signal, setAnalysisProgress)
      setAnalysisResult(result)
      await refresh(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      analysisController.current = null
      setAnalysisRunning(false)
    }
  }

  const handleJumpVolume = (volume: string) => {
    setJumpVolume(volume)
    if (!volume) return
    pendingScrollKey.current = `volume:${volume}`
    setChapterQuery('')
    setVolumeFilter(volume)
  }

  const handleJumpChapter = (key: string) => {
    if (!view || !key) return
    const target = view.volumes.flatMap((volume) => volume.chapters).find((chapter) => chapterRefKey(chapter.meta) === key)
    if (!target) return
    const segmentKey = `${target.meta.volume}:${Math.floor((target.meta.order - 1) / segmentSize)}`
    pendingScrollKey.current = key
    setJumpVolume(target.meta.volume)
    setChapterQuery('')
    setVolumeFilter(target.meta.volume)
    setCollapsedSegments((previous) => ({ ...previous, [segmentKey]: false }))
    setSelectedChapter(key)
  }

  if (loading) return <div className="chapter-flow-empty">加载章节脉络…</div>
  if (error && !view) {
    const canReset = error.includes('伏笔') || error.includes('schema')
    return (
      <div className="chapter-flow-error">
        <p>{error}</p>
        {canReset && <Button variant="danger" size="sm" onClick={() => setResetOpen(true)}>初始化新伏笔数据</Button>}
        {resetOpen && (
          <Modal>
            <h3>初始化新伏笔数据</h3>
            <p>将备份并替换 `memory/foreshadows.json`，同时处理旧伏笔灵感缓存。章节正文、细纲和其他创作数据不会改变。</p>
            <div className="dialog-footer">
              <Button variant="text" size="sm" onClick={() => setResetOpen(false)}>取消</Button>
              <Button variant="danger" size="md" onClick={() => { void handleReset() }}>确认初始化</Button>
            </div>
          </Modal>
        )}
      </div>
    )
  }
  if (!view) return <div className="chapter-flow-empty">暂无章节脉络数据</div>

  return (
    <div className="chapter-flow-panel">
      <div className="chapter-flow-toolbar">
        <strong>章节脉络</strong>
        <select value={volumeFilter} onChange={(event) => {
          setVolumeFilter(event.target.value)
          setJumpVolume(event.target.value === 'all' ? '' : event.target.value)
        }} aria-label="范围">
          <option value="all">全书</option>
          {view.volumes.map((volume) => <option key={volume.volume} value={volume.volume}>{volume.label}</option>)}
        </select>
        <select value={filter} onChange={(event) => setFilter(event.target.value as Filter)} aria-label="状态筛选">
          {(Object.keys(FILTER_LABELS) as Filter[]).map((key) => <option key={key} value={key}>{FILTER_LABELS[key]}</option>)}
        </select>
        <Button variant="text" size="sm" onClick={() => { void refresh(Boolean(view.indexError)) }}>刷新视图</Button>
        <Button variant="text" size="sm" onClick={() => { void handleScan() }}>
          {scanProgress ? `取消检查 (${scanProgress.completed}/${scanProgress.total || '…'})` : '检查正文变更'}
        </Button>
        <Button variant="text" size="sm" onClick={() => { setAnalysisOpen(true) }}>更新 AI 分析</Button>
      </div>
      <div className="chapter-flow-summary">
        <span>按计划 {view.summary['on-schedule']}</span>
        <span>提前 {view.summary.early}</span>
        <span>延迟 {view.summary.late}</span>
        <span>逾期 {view.summary.overdue}</span>
        <span>待核对 {view.summary['invalid-reference'] + view.summary['record-incomplete']}</span>
        <span>AI 待更新 {view.analysisItems.filter((item) => item.status !== 'ready').length}</span>
        {scanProgress && <span>正文检查 {scanProgress.completed}/{scanProgress.total || '…'}</span>}
      </div>
      {feedback && <div className="chapter-flow-feedback" role="status">{feedback}</div>}
      {view.indexError && <div className="chapter-flow-index-error"><span>{view.indexError}。点击“刷新视图”将先备份损坏文件，再重建轻量索引。</span></div>}
      <div className="chapter-flow-main">
        <aside className="chapter-flow-list-pane">
          <div className="chapter-flow-pane-title">伏笔计划与执行</div>
          <div className="chapter-flow-list">
            {paged.length === 0 && <div className="chapter-flow-list-empty">{view.checks.length === 0 ? '暂无伏笔计划。创建伏笔后，这里会自动显示其埋设、推进和回收情况。' : '当前筛选条件下没有伏笔。'}</div>}
            {paged.map(({ entry, check }) => (
              <article key={entry.id} className={`chapter-flow-foreshadow state-${check.state}`}>
                <div className="chapter-flow-entry-title"><strong>{entry.name}</strong><span>{STATE_LABELS[check.state]}</span></div>
                <div>埋设：{entry.plantedChapter.volume} · {entry.plantedChapter.chapterId}</div>
                <div>计划回收：{entry.plannedResolutionChapter ? `${entry.plannedResolutionChapter.volume} · ${entry.plannedResolutionChapter.chapterId}` : '未设置'}</div>
                <div>已记录回收：{entry.recordedResolutionChapter ? `${entry.recordedResolutionChapter.volume} · ${entry.recordedResolutionChapter.chapterId}` : '未记录'}</div>
                <div className="chapter-flow-message">{check.message}</div>
                <div className="chapter-flow-actions">
                  <Button variant="text" size="sm" onClick={() => onNavigateToForeshadow(entry.id)}>打开伏笔</Button>
                  <Button variant="text" size="sm" onClick={() => onNavigateToChapter(chapterRefKey(entry.plantedChapter))}>打开埋设章</Button>
                  {entry.recordedResolutionChapter && <Button variant="text" size="sm" onClick={() => onNavigateToChapter(chapterRefKey(entry.recordedResolutionChapter!))}>打开回收章</Button>}
                </div>
              </article>
            ))}
          </div>
          <Pagination currentPage={page} totalPages={Math.max(1, Math.ceil(filtered.length / pageSize))} totalItems={filtered.length} pageSize={pageSize} onPageChange={setPage} />
        </aside>
        <section className="chapter-flow-timeline-pane">
          <div className="chapter-flow-timeline-title">
            <span>章节时间线 · 共 {view.volumes.reduce((total, volume) => total + volume.chapters.length, 0)} 章</span>
            <div className="chapter-flow-timeline-navigation">
              <input value={chapterQuery} onChange={(event) => {
                setChapterQuery(event.target.value)
                scrollRef.current?.scrollTo({ top: 0 })
              }} placeholder="搜索章节标题或编号" aria-label="搜索章节" />
              <select value={jumpVolume} onChange={(event) => handleJumpVolume(event.target.value)} aria-label="跳转到卷">
                <option value="">跳转到卷…</option>
                {view.volumes.map((volume) => <option key={volume.volume} value={volume.volume}>{volume.label}</option>)}
              </select>
              <select value="" disabled={!jumpVolume} onChange={(event) => handleJumpChapter(event.target.value)} aria-label="跳转到章节">
                <option value="">跳转到章节…</option>
                {jumpVolume && view.volumes.find((volume) => volume.volume === jumpVolume)?.chapters.map((chapter) => <option key={chapterRefKey(chapter.meta)} value={chapterRefKey(chapter.meta)}>{chapter.label}</option>)}
              </select>
              <ChapterSegmentSizeSelect value={segmentSize} onChange={onSegmentSizeChange} />
            </div>
          </div>
          <div ref={scrollRef} className="chapter-flow-timeline-scroll">
            <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const row = volumeRows[virtualRow.index]!
                return (
                  <div key={row.key} className="chapter-flow-virtual-row" style={{ transform: `translateY(${virtualRow.start}px)` }}>
                    {row.kind === 'volume' && <div className="chapter-flow-volume-row">{row.label}</div>}
                    {row.kind === 'segment' && <button type="button" className="chapter-flow-segment-row" onClick={() => setCollapsedSegments((previous) => ({ ...previous, [row.key.slice('segment:'.length)]: !row.collapsed }))}>{row.collapsed ? '▶' : '▼'} {row.label}</button>}
                    {row.kind === 'chapter' && (
                      <button className={`chapter-flow-chapter-card${selectedChapter === row.key ? ' selected' : ''}`} onClick={() => setSelectedChapter(row.key)}>
                        <span className="chapter-flow-marker actual" aria-hidden="true">●</span><span>{row.label}</span><small>第 {row.meta.order} 章 · {row.meta.id}</small><em className={`analysis-${analysisStatusByRef.get(row.key) ?? 'missing'}`}>{ANALYSIS_LABELS[analysisStatusByRef.get(row.key) ?? 'missing']}</em>
                      </button>
                    )}
                    {row.kind === 'planned' && <button className={`chapter-flow-planned-card${selectedChapter === row.key ? ' selected' : ''}`} onClick={() => setSelectedChapter(row.key)}><span className="chapter-flow-marker planned" aria-hidden="true">◇</span><span>计划位置：{row.ref.chapterId}</span><small>{row.entries.map((item) => item.entry.name).join('、')}</small></button>}
                  </div>
                )
              })}
            </div>
          </div>
          {selectedRef && selectedRow && (
            <ChapterFlowDetailDrawer
              key={`${chapterRefKey(selectedRef)}:${analysisStatusByRef.get(chapterRefKey(selectedRef)) ?? 'missing'}`}
              projectId={projectId}
              chapter={selectedRef}
              label={selectedRow.kind === 'chapter' ? selectedRow.label : `计划位置：${selectedRef.chapterId}`}
              exists={selectedRow.kind === 'chapter'}
              entries={selectedEntries}
              analysisStatus={analysisStatusByRef.get(chapterRefKey(selectedRef)) ?? 'missing'}
              onClose={() => setSelectedChapter(null)}
              onNavigateToChapter={onNavigateToChapter}
              onNavigateToForeshadow={onNavigateToForeshadow}
            />
          )}
        </section>
      </div>
      {analysisOpen && (
        <ChapterFlowAnalysisDialog
          chapters={view.volumes.flatMap((volume) => volume.chapters.map((chapter) => chapter.meta))}
          statuses={view.analysisItems}
          selectedRef={selectedRef}
          running={analysisRunning}
          progress={analysisProgress}
          result={analysisResult}
          onStart={(refs) => { void handleAnalysis(refs) }}
          onCancel={() => analysisController.current?.abort()}
          onClose={() => {
            setAnalysisOpen(false)
            setAnalysisProgress(null)
            setAnalysisResult(null)
          }}
        />
      )}
    </div>
  )
}
