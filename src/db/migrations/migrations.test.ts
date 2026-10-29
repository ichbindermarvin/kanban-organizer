import Dexie from 'dexie'
import { KanbanDatabase } from '../database'
import { CURRENT_DB_VERSION } from './index'
import { missingDefaultColumns } from '@/features/board/services/defaults'
import { makeBoard, makeTask, NOW } from '@/tests/factories'

describe('IndexedDB migrations', () => {
  it('v1 → current adds backlog (before the inbox) and blocked (after planned) and keeps all existing data', async () => {
    const name = 'migration-v1'
    const { board, columns, inbox } = makeBoard()
    const v1Columns = columns.filter((c) => c.role !== 'backlog' && c.role !== 'blocked').map((c, index) => ({ ...c, position: index }))
    const task = makeTask(inbox, { title: 'Bleibt erhalten' })

    // Create a database exactly as version 1 of the app did.
    const legacy = new Dexie(name)
    legacy.version(1).stores({ boards: 'id', columns: 'id, boardId', tasks: 'id, boardId, columnId, recurrenceSeriesId', settings: 'id' })
    await legacy.table('boards').add(board)
    await legacy.table('columns').bulkAdd(v1Columns)
    await legacy.table('tasks').add(task)
    legacy.close()

    const db = new KanbanDatabase(name)
    await db.open()
    expect(db.verno).toBe(CURRENT_DB_VERSION)
    const migrated = (await db.columns.toArray()).sort((a, b) => a.position - b.position)
    expect(migrated.map((c) => c.role)).toEqual(['backlog', 'inbox', 'planned', 'blocked', 'doing', 'done'])
    expect(await db.tasks.get(task.id)).toEqual(task)
    expect(migrated.filter((c) => c.role !== 'backlog' && c.role !== 'blocked')).toEqual(expect.arrayContaining(v1Columns))
    db.close()
  })
})

describe('missingDefaultColumns', () => {
  it('returns nothing for a complete board', () => {
    const { board, columns } = makeBoard()
    expect(missingDefaultColumns([board], columns, NOW)).toEqual([])
  })
  it('inserts missing columns at the right position', () => {
    const { board, columns } = makeBoard()
    const withoutPlanned = columns.filter((c) => c.role !== 'planned')
    const [added] = missingDefaultColumns([board], withoutPlanned, NOW)
    const inbox = columns.find((c) => c.role === 'inbox')!
    const doing = columns.find((c) => c.role === 'doing')!
    expect(added!.role).toBe('planned')
    expect(added!.position).toBeGreaterThan(inbox.position)
    expect(added!.position).toBeLessThan(doing.position)
  })
})
