import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { ChapterKey, ChapterRef } from '../types/chapter'
import type { ConsistencyCheckResult, ConsistencyIssue, ReviewIssue } from '../types/review'
import { getChapterContent } from '../api/tauri'
import { runConsistencyChecks } from '../services/consistencyCheck'
import { runAndSaveLightCheck } from '../services/reviewLightService'
import { loadChapterReviewDetails, loadChapterReviews, type ChapterReviewData } from '../services/reviewReportStorage'
import { loadReviewRules } from '../services/reviewRules'
import { chapterRefKey } from '../services/chapterDisplay'
import type { ChapterSegmentSize } from '../hooks/useChapterSegmentSize'
import Button from './Button'
import ChapterSegmentSizeSelect from './ChapterSegmentSizeSelect'
import './ReviewPanel.css'

const ReviewRulesEditor = lazy(() => import('./ReviewRulesEditor'))

interface Props {
  projectId: string
  segmentSize: ChapterSegmentSize
  onSegmentSizeChange: (value: ChapterSegmentSize) => void
  currentChapterRef: ChapterRef | null
  chapterHtml?: string
  onNavigateToForeshadow?: (id: string) => void
}

type AnyIssue = ReviewIssue | ConsistencyIssue
type ReviewFilter = 'all' | 'issues' | 'reviewed' | 'unreviewed'
type TreeRow =
  | { kind: 'volume'; volume: string; label: string; total: number; reviewed: number; collapsed: boolean }
  | { kind: 'segment'; volume: string; startOrder: number; endOrder: number; collapsed: boolean }
  | { kind: 'chapter'; chapter: ChapterReviewData }

const isConsistencyIssue = (issue: AnyIssue): issue is ConsistencyIssue => 'type' in issue
const issueSeverity = (issue: AnyIssue) => isConsistencyIssue(issue) ? issue.severity : issue.severity
const issueDesc = (issue: AnyIssue) => isConsistencyIssue(issue) ? issue.description : issue.desc
const issueSuggestion = (issue: AnyIssue) => isConsistencyIssue(issue) ? issue.suggestion : issue.suggestion
const severityColor = (severity: string) => severity === 'error' || severity === 'S1' || severity === 'S2' ? '#e74c3c' : severity === 'warning' || severity === 'S3' ? '#e67e22' : '#888'

export default function ReviewPanel({ projectId, segmentSize, onSegmentSizeChange, currentChapterRef, chapterHtml = '', onNavigateToForeshadow }: Props) {
  const [chapters, setChapters] = useState<ChapterReviewData[]>([])
  const [expandedKey, setExpandedKey] = useState<ChapterKey | null>(null)
  const [runningReview, setRunningReview] = useState(false)
  const [runningConsistency, setRunningConsistency] = useState(false)
  const [consistencyResult, setConsistencyResult] = useState<ConsistencyCheckResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showRulesEditor, setShowRulesEditor] = useState(false)
  const [collapsedVolumes, setCollapsedVolumes] = useState<Record<string, boolean>>({})
  const [collapsedSegments, setCollapsedSegments] = useState<Record<string, boolean>>({})
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ReviewFilter>('all')
  const [jumpVolume, setJumpVolume] = useState('')
  const [loadingDetails, setLoadingDetails] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const normalizedQuery = query.trim().toLocaleLowerCase()

  const refresh = useCallback(async () => setChapters(await loadChapterReviews(projectId)), [projectId])
  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh().catch(console.error) }, 0)
    return () => window.clearTimeout(timer)
  }, [refresh])
  useEffect(() => {
    if (!currentChapterRef) return
    const timer = window.setTimeout(() => {
      const key = chapterRefKey(currentChapterRef)
      setExpandedKey(key)
      setCollapsedVolumes((previous) => ({ ...previous, [currentChapterRef.volume]: false }))
      setCollapsedSegments((previous) => ({ ...previous, [`${currentChapterRef.volume}:${Math.floor((Number(currentChapterRef.chapterId.replace(/^ch/i, '')) - 1) / segmentSize)}`]: false }))
    }, 0)
    return () => window.clearTimeout(timer)
  }, [currentChapterRef, segmentSize])

  const activeChapter = chapters.find((chapter) => chapter.key === expandedKey) ?? null
  const selectChapter = async (chapter: ChapterReviewData) => {
    if (expandedKey === chapter.key) { setExpandedKey(null); setConsistencyResult(null); return }
    setExpandedKey(chapter.key)
    setConsistencyResult(null)
    setCollapsedVolumes((previous) => ({ ...previous, [chapter.ref.volume]: false }))
    setCollapsedSegments((previous) => ({ ...previous, [`${chapter.ref.volume}:${Math.floor((chapter.chapterOrder - 1) / segmentSize)}`]: false }))
    if (!chapter.hasReports || chapter.lightCheck || chapter.deepReviews.length > 0) return
    setLoadingDetails(true)
    try {
      const detail = await loadChapterReviewDetails(projectId, chapter)
      setChapters((current) => current.map((item) => item.key === detail.key ? detail : item))
    } catch (reason) { setError(String(reason)) } finally { setLoadingDetails(false) }
  }
  const resolveChapterHtml = useCallback(async () => {
    if (!activeChapter) return null
    if (currentChapterRef && chapterRefKey(currentChapterRef) === activeChapter.key && chapterHtml) return chapterHtml
    return getChapterContent(projectId, activeChapter.ref.volume, activeChapter.ref.chapterId).catch(() => null)
  }, [activeChapter, chapterHtml, currentChapterRef, projectId])

  const handleLightCheck = async () => {
    if (!activeChapter) return
    const html = await resolveChapterHtml()
    if (!html) return
    setRunningReview(true); setError(null)
    try {
      await runAndSaveLightCheck(projectId, activeChapter.ref, html)
      const summaries = await loadChapterReviews(projectId)
      const summary = summaries.find((chapter) => chapter.key === activeChapter.key)
      const detail = summary ? await loadChapterReviewDetails(projectId, summary) : activeChapter
      setChapters(summaries.map((chapter) => chapter.key === detail.key ? detail : chapter))
    } catch (reason) { setError(String(reason)) } finally { setRunningReview(false) }
  }
  const handleDeepReview = async () => {
    if (!activeChapter) return
    const html = await resolveChapterHtml()
    if (!html) return
    setRunningReview(true); setError(null)
    try {
      const currentRules = await loadReviewRules(projectId)
      const { runDeepReview } = await import('../services/reviewDeepService')
      await runDeepReview(projectId, activeChapter.ref, html, currentRules.reviewDimensions)
      const summaries = await loadChapterReviews(projectId)
      const summary = summaries.find((chapter) => chapter.key === activeChapter.key)
      const detail = summary ? await loadChapterReviewDetails(projectId, summary) : activeChapter
      setChapters(summaries.map((chapter) => chapter.key === detail.key ? detail : chapter))
    } catch (reason) { setError(String(reason)) } finally { setRunningReview(false) }
  }
  const handleConsistency = async () => {
    if (!activeChapter) return
    const html = await resolveChapterHtml()
    if (!html) return
    setRunningConsistency(true); setError(null)
    try {
      const currentRules = await loadReviewRules(projectId)
      const tokens = html.replace(/<[^>]*>/g, '').match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]{2,4}/g) ?? []
      setConsistencyResult(await runConsistencyChecks(projectId, activeChapter.ref, tokens, currentRules.consistency))
    } catch (reason) { setError(String(reason)) } finally { setRunningConsistency(false) }
  }

  const treeRows = useMemo<TreeRow[]>(() => {
    const groups = new Map<string, ChapterReviewData[]>()
    for (const chapter of chapters) {
      const matchesQuery = !normalizedQuery || `${chapter.volumeLabel} ${chapter.chapterLabel} ${chapter.ref.chapterId} ${chapter.chapterOrder}`.toLocaleLowerCase().includes(normalizedQuery)
      const matchesFilter = filter === 'all' || (filter === 'issues' && chapter.totalIssues > 0) || (filter === 'reviewed' && chapter.hasReports) || (filter === 'unreviewed' && !chapter.hasReports)
      if (matchesQuery && matchesFilter) groups.set(chapter.ref.volume, [...(groups.get(chapter.ref.volume) ?? []), chapter])
    }
    const rows: TreeRow[] = []
    for (const [volume, entries] of groups) {
      const activeInVolume = expandedKey?.startsWith(`${volume}:`) ?? false
      const collapsed = normalizedQuery || filter !== 'all' ? false : (collapsedVolumes[volume] ?? !activeInVolume)
      const reviewed = entries.filter((entry) => entry.hasReports).length
      rows.push({ kind: 'volume', volume, label: entries[0]?.volumeLabel ?? volume, total: entries.length, reviewed, collapsed })
      if (collapsed) continue
      if (entries.length <= segmentSize) {
        rows.push(...entries.map((chapter) => ({ kind: 'chapter' as const, chapter })))
        continue
      }
      for (let index = 0; index < entries.length; index += segmentSize) {
        const segmentEntries = entries.slice(index, index + segmentSize)
        const startOrder = segmentEntries[0]?.chapterOrder ?? 0
        const endOrder = segmentEntries.at(-1)?.chapterOrder ?? 0
        const key = `${volume}:${Math.floor((startOrder - 1) / segmentSize)}`
        const containsActive = segmentEntries.some((chapter) => chapter.key === expandedKey)
        const segmentCollapsed = normalizedQuery || filter !== 'all' ? false : (collapsedSegments[key] ?? !containsActive)
        rows.push({ kind: 'segment', volume, startOrder, endOrder, collapsed: segmentCollapsed })
        if (!segmentCollapsed) rows.push(...segmentEntries.map((chapter) => ({ kind: 'chapter' as const, chapter })))
      }
    }
    return rows
  }, [chapters, collapsedSegments, collapsedVolumes, expandedKey, filter, normalizedQuery, segmentSize])

  // TanStack Virtual returns a mutable controller; it remains local to this fixed-row tree.
  // eslint-disable-next-line react-hooks/incompatible-library -- React Compiler cannot memoize TanStack's controller API.
  const rowVirtualizer = useVirtualizer({
    count: treeRows.length,
    getScrollElement: () => listRef.current,
    estimateSize: (index) => treeRows[index]?.kind === 'chapter' ? 32 : 36,
    getItemKey: (index) => {
      const row = treeRows[index]
      return row?.kind === 'chapter' ? `chapter:${row.chapter.key}` : row?.kind === 'segment' ? `segment:${row.volume}:${row.startOrder}` : `volume:${row?.volume ?? index}`
    },
    overscan: 8,
  })

  useEffect(() => {
    if (!expandedKey) return
    const targetIndex = treeRows.findIndex((row) => row.kind === 'chapter' && row.chapter.key === expandedKey)
    if (targetIndex >= 0) rowVirtualizer.scrollToIndex(targetIndex, { align: 'auto' })
  }, [expandedKey, rowVirtualizer, treeRows])

  const noSelection = !activeChapter
  const reviewVolumes = [...new Map(chapters.map((chapter) => [chapter.ref.volume, chapter.volumeLabel])).entries()]
  const handleSegmentSizeChange = (value: ChapterSegmentSize) => {
    onSegmentSizeChange(value)
    setCollapsedSegments({})
  }
  return <div className="review-panel panel-layout">
    <div className="panel-sidebar review-sidebar">
      <div className="review-sidebar-header"><h3>审查报告</h3><Button variant="ghost" size="sm" onClick={() => setShowRulesEditor(true)} title="审查规则配置">⚙</Button></div>
      <div className="review-navigation-controls"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索卷、章号或标题" aria-label="搜索审查章节" /><select value={filter} onChange={(event) => setFilter(event.target.value as ReviewFilter)} aria-label="筛选审查状态"><option value="all">全部</option><option value="issues">有问题</option><option value="unreviewed">未审查</option><option value="reviewed">已审查</option></select><select value={jumpVolume} onChange={(event) => setJumpVolume(event.target.value)} aria-label="选择审查卷"><option value="">跳转到卷…</option>{reviewVolumes.map(([volume, label]) => <option key={volume} value={volume}>{label}</option>)}</select><select value="" disabled={!jumpVolume} onChange={(event) => { const target = chapters.find((chapter) => chapter.key === event.target.value); if (target) void selectChapter(target) }} aria-label="选择审查章节"><option value="">跳转到章节…</option>{jumpVolume && chapters.filter((chapter) => chapter.ref.volume === jumpVolume).map((chapter) => <option key={chapter.key} value={chapter.key}>{chapter.chapterLabel}</option>)}</select><ChapterSegmentSizeSelect value={segmentSize} onChange={handleSegmentSizeChange} /></div>
      <div className="review-actions-panel">
        <Button variant="primary" size="md" onClick={() => { void handleLightCheck() }} disabled={runningReview || noSelection} style={{ width: '100%', marginBottom: 6 }}>{runningReview ? '检查中…' : '⚡ 轻量检查'}</Button>
        <Button variant="primary" size="md" onClick={() => { void handleDeepReview() }} disabled={runningReview || noSelection} style={{ width: '100%', marginBottom: 6 }}>{runningReview ? '审查中…' : '🔍 AI 深度审查'}</Button>
        <Button variant="secondary" size="md" onClick={() => { void handleConsistency() }} disabled={runningConsistency || noSelection} style={{ width: '100%' }}>{runningConsistency ? '检查中…' : '🔗 一致性检查'}</Button>
      </div>
      {error && <div className="error-bar">{error}</div>}
      <div ref={listRef} className="review-report-list">
        {treeRows.length === 0 && <p className="review-empty">暂无匹配章节；写作后将在此显示章节目录。</p>}
        <div className="review-virtual-spacer" style={{ height: rowVirtualizer.getTotalSize() }}>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const row = treeRows[virtualRow.index]
            if (!row) return null
            const style = { height: virtualRow.size, transform: `translateY(${virtualRow.start}px)` }
            if (row.kind === 'volume') return <button key={virtualRow.key} className="review-volume-row review-virtual-row" style={style} onClick={() => setCollapsedVolumes((previous) => ({ ...previous, [row.volume]: !row.collapsed }))}>{row.collapsed ? '▶' : '▼'} <span>{row.label}</span><span>{row.reviewed}/{row.total} 已生成</span></button>
            if (row.kind === 'segment') return <button key={virtualRow.key} className="review-segment-row review-virtual-row" style={style} onClick={() => setCollapsedSegments((previous) => ({ ...previous, [`${row.volume}:${Math.floor((row.startOrder - 1) / segmentSize)}`]: !row.collapsed }))}>{row.collapsed ? '▶' : '▼'} 第 {row.startOrder}–{row.endOrder} 章</button>
            const chapter = row.chapter
            const issueText = chapter.totalIssues > 0 ? `${chapter.totalIssues} 个问题` : chapter.hasReports ? '已审查' : '未审查'
            return <button key={virtualRow.key} className={`review-chapter-row review-virtual-row${expandedKey === chapter.key ? ' active' : ''}`} style={style} onClick={() => { void selectChapter(chapter) }}><span>{chapter.chapterLabel}</span><span className="review-issue-count" style={{ background: chapter.totalIssues > 0 ? '#e74c3c' : chapter.hasReports ? '#27ae60' : '#888' }}>{issueText}</span></button>
          })}
        </div>
      </div>
    </div>
    <div className="panel-editor review-content">
      {!activeChapter ? <div className="review-empty">选择左侧正文章节开始审查。</div> : <div><h3 style={{ margin: '0 0 16px' }}>{activeChapter.volumeLabel} / {activeChapter.chapterLabel}</h3>{loadingDetails && <p className="review-empty">加载审查详情…</p>}{!loadingDetails && !activeChapter.lightCheck && activeChapter.deepReviews.length === 0 && <p className="review-empty">该章节尚未审查。</p>}
        {activeChapter.lightCheck && <section><h4>轻量检查</h4>{groupLightIssues(activeChapter.lightCheck.checks.flatMap((check) => check.issues)).map((issue, index) => <IssueRow key={index} issue={issue} />)}</section>}
        {activeChapter.deepReviews[0] && <section><h4>AI 深度审查 · {activeChapter.deepReviews[0].overall_score}/10</h4>{activeChapter.deepReviews[0].dimensions.flatMap((dimension) => dimension.issues).map((issue, index) => <IssueRow key={index} issue={issue} />)}{activeChapter.deepReviews[0].suggestions.map((suggestion) => <p key={suggestion}>• {suggestion}</p>)}</section>}
        {consistencyResult && <section><h4>一致性检查 · {consistencyResult.summary.total} 个问题</h4>{consistencyResult.issues.map((issue) => <div key={issue.id}><IssueRow issue={issue} />{issue.foreshadowId && onNavigateToForeshadow && <button onClick={() => onNavigateToForeshadow(issue.foreshadowId!)}>→ 查看伏笔</button>}</div>)}</section>}
      </div>}
    </div>
    {showRulesEditor && <Suspense fallback={null}><ReviewRulesEditor projectId={projectId} onClose={() => setShowRulesEditor(false)} onSaved={() => {}} /></Suspense>}
  </div>
}

function groupLightIssues(issues: ReviewIssue[]): ReviewIssue[] {
  const grouped = new Map<string, ReviewIssue>()
  for (const issue of issues) {
    if (issue.checkType !== 'banned_words') {
      grouped.set(`${grouped.size}:${issue.desc}`, issue)
      continue
    }
    const key = issue.desc.replace(/（命中 \d+ 处）$/, '')
    const current = grouped.get(key)
    const locations = issue.locations ?? (issue.location ? [{ line: issue.location.line, offset: issue.location.offset, context: '' }] : [])
    if (!current) {
      grouped.set(key, { ...issue, locations })
      continue
    }
    const mergedLocations = [...(current.locations ?? []), ...locations]
    grouped.set(key, {
      ...current,
      desc: mergedLocations.length > 1 ? `${key}（命中 ${mergedLocations.length} 处）` : key,
      location: current.location ?? issue.location,
      locations: mergedLocations,
    })
  }
  return [...grouped.values()]
}

function IssueRow({ issue }: { issue: AnyIssue }) {
  const severity = issueSeverity(issue)
  const locations = !isConsistencyIssue(issue) ? issue.locations ?? [] : []
  const snippets = locations.filter((location) => location.context.trim().length > 0)
  return <div style={{ padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '0.84rem' }}>
    <div><span style={{ color: '#fff', background: severityColor(severity), borderRadius: 3, padding: '1px 6px', marginRight: 6 }}>{severity}</span>{issueDesc(issue)}</div>
    {snippets.length > 0 && <div className="review-issue-locations">{snippets.map((location, index) => <span className="review-issue-location" key={`${location.line}:${location.offset}:${index}`}>“{location.context}”</span>)}</div>}
    {issueSuggestion(issue) && <div style={{ color: 'var(--text-muted)', paddingLeft: 4 }}>→ {issueSuggestion(issue)}</div>}
  </div>
}
