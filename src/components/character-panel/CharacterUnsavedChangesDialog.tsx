import Button from '../Button'
import Modal from '../Modal'

interface Props {
  saving: boolean
  onSave: () => void
  onDiscard: () => void
  onCancel: () => void
}

export default function CharacterUnsavedChangesDialog({ saving, onSave, onDiscard, onCancel }: Props) {
  return (
    <Modal className="confirm-dialog" onRequestClose={saving ? undefined : onCancel}>
      <h2>角色内容尚未保存</h2>
      <p style={{ margin: '12px 0', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
        你可以先保存，也可以放弃本次修改并继续当前操作。
      </p>
      <div className="dialog-footer">
        <Button variant="secondary" size="md" onClick={onCancel} disabled={saving}>留在此处</Button>
        <Button variant="danger" size="md" onClick={onDiscard} disabled={saving}>放弃修改</Button>
        <Button variant="primary" size="md" onClick={onSave} loading={saving} disabled={saving}>保存并继续</Button>
      </div>
    </Modal>
  )
}
