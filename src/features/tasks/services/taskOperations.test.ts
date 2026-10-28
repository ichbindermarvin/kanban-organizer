import { applyCompletionState, buildNextRecurrence, createTask, duplicateTask } from './taskOperations'
import { makeBoard, makeTask, NOW } from '@/tests/factories'

describe('createTask', () => {
  it('creates a task with defaults at the end of the column', () => {
    const { inbox } = makeBoard()
    const existing = [makeTask(inbox, { position: 4 })]
    const task = createTask({ boardId: inbox.boardId, columnId: inbox.id, title: '  Newsletter  ' }, existing, NOW)
    expect(task).toMatchObject({ title: 'Newsletter', priority: 'medium', position: 5, tags: [], subtasks: [] })
    expect(task.id).toMatch(/[0-9a-f-]{36}/)
  })
})

describe('applyCompletionState', () => {
  it('sets completedAt when moved to done and clears it when reopened', () => {
    const { inbox, done } = makeBoard()
    const task = makeTask(inbox)
    const completed = applyCompletionState(task, done, NOW)
    expect(completed.completedAt).toBe(NOW)
    expect(applyCompletionState(completed, inbox, NOW).completedAt).toBeUndefined()
  })
})

describe('buildNextRecurrence', () => {
  const recurring = () => {
    const board = makeBoard()
    const task = makeTask(board.done, {
      title: 'Wochenplanung',
      description: 'Ziele',
      priority: 'high',
      tags: ['Organisation'],
      dueDate: '2026-08-10',
      recurrence: { frequency: 'weekly', interval: 1, daysOfWeek: [1] },
      recurrenceSeriesId: 'series-1',
      subtasks: [{ id: 's1', title: 'Review', completed: true, position: 0 }],
    })
    return { ...board, task }
  }

  it('creates the next instance in "Geplant" with copied properties and open subtasks', () => {
    const { columns, planned, task } = recurring()
    const next = buildNextRecurrence(task, columns, [task], '2026-08-12', NOW)!
    expect(next).toMatchObject({
      title: 'Wochenplanung',
      description: 'Ziele',
      priority: 'high',
      tags: ['Organisation'],
      dueDate: '2026-08-17',
      columnId: planned.id,
      recurrenceSeriesId: 'series-1',
      recurrence: { frequency: 'weekly', interval: 1, daysOfWeek: [1] },
    })
    expect(next.id).not.toBe(task.id)
    expect(next.subtasks).toHaveLength(1)
    expect(next.subtasks[0]).toMatchObject({ title: 'Review', completed: false })
    expect(next.subtasks[0]!.id).not.toBe('s1')
    expect(next.completedAt).toBeUndefined()
  })

  it('does not create a second successor when the series already has an open one', () => {
    const { columns, task } = recurring()
    const first = buildNextRecurrence(task, columns, [task], '2026-08-12', NOW)!
    expect(buildNextRecurrence(task, columns, [task, first], '2026-08-12', NOW)).toBeNull()
  })

  it('does nothing after the recurrence was stopped', () => {
    const { columns, task } = recurring()
    const { recurrence: _r, ...stopped } = task
    expect(buildNextRecurrence(stopped, columns, [stopped], '2026-08-12', NOW)).toBeNull()
  })
})

describe('duplicateTask', () => {
  it('copies an active task directly below the original with open subtasks', () => {
    const { columns, planned } = makeBoard()
    const a = makeTask(planned, { position: 0, dueDate: '2026-08-20', tags: ['X'], subtasks: [{ id: 's', title: 'A', completed: true, position: 0 }] })
    const b = makeTask(planned, { position: 1 })
    const { copy, shifted } = duplicateTask(a, columns, [a, b], NOW, '(Kopie)')
    expect(copy).toMatchObject({ title: `${a.title} (Kopie)`, columnId: planned.id, position: 1, dueDate: '2026-08-20', tags: ['X'] })
    expect(copy.subtasks[0]!.completed).toBe(false)
    expect(shifted).toEqual([expect.objectContaining({ id: b.id, position: 2 })])
  })

  it('reuses a completed task as a new Inbox task without deadline', () => {
    const { columns, done, inbox } = makeBoard()
    const task = makeTask(done, { completedAt: NOW, dueDate: '2026-08-01', recurrence: { frequency: 'daily', interval: 1 } })
    const { copy } = duplicateTask(task, columns, [task], NOW, '')
    expect(copy.columnId).toBe(inbox.id)
    expect(copy.dueDate).toBeUndefined()
    expect(copy.recurrence).toBeUndefined()
    expect(copy.completedAt).toBeUndefined()
    expect(copy.title).toBe(task.title)
  })

  it('a duplicated recurring task starts its own series', () => {
    const { columns, planned } = makeBoard()
    const task = makeTask(planned, { dueDate: '2026-08-20', recurrence: { frequency: 'daily', interval: 1 }, recurrenceSeriesId: 'old' })
    const { copy } = duplicateTask(task, columns, [task], NOW, '')
    expect(copy.recurrenceSeriesId).toBe(copy.id)
  })
})
