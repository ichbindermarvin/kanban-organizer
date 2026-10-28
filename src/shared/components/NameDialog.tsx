import { useId, useRef, useState } from 'react'
import { Dialog } from './Dialog'
import { useT } from '@/shared/hooks/useT'

interface NameDialogProps {
  title: string
  label: string
  initialValue?: string
  placeholder?: string
  hint?: string
  submitLabel: string
  /** Allows saving an empty value (e.g. to reset a column to its default name). */
  allowEmpty?: boolean
  onSubmit: (value: string) => void
  onClose: () => void
}

export function NameDialog({ title, label, initialValue = '', placeholder, hint, submitLabel, allowEmpty, onSubmit, onClose }: NameDialogProps) {
  const t = useT()
  const [value, setValue] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = useId()
  const hintId = useId()
  const valid = allowEmpty || value.trim().length > 0

  return (
    <Dialog title={title} onClose={onClose} size="sm" initialFocus={inputRef}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!valid) return
          onSubmit(value.trim())
          onClose()
        }}
      >
        <label htmlFor={inputId} className="field-label">
          {label}
        </label>
        <input
          ref={inputRef}
          id={inputId}
          className="input input--full"
          value={value}
          maxLength={40}
          placeholder={placeholder}
          aria-describedby={hint ? hintId : undefined}
          autoComplete="off"
          onChange={(e) => setValue(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
        />
        {hint && (
          <p id={hintId} className="muted small dialog__hint">
            {hint}
          </p>
        )}
        <div className="dialog__actions">
          <button type="button" className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn btn--primary" disabled={!valid}>
            {submitLabel}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
