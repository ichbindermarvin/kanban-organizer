import type { Task } from '@/features/tasks/models/schemas'
import { useAppStore } from '@/state/appStore'
import { useT } from '@/shared/hooks/useT'
import { Icon } from '@/shared/components/Icon'

export function CompleteButton({ task, done }: { task: Task; done: boolean }) {
  const t = useT()
  const toggle = useAppStore((s) => s.toggleComplete)
  const title = task.title || t('task.untitled')
  return (
    <button
      type="button"
      className={`check${done ? ' check--done' : ''}`}
      aria-label={done ? t('task.reopen', { title }) : t('task.complete', { title })}
      aria-pressed={done}
      disabled={!!task.archivedAt}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        toggle(task.id)
      }}
    >
      <Icon name="check" size={12} />
    </button>
  )
}
