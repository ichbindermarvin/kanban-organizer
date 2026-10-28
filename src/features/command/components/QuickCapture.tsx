import { useRef, useState } from 'react'
import type { ColumnRole } from '@/features/tasks/models/schemas'
import { columnByRole } from '@/features/board/services/defaults'
import { columnTitle, useAppStore } from '@/state/appStore'
import { Dialog } from '@/shared/components/Dialog'
import { useT } from '@/shared/hooks/useT'

const TARGETS: ColumnRole[] = ['backlog', 'inbox', 'planned', 'doing']

/** Global quick capture (shortcut N): title → Enter. Inbox is the default target. */
export function QuickCapture() {
  const t = useT()
  const { open, role: initialRole } = useAppStore((s) => s.quickCapture)
  if (!open) return null
  return <QuickCaptureDialog initialRole={initialRole} t={t} />
}

function QuickCaptureDialog({ initialRole, t }: { initialRole: ColumnRole; t: ReturnType<typeof useT> }) {
  const locale = useAppStore((s) => s.settings.locale)
  const columns = useAppStore((s) => s.columns)
  const boardId = useAppStore((s) => s.activeBoardId())
  const { addTask, closeQuickCapture, showToast } = useAppStore.getState()
  const [title, setTitle] = useState('')
  const [role, setRole] = useState<ColumnRole>(initialRole)
  const inputRef = useRef<HTMLInputElement>(null)

  const submit = () => {
    const column = columnByRole(columns, boardId, role)
    if (!column || !title.trim()) return
    addTask(title, column.id)
    closeQuickCapture()
    showToast({ message: t('toast.created', { column: columnTitle(column, locale) }) })
  }

  return (
    <Dialog title={t('quick.title')} onClose={closeQuickCapture} initialFocus={inputRef} position="top" size="md">
      <form
        className="quick"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <input
          ref={inputRef}
          className="input input--large"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('quick.placeholder')}
          aria-label={t('task.title')}
          autoComplete="off"
        />
        <div className="quick__footer">
          <div className="segmented segmented--small" role="radiogroup" aria-label={t('quick.target')}>
            {TARGETS.map((target) => {
              const column = columnByRole(columns, boardId, target)
              return (
                <button
                  key={target}
                  type="button"
                  role="radio"
                  aria-checked={role === target}
                  className="segmented__item"
                  onClick={() => {
                    setRole(target)
                    inputRef.current?.focus()
                  }}
                >
                  {column ? columnTitle(column, locale) : target}
                </button>
              )
            })}
          </div>
          <span className="muted small">{t('quick.hint')}</span>
          <button type="submit" className="btn btn--primary btn--small" disabled={!title.trim()}>
            {t('quick.save')}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
