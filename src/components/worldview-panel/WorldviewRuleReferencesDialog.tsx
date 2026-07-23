import { useState } from 'react'
import Button from '../Button'
import Modal from '../Modal'
import Pagination from '../Pagination'
import type { WorldviewRuleReference } from '../../services/worldviewRuleReferences'

interface Props { ruleName: string; loading: boolean; references: WorldviewRuleReference[]; error: string | null; onClose: () => void }
const labels: Record<WorldviewRuleReference['type'], string> = { worldview: '世界观', character: '角色', foreshadow: '伏笔', chapter: '章节', ai_record: 'AI 审查记录' }

export default function WorldviewRuleReferencesDialog({ ruleName, loading, references, error, onClose }: Props) {
  const [page, setPage] = useState(1)
  const pageSize = 10
  const totalPages = Math.max(1, Math.ceil(references.length / pageSize))
  const items = references.slice((page - 1) * pageSize, page * pageSize)
  return <Modal className="worldview-rule-references-modal" onRequestClose={onClose}><div style={{ display: 'flex', flexDirection: 'column', maxHeight: 'min(700px, 82vh)' }}>
    <div style={{ padding: '20px 24px 14px', borderBottom: '1px solid var(--border)' }}><h2 style={{ margin: 0, fontSize: '1.1rem' }}>“{ruleName}” 的引用</h2></div>
    <div style={{ overflowY: 'auto', padding: '16px 24px', minHeight: 0 }}>{loading ? <p>检索引用中…</p> : error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : references.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>未在当前项目资料中找到引用。</p> : items.map((item, index) => <div key={`${item.type}:${item.label}:${String(index)}`} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}><strong style={{ fontSize: '0.85rem' }}>{labels[item.type]} · {item.label}</strong><p style={{ margin: '6px 0 0', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{item.excerpt}</p></div>)}
      <Pagination currentPage={page} totalPages={totalPages} totalItems={references.length} onPageChange={setPage} />
    </div><div className="dialog-footer" style={{ padding: '14px 24px', borderTop: '1px solid var(--border)' }}><Button variant="secondary" size="md" onClick={onClose}>关闭</Button></div>
  </div></Modal>
}
