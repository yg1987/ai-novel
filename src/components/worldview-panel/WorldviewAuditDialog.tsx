import Button from '../Button'
import Modal from '../Modal'
import type { WorldviewAuditParseResult, WorldviewAuditSeverity } from '../../services/worldviewAudit'
import { fingerprintWorldviewAuditFinding, type WorldviewIssueState, type WorldviewIssueStatus } from '../../services/worldviewAuditState'

interface Props {
  generating: boolean
  error: string | null
  result: WorldviewAuditParseResult | null
  issueStates: Record<string, WorldviewIssueState>
  savingStatus: boolean
  onRun: () => void
  onUpdateStatus: (fingerprint: string, status: WorldviewIssueStatus) => void
  onClose: () => void
}

const severityLabels: Record<WorldviewAuditSeverity, string> = { blocker: '阻断', warning: '需确认', info: '提示' }
const severityColors: Record<WorldviewAuditSeverity, string> = { blocker: 'var(--danger)', warning: 'var(--warning)', info: 'var(--text-secondary)' }

const statusLabels: Record<WorldviewIssueStatus, string> = { open: '待处理', accepted: '已采纳', fixed: '已修复', ignored: '本次忽略', known_exception: '已知例外' }

export default function WorldviewAuditDialog({ generating, error, result, issueStates, savingStatus, onRun, onUpdateStatus, onClose }: Props) {
  return (
    <Modal className="worldview-audit-modal" onRequestClose={generating ? undefined : onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 'min(760px, 84vh)' }}>
        <div style={{ padding: '20px 24px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>设定一致性审查</h2>
          <p style={{ margin: '8px 0 0', color: 'var(--text-secondary)', lineHeight: 1.6 }}>审查会在你主动开始后调用 AI，默认读取世界观、规则卡片、角色、大纲、伏笔与最近三章。所有发现都必须附带可验证的来源摘录，不会自动改写任何内容。</p>
        </div>
        <div style={{ overflowY: 'auto', padding: '16px 24px', minHeight: 0 }}>
          {!result && !error && <p style={{ margin: 0, color: 'var(--text-muted)' }}>尚未运行审查。你可以先保存正在编辑的世界观栏目，以便审查基于最新文件内容进行。</p>}
          {error && <p style={{ margin: 0, color: 'var(--danger)' }}>{error}</p>}
          {result && <>
            <p style={{ margin: 0, lineHeight: 1.6 }}>{result.response.summary}</p>
            {result.ignored.length > 0 && <p style={{ margin: '10px 0 0', color: 'var(--text-muted)', fontSize: '0.82rem' }}>{result.ignored.join('；')}</p>}
            {result.response.findings.length === 0 ? <p style={{ margin: '14px 0 0', color: 'var(--text-muted)' }}>本次未发现需要报告的问题。</p> : result.response.findings.map((finding) => (
              <div key={finding.id} style={{ marginTop: 14, padding: 14, border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}><strong style={{ flex: 1 }}>{finding.title}</strong><span style={{ color: severityColors[finding.severity], fontSize: '0.8rem' }}>{severityLabels[finding.severity]}</span></div>
                <p style={{ margin: '8px 0 0', color: 'var(--text-secondary)', lineHeight: 1.55 }}>{finding.risk}</p>
                <p style={{ margin: '8px 0 0', lineHeight: 1.55 }}><strong>建议修订：</strong>{finding.suggestedRevision}</p>
                {finding.evidence.length === 0 ? <p style={{ margin: '8px 0 0', color: 'var(--text-muted)', fontSize: '0.82rem' }}>未提供可验证证据，仅作信息提示。</p> : finding.evidence.map((evidence) => <p key={`${evidence.type}:${evidence.id}:${evidence.excerpt}`} style={{ margin: '8px 0 0', padding: '8px 10px', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: 1.5 }}>【{evidence.label}】{evidence.excerpt}</p>)}
                <select className="notes-input" style={{ marginTop: 10 }} disabled={savingStatus} value={issueStates[fingerprintWorldviewAuditFinding(finding)]?.status ?? 'open'} onChange={(event) => { onUpdateStatus(fingerprintWorldviewAuditFinding(finding), event.target.value as WorldviewIssueStatus) }}>
                  {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
            ))}
          </>}
        </div>
        <div className="dialog-footer" style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <Button variant="secondary" size="md" disabled={generating} onClick={onClose}>关闭</Button>
          <Button variant="primary" size="md" disabled={generating} onClick={onRun}>{generating ? '审查中…' : result ? '重新审查' : '开始审查'}</Button>
        </div>
      </div>
    </Modal>
  )
}
