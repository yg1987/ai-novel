// src/components/RewriteButtons.tsx
// Shared three-button group: 改写 / 扩写 / 润色

interface Props {
  /** Whether the buttons are enabled (text is selected) */
  enabled: boolean
  /** Whether an AI request is in progress */
  loading?: boolean
  onRewrite: () => void
  onExpand: () => void
  onPolish: () => void
}

export default function RewriteButtons({ enabled, loading = false, onRewrite, onExpand, onPolish }: Props) {
  const disabled = !enabled || loading

  return (
    <span className="rewrite-btn-group">
      <button
        className="toolbar-btn rewrite-btn"
        disabled={disabled}
        onClick={onRewrite}
        title={enabled ? '改写选中文字' : '请先选中文字'}
      >
        ✏️ 改写
      </button>
      <button
        className="toolbar-btn expand-btn"
        disabled={disabled}
        onClick={onExpand}
        title={enabled ? '扩写选中文字' : '请先选中文字'}
      >
        📝 扩写
      </button>
      <button
        className="toolbar-btn polish-btn"
        disabled={disabled}
        onClick={onPolish}
        title={enabled ? '润色选中文字' : '请先选中文字'}
      >
        ✨ 润色
      </button>
    </span>
  )
}
