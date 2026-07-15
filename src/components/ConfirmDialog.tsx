import Button from './Button'

interface Props {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  title,
  message,
  confirmText = '确定',
  cancelText = '取消',
  danger,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <div className="dialog-overlay">
      <div className="dialog confirm-dialog" onClick={(e) => { e.stopPropagation() }}>
        <h2>{title}</h2>
        <p style={{ margin: '12px 0', lineHeight: 1.6, color: 'var(--text-secondary)' }}>{message}</p>
        <div className="dialog-footer">
          <Button variant="secondary" size="md" onClick={onCancel}>{cancelText}</Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            size="md"
            onClick={onConfirm}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  )
}
