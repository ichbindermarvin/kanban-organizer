import type { Board, Column, ColumnRole } from '@/features/tasks/models/schemas'
import { newId } from '@/shared/utils/id'

export const DEFAULT_COLUMN_ROLES: ColumnRole[] = ['inbox', 'planned', 'doing', 'done']
export const DEFAULT_WIP_LIMITS: Partial<Record<ColumnRole, number>> = { doing: 3 }

export function createDefaultBoard(now: string, name = 'Persönlich'): { board: Board; columns: Column[] } {
  const board: Board = { id: newId(), name, createdAt: now, updatedAt: now }
  const columns: Column[] = DEFAULT_COLUMN_ROLES.map((role, index) => ({
    id: newId(),
    boardId: board.id,
    title: '',
    role,
    position: index,
    ...(DEFAULT_WIP_LIMITS[role] ? { wipLimit: DEFAULT_WIP_LIMITS[role] } : {}),
    createdAt: now,
    updatedAt: now,
  }))
  return { board, columns }
}

export function columnByRole(columns: Column[], boardId: string, role: ColumnRole): Column | undefined {
  return columns.find((c) => c.boardId === boardId && c.role === role)
}
