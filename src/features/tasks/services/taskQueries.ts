import type { Column, Task } from '@/features/tasks/models/schemas'

/** Visible on the board: not archived and not deleted. */
export function isActive(task: Task): boolean {
  return !task.archivedAt && !task.deletedAt
}

export function isDone(task: Task, columnsById: Map<string, Column>): boolean {
  return columnsById.get(task.columnId)?.role === 'done'
}

/** Active and not completed. */
export function isOpen(task: Task, columnsById: Map<string, Column>): boolean {
  return isActive(task) && !isDone(task, columnsById)
}

export function indexColumns(columns: Column[]): Map<string, Column> {
  return new Map(columns.map((c) => [c.id, c]))
}

export function tasksInColumn(tasks: Task[], columnId: string): Task[] {
  return tasks.filter((t) => t.columnId === columnId && isActive(t)).sort(byPosition)
}

export function byPosition(a: Task, b: Task): number {
  return a.position - b.position || a.createdAt.localeCompare(b.createdAt)
}

const PRIORITY_RANK = { urgent: 0, high: 1, medium: 2, low: 3 } as const

export function byPriority(a: Task, b: Task): number {
  return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
}

/** Earliest deadline first, tasks without deadline last. */
export function byDueDate(a: Task, b: Task): number {
  if (a.dueDate === b.dueDate) return 0
  if (!a.dueDate) return 1
  if (!b.dueDate) return -1
  return a.dueDate < b.dueDate ? -1 : 1
}

export function allTags(tasks: Task[]): string[] {
  const seen = new Map<string, string>()
  for (const task of tasks) {
    if (task.deletedAt) continue
    for (const tag of task.tags) {
      const key = tag.toLocaleLowerCase()
      if (!seen.has(key)) seen.set(key, tag)
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b))
}
