import { useState, useEffect, useCallback } from 'react'
import type { ConsistencyCheckResult, ReviewIssue, ConsistencyIssue } from '../types/review'
import { runAndSaveLightCheck, runDeepReview, loadChapterReviews } from '../services/reviewService'
import type { ChapterReviewData } from '../services/reviewService'
import { runConsistencyChecks } from '../services/consistencyCheck'
import { loadReviewRules } from '../services/reviewRules'
import type { ReviewRules } from '../services/reviewRules'
import type { GroupedBannedMatch } from '../services/bannedWords'
import { listChapters, getChapterContent } from '../api/tauri'
import ReviewRulesEditor from './ReviewRulesEditor'

// ─── Props ───────────────────────────────────────

interface Props {
  projectId: string
  currentChapterId: string | null
  chapterHtml?: string
  onNavigateToForeshadow?: (id: string) => void
}

// ─── Severity helpers ────────────────────────────

type AnyIssue = ReviewIssue | ConsistencyIssue

function isConsistencyIssue(i: AnyIssue): i is ConsistencyIssue {
  return 'type' in i && [
    'dormant_foreshadow', 'absent_character', 'timeline_order',
    'overdue_foreshadow', 'resolution_delay', 'foreshadow_density',
  ].includes((i as ConsistencyIssue).type)
}

function issueSeverity(i: AnyIssue): string {
  if (isConsistencyIssue(i)) return i.severity
  return (i as ReviewIssue).severity
}

function issueDesc(i: AnyIssue): string {
  if (isConsistencyIssue(i)) return i.description
  return (i as ReviewIssue).desc
}

function issueSuggestion(i: AnyIssue): string | undefined {
  if (isConsistencyIssue(i)) return i.suggestion
  return (i as ReviewIssue).suggestion
}

function severityColor(s: string): string {
  switch (s) {
    case 'error': case 'S1': case 'S2': return '#e74c3c'
    case 'warning': case 'S3': return '#e67e22'
    default: return '#888'
  }
}

function severityLabel(s: string): string {
  const map: Record<string, string> = { error: '错误', warning: '警告', hint: '提示', S1: '硬伤', S2: '破坏叙事', S3: '细节差异', S4: '优化建议' }
  return map[s] ?? s
}

// ─── Component ───────────────────────────────────

const inputBase: React.CSSProperties = {
  fontFamily: 'inherit',
  fontSize: '0.85rem',
  color: 'var(--text)',
}

export default function ReviewPanel({ projectId, currentChapterId, chapterHtml = '', onNavigateToForeshadow }: Props) {
  const [chapters, setChapters] = useState<ChapterReviewData[]>([])
  const [expandedChapter, setExpandedChapter] = useState<string | null>(null)
  const [runningReview, setRunningReview] = useState(false)
  const [runningConsistency, setRunningConsistency] = useState(false)
  const [consistencyResult, setConsistencyResult] = useState<ConsistencyCheckResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showRulesEditor, setShowRulesEditor] = useState(false)
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())
  const [rules, setRules] = useState<ReviewRules | null>(null)
  const noExpandedChapter = !expandedChapter

  const refresh = useCallback(async () => {
    const data = await loadChapterReviews(projectId)
    setChapters(data)
  }, [projectId])

  useEffect(() => { refresh().catch(console.error) }, [refresh])

  // Auto-expand chapter when navigating from writing tab
  useEffect(() => {
    if (currentChapterId) setExpandedChapter(currentChapterId)
  }, [currentChapterId])

  useEffect(() => { loadReviewRules(projectId).then(setRules).catch(console.error) }, [projectId])

  const dimLabelMap: Record<string, string> = {}
  if (rules) {
    for (const d of rules.reviewDimensions) {
      dimLabelMap[d.id] = d.label
    }
  }

  // ─── Toggle helpers ────────────────────────────

  const toggleChapter = (chapterId: string) => {
    setExpandedChapter((prev) => prev === chapterId ? null : chapterId)
    setConsistencyResult(null)
  }

  const toggleSection = (section: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev)
      if (next.has(section)) next.delete(section)
      else next.add(section)
      return next
    })
  }

  const isCollapsed = (section: string) => collapsedSections.has(section)

  // ─── Chapter HTML resolver ──────────────────────

  /** Load chapter HTML from disk (writing tab may have provided it, otherwise load). */
  const resolveChapterHtml = useCallback(async (): Promise<string | null> => {
    if (!expandedChapter) return null
    // If the expanded chapter is the same as writing tab's current chapter, use prop
    if (expandedChapter === currentChapterId && chapterHtml) return chapterHtml
    try {
      const allChapters = await listChapters(projectId)
      const meta = allChapters.find((c) => c.id === expandedChapter)
      if (!meta) return null
      return await getChapterContent(projectId, meta.volume, expandedChapter)
    } catch { return null }
  }, [projectId, expandedChapter, currentChapterId, chapterHtml])

  // ─── Actions ────────────────────────────────────

  const handleRunLightCheck = async () => {
    const html = await resolveChapterHtml()
    if (!html) return
    setRunningReview(true)
    setError(null)
    try {
      await runAndSaveLightCheck(projectId, expandedChapter!, html)
      await refresh()
    } catch (e) { setError(String(e)) }
    finally { setRunningReview(false) }
  }

  const handleRunDeepReview = async () => {
    const html = await resolveChapterHtml()
    if (!html) return
    setRunningReview(true)
    setError(null)
    try {
      const rules = await loadReviewRules(projectId)
      await runDeepReview(projectId, expandedChapter!, html, rules.reviewDimensions)
      await refresh()
    } catch (e) { setError(String(e)) }
    finally { setRunningReview(false) }
  }

  const handleRunConsistency = async () => {
    const html = await resolveChapterHtml()
    if (!html) return
    setRunningConsistency(true)
    setError(null)
    try {
      const text = html.replace(/<[^>]*>/g, '').trim()
      const charFiles = text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]{2,4}/g) ?? []
      const rules = await loadReviewRules(projectId)
      const result = await runConsistencyChecks(projectId, expandedChapter!, charFiles, rules.consistency)
      setConsistencyResult(result)
    } catch (e) { setError(String(e)) }
    finally { setRunningConsistency(false) }
  }

  // ─── Derived ────────────────────────────────────

  const activeChapter = chapters.find((c) => c.chapterId === expandedChapter)
  const issueColor = (n: number) => n > 0 ? '#e74c3c' : '#27ae60'

  // ─── Sub-components ─────────────────────────────

  const IssueRow = ({ issue }: { issue: AnyIssue }) => {
    const s = issueSeverity(issue)
    return (
      <div style={{ padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '0.84rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 2 }}>
          <span style={{
            ...inputBase, fontSize: '0.72rem', fontWeight: 600, color: '#fff',
            background: severityColor(s), borderRadius: 3, padding: '1px 6px', flexShrink: 0,
          }}>
            {severityLabel(s)}
          </span>
          <span style={{ flex: 1, color: 'var(--text)' }}>{issueDesc(issue)}</span>
        </div>
        {issueSuggestion(issue) && (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', paddingLeft: 4 }}>
            → {issueSuggestion(issue)}
          </div>
        )}
      </div>
    )
  }

  const SectionHeader = ({ title, extra }: { title: string; extra?: React.ReactNode }) => (
    <div onClick={() => toggleSection(title)} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 14px', background: 'var(--bg-sidebar)', cursor: 'pointer',
      borderRadius: 'var(--radius-sm)', userSelect: 'none', marginBottom: 8,
    }}>
      <span style={{ ...inputBase, fontWeight: 500 }}>
        {isCollapsed(title) ? '▶' : '▼'} {title}
      </span>
      {extra}
    </div>
  )

  // ─── RENDER ─────────────────────────────────────

  return (
    <div className="review-panel panel-layout">

      {/* ====== SIDEBAR ====== */}
      <div className="panel-sidebar review-sidebar">
        <div className="review-sidebar-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3>审查报告</h3>
          <button className="btn-icon" onClick={() => setShowRulesEditor(true)} title="审查规则配置"
            style={{ fontSize: '1.1rem', padding: '2px 6px' }}>⚙</button>
        </div>

        {/* Action buttons */}
        <div className="review-actions-panel">
          {noExpandedChapter && (
            <p style={{ fontSize: '0.78rem', padding: '4px 0 8px', color: 'var(--text-muted)' }}>
              💡 展开左侧章节后可运行检查
            </p>
          )}
          <button className="btn-primary" onClick={handleRunLightCheck}
            disabled={runningReview || noExpandedChapter}
            title={noExpandedChapter ? '请先展开左侧章节' : undefined}
            style={{ width: '100%', marginBottom: 6 }}>
            {runningReview ? '检查中…' : '⚡ 轻量检查'}
          </button>
          <button className="btn-primary" onClick={handleRunDeepReview}
            disabled={runningReview || noExpandedChapter}
            title={noExpandedChapter ? '请先展开左侧章节' : undefined}
            style={{ width: '100%', marginBottom: 6 }}>
            {runningReview ? '审查中…' : '🔍 AI 深度审查'}
          </button>
          <div className="review-section-separator" />
          <button className="btn-secondary" onClick={handleRunConsistency}
            disabled={runningConsistency || noExpandedChapter}
            title={noExpandedChapter ? '请先展开左侧章节' : undefined}
            style={{ width: '100%' }}>
            {runningConsistency ? '检查中…' : '🔗 一致性检查（Tier 1）'}
          </button>
        </div>

        {error && <div className="error-bar">{error}</div>}

        {/* Chapter accordion */}
        <div className="review-report-list">
          {chapters.length === 0 && <p className="review-empty">暂无审查报告</p>}
          {chapters.map((ch) => {
            const isExpanded = expandedChapter === ch.chapterId
            return (
              <div key={ch.chapterId}
                onClick={() => toggleChapter(ch.chapterId)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '9px 12px', cursor: 'pointer', userSelect: 'none',
                  borderLeft: isExpanded ? '3px solid var(--accent)' : '3px solid transparent',
                  background: isExpanded ? 'var(--bg-card)' : 'transparent',
                  borderRadius: 'var(--radius-sm)', marginBottom: 2,
                }}
                onMouseEnter={(e) => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = 'var(--bg-sidebar)' }}
                onMouseLeave={(e) => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                <span style={{ ...inputBase, fontSize: '0.85rem' }}>
                  {isExpanded ? '▼' : '▶'} {ch.chapterLabel}
                </span>
                <span style={{
                  ...inputBase, fontSize: '0.72rem', fontWeight: 600, color: '#fff',
                  background: issueColor(ch.totalIssues), borderRadius: 10, padding: '1px 8px',
                  lineHeight: '18px',
                }}>
                  {ch.totalIssues} 个问题
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* ====== CONTENT ====== */}
      <div className="panel-editor review-content" style={{ padding: '12px 16px', overflowY: 'auto' }}>
        {!activeChapter ? (
          <div className="review-empty">
            <p>{chapters.length === 0 ? '暂无审查报告，对当前章节运行检查即可生成' : '选择左侧章节查看审查详情'}</p>
          </div>
        ) : (
          <div>
            <h3 style={{ margin: '0 0 16px', fontSize: '1.05rem' }}>{activeChapter.chapterLabel} 审查详情</h3>

            {/* ── Light Check ── */}
            {activeChapter.lightCheck && (
              <div style={{ marginBottom: 16 }}>
                <SectionHeader title="禁用词检测" />
                {!isCollapsed('禁用词检测') && (
                  <div style={{ padding: '0 4px 12px' }}>
                    {activeChapter.lightCheck.checks.map((check, i) => {
                      // Banned words: use grouped display with context samples
                      if (check.name === '禁用词检查') {
                        const grouped = check.meta?.groupedMatches as GroupedBannedMatch[] | undefined
                        if (grouped && grouped.length > 0) {
                          return (
                            <div key={i}>
                              {grouped.map((g, gi) => (
                                <div key={gi} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 4 }}>
                                    <span style={{
                                      ...inputBase, fontSize: '0.72rem', fontWeight: 600, color: '#fff',
                                      background: severityColor(
                                        g.severity >= 4 ? 'error' : g.severity >= 2 ? 'warning' : 'hint'
                                      ), borderRadius: 3, padding: '1px 6px', flexShrink: 0,
                                    }}>
                                      {g.severity >= 4 ? '错误' : g.severity >= 2 ? '警告' : '提示'}
                                    </span>
                                    <span style={{ flex: 1, color: 'var(--text)', fontSize: '0.84rem' }}>
                                      {g.pattern}（共 {g.count} 处）
                                    </span>
                                  </div>
                                  {g.suggestion && (
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', paddingLeft: 4, marginBottom: 4 }}>
                                      → {g.suggestion}
                                    </div>
                                  )}
                                  <div style={{ paddingLeft: 4 }}>
                                    {g.samples.map((ctx, si) => (
                                      <div key={si} style={{
                                        fontSize: '0.78rem', color: 'var(--text-secondary)',
                                        fontFamily: 'monospace', background: 'var(--bg-sidebar)',
                                        padding: '2px 6px', borderRadius: 3, marginBottom: 2,
                                      }}>
                                        {ctx}
                                      </div>
                                    ))}
                                    {g.count > g.samples.length && (
                                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', paddingLeft: 6 }}>
                                        (+{g.count - g.samples.length} 处)
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )
                        }
                        // Fallback to flat issue list
                        return check.issues.map((issue, j) => (
                          <IssueRow key={`${i}-${j}`} issue={issue} />
                        ))
                      }
                      // Character presence
                      if (check.name === '角色出场') {
                        const chars = (check.meta?.appearedCharacters as string[]) ?? []
                        return (
                          <div key={i} style={{ padding: '6px 0', fontSize: '0.84rem', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                            角色出场: {chars.length > 0 ? chars.join('、') : '（无已知角色出场）'}
                          </div>
                        )
                      }
                      // Health / other checks
                      return check.issues.map((issue, j) => (
                        <IssueRow key={`${i}-${j}`} issue={issue} />
                      ))
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── Deep Review ── */}
            {activeChapter.deepReviews.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <SectionHeader
                  title="AI 深度审查"
                  extra={
                    <span style={{
                      ...inputBase, fontWeight: 600, fontSize: '0.9rem',
                      color: (activeChapter.deepReviews[0]?.overall_score ?? 0) >= 7 ? '#27ae60' : '#e67e22',
                    }}>
                      综合评分: {activeChapter.deepReviews[0]?.overall_score}/10
                    </span>
                  }
                />
                {!isCollapsed('AI 深度审查') && (
                  <div style={{ padding: '0 4px 12px' }}>
                    {activeChapter.deepReviews[0]?.dimensions.map((dim, i) => (
                      <div key={i} style={{ marginBottom: 10 }}>
                        <div style={{ ...inputBase, fontWeight: 500, marginBottom: 4, fontSize: '0.88rem' }}>
                          {dimLabelMap[dim.name] ?? dim.name}
                          <span style={{
                            marginLeft: 8, fontWeight: 600,
                            color: dim.score >= 7 ? '#27ae60' : dim.score >= 4 ? '#e67e22' : '#e74c3c',
                          }}>
                            ({dim.score}/10)
                          </span>
                        </div>
                        {dim.issues.map((issue, j) => (
                          <IssueRow key={j} issue={issue} />
                        ))}
                      </div>
                    ))}
                    {(activeChapter.deepReviews[0]?.suggestions?.length ?? 0) > 0 && (
                      <div style={{ marginTop: 8, padding: '8px 10px', background: 'var(--bg-sidebar)', borderRadius: 'var(--radius-sm)' }}>
                        <div style={{ ...inputBase, fontWeight: 500, marginBottom: 4 }}>改进建议</div>
                        {activeChapter.deepReviews[0]!.suggestions.map((s, i) => (
                          <div key={i} style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', padding: '2px 0' }}>
                            • {s}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── Consistency ── */}
            {consistencyResult && (
              <div style={{ marginBottom: 16 }}>
                <SectionHeader
                  title="一致性检查"
                  extra={<span style={{ ...inputBase, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    {consistencyResult.summary.total} 个问题
                  </span>}
                />
                {!isCollapsed('一致性检查') && (
                  <div style={{ padding: '0 4px 12px' }}>
                    {consistencyResult.issues.map((issue) => (
                      <div key={issue.id}>
                        <IssueRow issue={issue} />
                        {issue.foreshadowId && onNavigateToForeshadow && (
                          <button
                            onClick={() => onNavigateToForeshadow(issue.foreshadowId!)}
                            style={{
                              ...inputBase, fontSize: '0.78rem', color: 'var(--accent)',
                              background: 'none', border: 'none', cursor: 'pointer',
                              padding: '2px 0 2px 4px', textDecoration: 'underline',
                            }}
                          >
                            → 查看伏笔
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>
        )}
      </div>

      {/* Modal */}
      {showRulesEditor && (
        <ReviewRulesEditor
          projectId={projectId}
          onClose={() => setShowRulesEditor(false)}
          onSaved={() => {}}
        />
      )}
    </div>
  )
}
