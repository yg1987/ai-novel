import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export interface PopupMenuItem {
  key: string
  label: string
  onClick: () => void
}

interface PopupMenuProps {
  trigger: React.ReactNode
  items: PopupMenuItem[]
  open: boolean
  onClose: () => void
}

const MENU_STYLE: React.CSSProperties = {
  position: 'fixed',
  minWidth: 120,
  background: '#fff',
  border: '1px solid #dee2e6',
  borderRadius: 6,
  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
  zIndex: 9999,
  overflow: 'hidden',
  padding: '4px 0',
}

const ITEM_STYLE: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '6px 14px',
  border: 'none',
  background: 'transparent',
  fontSize: '0.82rem',
  color: '#1a1a2e',
  cursor: 'pointer',
  textAlign: 'left' as const,
  whiteSpace: 'nowrap' as const,
  fontFamily: 'inherit',
  lineHeight: 1.5,
}

export default function PopupMenu({ trigger, items, open, onClose }: PopupMenuProps) {
  const triggerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  // Compute position from trigger element's bounding rect
  const updatePosition = () => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setPos({
      top: rect.bottom + 4,
      left: Math.max(4, rect.right - 120),
    })
  }

  useEffect(() => {
    if (!open) return
    updatePosition()
  }, [open])

  // Close on click outside or Escape
  useEffect(() => {
    if (!open) return

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        menuRef.current && !menuRef.current.contains(target) &&
        triggerRef.current && !triggerRef.current.contains(target)
      ) {
        onClose()
      }
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    // capture phase for scroll so menu position stays synced
    const handleScroll = () => updatePosition()

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    window.addEventListener('scroll', handleScroll, true)
    window.addEventListener('resize', updatePosition)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [open, onClose])

  const handleItemClick = (item: PopupMenuItem) => {
    item.onClick()
    onClose()
  }

  return (
    <>
      <div ref={triggerRef} style={{ display: 'inline-block' }}>
        {trigger}
      </div>
      {open &&
        createPortal(
          <div ref={menuRef} style={{ ...MENU_STYLE, top: pos.top, left: pos.left }}>
            {items.map((item) => (
              <button
                key={item.key}
                style={ITEM_STYLE}
                onMouseEnter={(e) => {
                  const el = e.currentTarget
                  el.style.background = '#4a6fa5'
                  el.style.color = '#fff'
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget
                  el.style.background = 'transparent'
                  el.style.color = '#1a1a2e'
                }}
                onClick={() => handleItemClick(item)}
              >
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}
