import type { Column, Task } from '@/features/tasks/models/schemas'
import { tasksInColumn } from '@/features/tasks/services/taskQueries'

/**
 * Moves a task to `toIndex` within `toColumnId` (same or different column).
 * Positions of affected columns are renumbered 0..n-1. Returns only tasks that changed,
 * each with a fresh `updatedAt`, ready to be persisted.
 */
export function moveTask(tasks: Task[], taskId: string, toColumnId: string, toIndex: number, now: string): Task[] {
  const task = tasks.find((t) => t.id === taskId)
  if (!task) return []
  const fromColumnId = task.columnId

  const source = tasksInColumn(tasks, fromColumnId).filter((t) => t.id !== taskId)
  const target = fromColumnId === toColumnId ? source : tasksInColumn(tasks, toColumnId)
  const index = Math.max(0, Math.min(toIndex, target.length))
  target.splice(index, 0, { ...task, columnId: toColumnId })

  const changed = new Map<string, Task>()
  const renumber = (list: Task[]) =>
    list.forEach((t, position) => {
      const original = tasks.find((o) => o.id === t.id)!
      if (original.position !== position || original.columnId !== t.columnId) {
        changed.set(t.id, { ...t, position, updatedAt: now })
      }
    })
  renumber(target)
  if (fromColumnId !== toColumnId) renumber(source)
  return [...changed.values()]
}

/** True when moving one more task into `column` would exceed its (soft) WIP limit. */
export function wouldExceedWip(column: Column, tasks: Task[], movingTaskId?: string): boolean {
  if (!column.wipLimit) return false
  const count = tasksInColumn(tasks, column.id).filter((t) => t.id !== movingTaskId).length
  return count >= column.wipLimit
}
