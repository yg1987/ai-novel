import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import type { ChapterKey, ChapterRef } from '../types/chapter'
import type { ConsistencyCheckResult, ConsistencyIssue, ReviewIssue } from '../types/review'
import { getChapterContent } from '../api/tauri'
import { runConsistencyChecks } from '../services/consistencyCheck'
import { runAndSaveLightCheck } from '../services/reviewLightService'
import { loadChapterReviewDetails, loadChapterReviews, type ChapterReviewData } from '../services/reviewReportStorage'
import { loadReviewRules } from '../services/reviewRules'
import { chapterRefKey } from '../services/chapterDisplay'
import Button from './Button'
import './ReviewPanel.css'

const ReviewRulesEditor = lazy(() => import('./ReviewRulesEditor'))

interface Props {
  projectId: string
  currentChapterRef: ChapterRef | null
  chapterHtml?: string
  onNavigateToForeshadow?: (id: string) => void
}

type AnyIssue = ReviewIssue | ConsistencyIssue
const isConsistencyIssue = (issue: AnyIssue): issue is ConsistencyIssue => 'type' in issue
const issueSeverity = (issue: AnyIssue) => isConsistencyIssue(issue) ? issue.severity : issue.severity
const issueDesc = (issue: AnyIssue) => isConsistencyIssue(issue) ? issue.description : issue.desc
const issueSuggestion = (issue: AnyIssue) => isConsistencyIssue(issue) ? issue.suggestion : issue.suggestion
const severityColor = (severity: string) => severity === 'error' || severity === 'S1' || severity === 'S2' ? '#e74c3c' : severity === 'warning' || severity === 'S3' ? '#e67e22' : '#888'

export default function ReviewPanel({ projectId, currentChapterRef, chapterHtml = '', onNavigateToForeshadow }: Props) {
  const [chapters, setChapters] = useState<ChapterReviewData[]>([])
  const [expandedKey, setExpandedKey] = useState<ChapterKey | null>(null)
  const [runningReview, setRunningReview] = useState(false)
  const [runningConsistency, setRunningConsistency] = useState(false)
  const [consistencyResult, setConsistencyResult] = useState<ConsistencyCheckResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showRulesEditor, setShowRulesEditor] = useState(false)
  const [collapsedVolumes, setCollapsedVolumes] = useState<Record<string, boolean>>({})
  const [loadingDetails, setLoadingDetails] = useState(false)

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
    }, 0)
    return () => window.clearTimeout(timer)
  }, [currentChapterRef])

  const activeChapter = chapters.find((chapter) => chapter.key === expandedKey) ?? null
  const selectChapter = async (chapter: ChapterReviewData) => {
    if (expandedKey === chapter.key) { setExpandedKey(null); setConsistencyResult(null); return }
    setExpandedKey(chapter.key)
    setConsistencyResult(null)
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
      setConsistencyResult(await runConsistencyChecks(projectId, activeChapter.ref.chapterId, tokens, currentRules.consistency))
    } catch (reason) { setError(String(reason)) } finally { setRunningConsistency(false) }
  }

  const grouped = useMemo(() => {
    const groups = new Map<string, ChapterReviewData[]>()
    for (const chapter of chapters) groups.set(chapter.ref.volume, [...(groups.get(chapter.ref.volume) ?? []), chapter])
    return [...groups.entries()]
  }, [chapters])
  const noSelection = !activeChapter

  return <div className="review-panel panel-layout">
    <div className="panel-sidebar review-sidebar">
      <div className="review-sidebar-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><h3>审查报告</h3><Button variant="ghost" size="sm" onClick={() => setShowRulesEditor(true)} title="审查规则配置">⚙</Button></div>
      <div className="review-actions-panel">
        <Button variant="primary" size="md" onClick={() => { void handleLightCheck() }} disabled={runningReview || noSelection} style={{ width: '100%', marginBottom: 6 }}>{runningReview ? '检查中…' : '⚡ 轻量检查'}</Button>
        <Button variant="primary" size="md" onClick={() => { void handleDeepReview() }} disabled={runningReview || noSelection} style={{ width: '100%', marginBottom: 6 }}>{runningReview ? '审查中…' : '🔍 AI 深度审查'}</Button>
        <Button variant="secondary" size="md" onClick={() => { void handleConsistency() }} disabled={runningConsistency || noSelection} style={{ width: '100%' }}>{runningConsistency ? '检查中…' : '🔗 一致性检查'}</Button>
      </div>
      {error && <div className="error-bar">{error}</div>}
      <div className="review-report-list">
        {grouped.length === 0 && <p className="review-empty">暂无正文；写作后将在此显示章节目录。</p>}
        {grouped.map(([volume, entries]) => {
          const collapsed = collapsedVolumes[volume] ?? false
          return <div key={volume}><button className="review-volume-row" onClick={() => setCollapsedVolumes((previous) => ({ ...previous, [volume]: !collapsed }))}>{collapsed ? '▶' : '▼'} {volume} <span>{entries.length} 章</span></button>{!collapsed && entries.map((chapter) => <button key={chapter.key} className={`review-chapter-row${expandedKey === chapter.key ? ' active' : ''}`} onClick={() => { void selectChapter(chapter) }}><span>{chapter.chapterLabel}</span><span className="review-issue-count" style={{ background: chapter.totalIssues > 0 ? '#e74c3c' : chapter.hasReports ? '#27ae60' : '#888' }}>{chapter.lightCheck || chapter.deepReviews.length ? `${chapter.totalIssues} 个问题` : chapter.hasReports ? '已审查' : '未审查'}</span></button>)}</div>
        })}
      </div>
    </div>
    <div className="panel-editor review-content" style={{ padding: '12px 16px', overflowY: 'auto' }}>
      {!activeChapter ? <div className="review-empty">选择左侧正文章节开始审查。</div> : <div><h3 style={{ margin: '0 0 16px' }}>{activeChapter.chapterLabel}</h3>{loadingDetails && <p className="review-empty">加载审查详情…</p>}{!loadingDetails && !activeChapter.lightCheck && activeChapter.deepReviews.length === 0 && <p className="review-empty">该章节尚未审查。</p>}
        {activeChapter.lightCheck && <section><h4>轻量检查</h4>{activeChapter.lightCheck.checks.flatMap((check) => check.issues).map((issue, index) => <IssueRow key={index} issue={issue} />)}</section>}
        {activeChapter.deepReviews[0] && <section><h4>AI 深度审查 · {activeChapter.deepReviews[0].overall_score}/10</h4>{activeChapter.deepReviews[0].dimensions.flatMap((dimension) => dimension.issues).map((issue, index) => <IssueRow key={index} issue={issue} />)}{activeChapter.deepReviews[0].suggestions.map((suggestion) => <p key={suggestion}>• {suggestion}</p>)}</section>}
        {consistencyResult && <section><h4>一致性检查 · {consistencyResult.summary.total} 个问题</h4>{consistencyResult.issues.map((issue) => <div key={issue.id}><IssueRow issue={issue} />{issue.foreshadowId && onNavigateToForeshadow && <button onClick={() => onNavigateToForeshadow(issue.foreshadowId!)}>→ 查看伏笔</button>}</div>)}</section>}
      </div>}
    </div>
    {showRulesEditor && <Suspense fallback={null}><ReviewRulesEditor projectId={projectId} onClose={() => setShowRulesEditor(false)} onSaved={() => {}} /></Suspense>}
  </div>
}

function IssueRow({ issue }: { issue: AnyIssue }) {
  const severity = issueSeverity(issue)
  return <div style={{ padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '0.84rem' }}><span style={{ color: '#fff', background: severityColor(severity), borderRadius: 3, padding: '1px 6px', marginRight: 6 }}>{severity}</span>{issueDesc(issue)}{issueSuggestion(issue) && <div style={{ color: 'var(--text-muted)', paddingLeft: 4 }}>→ {issueSuggestion(issue)}</div>}</div>
}
