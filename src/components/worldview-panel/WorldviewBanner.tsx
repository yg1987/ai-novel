import Button from '../Button'

interface Props {
  genreMismatch: boolean
  genre: string
  savedGenre: string | null
  onReset: () => void
  onDismiss: () => void
}

export default function WorldviewBanner({ genreMismatch, genre, savedGenre, onReset, onDismiss }: Props) {
  if (!genreMismatch) return null

  return (
    <div style={{
      padding: '8px 16px',
      background: 'var(--bg-sidebar)',
      borderBottom: '1px solid var(--border)',
      fontSize: '0.82rem',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      flexShrink: 0,
    }}>
      <span style={{ flex: 1 }}>
        项目类型已改为「{genre}」，世界观栏目还是「{savedGenre}」的默认预设。
      </span>
      <Button variant="text" size="sm" onClick={onReset}>重置</Button>
      <Button variant="text" size="sm" style={{ color: 'var(--text-muted)' }} onClick={onDismiss}>忽略</Button>
    </div>
  )
}
