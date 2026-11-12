import type { Board, Column } from '@/features/tasks/models/schemas'
import { missingDefaultColumns } from './defaults'
import { normalizeLegacyBoard } from './layout'

/**
 * Brings boards created before flexible layouts into the current model: adds default columns that
 * did not exist yet (backlog, blocked) and assigns areas, tracks and stacks so the board looks as
 * before. Boards that already have a layout are never touched (columns may have been removed on
 * purpose). Returns only the records that changed.
 */
export function normalizeBoards(boards: Board[], columns: Column[], now: string): { boards: Board[]; columns: Column[] } {
  const changedBoards: Board[] = []
  const changedColumns = new Map<string, Column>()
  for (const board of boards) {
    if (board.areas) continue
    const own = columns.filter((c) => c.boardId === board.id)
    const added = missingDefaultColumns([board], own, now)
    const normalized = normalizeLegacyBoard(board, [...own, ...added], now)
    if (!normalized) continue
    changedBoards.push(normalized.board)
    for (const column of [...added, ...normalized.columns]) changedColumns.set(column.id, column)
  }
  return { boards: changedBoards, columns: [...changedColumns.values()] }
}
