import { useState } from 'react'
import Button from '../Button'
import Modal from '../Modal'
import type { WorldviewTemplate } from '../../services/worldviewTemplates'

interface Props {
  templates: WorldviewTemplate[]
  loading: boolean
  saving: boolean
  error: string | null
  onCreate: (name: string) => void
  onApply: (template: WorldviewTemplate) => void
  onDelete: (templateId: string) => void
  onClose: () => void
}

export default function WorldviewTemplateDialog({ templates, loading, saving, error, onCreate, onApply, onDelete, onClose }: Props) {
  const [name, setName] = useState('')

  const create = () => {
    if (!name.trim()) return
    onCreate(name)
    setName('')
  }

  return (
    <Modal className="worldview-template-modal" onRequestClose={saving ? undefined : onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 'min(700px, 84vh)' }}>
        <div style={{ padding: '20px 24px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>世界观模板</h2>
          <p style={{ margin: '8px 0 0', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            模板只保存栏目和子字段结构。应用模板不会删除或覆盖已有世界观内容。
          </p>
        </div>

        <div style={{ overflowY: 'auto', padding: '16px 24px', minHeight: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              className="notes-input"
              style={{ flex: 1 }}
              value={name}
              onChange={(event) => { setName(event.target.value) }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) create()
              }}
              placeholder="将当前栏目结构保存为模板…"
              maxLength={50}
            />
            <Button variant="primary" size="sm" disabled={saving || !name.trim()} onClick={create}>保存当前结构</Button>
          </div>
          {error && <p style={{ margin: '12px 0 0', color: 'var(--danger)', lineHeight: 1.5 }}>{error}</p>}

          {loading ? (
            <p style={{ color: 'var(--text-muted)' }}>加载模板中…</p>
          ) : templates.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>尚无自定义模板。你可以先调整栏目，再保存当前结构。</p>
          ) : templates.map((template) => (
            <div key={template.id} style={{ padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <strong style={{ flex: 1 }}>{template.name}</strong>
                <Button variant="text" size="sm" disabled={saving} onClick={() => { onApply(template) }}>应用</Button>
                <Button variant="ghost" size="xs" disabled={saving} title="删除模板" onClick={() => { onDelete(template.id) }}>✕</Button>
              </div>
              <p style={{ margin: '7px 0 0', color: 'var(--text-muted)', fontSize: '0.8rem', lineHeight: 1.5 }}>
                {template.sections.length} 个栏目 · {template.sections.reduce((total, section) => total + section.subs.length, 0)} 个子字段
              </p>
            </div>
          ))}
        </div>

        <div className="dialog-footer" style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <Button variant="secondary" size="md" disabled={saving} onClick={onClose}>关闭</Button>
        </div>
      </div>
    </Modal>
  )
}
