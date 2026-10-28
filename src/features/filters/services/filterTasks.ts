import { endOfWeek } from 'date-fns'
import type { Priority, Task } from '@/features/tasks/models/schemas'
import { fromIsoDate, toIsoDate } from '@/shared/utils/dates'
import { byDueDate, byPosition, byPriority } from '@/features/tasks/services/taskQueries'

export type DueFilter = 'overdue' | 'today' | 'week' | 'none'

export interface TaskFilter {
  priorities: Priority[]
  due: DueFilter[]
  tags: string[]
}

export const EMPTY_FILTER: TaskFilter = { priorities: [], due: [], tags: [] }

export function isFilterActive(filter: TaskFilter): boolean {
  return filter.priorities.length + filter.due.length + filter.tags.length > 0
}

function matchesDue(task: Task, due: DueFilter, today: string): boolean {
  switch (due) {
    case 'overdue':
      return !!task.dueDate && task.dueDate < today
    case 'today':
      return task.dueDate === today
    case 'week': {
      const end = toIsoDate(endOfWeek(fromIsoDate(today), { weekStartsOn: 1 }))
      return !!task.dueDate && task.dueDate >= today && task.dueDate <= end
    }
    case 'none':
      return !task.dueDate
  }
}

/**
 * Categories are combined with AND, options inside a category with OR.
 * Example: priority (high OR urgent) AND due (today) AND tag (Content OR Admin).
 */
export function filterTasks(tasks: Task[], filter: TaskFilter, today: string): Task[] {
  const tags = filter.tags.map((t) => t.toLocaleLowerCase())
  return tasks.filter(
    (task) =>
      (filter.priorities.length === 0 || filter.priorities.includes(task.priority)) &&
      (filter.due.length === 0 || filter.due.some((d) => matchesDue(task, d, today))) &&
      (tags.length === 0 || task.tags.some((t) => tags.includes(t.toLocaleLowerCase()))),
  )
}

export type SortMode = 'manual' | 'priority' | 'dueDate' | 'created'

export function sortTasks(tasks: Task[], mode: SortMode): Task[] {
  const list = [...tasks]
  switch (mode) {
    case 'manual':
      return list.sort(byPosition)
    case 'priority':
      return list.sort((a, b) => byPriority(a, b) || byPosition(a, b))
    case 'dueDate':
      return list.sort((a, b) => byDueDate(a, b) || byPosition(a, b))
    case 'created':
      return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }
}
