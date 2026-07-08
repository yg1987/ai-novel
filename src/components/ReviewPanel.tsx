import { useState, useEffect, useCallback } from 'react'
import type { ReviewReportMeta, LightCheckResult, DeepCheckResult, ConsistencyCheckResult } from '../types/review'
import { listReviewReports, getReviewReport, runAndSaveLightCheck, runDeepReview } from '../services/reviewService'
import { runConsistencyChecks } from '../services/consistencyCheck'
import ReviewReportCard from './ReviewReportCard'

interface Props {
  projectId: string
  currentChapterId: string | null
  chapterHtml?: string
}

export default function ReviewPanel({ projectId, currentChapterId, chapterHtml = '' }: Props) {
  const [reports, setReports] = useState<ReviewReportMeta[]>([])
  const [selectedReport, setSelectedReport] = useState<{ type: 'light' | 'full'; filename: string } | null>(null)
  const [reportContent, setReportContent] = useState<string>('')
  const [runningReview, setRunningReview] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [consistencyResult, setConsistencyResult] = useState<ConsistencyCheckResult | null>(null)
  const [runningConsistency, setRunningConsistency] = useState(false)
  const noChapter = !currentChapterId

  const refresh = useCallback(async () => {
    const list = await listReviewReports(projectId)
    setReports(list)
  }, [projectId])

  useEffect(() => { refresh().catch(console.error) }, [refresh])

  const handleSelectReport = async (type: 'light' | 'full', filename: string) => {
    setSelectedReport({ type, filename })
    try {
      const content = await getReviewReport(projectId, type, filename)
      setReportContent(content)
    } catch (e) {
      setError(String(e))
    }
  }

  const handleRunLightCheck = async () => {
    if (!currentChapterId || !chapterHtml) return
    setRunningReview(true)
    setError(null)
    try {
      await runAndSaveLightCheck(projectId, currentChapterId, chapterHtml)
      await refresh()
    } catch (e) {
      setError(String(e))
    } finally {
      setRunningReview(false)
    }
  }

  const handleRunDeepReview = async () => {
    if (!currentChapterId || !chapterHtml) return
    setRunningReview(true)
    setError(null)
    try {
      await runDeepReview(projectId, currentChapterId, chapterHtml)
      await refresh()
    } catch (e) {
      setError(String(e))
    } finally {
      setRunningReview(false)
    }
  }

  const handleRunConsistency = async () => {
    if (!currentChapterId || !chapterHtml) return
    setRunningConsistency(true)
    setError(null)
    try {
      const text = chapterHtml.replace(/<[^>]*>/g, '').trim()
      const charFiles = text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]{2,4}/g) ?? []
      const chapterNum = parseInt(currentChapterId.replace(/\D/g, ''), 10) || 1
      const result = await runConsistencyChecks(projectId, chapterNum, charFiles)
      setConsistencyResult(result)
    } catch (e) {
      setError(String(e))
    } finally {
      setRunningConsistency(false)
    }
  }

  let parsedReport: LightCheckResult | DeepCheckResult | null = null
  if (reportContent) {
    try { parsedReport = JSON.parse(reportContent) as LightCheckResult | DeepCheckResult } catch { /* ignore */ }
  }

  return (
    <div className="review-panel panel-layout">
      <div className="panel-sidebar review-sidebar">
        <div className="review-sidebar-header">
          <h3>审查报告</h3>
        </div>
        <div className="review-actions-panel">
          {noChapter ? (
            <p className="review-hint" style={{ fontSize: '0.82rem', padding: '8px 0', color: 'var(--text-muted)' }}>
              切换到写作 tab 选择一个章节后，保存时会自动运行审查
            </p>
          ) : (
            <>
              <button
                className="btn-primary"
                onClick={handleRunLightCheck}
                disabled={runningReview}
                style={{ width: '100%', marginBottom: 6 }}
              >
                {runningReview ? '检查中…' : '⚡ 轻量检查'}
              </button>
              <button
                className="btn-primary"
                onClick={handleRunDeepReview}
                disabled={runningReview}
                style={{ width: '100%', marginBottom: 6 }}
              >
                {runningReview ? '审查中…' : '🔍 AI 深度审查'}
              </button>
              <div className="review-section-separator" />
              <button
                className="btn-secondary"
                onClick={handleRunConsistency}
                disabled={runningConsistency}
                style={{ width: '100%' }}
              >
                {runningConsistency ? '检查中…' : '🔗 一致性检查（Tier 1）'}
              </button>
            </>
          )}
        </div>
        {consistencyResult && consistencyResult.issues.length > 0 && (
          <div className="consistency-quick-summary">
            {(['S1', 'S2', 'S3', 'S4'] as const).map((s) =>
              consistencyResult.summary[s] > 0 ? (
                <span key={s} className={`severity-badge-sm severity-${s.toLowerCase()}`}>
                  {s}: {consistencyResult.summary[s]}
                </span>
              ) : null
            )}
          </div>
        )}
        {error && <div className="error-bar">{error}</div>}
        <div className="review-report-list">
          {reports.length === 0 && <p className="review-empty">暂无审查报告</p>}
          {reports.map((r) => (
            <div
              key={`${r.type}-${r.filename}`}
              className={`review-report-item${
                selectedReport?.filename === r.filename ? ' active' : ''
              }`}
              onClick={() => handleSelectReport(r.type, r.filename)}
            >
              <div className="report-item-header">
                <span className={`report-type-badge type-${r.type}`}>
                  {r.type === 'light' ? '轻量' : '深度'}
                </span>
                <span className="report-chapter">{r.chapterId}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel-editor review-content">
        {consistencyResult ? (
          <div className="consistency-section">
            <h3 className="consistency-section-title">一致性检查结果（Tier 1 确定性规则）</h3>
            <div className="consistency-summary-bar">
              <span>共 {consistencyResult.summary.total} 个问题</span>
              {(['S1', 'S2', 'S3', 'S4'] as const).map((s) =>
                consistencyResult.summary[s] > 0 ? (
                  <span key={s} className={`severity-count severity-${s.toLowerCase()}`}>
                    {s}: {consistencyResult.summary[s]}
                  </span>
                ) : null
              )}
              <span className="consistency-time">
                {consistencyResult.checkedAt.slice(11, 19)}
              </span>
            </div>
            <div className="consistency-issues-list">
              {consistencyResult.issues.map((issue) => (
                <div key={issue.id} className={`consistency-issue severity-${issue.severity.toLowerCase()}`}>
                  <span className="severity-badge">{issue.severity}</span>
                  <span className="issue-type">{issue.type}</span>
                  <span className="issue-desc">{issue.description}</span>
                  {issue.suggestion && <span className="issue-suggestion">→ {issue.suggestion}</span>}
                </div>
              ))}
            </div>
          </div>
        ) : parsedReport ? (
          <>
            {'checks' in parsedReport ? (
              (parsedReport as LightCheckResult).checks.map((check, i) => (
                <ReviewReportCard
                  key={i}
                  title={check.name}
                  passed={check.passed}
                  issues={check.issues}
                />
              ))
            ) : (
              <>
                <div className="review-overall-score">
                  综合评分：<span className={`score-${(parsedReport as DeepCheckResult).overall_score >= 7 ? 'good' : 'mid'}`}>
                    {(parsedReport as DeepCheckResult).overall_score}/10
                  </span>
                </div>
                {(parsedReport as DeepCheckResult).dimensions.map((d, i) => (
                  <ReviewReportCard
                    key={i}
                    title={d.name}
                    score={d.score}
                    issues={d.issues}
                  />
                ))}
                {(parsedReport as DeepCheckResult).suggestions.length > 0 && (
                  <div className="review-suggestions">
                    <h4>改进建议</h4>
                    <ul>
                      {(parsedReport as DeepCheckResult).suggestions.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <div className="review-empty">
            <p>选择左侧报告查看详情，或点击按钮对当前章节运行检查</p>
          </div>
        )}
      </div>
    </div>
  )
}
