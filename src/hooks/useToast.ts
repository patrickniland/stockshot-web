import { useContext } from 'react'
import { ToastContext, ToastVariant } from '../components/ui/Toast'

export function useToast(): { addToast: (variant: ToastVariant, message: string) => void } {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return { addToast: ctx.addToast }
}
