import type { Task } from '@/features/tasks/models/schemas'
import { useAppStore } from '@/state/appStore'
import { useT } from '@/shared/hooks/useT'
import { dueState, formatDue } from '@/shared/utils/format'
import { Icon } from '@/shared/components/Icon'
import { colorDescription } from '@/features/tasks/services/colorLabels'

export function PriorityBadge({ priority }: { priority: Task['priority'] }) {
  const t = useT()
  // Medium is the default and stays invisible to keep cards calm.
  if (priority === 'medium') return null
  return (
    <span className={`badge badge--priority badge--${priority}`}>
      {priority !== 'low' && <Icon name="arrowUp" size={12} />}
      <span>{t(`priority.${priority}`)}</span>
    </span>
  )
}

export function DueBadge({ dueDate, completed }: { dueDate: string; completed?: boolean }) {
  const today = useAppStore((s) => s.today)
  const locale = useAppStore((s) => s.settings.locale)
  const t = useT()
  const state = completed ? 'future' : dueState(dueDate, today)
  const label = formatDue(dueDate, today, locale)
  return (
    <span className={`badge badge--due badge--due-${state}`}>
      <Icon name={state === 'overdue' ? 'overdue' : 'calendar'} size={12} />
      <span>{label}</span>
      {state === 'overdue' && <span className="visually-hidden">, {t('due.overdue')}</span>}
    </span>
  )
}

/** Compact secondary line of a task: priority, deadline, subtasks, recurrence, tags. */
export function TaskMeta({ task, completed, extra }: { task: Task; completed?: boolean; extra?: React.ReactNode }) {
  const t = useT()
  const colorLabel = useAppStore((s) => (task.color ? s.settings.colorLabels?.[task.color]?.trim() : undefined))
  const colorText = useAppStore((s) => (task.color ? colorDescription(task.color, s.settings, t) : undefined))
  const doneSubtasks = task.subtasks.filter((s) => s.completed).length
  const hasMeta = task.priority !== 'medium' || task.dueDate || task.subtasks.length || task.recurrence || task.tags.length || extra || task.color
  if (!hasMeta) return null
  return (
    <div className="task-meta">
      {/* The color's meaning is shown as text, so color is never the only carrier of information. */}
      {colorLabel ? (
        <span className={`badge badge--color color-${task.color}`}>
          <span className="dot" aria-hidden="true" />
          <span>{colorLabel}</span>
        </span>
      ) : (
        colorText && <span className="visually-hidden">{t('color.set', { color: colorText })}</span>
      )}
      <PriorityBadge priority={task.priority} />
      {task.dueDate && <DueBadge dueDate={task.dueDate} completed={completed} />}
      {task.subtasks.length > 0 && (
        <span className="badge badge--subtle" title={t('task.subtaskProgress', { done: doneSubtasks, total: task.subtasks.length })}>
          <Icon name="subtasks" size={12} />
          <span aria-hidden="true">
            {doneSubtasks}/{task.subtasks.length}
          </span>
          <span className="visually-hidden">{t('task.subtaskProgress', { done: doneSubtasks, total: task.subtasks.length })}</span>
        </span>
      )}
      {task.recurrence && (
        <span className="badge badge--subtle" title={t('task.recurring')}>
          <Icon name="repeat" size={12} />
          <span className="visually-hidden">{t('task.recurring')}</span>
        </span>
      )}
      {task.tags.length > 0 && <span className="task-meta__tags">{task.tags.join(' · ')}</span>}
      {extra}
    </div>
  )
}
