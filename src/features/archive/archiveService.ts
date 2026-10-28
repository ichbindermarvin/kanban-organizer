import { subDays } from 'date-fns'
import type { Column, Task } from '@/features/tasks/models/schemas'
import { indexColumns, isActive } from '@/features/tasks/services/taskQueries'

/** Archives completed tasks of the board. With `olderThanDays`, only tasks completed before that many days ago. */
export function archiveCompleted(tasks: Task[], columns: Column[], now: Date, olderThanDays?: number): Task[] {
  const columnsById = indexColumns(columns)
  const cutoff = olderThanDays === undefined ? undefined : subDays(now, olderThanDays).toISOString()
  const timestamp = now.toISOString()
  return tasks
    .filter((t) => isActive(t) && columnsById.get(t.columnId)?.role === 'done')
    .filter((t) => cutoff === undefined || (t.completedAt ?? t.updatedAt) < cutoff)
    .map((t) => ({ ...t, archivedAt: timestamp, updatedAt: timestamp }))
}
