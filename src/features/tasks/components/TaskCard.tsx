import { memo, type CSSProperties, type HTMLAttributes, type Ref } from 'react'
import type { Task } from '@/features/tasks/models/schemas'
import { useAppStore } from '@/state/appStore'
import { useT } from '@/shared/hooks/useT'
import { Icon } from '@/shared/components/Icon'
import { TaskMeta } from './TaskMeta'
import { TaskActionsMenu } from './TaskActionsMenu'
import { CompleteButton } from './CompleteButton'

export interface DragBindings {
  nodeRef?: Ref<HTMLElement>
  handleRef?: Ref<HTMLButtonElement>
  handleProps?: HTMLAttributes<HTMLButtonElement>
  onPointerDown?: HTMLAttributes<HTMLElement>['onPointerDown']
  style?: CSSProperties
  isDragging?: boolean
  dragDisabled?: boolean
}

interface TaskCardProps {
  task: Task
  done: boolean
  /** Shows the "waiting for" line (only for tasks in "Blockiert"). */
  blocked?: boolean
  drag?: DragBindings
  overlay?: boolean
}

export const TaskCard = memo(function TaskCard({ task, done, blocked, drag, overlay }: TaskCardProps) {
  const t = useT()
  const openDrawer = useAppStore((s) => s.openDrawer)
  const selectTask = useAppStore((s) => s.selectTask)
  const selected = useAppStore((s) => s.selectedTaskId === task.id)
  const title = task.title || t('task.untitled')

  return (
    <article
      ref={drag?.nodeRef as Ref<HTMLElement>}
      style={drag?.style}
      className={`card${task.color ? ` card--colored color-${task.color}` : ''}${done ? ' card--done' : ''}${drag?.isDragging ? ' card--placeholder' : ''}${overlay ? ' card--overlay' : ''}${selected ? ' card--selected' : ''}`}
      data-task-id={task.id}
      onPointerDown={drag?.onPointerDown}
      onFocus={() => selectTask(task.id)}
    >
      <CompleteButton task={task} done={done} />
      <button type="button" className="card__main" onClick={() => openDrawer(task.id)}>
        <span className="card__title">{title}</span>
        {blocked && task.waitingFor && <span className="waiting">{t('task.waitingForLine', { text: task.waitingFor })}</span>}
        <TaskMeta task={task} completed={done} />
      </button>
      <div className="card__actions">
        {!drag?.dragDisabled && (
          <button
            ref={drag?.handleRef}
            type="button"
            className="icon-btn drag-handle"
            {...drag?.handleProps}
            aria-label={`${t('task.moveTo')} ${title}`}
          >
            <Icon name="grip" />
          </button>
        )}
        <TaskActionsMenu task={task} />
      </div>
    </article>
  )
})
