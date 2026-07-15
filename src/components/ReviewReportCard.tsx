import type { ReviewIssue } from '../types/review'
import Button from './Button'

interface Props {
  title: string
  score?: number
  passed?: boolean
  issues: ReviewIssue[]
  onLocate?: (issue: ReviewIssue) => void
  onFix?: (issue: ReviewIssue) => void
  onDismiss?: (issue: ReviewIssue) => void
}

function severityLabel(s: string): string {
  const map: Record<string, string> = { error: '错误', warning: '警告', hint: '提示' }
  return map[s] ?? s
}

export default function ReviewReportCard({ title, score, passed, issues, onLocate, onFix, onDismiss }: Props) {
  const sorted = [...issues].sort((a, b) => {
    const order = { error: 0, warning: 1, hint: 2 }
    return (order[a.severity] ?? 3) - (order[b.severity] ?? 3)
  })

  return (
    <div className="review-card">
      <div className="review-card-header">
        <h4>{title}</h4>
        {score !== undefined && (
          <div className={`review-score score-${score >= 7 ? 'good' : score >= 4 ? 'mid' : 'bad'}`}>
            {score}/10
          </div>
        )}
        {passed !== undefined && (
          <span className={`review-passed ${passed ? 'passed' : 'failed'}`}>
            {passed ? '✓ 通过' : '✗ 有问题'}
          </span>
        )}
      </div>

      <div className="review-issue-list">
        {sorted.length === 0 && <p className="review-empty">暂无问题</p>}
        {sorted.map((issue, i) => (
          <div key={i} className={`review-issue issue-${issue.severity}`}>
            <div className="review-issue-header">
              <span className={`issue-severity-badge badge-${issue.severity}`}>
                {severityLabel(issue.severity)}
              </span>
              <span className="issue-desc">{issue.desc}</span>
            </div>
            {issue.suggestion && (
              <div className="issue-suggestion">→ {issue.suggestion}</div>
            )}
            <div className="issue-actions">
              {onLocate && issue.location && (
                <Button variant="text" size="sm" onClick={() => onLocate(issue)}>📍 定位</Button>
              )}
              {onFix && (
                <Button variant="text" size="sm" onClick={() => onFix(issue)}>🤖 AI 修复</Button>
              )}
              {onDismiss && (
                <Button variant="text" size="sm" onClick={() => onDismiss(issue)}>✓ 标记已处理</Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
