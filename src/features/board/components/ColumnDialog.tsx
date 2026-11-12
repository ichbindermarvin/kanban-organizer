import { useId, useRef, useState } from 'react'
import { COLUMN_ROLES, type Column, type ColumnRole } from '@/features/tasks/models/schemas'
import { useAppStore } from '@/state/appStore'
import { Dialog } from '@/shared/components/Dialog'
import { useT } from '@/shared/hooks/useT'
import { translate } from '@/shared/i18n'

/** Edit name, type and WIP limit of a column (or only the name of a split column). */
export function ColumnDialog({ column, onClose }: { column: Column; onClose: () => void }) {
  const t = useT()
  const locale = useAppStore((s) => s.settings.locale)
  const updateColumn = useAppStore((s) => s.updateColumn)
  const showToast = useAppStore((s) => s.showToast)
  const group = column.kind === 'group'
  const [title, setTitle] = useState(column.title)
  const [role, setRole] = useState<ColumnRole>(column.role)
  const [wip, setWip] = useState(column.wipLimit ? String(column.wipLimit) : '')
  const inputRef = useRef<HTMLInputElement>(null)
  const ids = { name: useId(), type: useId(), wip: useId(), hint: useId() }
  const defaultName = translate(locale, `column.${role}`)

  return (
    <Dialog title={group ? t('column.editGroup') : t('column.edit')} onClose={onClose} size="sm" initialFocus={inputRef}>
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault()
          const wipLimit = Number(wip) >= 1 ? Math.floor(Number(wip)) : undefined
          const result = updateColumn(column.id, group ? { title: title.trim() } : { title: title.trim(), role, wipLimit })
          if (!result.ok) {
            showToast({ message: t(`layout.error.${result.reason}`), tone: 'error' })
            return
          }
          onClose()
        }}
      >
        <div>
          <label htmlFor={ids.name} className="field-label">
            {t('boards.name')}
          </label>
          <input
            ref={inputRef}
            id={ids.name}
            className="input input--full"
            value={title}
            maxLength={40}
            placeholder={defaultName}
            aria-describedby={ids.hint}
            autoComplete="off"
            onChange={(e) => setTitle(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
          />
          <p id={ids.hint} className="muted small dialog__hint">
            {t('column.renameHint', { name: defaultName })}
          </p>
        </div>
        {!group && (
          <>
            <div>
              <label htmlFor={ids.type} className="field-label">
                {t('column.type')}
              </label>
              <select id={ids.type} className="select input--full" value={role} onChange={(e) => setRole(e.target.value as ColumnRole)}>
                {COLUMN_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t(`role.${r}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={ids.wip} className="field-label">
                {t('column.wipLimit')}
              </label>
              <input
                id={ids.wip}
                className="input input--small input--number"
                type="number"
                min={1}
                max={99}
                value={wip}
                placeholder={t('common.none')}
                onChange={(e) => setWip(e.target.value)}
              />
            </div>
          </>
        )}
        <div className="dialog__actions">
          <button type="button" className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn btn--primary">
            {t('common.save')}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
