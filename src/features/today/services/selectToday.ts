import type { Column, Task } from '@/features/tasks/models/schemas'
import { byDueDate, byPosition, byPriority, indexColumns, isOpen } from '@/features/tasks/services/taskQueries'

export interface TodaySections {
  overdue: Task[]
  dueToday: Task[]
  inProgress: Task[]
}

/**
 * Today view: a computed view over the same tasks (nothing is copied or modified).
 * Each task appears at most once – in the first matching section (overdue → today → in progress).
 */
export function selectToday(tasks: Task[], columns: Column[], today: string): TodaySections {
  const columnsById = indexColumns(columns)
  const open = tasks.filter((t) => isOpen(t, columnsById))
  const overdue = open.filter((t) => t.dueDate !== undefined && t.dueDate < today)
  const dueToday = open.filter((t) => t.dueDate === today)
  const seen = new Set([...overdue, ...dueToday].map((t) => t.id))
  const inProgress = open.filter((t) => columnsById.get(t.columnId)?.role === 'doing' && !seen.has(t.id))
  return {
    overdue: overdue.sort((a, b) => byDueDate(a, b) || byPriority(a, b)),
    dueToday: dueToday.sort((a, b) => byPriority(a, b) || byPosition(a, b)),
    inProgress: inProgress.sort(byPosition),
  }
}

export function selectOverdue(tasks: Task[], columns: Column[], today: string): Task[] {
  return selectToday(tasks, columns, today).overdue
}

export function selectHighPriority(tasks: Task[], columns: Column[]): Task[] {
  const columnsById = indexColumns(columns)
  return tasks
    .filter((t) => isOpen(t, columnsById) && (t.priority === 'high' || t.priority === 'urgent'))
    .sort((a, b) => byPriority(a, b) || byDueDate(a, b) || byPosition(a, b))
}
