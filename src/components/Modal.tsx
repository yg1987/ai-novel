// src/components/Modal.tsx
import type { ReactNode } from 'react'
import './Modal.css'

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
