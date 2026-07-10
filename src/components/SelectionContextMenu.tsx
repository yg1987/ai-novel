import { useEffect, useRef } from 'react'

export interface ContextMenuAction {
  label: string
  onClick: () => void
  disabled?: boolean
}

interface Props {
  x: number
  y: number
  items: ContextMenuAction[]
  onClose: () => void
}

export default function SelectionContextMenu({ x, y, items, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    // Delay adding listeners so the same click that opened the menu doesn't close it
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick)
      document.addEventListener('keydown', handleKey)
    }, 0)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  // Adjust position to stay within viewport
  const adjustedX = Math.min(x, window.innerWidth - 160)
  const adjustedY = Math.min(y, window.innerHeight - items.length * 36 - 8)

  return (
    <div
      ref={menuRef}
      className="selection-context-menu"
      style={{ left: adjustedX, top: adjustedY }}
    >
      {items.length === 0 && (
        <div className="selection-context-menu-empty">无可用操作</div>
      )}
      {items.map((item, i) => (
        <button
          key={i}
          className="selection-context-menu-item"
          disabled={item.disabled}
          onClick={() => { item.onClick(); onClose() }}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
