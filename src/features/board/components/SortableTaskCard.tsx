import type { KeyboardEventHandler, PointerEventHandler } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Task } from '@/features/tasks/models/schemas'
import { TaskCard } from '@/features/tasks/components/TaskCard'

export function SortableTaskCard({ task, done, blocked, disabled }: { task: Task; done: boolean; blocked?: boolean; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled,
  })
  return (
    <TaskCard
      task={task}
      done={done}
      blocked={blocked}
      drag={{
        nodeRef: setNodeRef,
        handleRef: setActivatorNodeRef,
        handleProps: { ...attributes, onKeyDown: listeners?.onKeyDown as KeyboardEventHandler<HTMLButtonElement> | undefined },
        onPointerDown: listeners?.onPointerDown as PointerEventHandler<HTMLElement> | undefined,
        style: { transform: CSS.Translate.toString(transform), transition },
        isDragging,
        dragDisabled: disabled,
      }}
    />
  )
}
