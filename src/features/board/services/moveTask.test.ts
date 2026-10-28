import { moveTask, wouldExceedWip } from './moveTask'
import { makeBoard, makeTask } from '@/tests/factories'

const LATER = '2026-08-19T11:00:00.000Z'

describe('moveTask', () => {
  it('reorders within the same column', () => {
    const { inbox } = makeBoard()
    const [a, b, c] = [0, 1, 2].map((position) => makeTask(inbox, { position }))
    const changed = moveTask([a!, b!, c!], c!.id, inbox.id, 0, LATER)
    const order = new Map(changed.map((t) => [t.id, t.position]))
    expect(order.get(c!.id)).toBe(0)
    expect(order.get(a!.id)).toBe(1)
    expect(order.get(b!.id)).toBe(2)
    expect(changed.every((t) => t.updatedAt === LATER)).toBe(true)
  })

  it('moves between columns and renumbers both', () => {
    const { inbox, planned } = makeBoard()
    const a = makeTask(inbox, { position: 0 })
    const b = makeTask(inbox, { position: 1 })
    const p = makeTask(planned, { position: 0 })
    const changed = moveTask([a, b, p], a.id, planned.id, 1, LATER)
    const moved = changed.find((t) => t.id === a.id)!
    expect(moved).toMatchObject({ columnId: planned.id, position: 1 })
    expect(changed.find((t) => t.id === b.id)).toMatchObject({ position: 0 })
    expect(changed.find((t) => t.id === p.id)).toBeUndefined()
  })

  it('clamps the index to the column length', () => {
    const { inbox, planned } = makeBoard()
    const a = makeTask(inbox, { position: 0 })
    expect(moveTask([a], a.id, planned.id, 99, LATER)[0]).toMatchObject({ columnId: planned.id, position: 0 })
  })

  it('ignores archived tasks when numbering', () => {
    const { inbox } = makeBoard()
    const archived = makeTask(inbox, { position: 0, archivedAt: LATER })
    const a = makeTask(inbox, { position: 5 })
    expect(moveTask([archived, a], a.id, inbox.id, 0, LATER)[0]).toMatchObject({ id: a.id, position: 0 })
  })
})

describe('wouldExceedWip', () => {
  it('detects when the limit is reached', () => {
    const { doing, inbox } = makeBoard()
    const tasks = [makeTask(doing), makeTask(doing), makeTask(doing), makeTask(inbox)]
    expect(wouldExceedWip(doing, tasks, tasks[3]!.id)).toBe(true)
    expect(wouldExceedWip(doing, tasks.slice(1), tasks[3]!.id)).toBe(false)
    expect(wouldExceedWip({ ...doing, wipLimit: undefined }, tasks)).toBe(false)
  })
})
