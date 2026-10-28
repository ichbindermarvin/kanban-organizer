import { useId, useRef, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useFocusTrap } from '@/shared/hooks/useFocusTrap'

interface DialogProps {
  title: string
  hideTitle?: boolean
  onClose: () => void
  children: ReactNode
  initialFocus?: RefObject<HTMLElement | null>
  size?: 'sm' | 'md'
  position?: 'center' | 'top'
  role?: 'dialog' | 'alertdialog'
  describedBy?: string
}

/** Modal dialog: focus trap, Escape to close, focus restore, click on backdrop closes. */
export function Dialog({ title, hideTitle, onClose, children, initialFocus, size = 'md', position = 'center', role = 'dialog', describedBy }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useFocusTrap(ref, onClose, initialFocus)
  return createPortal(
    <div className={`dialog-backdrop dialog-backdrop--${position}`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        className={`dialog dialog--${size}`}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedBy}
        tabIndex={-1}
      >
        <h2 id={titleId} className={hideTitle ? 'visually-hidden' : 'dialog__title'}>
          {title}
        </h2>
        {children}
      </div>
    </div>,
    document.body,
  )
}
