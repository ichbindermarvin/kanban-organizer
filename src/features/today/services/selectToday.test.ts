import { selectHighPriority, selectToday } from './selectToday'
import { makeBoard, makeTask } from '@/tests/factories'

const TODAY = '2026-08-19'

describe('selectToday', () => {
  it('collects overdue, due today and in-progress tasks without duplicates', () => {
    const { columns, inbox, planned, doing, done } = makeBoard()
    const overdue = makeTask(inbox, { dueDate: '2026-08-10' })
    const dueToday = makeTask(planned, { dueDate: TODAY })
    const todayAndDoing = makeTask(doing, { dueDate: TODAY })
    const doingOnly = makeTask(doing)
    const future = makeTask(planned, { dueDate: '2026-08-25' })
    const doneToday = makeTask(done, { dueDate: TODAY, completedAt: '2026-08-19T08:00:00.000Z' })
    const archived = makeTask(planned, { dueDate: TODAY, archivedAt: '2026-08-19T08:00:00.000Z' })
    const deleted = makeTask(planned, { dueDate: TODAY, deletedAt: '2026-08-19T08:00:00.000Z' })

    const result = selectToday([overdue, dueToday, todayAndDoing, doingOnly, future, doneToday, archived, deleted], columns, TODAY)
    expect(result.overdue.map((t) => t.id)).toEqual([overdue.id])
    expect(result.dueToday.map((t) => t.id).sort()).toEqual([dueToday.id, todayAndDoing.id].sort())
    expect(result.inProgress.map((t) => t.id)).toEqual([doingOnly.id])
    const all = [...result.overdue, ...result.dueToday, ...result.inProgress].map((t) => t.id)
    expect(new Set(all).size).toBe(all.length)
  })

  it('lists backlog tasks after tasks of the active flow', () => {
    const { columns, planned, backlog } = makeBoard()
    const fromBacklog = makeTask(backlog, { dueDate: TODAY, priority: 'urgent' })
    const fromFlow = makeTask(planned, { dueDate: TODAY, priority: 'low' })
    expect(selectToday([fromBacklog, fromFlow], columns, TODAY).dueToday.map((t) => t.id)).toEqual([fromFlow.id, fromBacklog.id])
  })

  it('includes overdue blocked tasks (blocked is still open)', () => {
    const { columns, board } = makeBoard()
    const blocked = columns.find((c) => c.role === 'blocked' && c.boardId === board.id)!
    const task = makeTask(blocked, { dueDate: '2026-08-01' })
    expect(selectToday([task], columns, TODAY).overdue.map((t) => t.id)).toEqual([task.id])
  })

  it('sorts tasks due today by priority', () => {
    const { columns, planned } = makeBoard()
    const low = makeTask(planned, { dueDate: TODAY, priority: 'low' })
    const urgent = makeTask(planned, { dueDate: TODAY, priority: 'urgent' })
    expect(selectToday([low, urgent], columns, TODAY).dueToday.map((t) => t.id)).toEqual([urgent.id, low.id])
  })
})

describe('selectHighPriority', () => {
  it('returns open high and urgent tasks', () => {
    const { columns, planned, done } = makeBoard()
    const high = makeTask(planned, { priority: 'high' })
    const urgent = makeTask(planned, { priority: 'urgent' })
    const doneUrgent = makeTask(done, { priority: 'urgent' })
    const medium = makeTask(planned)
    expect(selectHighPriority([high, urgent, doneUrgent, medium], columns).map((t) => t.id)).toEqual([urgent.id, high.id])
  })
})
