import { memo, type ReactNode } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { Column, Task } from '@/features/tasks/models/schemas'
import { columnTitle, useAppStore } from '@/state/appStore'
import { useT } from '@/shared/hooks/useT'
import { Menu, type MenuEntry } from '@/shared/components/Menu'
import { Icon } from '@/shared/components/Icon'
import { SortableTaskCard } from './SortableTaskCard'
import { ColumnComposer } from './ColumnComposer'

export const COLUMN_PREFIX = 'column:'

export interface CollapseProps {
  collapsed: boolean
  /** strip = vertical strip (column alone in its track), bar = horizontal bar (stacked). */
  collapseStyle: 'strip' | 'bar'
  /** Always show the collapse button in the header (otherwise it is in the menu). */
  showToggle: boolean
  /** Strips fold towards the right edge (e.g. "Erledigt") instead of the left. */
  foldsRight?: boolean
  onToggleCollapse: () => void
}

function CollapseToggle({ name, collapsed, collapseStyle, foldsRight, onToggleCollapse }: CollapseProps & { name: string }) {
  const t = useT()
  // The arrow points where the column goes: collapsing folds it towards its edge, expanding away from it.
  const icon = collapseStyle === 'bar' ? (collapsed ? 'chevronUp' : 'chevronDown') : collapsed !== !!foldsRight ? 'chevronRight' : 'chevronLeft'
  return (
    <button
      type="button"
      className="icon-btn icon-btn--sm column__toggle"
      aria-expanded={!collapsed}
      aria-label={collapsed ? t('column.expand', { column: name }) : t('column.collapse', { column: name })}
      onClick={onToggleCollapse}
    >
      <Icon name={icon} size={14} />
    </button>
  )
}

function CountBadge({ column, totalCount }: { column: Column; totalCount: number }) {
  const t = useT()
  const limit = column.wipLimit
  if (!limit)
    return (
      <span className="column__count" aria-label={t('column.count', { count: totalCount })}>
        {totalCount}
      </span>
    )
  const state = totalCount > limit ? 'over' : totalCount === limit ? 'full' : 'ok'
  return (
    <span className={`column__count column__count--wip column__count--${state}`} title={t('column.wipLabel', { count: totalCount, limit })}>
      {state !== 'ok' && <Icon name="alert" size={12} />}
      <span aria-hidden="true">{t('column.wip', { count: totalCount, limit })}</span>
      <span className="visually-hidden">{t('column.wipLabel', { count: totalCount, limit })}</span>
    </span>
  )
}

/** Collapsed column or group: a vertical strip or a horizontal bar that still accepts drops. */
export function CollapsedColumn({
  column,
  dropId,
  totalCount,
  menuEntries,
  ...collapse
}: CollapseProps & { column: Column; dropId: string; totalCount: number; menuEntries: MenuEntry[] }) {
  const t = useT()
  const locale = useAppStore((s) => s.settings.locale)
  const { setNodeRef, isOver } = useDroppable({ id: COLUMN_PREFIX + dropId })
  const name = columnTitle(column, locale)
  const headingId = `column-heading-${column.id}`
  const roleClass = column.kind === 'group' ? 'column--group' : `column--${column.role}`
  if (collapse.collapseStyle === 'bar')
    return (
      <section ref={setNodeRef} className={`column ${roleClass} column--bar${isOver ? ' column--over' : ''}`} aria-labelledby={headingId} data-column={column.role}>
        <header className="column__header">
          <h2 id={headingId} className="column__title" title={name}>
            {name}
          </h2>
          <span className="column__count" aria-label={t('column.count', { count: totalCount })}>
            {totalCount}
          </span>
          <Menu label={`${t('column.menu')}: ${name}`} trigger={<Icon name="more" />} triggerClassName="icon-btn icon-btn--sm column__menu" entries={menuEntries} />
          <CollapseToggle name={name} {...collapse} />
        </header>
      </section>
    )
  return (
    <section ref={setNodeRef} className={`column ${roleClass} column--collapsed${isOver ? ' column--over' : ''}`} aria-labelledby={headingId} data-column={column.role}>
      <CollapseToggle name={name} {...collapse} />
      <h2 id={headingId} className="column__title column__title--vertical">
        {name}
      </h2>
      <span className="column__count" aria-label={t('column.count', { count: totalCount })}>
        {totalCount}
      </span>
    </section>
  )
}

interface BoardColumnProps {
  column: Column
  tasks: Task[]
  totalCount: number
  dragDisabled: boolean
  menuEntries: MenuEntry[]
  collapse?: CollapseProps
  /** Sub-column of a split column: compact header, no own background. */
  sub?: boolean
}

export const BoardColumn = memo(function BoardColumn({ column, tasks, totalCount, dragDisabled, menuEntries, collapse, sub }: BoardColumnProps) {
  const t = useT()
  const locale = useAppStore((s) => s.settings.locale)
  const { setNodeRef, isOver } = useDroppable({ id: COLUMN_PREFIX + column.id })
  const name = columnTitle(column, locale)
  const headingId = `column-heading-${column.id}`
  const done = column.role === 'done'

  return (
    <section
      className={`column column--${column.role}${sub ? ' column--sub' : ''}${isOver ? ' column--over' : ''}`}
      aria-labelledby={headingId}
      data-column={column.role}
    >
      <header className="column__header">
        <h2 id={headingId} className="column__title" title={name}>
          {name}
        </h2>
        <CountBadge column={column} totalCount={totalCount} />
        <Menu label={`${t('column.menu')}: ${name}`} trigger={<Icon name="more" />} triggerClassName="icon-btn icon-btn--sm column__menu" entries={menuEntries} />
        {collapse?.showToggle && <CollapseToggle name={name} {...collapse} />}
      </header>
      <SortableContext id={column.id} items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="column__list" role="list" aria-labelledby={headingId}>
          {tasks.map((task) => (
            <div role="listitem" key={task.id}>
              <SortableTaskCard task={task} done={done} blocked={column.role === 'blocked'} disabled={dragDisabled} />
            </div>
          ))}
          {tasks.length === 0 && done && <p className="column__empty">{t('column.empty')}</p>}
          {!done && <ColumnComposer columnId={column.id} columnName={name} />}
        </div>
      </SortableContext>
    </section>
  )
})

/** Split column: a shared header above sub-columns that sit side by side. */
export function GroupColumn({
  group,
  totalCount,
  menuEntries,
  collapse,
  children,
}: {
  group: Column
  totalCount: number
  menuEntries: MenuEntry[]
  collapse?: CollapseProps
  children: ReactNode
}) {
  const t = useT()
  const locale = useAppStore((s) => s.settings.locale)
  const name = columnTitle(group, locale)
  const headingId = `column-heading-${group.id}`
  return (
    <section className="column column--group" aria-labelledby={headingId} data-column="group">
      <header className="column__header">
        <h2 id={headingId} className="column__title" title={name}>
          {name}
        </h2>
        <span className="column__count" aria-label={t('column.count', { count: totalCount })}>
          {totalCount}
        </span>
        <Menu label={`${t('column.menu')}: ${name}`} trigger={<Icon name="more" />} triggerClassName="icon-btn icon-btn--sm column__menu" entries={menuEntries} />
        {collapse?.showToggle && <CollapseToggle name={name} {...collapse} />}
      </header>
      <div className="column-group__children">{children}</div>
    </section>
  )
}
