import { createDefaultBoard } from './defaults'
import {
  addArea,
  buildLayout,
  deleteArea,
  deleteColumn,
  insertColumn,
  leafColumnsInOrder,
  moveArea,
  moveColumnToArea,
  moveTrack,
  moveWithinStack,
  normalizeLegacyBoard,
  splitColumn,
  unsplitGroup,
  type LayoutChange,
} from './layout'
import type { Column, Task } from '@/features/tasks/models/schemas'
import { makeTask, NOW } from '@/tests/factories'

const LATER = '2026-08-20T10:00:00.000Z'

function apply(columns: Column[], change: LayoutChange): Column[] {
  const byId = new Map(columns.map((c) => [c.id, c]))
  for (const c of change.columns) byId.set(c.id, c)
  return [...byId.values()].filter((c) => !c.deletedAt)
}

function setup() {
  const { board, columns } = createDefaultBoard(NOW)
  const byRole = (role: Column['role'], list = columns) => list.find((c) => c.role === role && c.kind !== 'group')!
  return { board, columns, byRole }
}

const roles = (columns: Column[]) => columns.map((c) => c.title || c.role)

describe('default layout', () => {
  it('reproduces the standard board: Blockiert stacked below Geplant', () => {
    const { board, columns } = setup()
    const [row] = buildLayout(board, columns)
    const tracks = row!.areas[0]!.tracks.map((t) => t.slots.map((s) => s.column.role))
    expect(tracks).toEqual([['backlog'], ['inbox'], ['planned', 'blocked'], ['doing'], ['done']])
    expect(roles(leafColumnsInOrder(board, columns))).toEqual(['backlog', 'inbox', 'planned', 'blocked', 'doing', 'done'])
  })

  it('has no split columns by default', () => {
    const { columns } = setup()
    expect(columns.some((c) => c.kind === 'group' || c.parentId)).toBe(false)
  })
})

describe('column operations', () => {
  it('inserts a column to the right as a new track and shifts the following tracks', () => {
    const { board, columns, byRole } = setup()
    const change = insertColumn(columns, byRole('inbox'), 'right', 'planned', LATER)
    const next = apply(columns, { ...change, columns: [...change.columns.slice(0, -1), { ...change.created, title: 'Recherche' }] })
    expect(roles(leafColumnsInOrder(board, next))).toEqual(['backlog', 'inbox', 'Recherche', 'planned', 'blocked', 'doing', 'done'])
  })

  it('inserts a column below (stacked) and keeps the order of the stack', () => {
    const { board, columns, byRole } = setup()
    const change = insertColumn(columns, byRole('planned'), 'below', 'blocked', LATER)
    const next = apply(columns, { ...change, columns: [...change.columns.slice(0, -1), { ...change.created, title: 'Freigabe' }] })
    const track = buildLayout(board, next)[0]!.areas[0]!.tracks[2]!
    expect(track.slots.map((s) => s.column.title || s.column.role)).toEqual(['planned', 'Freigabe', 'blocked'])
  })

  it('moves whole tracks left/right and columns up/down in a stack', () => {
    const { board, columns, byRole } = setup()
    let next = apply(columns, moveTrack(columns, byRole('doing'), -1, LATER))
    expect(roles(leafColumnsInOrder(board, next))).toEqual(['backlog', 'inbox', 'doing', 'planned', 'blocked', 'done'])
    next = apply(next, moveWithinStack(next, byRole('blocked', next), -1, LATER))
    expect(roles(leafColumnsInOrder(board, next))).toEqual(['backlog', 'inbox', 'doing', 'blocked', 'planned', 'done'])
    expect(moveTrack(next, byRole('backlog', next), -1, LATER).columns).toEqual([])
  })

  it('splits a column into two sub-columns and keeps its tasks; unsplit merges them back', () => {
    const { board, columns, byRole } = setup()
    const doing = byRole('doing')
    const split = splitColumn(doing, LATER, ['In Arbeit', 'Fertig'])
    let next = apply(columns, split)
    const layout = buildLayout(board, next)[0]!.areas[0]!.tracks[3]!.slots[0]!
    expect(layout.column.kind).toBe('group')
    expect(layout.children.map((c) => c.title)).toEqual(['In Arbeit', 'Fertig'])
    expect(layout.children[0]!.id).toBe(doing.id)

    const second = layout.children[1]!
    const tasks: Task[] = [makeTask(doing), makeTask(second)]
    const merged = unsplitGroup(next, tasks, split.group, LATER)
    next = apply(next, merged)
    const promoted = next.find((c) => c.id === doing.id)!
    expect(promoted.parentId).toBeUndefined()
    expect(promoted).toMatchObject({ track: doing.track, title: doing.title })
    expect(next.some((c) => c.kind === 'group')).toBe(false)
    expect(merged.tasks).toEqual([expect.objectContaining({ id: tasks[1]!.id, columnId: doing.id })])
  })

  it('deletes a column, moves its tasks and lets stacked columns move up', () => {
    const { board, columns, byRole } = setup()
    const planned = byRole('planned')
    const task = makeTask(planned)
    const archived = makeTask(planned, { archivedAt: NOW })
    const change = deleteColumn(columns, [task, archived], planned, byRole('inbox').id, LATER)
    const next = apply(columns, change)
    expect(change.columns.find((c) => c.id === planned.id)!.deletedAt).toBe(LATER)
    expect(change.tasks.map((t) => t.columnId)).toEqual([byRole('inbox').id, byRole('inbox').id])
    const track = buildLayout(board, next)[0]!.areas[0]!.tracks.find((t) => t.slots.some((s) => s.column.role === 'blocked'))!
    expect(track.slots[0]!.column.stack).toBe(0)
  })

  it('deleting one of two sub-columns turns the group back into a plain column', () => {
    const { board, columns, byRole } = setup()
    const split = splitColumn(byRole('doing'), LATER, ['A', 'B'])
    let next = apply(columns, split)
    const b = next.find((c) => c.title === 'B')!
    next = apply(next, deleteColumn(next, [], b, byRole('inbox').id, LATER))
    expect(next.some((c) => c.kind === 'group' || c.parentId)).toBe(false)
    // The remaining sub-column takes the group's place and name.
    expect(roles(leafColumnsInOrder(board, next))).toEqual(['backlog', 'inbox', 'planned', 'blocked', 'doing', 'done'])
  })
})

describe('areas', () => {
  it('adds an area with a small default flow in its own row and arranges areas', () => {
    const { board, columns } = setup()
    const added = addArea(board, 'Daily Business', LATER)
    let nextBoard = added.board!
    const nextColumns = [...columns, ...added.columns]
    expect(buildLayout(nextBoard, nextColumns).map((row) => row.areas.map((a) => a.area.title))).toEqual([[''], ['Daily Business']])
    expect(added.columns.map((c) => c.role)).toEqual(['planned', 'doing', 'done'])

    nextBoard = moveArea(nextBoard, added.area.id, 'up', LATER)
    expect(buildLayout(nextBoard, nextColumns).map((row) => row.areas.map((a) => a.area.title))).toEqual([['Daily Business'], ['']])
    nextBoard = moveArea(nextBoard, board.areas![0]!.id, 'beside', LATER)
    expect(buildLayout(nextBoard, nextColumns).map((row) => row.areas.map((a) => a.area.title))).toEqual([['Daily Business', '']])
  })

  it('moves a column into another area (e.g. the backlog into its own area)', () => {
    const { board, columns, byRole } = setup()
    const added = addArea(board, 'Backlog', LATER)
    let next = [...columns, ...added.columns]
    next = apply(next, moveColumnToArea(next, byRole('backlog'), added.area.id, LATER))
    const rows = buildLayout(added.board!, next)
    expect(rows[1]!.areas[0]!.tracks.at(-1)!.slots[0]!.column.role).toBe('backlog')
    expect(rows[0]!.areas[0]!.tracks[0]!.slots[0]!.column.role).toBe('inbox')
  })

  it('adds an empty area above another one', () => {
    const { board } = setup()
    const added = addArea(board, 'Backlog', LATER, { empty: true, aboveAreaId: board.areas![0]!.id })
    expect(added.columns).toEqual([])
    expect(buildLayout(added.board!, []).map((row) => row.areas.map((a) => a.area.title))).toEqual([['Backlog'], ['']])
  })

  it('deletes an area with its columns and moves the tasks', () => {
    const { board, columns, byRole } = setup()
    const added = addArea(board, 'Mini', LATER)
    const task = makeTask(added.columns[0]!)
    const change = deleteArea(added.board!, [...columns, ...added.columns], [task], added.area.id, byRole('inbox').id, LATER)
    expect(change.board!.areas).toHaveLength(1)
    expect(change.columns.every((c) => c.deletedAt)).toBe(true)
    expect(change.tasks[0]!.columnId).toBe(byRole('inbox').id)
  })
})

describe('robustness', () => {
  it('shows columns of an unknown area in the first area instead of hiding them', () => {
    const { board, columns, byRole } = setup()
    const orphan = { ...byRole('backlog'), areaId: 'missing-area' }
    const next = columns.map((c) => (c.id === orphan.id ? orphan : c))
    expect(leafColumnsInOrder(board, next).map((c) => c.id)).toContain(orphan.id)
  })
})

describe('normalizeLegacyBoard', () => {
  it('gives an old board one area and stacks Blockiert below Geplant', () => {
    const { board, columns } = setup()
    const legacyBoard = { ...board, areas: undefined }
    const legacyColumns = columns.map(({ areaId: _a, track: _t, stack: _s, ...c }) => c)
    const normalized = normalizeLegacyBoard(legacyBoard, legacyColumns, LATER)!
    expect(normalized.board.areas).toHaveLength(1)
    const tracks = buildLayout(normalized.board, normalized.columns)[0]!.areas[0]!.tracks.map((t) => t.slots.map((s) => s.column.role))
    expect(tracks).toEqual([['backlog'], ['inbox'], ['planned', 'blocked'], ['doing'], ['done']])
    expect(normalizeLegacyBoard(normalized.board, normalized.columns, LATER)).toBeUndefined()
  })
})
