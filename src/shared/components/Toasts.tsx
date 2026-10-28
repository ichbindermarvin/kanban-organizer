import { useEffect } from 'react'
import { useAppStore, type Toast } from '@/state/appStore'
import { Icon } from './Icon'
import { useT } from '@/shared/hooks/useT'

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useAppStore((s) => s.dismissToast)
  const t = useT()
  useEffect(() => {
    const timeout = window.setTimeout(() => dismiss(toast.id), toast.action ? 7000 : toast.tone === 'error' ? 9000 : 4000)
    return () => window.clearTimeout(timeout)
  }, [toast, dismiss])
  return (
    <div className={`toast toast--${toast.tone}`} role={toast.tone === 'error' ? 'alert' : 'status'}>
      <span className="toast__message">{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          className="toast__action"
          onClick={() => {
            toast.action?.()
            dismiss(toast.id)
          }}
        >
          {toast.actionLabel}
        </button>
      )}
      <button type="button" className="icon-btn icon-btn--sm" aria-label={t('common.close')} onClick={() => dismiss(toast.id)}>
        <Icon name="close" size={14} />
      </button>
    </div>
  )
}

export function Toasts() {
  const toasts = useAppStore((s) => s.toasts)
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  )
}
