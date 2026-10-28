import type { Task } from '@/features/tasks/models/schemas'
import { columnTitle, useAppStore } from '@/state/appStore'
import { useT } from '@/shared/hooks/useT'
import { TaskMeta } from './TaskMeta'
import { TaskActionsMenu } from './TaskActionsMenu'
import { CompleteButton } from './CompleteButton'

interface TaskRowProps {
  task: Task
  showColumn?: boolean
  extra?: React.ReactNode
  /** Shows backlog tasks slightly greyed out (used by the Today view). */
  dimBacklog?: boolean
}

export function TaskRow({ task, showColumn = true, extra, dimBacklog }: TaskRowProps) {
  const t = useT()
  const locale = useAppStore((s) => s.settings.locale)
  const column = useAppStore((s) => s.columns.find((c) => c.id === task.columnId))
  const boardName = useAppStore((s) => (s.boards.filter((b) => !b.archivedAt).length > 1 ? s.boards.find((b) => b.id === task.boardId)?.name : undefined))
  const openDrawer = useAppStore((s) => s.openDrawer)
  const selectTask = useAppStore((s) => s.selectTask)
  const selected = useAppStore((s) => s.selectedTaskId === task.id)
  const done = column?.role === 'done'
  const title = task.title || t('task.untitled')
  const columnBadge =
    showColumn && column ? <span className={`badge badge--column badge--col-${column.role}`}>{boardName ? `${boardName} · ` : ''}{columnTitle(column, locale)}</span> : null

  return (
    <li
      className={`row${task.color ? ` row--colored color-${task.color}` : ''}${done ? ' row--done' : ''}${dimBacklog && column?.role === 'backlog' ? ' row--dimmed' : ''}${selected ? ' row--selected' : ''}`} data-task-id={task.id} onFocus={() => selectTask(task.id)}>
      <CompleteButton task={task} done={done} />
      <button type="button" className="row__main" onClick={() => openDrawer(task.id)}>
        <span className="row__title">{title}</span>
        <TaskMeta
          task={task}
          completed={done}
          extra={
            <>
              {columnBadge}
              {extra}
            </>
          }
        />
      </button>
      <TaskActionsMenu task={task} />
    </li>
  )
}

export function TaskList({ tasks, label, showColumn, dimBacklog }: { tasks: Task[]; label?: string; showColumn?: boolean; dimBacklog?: boolean }) {
  return (
    <ul className="task-list" aria-label={label}>
      {tasks.map((task) => (
        <TaskRow key={task.id} task={task} showColumn={showColumn} dimBacklog={dimBacklog} />
      ))}
    </ul>
  )
}
