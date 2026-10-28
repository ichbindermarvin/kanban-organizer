import type { Column, Task } from '@/features/tasks/models/schemas'
import { createDefaultBoard } from '@/features/board/services/defaults'

export const NOW = '2026-08-19T10:00:00.000Z'

export function makeBoard() {
  const { board, columns } = createDefaultBoard(NOW)
  const byRole = (role: Column['role']) => columns.find((c) => c.role === role)!
  return { board, columns, inbox: byRole('inbox'), planned: byRole('planned'), doing: byRole('doing'), done: byRole('done') }
}

let counter = 0
export function makeTask(column: Column, overrides: Partial<Task> = {}): Task {
  counter++
  return {
    id: `task-${counter}`,
    boardId: column.boardId,
    columnId: column.id,
    title: `Task ${counter}`,
    position: counter,
    priority: 'medium',
    tags: [],
    subtasks: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}
