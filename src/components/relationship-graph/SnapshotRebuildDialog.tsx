import { useMemo, useState } from 'react'
import Modal from '../Modal'
import Button from '../Button'
import Pagination from '../Pagination'
import { usePagination } from '../../hooks/usePagination'
import type {
  SnapshotRegenerationRecord,
  SnapshotRegenerationProgress,
  SnapshotRegenerationReport,
  SnapshotRegenerationScope,
} from '../../services/snapshotRegeneration'
import type { ChapterMeta } from '../../types/chapter'

type SnapshotStatusFilter = 'attention' | 'failed' | 'stale' | 'success' | 'all'

function formatRebuildTime(value: string): string {
  const time = new Date(value)
  if (Number.isNaN(time.getTime())) return value
  return time.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function snapshotRecordState(item: SnapshotRegenerationRecord): { label: string; className: string } {
  if (item.status === 'failed') return { label: '失败', className: 'failed' }
  if (item.stale) return { label: '已过期', className: 'stale' }
  return { label: '可用', className: 'success' }
}

function SnapshotReportView({ report }: { report: SnapshotRegenerationReport | null }) {
  const [statusFilter, setStatusFilter] = useState<SnapshotStatusFilter>('attention')
  const [pageSize, setPageSize] = useState(15)
  const attentionCount = report ? report.items.filter((item) => item.status === 'failed' || item.stale).length : 0
  const filteredItems = useMemo(() => {
    if (!report) return []
    if (statusFilter === 'attention') return report.items.filter((item) => item.status === 'failed' || item.stale)
    if (statusFilter === 'stale') return report.items.filter((item) => item.stale)
    if (statusFilter === 'success') return report.items.filter((item) => item.status === 'success' && !item.stale)
    if (statusFilter === 'all') return report.items
    return report.items.filter((item) => item.status === statusFilter)
  }, [report, statusFilter])
  const { paged, page, setPage, totalPages, reset } = usePagination(filteredItems, pageSize)
  const changeFilter = (next: SnapshotStatusFilter) => {
    setStatusFilter(next)
    reset()
  }
  const changePageSize = (next: number) => {
    setPageSize(next)
    reset()
  }

  if (!report) return <p className="review-empty">暂无快照重建记录</p>
  return (
    <div className="graph-rebuild-report">
      <div className="graph-rebuild-summary">
        <span>{report.lastScopeLabel ?? '快照重建状态'}</span>
        <span>{attentionCount} 待处理</span>
        <span>{report.failed} 失败</span>
        <span>{report.stale} 已过期</span>
        <span>{report.success}/{report.total} 可用</span>
      </div>
      <div className="graph-rebuild-report-filters">
        <button className={statusFilter === 'attention' ? 'active' : ''} onClick={() => changeFilter('attention')}>待处理 {attentionCount}</button>
        <button className={statusFilter === 'failed' ? 'active' : ''} onClick={() => changeFilter('failed')}>失败 {report.failed}</button>
        <button className={statusFilter === 'stale' ? 'active' : ''} onClick={() => changeFilter('stale')}>已过期 {report.stale}</button>
        <button className={statusFilter === 'success' ? 'active' : ''} onClick={() => changeFilter('success')}>可用 {report.success}</button>
        <button className={statusFilter === 'all' ? 'active' : ''} onClick={() => changeFilter('all')}>全部 {report.total}</button>
      </div>
      <div className="graph-rebuild-report-list">
        {paged.length === 0 ? <p className="review-empty">当前筛选无记录</p> : paged.map((item) => {
          const state = snapshotRecordState(item)
          return (
            <div key={item.chapterId} className={`graph-rebuild-report-item ${state.className}`}>
              <span>{state.label}：第{item.chapterOrder}章 {item.chapterTitle}</span>
              <small>最近重建：{formatRebuildTime(item.rebuiltAt)} · {item.scopeLabel}</small>
              {item.error && <small>{item.error}</small>}
            </div>
          )
        })}
      </div>
      <Pagination currentPage={page} totalPages={totalPages} totalItems={filteredItems.length} pageSize={pageSize} pageSizeOptions={[15, 30, 50]} onPageChange={setPage} onPageSizeChange={changePageSize} />
    </div>
  )
}

interface Props {
  chapters: ChapterMeta[]
  loadingChapters: boolean
  regenerating: boolean
  progress: SnapshotRegenerationProgress | null
  lastReport: SnapshotRegenerationReport | null
  onClose: () => void
  onStart: (scope: SnapshotRegenerationScope) => void
}

export default function SnapshotRebuildDialog({
  chapters,
  loadingChapters,
  regenerating,
  progress,
  lastReport,
  onClose,
  onStart,
}: Props) {
  const [scopeKind, setScopeKind] = useState<SnapshotRegenerationScope['kind']>('from')
  const [startChapterId, setStartChapterId] = useState('')
  const [endChapterId, setEndChapterId] = useState('')

  const selectedStartChapterId = startChapterId || chapters[0]?.id || ''
  const selectedEndChapterId = endChapterId || chapters[chapters.length - 1]?.id || ''

  const volumes = useMemo(() => [...new Set(chapters.map((chapter) => chapter.volume))].sort(), [chapters])

  const renderChapterSelect = (value: string, onChange: (value: string) => void) => (
    <select value={value} onChange={(event) => onChange(event.target.value)} disabled={regenerating || loadingChapters}>
      {volumes.map((volume) => (
        <optgroup key={volume} label={volume}>
          {chapters
            .filter((chapter) => chapter.volume === volume)
            .sort((a, b) => a.order - b.order)
            .map((chapter) => (
              <option key={chapter.id} value={chapter.id}>
                {chapter.title}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  )

  const buildScope = (): SnapshotRegenerationScope => {
    if (scopeKind === 'all') return { kind: 'all' }
    if (scopeKind === 'single') return { kind: 'single', chapterId: selectedStartChapterId }
    if (scopeKind === 'from') return { kind: 'from', chapterId: selectedStartChapterId }
    return { kind: 'range', startChapterId: selectedStartChapterId, endChapterId: selectedEndChapterId }
  }

  return (
    <Modal className="graph-rebuild-dialog">
      <div className="graph-rebuild-header">
        <h3>AI 快照重建</h3>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={regenerating}>✕</Button>
      </div>
      <div className="modal-scroll-body graph-rebuild-body">
        <p className="graph-rebuild-note">这会调用 AI 重新分析章节并覆盖对应快照。关系图普通刷新不需要执行这个操作。</p>
        <div className="graph-rebuild-options">
          <label>范围</label>
          <select value={scopeKind} onChange={(event) => setScopeKind(event.target.value as SnapshotRegenerationScope['kind'])} disabled={regenerating || loadingChapters}>
            <option value="from">从指定章节开始</option>
            <option value="single">仅单章</option>
            <option value="range">章节范围</option>
            <option value="all">全部章节</option>
          </select>
          {scopeKind !== 'all' && (
            renderChapterSelect(selectedStartChapterId, setStartChapterId)
          )}
          {scopeKind === 'range' && (
            renderChapterSelect(selectedEndChapterId, setEndChapterId)
          )}
        </div>
        {progress && <div className="graph-rebuild-progress">{progress.status === 'running' ? '正在分析' : progress.status === 'success' ? '完成' : '失败'}：{progress.current}/{progress.total} {progress.chapterTitle}{progress.error ? `（${progress.error}）` : ''}</div>}
        <h4>快照重建状态</h4>
        <SnapshotReportView report={lastReport} />
      </div>
      <div className="dialog-footer">
        <Button variant="text" size="sm" onClick={onClose} disabled={regenerating}>关闭</Button>
        <Button variant="primary" size="sm" onClick={() => onStart(buildScope())} disabled={regenerating || loadingChapters || chapters.length === 0}>
          {regenerating ? '重建中…' : '开始重建'}
        </Button>
      </div>
    </Modal>
  )
}
