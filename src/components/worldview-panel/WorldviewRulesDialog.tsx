import { useMemo, useState } from 'react'
import Button from '../Button'
import Modal from '../Modal'
import type { SectionDef } from '../../services/worldviewConfig'
import type { WorldviewRuleCheckFinding } from '../../services/worldviewRuleChecks'
import type { WorldviewRule, WorldviewRuleInput, WorldviewRuleStatus, WorldviewRuleStrength } from '../../services/worldviewRules'

interface Props {
  rules: WorldviewRule[]
  sections: SectionDef[]
  loading: boolean
  saving: boolean
  error: string | null
  onCreate: (input: WorldviewRuleInput) => void
  onUpdate: (id: string, input: WorldviewRuleInput) => void
  onDelete: (id: string) => void
  onReferences: (rule: WorldviewRule) => void
  onCheck: () => Promise<WorldviewRuleCheckFinding[]>
  onClose: () => void
}

const EMPTY_INPUT: WorldviewRuleInput = {
  name: '', statement: '', strength: 'hard', applicableTo: '', aliases: [], status: 'active', sourceSectionKey: null,
}

const strengthLabels: Record<WorldviewRuleStrength, string> = { hard: '硬规则', convention: '惯例', pending: '待确认' }
const statusLabels: Record<WorldviewRuleStatus, string> = { active: '有效', archived: '已废弃', secret: '剧情保密' }

export default function WorldviewRulesDialog({ rules, sections, loading, saving, error, onCreate, onUpdate, onDelete, onReferences, onCheck, onClose }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [input, setInput] = useState<WorldviewRuleInput>(EMPTY_INPUT)
  const [checking, setChecking] = useState(false)
  const [checkError, setCheckError] = useState<string | null>(null)
  const [findings, setFindings] = useState<WorldviewRuleCheckFinding[] | null>(null)
  const aliasesText = useMemo(() => input.aliases.join('、'), [input.aliases])

  const startCreate = () => {
    setEditingId('new')
    setInput(EMPTY_INPUT)
  }
  const startEdit = (rule: WorldviewRule) => {
    setEditingId(rule.id)
    setInput({
      name: rule.name, statement: rule.statement, strength: rule.strength,
      applicableTo: rule.applicableTo, aliases: rule.aliases, status: rule.status, sourceSectionKey: rule.sourceSectionKey,
    })
  }
  const submit = () => {
    if (editingId === 'new') onCreate(input)
    else if (editingId) onUpdate(editingId, input)
    setEditingId(null)
  }
  const runCheck = async () => {
    setChecking(true)
    setCheckError(null)
    try {
      setFindings(await onCheck())
    } catch (checkFailure) {
      setCheckError(checkFailure instanceof Error ? checkFailure.message : String(checkFailure))
    } finally {
      setChecking(false)
    }
  }

  return (
    <Modal className="worldview-rules-modal" onRequestClose={saving ? undefined : onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 'min(760px, 84vh)' }}>
        <div style={{ padding: '20px 24px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>关键规则卡片</h2>
          <p style={{ margin: '8px 0 0', color: 'var(--text-secondary)', lineHeight: 1.6 }}>规则卡片是 Markdown 的可选增强，用于标记必须遵守的设定；未创建规则时不会影响现有工作流。</p>
        </div>

        <div style={{ overflowY: 'auto', padding: '16px 24px', minHeight: 0 }}>
          {editingId ? (
            <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 14 }}>
              <input className="notes-input" style={{ width: '100%' }} value={input.name} onChange={(event) => { setInput((prev) => ({ ...prev, name: event.target.value })) }} placeholder="规则名称，例如：复活限制" />
              <textarea className="notes-input" style={{ width: '100%', minHeight: 110, marginTop: 10, resize: 'vertical', lineHeight: 1.6 }} value={input.statement} onChange={(event) => { setInput((prev) => ({ ...prev, statement: event.target.value })) }} placeholder="完整陈述这条规则以及不可突破的边界…" />
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <select className="notes-input" value={input.strength} onChange={(event) => { setInput((prev) => ({ ...prev, strength: event.target.value as WorldviewRuleStrength })) }}>
                  {Object.entries(strengthLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <select className="notes-input" value={input.status} onChange={(event) => { setInput((prev) => ({ ...prev, status: event.target.value as WorldviewRuleStatus })) }}>
                  {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <select className="notes-input" value={input.sourceSectionKey ?? ''} onChange={(event) => { setInput((prev) => ({ ...prev, sourceSectionKey: event.target.value || null })) }}>
                  <option value="">来源栏目（可选）</option>
                  {sections.map((section) => <option key={section.key} value={section.key}>{section.label}</option>)}
                </select>
              </div>
              <input className="notes-input" style={{ width: '100%', marginTop: 10 }} value={input.applicableTo} onChange={(event) => { setInput((prev) => ({ ...prev, applicableTo: event.target.value })) }} placeholder="适用范围（时代、地域、角色或阵营，可选）" />
              <input className="notes-input" style={{ width: '100%', marginTop: 10 }} value={aliasesText} onChange={(event) => { setInput((prev) => ({ ...prev, aliases: event.target.value.split(/[、,，]/u) })) }} placeholder="别名（用顿号或逗号分隔，可选）" />
              <div className="dialog-footer" style={{ marginTop: 12 }}>
                <Button variant="secondary" size="sm" disabled={saving} onClick={() => { setEditingId(null) }}>取消</Button>
                <Button variant="primary" size="sm" disabled={saving} onClick={submit}>{editingId === 'new' ? '创建规则' : '保存规则'}</Button>
              </div>
            </div>
          ) : <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="primary" size="sm" onClick={startCreate}>+ 新建规则</Button>
            <Button variant="secondary" size="sm" disabled={loading || saving || checking} onClick={() => { void runCheck() }}>{checking ? '检查中…' : '运行本地检查'}</Button>
          </div>}
          {error && <p style={{ margin: '12px 0 0', color: 'var(--danger)' }}>{error}</p>}
          {checkError && <p style={{ margin: '12px 0 0', color: 'var(--danger)' }}>{checkError}</p>}
          {findings !== null && <div style={{ marginTop: 14, padding: 12, border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg-secondary)' }}>
            <strong style={{ fontSize: '0.9rem' }}>本地检查结果</strong>
            {findings.length === 0 ? <p style={{ margin: '8px 0 0', color: 'var(--text-muted)' }}>未发现可确定的问题。此检查不会调用 AI，也不会修改任何内容。</p> : findings.map((finding) => (
              <div key={finding.id} style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                <strong style={{ color: finding.severity === 'warning' ? 'var(--warning)' : 'var(--text-primary)' }}>{finding.severity === 'warning' ? '需确认：' : '提示：'}{finding.title}</strong>
                <p style={{ margin: '5px 0 0', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{finding.detail}</p>
                {finding.sourceLabel && <p style={{ margin: '5px 0 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>来源：{finding.sourceLabel}{finding.excerpt ? ` · ${finding.excerpt}` : ''}</p>}
              </div>
            ))}
          </div>}
          {loading ? <p style={{ color: 'var(--text-muted)' }}>加载规则中…</p> : rules.length === 0 ? <p style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>尚无规则卡片。你仍可继续使用 Markdown 记录世界观。</p> : rules.map((rule) => (
            <div key={rule.id} style={{ padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <strong style={{ flex: 1 }}>{rule.name}</strong>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{strengthLabels[rule.strength]} · {statusLabels[rule.status]}</span>
                <Button variant="text" size="sm" disabled={saving} onClick={() => { startEdit(rule) }}>编辑</Button>
                <Button variant="text" size="sm" disabled={saving} onClick={() => { onReferences(rule) }}>引用</Button>
                <Button variant="ghost" size="xs" disabled={saving} title="删除规则" onClick={() => { onDelete(rule.id) }}>✕</Button>
              </div>
              <p style={{ margin: '8px 0 0', lineHeight: 1.6, color: 'var(--text-secondary)' }}>{rule.statement}</p>
              {(rule.applicableTo || rule.aliases.length > 0) && <p style={{ margin: '6px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{rule.applicableTo && `适用：${rule.applicableTo}`}{rule.applicableTo && rule.aliases.length > 0 && ' · '}{rule.aliases.length > 0 && `别名：${rule.aliases.join('、')}`}</p>}
            </div>
          ))}
        </div>
        <div className="dialog-footer" style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', flexShrink: 0 }}><Button variant="secondary" size="md" disabled={saving} onClick={onClose}>关闭</Button></div>
      </div>
    </Modal>
  )
}
