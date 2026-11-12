import type { Area, Board, Column, ColumnRole, Task } from '@/features/tasks/models/schemas'
import { tasksInColumn } from '@/features/tasks/services/taskQueries'
import { newId } from '@/shared/utils/id'
import { stripUndefined } from '@/shared/utils/object'

/*
 * Flexible board layout.
 *
 *   Board ─ areas (rows; areas in the same row sit side by side)
 *     Area ─ tracks (left → right, with flow arrows in between)
 *       Track ─ slots stacked top → bottom (e.g. "Geplant" above "Blockiert")
 *         Slot ─ a column, or a group ("split column") whose sub-columns sit side by side
 *
 * Tasks only live in leaf columns (never in groups). All operations are pure and return the
 * records to persist, so they can be tested without UI or database.
 */

export interface Slot {
  column: Column
  /** Sub-columns of a group, left → right. Empty for a plain column. */
  children: Column[]
}

export interface Track {
  index: number
  slots: Slot[]
}

export interface AreaLayout {
  area: Area
  tracks: Track[]
}

export interface LayoutRow {
  areas: AreaLayout[]
}

export interface LayoutChange {
  columns: Column[]
  tasks: Task[]
  board?: Board
}

export const isGroup = (column: Column) => column.kind === 'group'
export const isLeaf = (column: Column) => column.kind !== 'group'

export function newArea(row: number, title = ''): Area {
  return { id: newId(), title, row, position: 0 }
}

/** Areas ordered by row, then position. */
export function sortedAreas(board: Board): Area[] {
  return [...(board.areas ?? [])].sort((a, b) => a.row - b.row || a.position - b.position)
}

export function buildLayout(board: Board, allColumns: Column[]): LayoutRow[] {
  const columns = allColumns.filter((c) => c.boardId === board.id && !c.deletedAt)
  const areas = sortedAreas(board)
  const fallbackAreaId = areas[0]?.id
  const childrenOf = new Map<string, Column[]>()
  for (const column of columns) {
    if (!column.parentId) continue
    const list = childrenOf.get(column.parentId) ?? []
    list.push(column)
    childrenOf.set(column.parentId, list)
  }
  for (const list of childrenOf.values()) list.sort((a, b) => a.position - b.position)

  const topLevel = columns.filter((c) => !c.parentId)
  // Columns whose area is unknown (e.g. an interrupted save) are shown in the first area instead of vanishing.
  const areaIds = new Set(areas.map((a) => a.id))
  const areaOf = (c: Column) => (c.areaId && areaIds.has(c.areaId) ? c.areaId : fallbackAreaId)
  const areaLayouts = areas.map<AreaLayout>((area) => {
    const own = topLevel.filter((c) => areaOf(c) === area.id)
    const trackNumbers = [...new Set(own.map((c) => c.track ?? c.position))].sort((a, b) => a - b)
    return {
      area,
      tracks: trackNumbers.map((index) => ({
        index,
        slots: own
          .filter((c) => (c.track ?? c.position) === index)
          .sort((a, b) => (a.stack ?? 0) - (b.stack ?? 0) || a.position - b.position)
          .map((column) => ({ column, children: isGroup(column) ? (childrenOf.get(column.id) ?? []) : [] })),
      })),
    }
  })

  const rows: LayoutRow[] = []
  let currentRow: number | undefined
  for (const layout of areaLayouts) {
    if (layout.area.row !== currentRow) {
      rows.push({ areas: [] })
      currentRow = layout.area.row
    }
    rows[rows.length - 1]!.areas.push(layout)
  }
  return rows
}

/** All task-holding columns in reading order (areas, tracks, stacks, sub-columns). */
export function leafColumnsInOrder(board: Board | undefined, columns: Column[]): Column[] {
  if (!board) return []
  const result: Column[] = []
  for (const row of buildLayout(board, columns))
    for (const area of row.areas)
      for (const track of area.tracks)
        for (const slot of track.slots) {
          if (slot.children.length) result.push(...slot.children)
          else if (isLeaf(slot.column)) result.push(slot.column)
        }
  return result
}

/* ───────────── Legacy boards ───────────── */

/**
 * Converts a board created before flexible layouts (no `areas`) into the new model without
 * changing how it looks: one untitled area, one track per column, "Blockiert" stacked below
 * "Geplant". Returns undefined when the board is already normalized.
 */
export function normalizeLegacyBoard(board: Board, columns: Column[], now: string): { board: Board; columns: Column[] } | undefined {
  if (board.areas) return undefined
  const area = newArea(0)
  const own = columns.filter((c) => c.boardId === board.id && !c.deletedAt).sort((a, b) => a.position - b.position)
  const planned = own.find((c) => c.role === 'planned')
  const changed: Column[] = []
  let track = 0
  for (const column of own) {
    if (column.role === 'blocked' && planned && column !== planned) continue
    changed.push({ ...column, areaId: area.id, track, stack: 0, updatedAt: now })
    if (column === planned) {
      const blocked = own.find((c) => c.role === 'blocked')
      if (blocked) changed.push({ ...blocked, areaId: area.id, track, stack: 1, updatedAt: now })
    }
    track++
  }
  return { board: { ...board, areas: [area], updatedAt: now }, columns: changed }
}

/* ───────────── Column operations ───────────── */

export function createColumn(boardId: string, role: ColumnRole, now: string, extra: Partial<Column> = {}): Column {
  return { id: newId(), boardId, title: '', role, position: 0, createdAt: now, updatedAt: now, ...extra }
}

function siblings(columns: Column[], column: Column): Column[] {
  return columns.filter((c) => c.boardId === column.boardId && !c.deletedAt && c.parentId === column.parentId && c.id !== column.id)
}

function topLevelInArea(columns: Column[], areaId: string | undefined): Column[] {
  return columns.filter((c) => !c.parentId && !c.deletedAt && c.areaId === areaId)
}

/**
 * Inserts a new column next to `ref`: to its left/right (a new track, or a new sub-column when
 * `ref` is a sub-column), or below it in the same track (stacked, like "Blockiert").
 */
export function insertColumn(columns: Column[], ref: Column, where: 'left' | 'right' | 'below', role: ColumnRole, now: string): LayoutChange & { created: Column } {
  const changed: Column[] = []
  let created: Column
  if (ref.parentId) {
    const group = [...siblings(columns, ref), ref].sort((a, b) => a.position - b.position)
    const index = group.findIndex((c) => c.id === ref.id) + (where === 'left' ? 0 : 1)
    created = createColumn(ref.boardId, role, now, { parentId: ref.parentId })
    group.splice(index, 0, created)
    group.forEach((c, position) => {
      if (c.id === created.id) created = { ...created, position }
      else if (c.position !== position) changed.push({ ...c, position, updatedAt: now })
    })
  } else if (where === 'below') {
    const stack = (ref.stack ?? 0) + 1
    for (const c of topLevelInArea(columns, ref.areaId))
      if (c.track === ref.track && (c.stack ?? 0) >= stack) changed.push({ ...c, stack: (c.stack ?? 0) + 1, updatedAt: now })
    created = createColumn(ref.boardId, role, now, { areaId: ref.areaId, track: ref.track, stack })
  } else {
    const track = (ref.track ?? 0) + (where === 'right' ? 1 : 0)
    for (const c of topLevelInArea(columns, ref.areaId))
      if ((c.track ?? 0) >= track) changed.push({ ...c, track: (c.track ?? 0) + 1, updatedAt: now })
    created = createColumn(ref.boardId, role, now, { areaId: ref.areaId, track, stack: 0 })
  }
  return { columns: [...changed, created], tasks: [], created }
}

/** Moves a whole track (the column and everything stacked with it) one step left or right. */
export function moveTrack(columns: Column[], column: Column, direction: -1 | 1, now: string): LayoutChange {
  const inArea = topLevelInArea(columns, column.areaId)
  const tracks = [...new Set(inArea.map((c) => c.track ?? 0))].sort((a, b) => a - b)
  const index = tracks.indexOf(column.track ?? 0)
  const neighbor = tracks[index + direction]
  if (neighbor === undefined) return { columns: [], tasks: [] }
  const current = column.track ?? 0
  return {
    columns: inArea
      .filter((c) => c.track === current || c.track === neighbor)
      .map((c) => ({ ...c, track: c.track === current ? neighbor : current, updatedAt: now })),
    tasks: [],
  }
}

/** Moves a column up or down within its stack, or a sub-column left/right within its group. */
export function moveWithinStack(columns: Column[], column: Column, direction: -1 | 1, now: string): LayoutChange {
  if (column.parentId) {
    const group = [...siblings(columns, column), column].sort((a, b) => a.position - b.position)
    const index = group.findIndex((c) => c.id === column.id)
    const other = group[index + direction]
    if (!other) return { columns: [], tasks: [] }
    return {
      columns: [
        { ...column, position: other.position, updatedAt: now },
        { ...other, position: column.position, updatedAt: now },
      ],
      tasks: [],
    }
  }
  const stack = topLevelInArea(columns, column.areaId)
    .filter((c) => c.track === column.track)
    .sort((a, b) => (a.stack ?? 0) - (b.stack ?? 0))
  const index = stack.findIndex((c) => c.id === column.id)
  const other = stack[index + direction]
  if (!other) return { columns: [], tasks: [] }
  return {
    columns: [
      { ...column, stack: other.stack ?? 0, updatedAt: now },
      { ...other, stack: column.stack ?? 0, updatedAt: now },
    ],
    tasks: [],
  }
}

/** Moves a top-level column (or split column) to the end of another area; columns below it move up. */
export function moveColumnToArea(columns: Column[], column: Column, areaId: string, now: string): LayoutChange {
  if (column.parentId || column.areaId === areaId) return { columns: [], tasks: [] }
  const target = topLevelInArea(columns, areaId)
  const track = target.length ? Math.max(...target.map((c) => c.track ?? 0)) + 1 : 0
  const shifted = topLevelInArea(columns, column.areaId)
    .filter((c) => c.id !== column.id && c.track === column.track && (c.stack ?? 0) > (column.stack ?? 0))
    .map((c) => ({ ...c, stack: (c.stack ?? 0) - 1, updatedAt: now }))
  return { columns: [{ ...column, areaId, track, stack: 0, updatedAt: now }, ...shifted], tasks: [] }
}

/** Moves tasks of the given columns to the end of `targetId`. Archived tasks move too. */
function moveTasksTo(tasks: Task[], fromIds: Set<string>, targetId: string, now: string): Task[] {
  const target = tasksInColumn(tasks, targetId)
  let position = (target[target.length - 1]?.position ?? -1) + 1
  return tasks
    .filter((t) => fromIds.has(t.columnId) && !t.deletedAt)
    .sort((a, b) => a.position - b.position)
    .map((t) => ({ ...t, columnId: targetId, position: position++, updatedAt: now }))
}

/**
 * Splits a column into a group with two sub-columns side by side. The original column (and its
 * tasks) becomes the first sub-column; a second one is added after it.
 */
export function splitColumn(column: Column, now: string, titles: [string, string]): LayoutChange & { group: Column } {
  const group = createColumn(column.boardId, column.role, now, {
    kind: 'group',
    title: column.title,
    areaId: column.areaId,
    track: column.track,
    stack: column.stack,
    position: column.position,
    ...(column.collapsed ? { collapsed: true } : {}),
  })
  const first = stripUndefined({
    ...column,
    parentId: group.id,
    title: titles[0],
    position: 0,
    areaId: undefined,
    track: undefined,
    stack: undefined,
    collapsed: undefined,
    updatedAt: now,
  })
  const second = createColumn(column.boardId, column.role, now, { parentId: group.id, title: titles[1], position: 1 })
  return { columns: [group, first, second], tasks: [], group }
}

/** Removes the split: the first sub-column takes the group's place; tasks of the others join it. */
export function unsplitGroup(columns: Column[], tasks: Task[], group: Column, now: string): LayoutChange {
  const children = columns.filter((c) => c.parentId === group.id && !c.deletedAt).sort((a, b) => a.position - b.position)
  const [first, ...rest] = children
  if (!first) return { columns: [{ ...group, deletedAt: now, updatedAt: now }], tasks: [] }
  const promoted = stripUndefined({
    ...first,
    parentId: undefined,
    title: group.title,
    areaId: group.areaId,
    track: group.track,
    stack: group.stack,
    position: group.position,
    collapsed: group.collapsed,
    updatedAt: now,
  })
  return {
    columns: [promoted, ...rest.map((c) => ({ ...c, deletedAt: now, updatedAt: now })), { ...group, deletedAt: now, updatedAt: now }],
    tasks: moveTasksTo(tasks, new Set(rest.map((c) => c.id)), first.id, now),
  }
}

/**
 * Removes a column (or a whole group). Its tasks move to `targetId`. A group left with a single
 * sub-column is turned back into a plain column; columns stacked below move up.
 */
export function deleteColumn(columns: Column[], tasks: Task[], column: Column, targetId: string, now: string): LayoutChange {
  if (isGroup(column)) {
    const children = columns.filter((c) => c.parentId === column.id && !c.deletedAt)
    return {
      columns: [column, ...children].map((c) => ({ ...c, deletedAt: now, updatedAt: now })),
      tasks: moveTasksTo(tasks, new Set(children.map((c) => c.id)), targetId, now),
    }
  }
  const removed = { ...column, deletedAt: now, updatedAt: now }
  if (column.parentId) {
    const group = columns.find((c) => c.id === column.parentId)
    const remaining = siblings(columns, column)
    if (group && remaining.length === 1) {
      const rest = columns.map((c) => (c.id === column.id ? removed : c))
      const merged = unsplitGroup(rest, tasks, group, now)
      return { columns: [removed, ...merged.columns], tasks: moveTasksTo(tasks, new Set([column.id]), remaining[0]!.id, now) }
    }
    return { columns: [removed], tasks: moveTasksTo(tasks, new Set([column.id]), targetId, now) }
  }
  const shifted = topLevelInArea(columns, column.areaId)
    .filter((c) => c.id !== column.id && c.track === column.track && (c.stack ?? 0) > (column.stack ?? 0))
    .map((c) => ({ ...c, stack: (c.stack ?? 0) - 1, updatedAt: now }))
  return { columns: [removed, ...shifted], tasks: moveTasksTo(tasks, new Set([column.id]), targetId, now) }
}

/* ───────────── Area operations ───────────── */

function withAreas(board: Board, rows: Area[][], now: string): Board {
  const areas = rows.filter((row) => row.length).flatMap((row, rowIndex) => row.map((area, position) => ({ ...area, row: rowIndex, position })))
  return { ...board, areas, updatedAt: now }
}

function areaRows(board: Board): Area[][] {
  const rows: Area[][] = []
  let current: number | undefined
  for (const area of sortedAreas(board)) {
    if (area.row !== current) {
      rows.push([])
      current = area.row
    }
    rows[rows.length - 1]!.push(area)
  }
  return rows
}

/**
 * Adds an area in a new row – at the bottom, or above the row of `aboveAreaId`. By default it gets a
 * small flow (Geplant → In Arbeit → Erledigt); `empty` creates it without columns.
 */
export function addArea(board: Board, title: string, now: string, options: { empty?: boolean; aboveAreaId?: string } = {}): LayoutChange & { area: Area } {
  const rows = areaRows(board)
  const area = newArea(rows.length, title)
  const roles: ColumnRole[] = options.empty ? [] : ['planned', 'doing', 'done']
  const columns = roles.map((role, track) => createColumn(board.id, role, now, { areaId: area.id, track, stack: 0, position: track }))
  const index = options.aboveAreaId ? rows.findIndex((row) => row.some((a) => a.id === options.aboveAreaId)) : -1
  if (index >= 0) rows.splice(index, 0, [area])
  else rows.push([area])
  return { board: withAreas(board, rows, now), columns, tasks: [], area }
}

export type AreaMove = 'up' | 'down' | 'beside'

/**
 * up/down: the area gets its own row above/below its current row.
 * beside: the area joins the row above (sits next to the areas there).
 */
export function moveArea(board: Board, areaId: string, move: AreaMove, now: string): Board {
  const rows = areaRows(board)
  const rowIndex = rows.findIndex((row) => row.some((a) => a.id === areaId))
  if (rowIndex < 0) return board
  const area = rows[rowIndex]!.find((a) => a.id === areaId)!
  const alone = rows[rowIndex]!.length === 1
  rows[rowIndex] = rows[rowIndex]!.filter((a) => a.id !== areaId)
  if (move === 'beside') {
    if (rowIndex === 0) return board
    rows[rowIndex - 1]!.push(area)
  } else if (alone) {
    const target = rowIndex + (move === 'up' ? -1 : 1)
    if (target < 0 || target >= rows.length) return board
    rows[rowIndex] = rows[target]!
    rows[target] = [area]
  } else {
    rows.splice(move === 'up' ? rowIndex : rowIndex + 1, 0, [area])
  }
  return withAreas(board, rows, now)
}

export function updateArea(board: Board, areaId: string, patch: Partial<Pick<Area, 'title' | 'collapsed' | 'size'>>, now: string): Board {
  return { ...board, areas: (board.areas ?? []).map((a) => (a.id === areaId ? stripUndefined({ ...a, ...patch }) : a)), updatedAt: now }
}

/** Removes an area with all its columns; tasks move to `targetId` (a column in another area). */
export function deleteArea(board: Board, columns: Column[], tasks: Task[], areaId: string, targetId: string, now: string): LayoutChange {
  const top = columns.filter((c) => c.boardId === board.id && !c.deletedAt && !c.parentId && c.areaId === areaId)
  const children = columns.filter((c) => !c.deletedAt && top.some((g) => g.id === c.parentId))
  const removed = [...top, ...children]
  const rows = areaRows(board).map((row) => row.filter((a) => a.id !== areaId))
  return {
    board: withAreas(board, rows, now),
    columns: removed.map((c) => ({ ...c, deletedAt: now, updatedAt: now })),
    tasks: moveTasksTo(tasks, new Set(removed.map((c) => c.id)), targetId, now),
  }
}
