import { createContext, useState, useCallback, ReactNode } from 'react'
import { X } from '@phosphor-icons/react'

export type ToastVariant = 'success' | 'error' | 'info'

export type ToastItem = {
  id: string
  variant: ToastVariant
  message: string
}

export type ToastContextType = {
  toasts: ToastItem[]
  addToast: (variant: ToastVariant, message: string) => void
  removeToast: (id: string) => void
}

export const ToastContext = createContext<ToastContextType | null>(null)

const VARIANT_BG: Record<ToastVariant, string> = {
  success: 'bg-[var(--color-success)]',
  error:   'bg-[var(--color-danger)]',
  info:    'bg-[var(--color-info)]',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const addToast = useCallback((variant: ToastVariant, message: string) => {
    const id = `${Date.now()}-${Math.random()}`
    setToasts(prev => [...prev, { id, variant, message }])
    setTimeout(() => removeToast(id), 3000)
  }, [removeToast])

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-2 pointer-events-none w-[min(90vw,420px)]">
        {toasts.map(toast => (
          <div
            key={toast.id}
            onClick={() => removeToast(toast.id)}
            className={[
              VARIANT_BG[toast.variant],
              'text-white px-4 py-3 rounded-[var(--radius-lg)] shadow-lg',
              'flex items-center justify-between gap-3',
              'pointer-events-auto cursor-pointer',
              'animate-[slideDown_0.2s_ease-out]',
            ].join(' ')}
          >
            <span className="text-[var(--text-sm)] font-medium">{toast.message}</span>
            <X size={16} className="flex-shrink-0 opacity-70" />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
