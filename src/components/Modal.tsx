// src/components/Modal.tsx
import type { ReactNode } from 'react'

interface ModalProps {
  children: ReactNode
  className?: string
}

export default function Modal({ children, className }: ModalProps) {
  return (
    <div className="modal-overlay">
      <div className={`modal-content${className ? ` ${className}` : ''}`}>
        {children}
      </div>
    </div>
  )
}
