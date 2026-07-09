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
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog confirm-dialog" onClick={(e) => { e.stopPropagation() }}>
        <h2>{title}</h2>
        <p style={{ margin: '12px 0', lineHeight: 1.6, color: 'var(--text-secondary)' }}>{message}</p>
        <div className="dialog-actions">
          <button className="btn-secondary" onClick={onCancel}>{cancelText}</button>
          <button
            className={danger ? 'btn-danger' : 'btn-primary'}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
