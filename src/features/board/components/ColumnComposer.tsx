import { useRef, useState } from 'react'
import { useAppStore } from '@/state/appStore'
import { useT } from '@/shared/hooks/useT'
import { Icon } from '@/shared/components/Icon'

/** Inline "+ Aufgabe": type a title, Enter creates it and keeps the field open for the next one. */
export function ColumnComposer({ columnId, columnName }: { columnId: string; columnName: string }) {
  const t = useT()
  const addTask = useAppStore((s) => s.addTask)
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const buttonRef = useRef<HTMLButtonElement>(null)

  const close = () => {
    setOpen(false)
    setTitle('')
    requestAnimationFrame(() => buttonRef.current?.focus())
  }

  if (!open) {
    return (
      <button ref={buttonRef} type="button" className="column__add" onClick={() => setOpen(true)} aria-label={t('column.addTaskLabel', { column: columnName })}>
        <Icon name="plus" size={14} />
        <span>{t('column.addTask')}</span>
      </button>
    )
  }

  return (
    <form
      className="column__composer"
      onSubmit={(e) => {
        e.preventDefault()
        if (title.trim()) addTask(title, columnId)
        setTitle('')
      }}
    >
      <input
        autoFocus
        className="input"
        value={title}
        placeholder={t('column.newTaskPlaceholder')}
        aria-label={t('column.addTaskLabel', { column: columnName })}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            close()
          }
        }}
        onBlur={() => {
          if (!title.trim()) close()
        }}
      />
    </form>
  )
}
