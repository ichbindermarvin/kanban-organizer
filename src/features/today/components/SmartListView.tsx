import { useMemo } from 'react'
import { useAppStore } from '@/state/appStore'
import { useActiveBoardTasks } from '@/features/board/services/useActiveBoardTasks'
import { selectHighPriority, selectOverdue } from '@/features/today/services/selectToday'
import { filterTasks } from '@/features/filters/services/filterTasks'
import { FilterPopover, ResetFilterButton } from '@/features/filters/components/FilterPopover'
import { TaskList } from '@/features/tasks/components/TaskList'
import { useT } from '@/shared/hooks/useT'

/** Smart views show the same tasks selected by criteria – nothing is copied. */
export function SmartListView({ kind }: { kind: 'overdue' | 'high' }) {
  const t = useT()
  const boardTasks = useActiveBoardTasks()
  const columns = useAppStore((s) => s.columns)
  const today = useAppStore((s) => s.today)
  const filter = useAppStore((s) => s.filter)
  const list = useMemo(() => {
    const selected = kind === 'overdue' ? selectOverdue(boardTasks, columns, today) : selectHighPriority(boardTasks, columns)
    return filterTasks(selected, filter, today)
  }, [boardTasks, columns, today, filter, kind])
  const title = kind === 'overdue' ? t('views.overdue.title') : t('views.high.title')

  return (
    <div className="view view--list">
      <div className="view__header">
        <h1 className="view__title">{title}</h1>
        <div className="toolbar">
          <ResetFilterButton />
          <FilterPopover />
        </div>
      </div>
      {list.length === 0 ? <p className="empty-state">{kind === 'overdue' ? t('views.overdue.empty') : t('views.high.empty')}</p> : <TaskList tasks={list} label={title} />}
    </div>
  )
}
