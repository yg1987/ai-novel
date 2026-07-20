// src/components/Modal.tsx
import { useEffect, useRef } from 'react'
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react'
import './Modal.css'

interface ModalProps {
  children: ReactNode
  className?: string
  onRequestClose?: () => void
}

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function Modal({ children, className, onRequestClose }: ModalProps) {
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const content = contentRef.current
    const firstFocusable = content?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
    ;(firstFocusable ?? content)?.focus()
    return () => previousFocus?.focus()
  }, [])

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && onRequestClose) {
      event.preventDefault()
      onRequestClose()
      return
    }
    if (event.key !== 'Tab') return
    const focusable = Array.from(contentRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [])
    if (focusable.length === 0) {
      event.preventDefault()
      contentRef.current?.focus()
      return
    }
    const first = focusable[0]!
    const last = focusable[focusable.length - 1]!
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const handleOverlayClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onRequestClose?.()
  }

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div ref={contentRef} className={`modal-content${className ? ` ${className}` : ''}`} role="dialog" aria-modal="true" tabIndex={-1} onKeyDown={handleKeyDown}>
        {onRequestClose && <button type="button" className="modal-close-button" aria-label="关闭" onClick={onRequestClose}>×</button>}
        {children}
      </div>
    </div>
  )
}
