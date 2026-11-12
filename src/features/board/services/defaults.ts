import type { Board, Column, ColumnRole } from '@/features/tasks/models/schemas'
import { newId } from '@/shared/utils/id'

/**
 * Flow order of the board. The backlog sits in front of the inbox; "blocked" shares the track of
 * "planned" (shown below it) and can be collapsed.
 */
export const DEFAULT_COLUMN_ROLES: ColumnRole[] = ['backlog', 'inbox', 'planned', 'blocked', 'doing', 'done']
/** Upper limit of boards. Keeps the tool personal and the navigation calm. */
export const MAX_BOARDS = 3

export const DEFAULT_WIP_LIMITS: Partial<Record<ColumnRole, number>> = { doing: 3 }

function buildColumn(boardId: string, role: ColumnRole, position: number, now: string): Column {
  return {
    id: newId(),
    boardId,
    title: '',
    role,
    position,
    ...(DEFAULT_WIP_LIMITS[role] ? { wipLimit: DEFAULT_WIP_LIMITS[role] } : {}),
    // "Blockiert" is optional and starts collapsed.
    ...(role === 'blocked' ? { collapsed: true } : {}),
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Standard layout: one area, Backlog → Inbox → Geplant (with "Blockiert" stacked below, collapsed)
 * → In Arbeit → Erledigt. Everything can be changed afterwards.
 */
export function createDefaultBoard(now: string, name = 'Persönlich'): { board: Board; columns: Column[] } {
  const areaId = newId()
  const board: Board = { id: newId(), name, areas: [{ id: areaId, title: '', row: 0, position: 0 }], createdAt: now, updatedAt: now }
  let track = -1
  const columns = DEFAULT_COLUMN_ROLES.map((role, index) => {
    const stacked = role === 'blocked'
    if (!stacked) track++
    return { ...buildColumn(board.id, role, index, now), areaId, track, stack: stacked ? 1 : 0 }
  })
  return { board, columns }
}

/**
 * Columns a board is missing compared to the default set (e.g. the backlog for boards created
 * before it existed). New columns are positioned according to the default flow order.
 */
export function missingDefaultColumns(boards: Pick<Board, 'id'>[], columns: Column[], now: string): Column[] {
  const created: Column[] = []
  for (const board of boards) {
    const own = columns.filter((c) => c.boardId === board.id)
    if (own.length === 0) continue
    for (const role of DEFAULT_COLUMN_ROLES) {
      if (own.some((c) => c.role === role)) continue
      const index = DEFAULT_COLUMN_ROLES.indexOf(role)
      const before = own.filter((c) => DEFAULT_COLUMN_ROLES.indexOf(c.role) < index).map((c) => c.position)
      const after = own.filter((c) => DEFAULT_COLUMN_ROLES.indexOf(c.role) > index).map((c) => c.position)
      const position = before.length === 0 ? Math.min(...after) - 1 : after.length === 0 ? Math.max(...before) + 1 : (Math.max(...before) + Math.min(...after)) / 2
      const column = buildColumn(board.id, role, position, now)
      own.push(column)
      created.push(column)
    }
  }
  return created
}

/** First task column of a role on a board, in layout order when the board is known. */
export function columnByRole(columns: Column[], boardId: string, role: ColumnRole): Column | undefined {
  const candidates = columns.filter((c) => c.boardId === boardId && c.role === role && c.kind !== 'group' && !c.deletedAt)
  if (candidates.length <= 1) return candidates[0]
  // Prefer the top-left one: lowest track, then stack, then position.
  return [...candidates].sort((a, b) => (a.track ?? 99) - (b.track ?? 99) || (a.stack ?? 0) - (b.stack ?? 0) || a.position - b.position)[0]
}
