import { memo } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { Column, Task } from '@/features/tasks/models/schemas'
import { columnTitle, useAppStore } from '@/state/appStore'
import { useT } from '@/shared/hooks/useT'
import { Menu } from '@/shared/components/Menu'
import { Icon } from '@/shared/components/Icon'
import { SortableTaskCard } from './SortableTaskCard'
import { ColumnComposer } from './ColumnComposer'

interface BoardColumnProps {
  column: Column
  tasks: Task[]
  totalCount: number
  dragDisabled: boolean
}

export const COLUMN_PREFIX = 'column:'

export const BoardColumn = memo(function BoardColumn({ column, tasks, totalCount, dragDisabled }: BoardColumnProps) {
  const t = useT()
  const locale = useAppStore((s) => s.settings.locale)
  const archiveDone = useAppStore((s) => s.archiveDone)
  const { setNodeRef, isOver } = useDroppable({ id: COLUMN_PREFIX + column.id })
  const name = columnTitle(column, locale)
  const headingId = `column-heading-${column.id}`
  const limit = column.wipLimit
  const wipState = limit ? (totalCount > limit ? 'over' : totalCount === limit ? 'full' : 'ok') : undefined
  const done = column.role === 'done'

  return (
    <section className={`column column--${column.role}${isOver ? ' column--over' : ''}`} aria-labelledby={headingId} data-column={column.role}>
      <header className="column__header">
        <h2 id={headingId} className="column__title">
          {name}
        </h2>
        {limit ? (
          <span className={`column__count column__count--wip column__count--${wipState}`} title={t('column.wipLabel', { count: totalCount, limit })}>
            {wipState !== 'ok' && <Icon name="alert" size={12} />}
            <span aria-hidden="true">{t('column.wip', { count: totalCount, limit })}</span>
            <span className="visually-hidden">{t('column.wipLabel', { count: totalCount, limit })}</span>
          </span>
        ) : (
          <span className="column__count" aria-label={t('column.count', { count: totalCount })}>
            {totalCount}
          </span>
        )}
        {done && (
          <Menu
            label={t('column.menu')}
            trigger={<Icon name="more" />}
            triggerClassName="icon-btn icon-btn--sm column__menu"
            entries={[
              { type: 'item', label: t('column.archiveDone'), icon: <Icon name="archive" />, onSelect: () => archiveDone() },
              { type: 'item', label: t('column.archiveOld'), icon: <Icon name="archive" />, onSelect: () => archiveDone(30) },
            ]}
          />
        )}
      </header>
      <SortableContext id={column.id} items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="column__list" role="list" aria-labelledby={headingId}>
          {tasks.map((task) => (
            <div role="listitem" key={task.id}>
              <SortableTaskCard task={task} done={done} disabled={dragDisabled} />
            </div>
          ))}
          {tasks.length === 0 && done && <p className="column__empty">{t('column.empty')}</p>}
          {!done && <ColumnComposer columnId={column.id} columnName={name} />}
        </div>
      </SortableContext>
    </section>
  )
})
