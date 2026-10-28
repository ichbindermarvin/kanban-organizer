import { useId, useRef } from 'react'
import { Dialog } from './Dialog'
import { useT } from '@/shared/hooks/useT'

interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  tone?: 'default' | 'danger'
}

export function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel, tone = 'default' }: ConfirmDialogProps) {
  const t = useT()
  const confirmRef = useRef<HTMLButtonElement>(null)
  const messageId = useId()
  return (
    <Dialog title={title} onClose={onCancel} size="sm" role="alertdialog" initialFocus={confirmRef} describedBy={messageId}>
      <p id={messageId} className="dialog__text">
        {message}
      </p>
      <div className="dialog__actions">
        <button type="button" className="btn" onClick={onCancel}>
          {t('common.cancel')}
        </button>
        <button ref={confirmRef} type="button" className={`btn ${tone === 'danger' ? 'btn--danger' : 'btn--primary'}`} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  )
}
