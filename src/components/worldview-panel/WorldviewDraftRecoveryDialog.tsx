import Button from '../Button'
import Modal from '../Modal'
import type { WorldviewDraft } from '../../services/worldviewDrafts'

interface Props {
  draft: WorldviewDraft
  officialContent: string
  baseContentChanged: boolean
  onRestore: () => void
  onDiscard: () => void
}

export default function WorldviewDraftRecoveryDialog({ draft, officialContent, baseContentChanged, onRestore, onDiscard }: Props) {
  const draftContent = draft.content || Object.entries(draft.subValues).map(([key, value]) => `## ${key}\n${value}`).join('\n\n')
  return (
    <Modal className="confirm-dialog">
      <h2>发现未保存草稿</h2>
      <p style={{ margin: '12px 0', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
        这份草稿保存于 {new Date(draft.savedAt).toLocaleString()}。恢复后需要手动点击保存才会写入正式世界观内容。
      </p>
      {baseContentChanged && (
        <p style={{ margin: '0 0 12px', lineHeight: 1.6, color: 'var(--danger)' }}>
          正式内容在草稿保存后发生过变化，请在恢复前核对差异。
        </p>
      )}
      <details style={{ marginBottom: 16 }}>
        <summary style={{ cursor: 'pointer', color: 'var(--text-secondary)' }}>查看正式内容与草稿</summary>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))', gap: 12, marginTop: 8 }}>
          <section>
            <strong style={{ fontSize: '0.82rem' }}>正式内容</strong>
            <pre style={{ maxHeight: 180, overflow: 'auto', whiteSpace: 'pre-wrap', marginTop: 6, fontSize: '0.8rem' }}>{officialContent || '（空）'}</pre>
          </section>
          <section>
            <strong style={{ fontSize: '0.82rem' }}>未保存草稿</strong>
            <pre style={{ maxHeight: 180, overflow: 'auto', whiteSpace: 'pre-wrap', marginTop: 6, fontSize: '0.8rem' }}>{draftContent || '（空）'}</pre>
          </section>
        </div>
      </details>
      <div className="dialog-footer">
        <Button variant="secondary" size="md" onClick={onDiscard}>丢弃草稿</Button>
        <Button variant="primary" size="md" onClick={onRestore}>恢复草稿</Button>
      </div>
    </Modal>
  )
}
