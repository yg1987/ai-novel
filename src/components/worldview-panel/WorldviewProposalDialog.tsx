import { useMemo, useState } from 'react'
import Button from '../Button'
import Modal from '../Modal'
import type { SectionDef } from '../../services/worldviewConfig'
import type { WorldviewProposal, WorldviewProposalResponse } from '../../services/worldviewProposal'

interface Props {
  sections: SectionDef[]
  response: WorldviewProposalResponse
  ignoredCount: number
  sourceLabels?: string[]
  onAccept: (proposals: WorldviewProposal[]) => void
  onRegenerate?: () => void
  onClose: () => void
}

function proposalKey(proposal: WorldviewProposal, index: number): string {
  return `${proposal.target.sectionKey}:${proposal.target.fieldKey ?? ''}:${String(index)}`
}

function actionLabel(action: WorldviewProposal['action']): string {
  if (action === 'fill_empty') return '填充空白'
  if (action === 'suggest_append') return '追加建议'
  return '替换建议'
}

function targetLabel(proposal: WorldviewProposal, sections: SectionDef[]): string {
  const section = sections.find((item) => item.key === proposal.target.sectionKey)
  if (!section) return proposal.target.fieldKey ?? proposal.target.sectionKey
  const field = proposal.target.fieldKey ? section.subs.find((item) => item.key === proposal.target.fieldKey) : null
  return field ? `${section.label} · ${field.label}` : section.label
}

export default function WorldviewProposalDialog({ sections, response, ignoredCount, sourceLabels, onAccept, onRegenerate, onClose }: Props) {
  const initialSelected = useMemo(() => new Set(response.proposals
    .map((proposal, index) => ({ proposal, key: proposalKey(proposal, index) }))
    .filter(({ proposal }) => proposal.action !== 'suggest_replace')
    .map(({ key }) => key)), [response.proposals])
  const [selected, setSelected] = useState(initialSelected)
  const [contents, setContents] = useState(() => response.proposals.map((proposal) => proposal.content))

  const toggle = (key: string) => {
    setSelected((previous) => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const acceptSelected = () => {
    const accepted = response.proposals.flatMap((proposal, index) => {
      if (!selected.has(proposalKey(proposal, index))) return []
      const content = contents[index]?.trim()
      return content ? [{ ...proposal, content }] : []
    })
    onAccept(accepted)
  }

  return (
    <Modal className="worldview-proposal-modal" onRequestClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', height: 'min(760px, 84vh)' }}>
        <div style={{ padding: '20px 24px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>AI 世界观草案</h2>
          {response.summary && <p style={{ margin: '8px 0 0', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{response.summary}</p>}
          {(sourceLabels?.length || response.usedSources.length > 0) && (
            <p style={{ margin: '6px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              参考资料：{(sourceLabels ?? response.usedSources.map((source) => source.label)).join('、')}
            </p>
          )}
          {ignoredCount > 0 && <p style={{ margin: '6px 0 0', color: 'var(--warning)', fontSize: '0.8rem' }}>已忽略 {ignoredCount} 条无法定位或格式无效的提案。</p>}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', minHeight: 0 }}>
          {response.proposals.map((proposal, index) => {
            const key = proposalKey(proposal, index)
            const checked = selected.has(key)
            return (
              <div key={key} style={{ padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
                <label style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer' }}>
                  <input type="checkbox" checked={checked} onChange={() => { toggle(key) }} />
                  <strong>{targetLabel(proposal, sections)}</strong>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{actionLabel(proposal.action)}</span>
                </label>
                <textarea
                  className="notes-input"
                  style={{ width: '100%', minHeight: 120, marginTop: 10, resize: 'vertical', lineHeight: 1.6 }}
                  value={contents[index] ?? ''}
                  onChange={(event) => {
                    setContents((previous) => previous.map((content, itemIndex) => itemIndex === index ? event.target.value : content))
                  }}
                />
                {proposal.rationale && <p style={{ margin: '8px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>理由：{proposal.rationale}</p>}
                {proposal.conflicts.length > 0 && <p style={{ margin: '6px 0 0', fontSize: '0.8rem', color: 'var(--danger)' }}>该建议与现有内容可能冲突，请核对后再采纳。</p>}
              </div>
            )
          })}

          {response.questions.length > 0 && (
            <div style={{ paddingTop: 16 }}>
              <strong style={{ fontSize: '0.9rem' }}>待确认问题</strong>
              {response.questions.map((item, index) => (
                <p key={`${item.question}:${String(index)}`} style={{ margin: '8px 0 0', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  {item.question}<br /><span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{item.whyNeeded}</span>
                </p>
              ))}
            </div>
          )}
        </div>

        <div className="dialog-footer" style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <Button variant="secondary" size="md" onClick={onClose}>保留草案</Button>
          {onRegenerate && <Button variant="secondary" size="md" onClick={onRegenerate}>重新生成</Button>}
          <Button variant="primary" size="md" disabled={selected.size === 0} onClick={acceptSelected}>采纳选中项</Button>
        </div>
      </div>
    </Modal>
  )
}
