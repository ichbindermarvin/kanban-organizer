import type { Column, Priority, Task } from '@/features/tasks/models/schemas'
import { calculateNextOccurrence } from '@/features/recurrence/services/nextOccurrence'
import { columnByRole } from '@/features/board/services/defaults'
import { indexColumns, isActive, tasksInColumn } from './taskQueries'
import { newId } from '@/shared/utils/id'

export interface NewTaskInput {
  boardId: string
  columnId: string
  title: string
  priority?: Priority
  dueDate?: string
  tags?: string[]
}

/** Creates a task at the end of its column. */
export function createTask(input: NewTaskInput, existing: Task[], now: string): Task {
  const siblings = tasksInColumn(existing, input.columnId)
  const last = siblings[siblings.length - 1]
  return {
    id: newId(),
    boardId: input.boardId,
    columnId: input.columnId,
    title: input.title.trim(),
    position: last ? last.position + 1 : 0,
    priority: input.priority ?? 'medium',
    ...(input.dueDate ? { dueDate: input.dueDate } : {}),
    tags: input.tags ?? [],
    subtasks: [],
    createdAt: now,
    updatedAt: now,
  }
}

/** Sets or clears `completedAt` depending on whether the target column is the done column. */
export function applyCompletionState(task: Task, target: Column | undefined, now: string): Task {
  const done = target?.role === 'done'
  if (done && !task.completedAt) return { ...task, completedAt: now }
  if (!done && task.completedAt) {
    const { completedAt: _removed, ...rest } = task
    return rest
  }
  return task
}

/**
 * Builds the next instance of a recurring task that was just completed.
 * Returns null when the task is not recurring, the series ended, or the series already has
 * an open successor (protects against duplicates when a task is reopened and completed again).
 */
export function buildNextRecurrence(task: Task, columns: Column[], tasks: Task[], today: string, now: string): Task | null {
  if (!task.recurrence || !task.dueDate) return null
  const seriesId = task.recurrenceSeriesId ?? task.id
  const columnsById = indexColumns(columns)
  const hasOpenSuccessor = tasks.some(
    (t) =>
      t.id !== task.id &&
      (t.recurrenceSeriesId ?? t.id) === seriesId &&
      isActive(t) &&
      columnsById.get(t.columnId)?.role !== 'done' &&
      (t.dueDate ?? '') > task.dueDate!,
  )
  if (hasOpenSuccessor) return null

  const nextDue = calculateNextOccurrence(task.recurrence, task.dueDate, today)
  if (!nextDue) return null

  // Decision: new instances always start in "Geplant" – they are scheduled by definition.
  const planned = columnByRole(columns, task.boardId, 'planned') ?? columnsById.get(task.columnId)
  if (!planned) return null
  const base = createTask({ boardId: task.boardId, columnId: planned.id, title: task.title }, tasks, now)
  return {
    ...base,
    ...(task.description ? { description: task.description } : {}),
    priority: task.priority,
    dueDate: nextDue,
    tags: [...task.tags],
    subtasks: task.subtasks.map((s) => ({ ...s, id: newId(), completed: false })),
    recurrence: { ...task.recurrence },
    recurrenceSeriesId: seriesId,
  }
}

/**
 * Duplicates a task so it can be reused.
 * - Active tasks are copied right below the original in the same column, deadline included.
 * - Completed or archived tasks are copied into the Inbox without deadline (reuse as a template).
 * Subtasks are reset to open. A recurring copy starts its own new series.
 */
export function duplicateTask(task: Task, columns: Column[], tasks: Task[], now: string, copySuffix: string): { copy: Task; shifted: Task[] } {
  const columnsById = indexColumns(columns)
  const reuse = !!task.archivedAt || columnsById.get(task.columnId)?.role === 'done'
  const targetColumn = reuse ? (columnByRole(columns, task.boardId, 'inbox') ?? columnsById.get(task.columnId)!) : columnsById.get(task.columnId)!
  const siblings = tasksInColumn(tasks, targetColumn.id)

  const id = newId()
  const keepDue = !reuse && task.dueDate
  const copy: Task = {
    id,
    boardId: task.boardId,
    columnId: targetColumn.id,
    title: copySuffix ? `${task.title} ${copySuffix}` : task.title,
    ...(task.description ? { description: task.description } : {}),
    position: 0,
    priority: task.priority,
    ...(keepDue ? { dueDate: task.dueDate } : {}),
    tags: [...task.tags],
    subtasks: task.subtasks.map((s) => ({ ...s, id: newId(), completed: false })),
    ...(task.recurrence && keepDue ? { recurrence: { ...task.recurrence }, recurrenceSeriesId: id } : {}),
    createdAt: now,
    updatedAt: now,
  }

  // Insert after the original (active) or at the end (reuse); renumber the column.
  const insertIndex = reuse ? siblings.length : siblings.findIndex((t) => t.id === task.id) + 1
  const ordered = [...siblings]
  ordered.splice(insertIndex, 0, copy)
  const shifted: Task[] = []
  let result = copy
  ordered.forEach((t, index) => {
    if (t.id === id) result = { ...copy, position: index }
    else if (t.position !== index) shifted.push({ ...t, position: index, updatedAt: now })
  })
  return { copy: result, shifted }
}
