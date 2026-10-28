import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { PRIORITIES } from '@/features/tasks/models/schemas'
import { isFilterActive, type DueFilter, type TaskFilter } from '@/features/filters/services/filterTasks'
import { allTags } from '@/features/tasks/services/taskQueries'
import { useAppStore } from '@/state/appStore'
import { useT } from '@/shared/hooks/useT'
import { Icon } from '@/shared/components/Icon'

const DUE_OPTIONS: DueFilter[] = ['overdue', 'today', 'week', 'none']

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

export function FilterPopover() {
  const t = useT()
  const filter = useAppStore((s) => s.filter)
  const setFilter = useAppStore((s) => s.setFilter)
  const resetFilter = useAppStore((s) => s.resetFilter)
  const tasks = useAppStore((s) => s.tasks)
  const tags = useMemo(() => allTags(tasks), [tasks])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  const count = filter.priorities.length + filter.due.length + filter.tags.length

  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [open])

  const update = (patch: Partial<TaskFilter>) => setFilter({ ...filter, ...patch })

  return (
    <div
      className="popover-anchor"
      ref={ref}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.preventDefault()
          e.stopPropagation()
          setOpen(false)
          buttonRef.current?.focus()
        }
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className={`btn btn--ghost${isFilterActive(filter) ? ' btn--active' : ''}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="filter" />
        <span>{count ? t('filter.activeCount', { count }) : t('filter.button')}</span>
      </button>
      {open && (
        <div id={panelId} className="popover filter-panel" role="group" aria-label={t('filter.button')}>
          <fieldset>
            <legend>{t('filter.priority')}</legend>
            {PRIORITIES.map((p) => (
              <label key={p} className="checkbox">
                <input type="checkbox" checked={filter.priorities.includes(p)} onChange={() => update({ priorities: toggle(filter.priorities, p) })} />
                {t(`priority.${p}`)}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>{t('filter.due')}</legend>
            {DUE_OPTIONS.map((d) => (
              <label key={d} className="checkbox">
                <input type="checkbox" checked={filter.due.includes(d)} onChange={() => update({ due: toggle(filter.due, d) })} />
                {t(`filter.due.${d}`)}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>{t('filter.tags')}</legend>
            {tags.length === 0 && <p className="muted small">{t('filter.noTags')}</p>}
            <div className="filter-panel__tags">
              {tags.map((tag) => (
                <label key={tag} className="checkbox">
                  <input type="checkbox" checked={filter.tags.includes(tag)} onChange={() => update({ tags: toggle(filter.tags, tag) })} />
                  {tag}
                </label>
              ))}
            </div>
          </fieldset>
          <button type="button" className="btn btn--small" onClick={resetFilter} disabled={!isFilterActive(filter)}>
            {t('filter.reset')}
          </button>
        </div>
      )}
    </div>
  )
}

export function ResetFilterButton() {
  const t = useT()
  const filter = useAppStore((s) => s.filter)
  const resetFilter = useAppStore((s) => s.resetFilter)
  if (!isFilterActive(filter)) return null
  return (
    <button type="button" className="btn btn--ghost btn--small" onClick={resetFilter}>
      <Icon name="close" size={14} />
      {t('filter.reset')}
    </button>
  )
}
