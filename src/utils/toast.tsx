import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

interface ToastItem {
  id: number
  message: string
  leaving: boolean
}

let nextId = 0
const listeners: Array<(item: ToastItem) => void> = []

/** Show a toast notification. Call from anywhere — no React import needed. */
export function showToast(message: string) {
  const item: ToastItem = { id: nextId++, message, leaving: false }
  for (const fn of listeners) fn(item)
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    const activeTimers = timers.current
    const handler = (item: ToastItem) => {
      setToasts((prev) => [...prev, item])

      const dismiss = setTimeout(() => {
        setToasts((prev) =>
          prev.map((t) => (t.id === item.id ? { ...t, leaving: true } : t)),
        )
        const remove = setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== item.id))
          activeTimers.delete(item.id)
        }, 300)
        activeTimers.set(item.id, remove)
      }, 2000)

      activeTimers.set(item.id, dismiss)
    }

    listeners.push(handler)
    return () => {
      const idx = listeners.indexOf(handler)
      if (idx >= 0) listeners.splice(idx, 1)
      for (const t of activeTimers.values()) clearTimeout(t)
    }
  }, [])

  if (toasts.length === 0) return null

  return createPortal(
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast-item${t.leaving ? ' toast-leaving' : ''}`}>
          {t.message}
        </div>
      ))}
    </div>,
    document.body,
  )
}
