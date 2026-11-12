import type { Table } from 'dexie'
import { KanbanDatabase, classifyDbError, nextMark, recordKey, type RecordKind } from '../database'
import type { DataSnapshot, Repositories } from './types'

async function guard<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    throw classifyDbError(error)
  }
}

/**
 * Dexie-backed repositories. Every write also marks the record in the outbox – in the same
 * transaction – so cloud sync can upload it later (also after being offline).
 */
export function createDexieRepositories(db: KanbanDatabase): Repositories {
  const mark = (kind: RecordKind, ids: string[]) => {
    const markedAt = nextMark()
    return db.outbox.bulkPut(ids.map((id) => ({ key: recordKey(kind, id), markedAt })))
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tracked = <T>(tables: Table<any, string>[], operation: () => Promise<T>) =>
    guard(() => db.transaction('rw', tables, operation))
  return {
    tasks: {
      getAll: () => guard(() => db.tasks.toArray()),
      getById: (id) => guard(() => db.tasks.get(id)),
      create: (task) => tracked([db.tasks, db.outbox], async () => void (await db.tasks.add(task), await mark('task', [task.id]))),
      update: (task) => tracked([db.tasks, db.outbox], async () => void (await db.tasks.put(task), await mark('task', [task.id]))),
      delete: (id) => guard(() => db.tasks.delete(id)),
      saveMany: (tasks) => tracked([db.tasks, db.outbox], async () => void (await db.tasks.bulkPut(tasks), await mark('task', tasks.map((t) => t.id)))),
    },
    boards: {
      getAll: () => guard(() => db.boards.toArray()),
      saveMany: (boards) => tracked([db.boards, db.outbox], async () => void (await db.boards.bulkPut(boards), await mark('board', boards.map((b) => b.id)))),
    },
    columns: {
      getAll: () => guard(() => db.columns.toArray()),
      saveMany: (columns) => tracked([db.columns, db.outbox], async () => void (await db.columns.bulkPut(columns), await mark('column', columns.map((c) => c.id)))),
    },
    settings: {
      get: () => guard(() => db.settings.get('app')),
      save: (settings) => tracked([db.settings, db.outbox], async () => void (await db.settings.put(settings), await mark('settings', [settings.id]))),
    },
    loadAll: () =>
      guard(() =>
        db.transaction('r', [db.boards, db.columns, db.tasks, db.settings], async () => {
          const [boards, columns, tasks, settings] = await Promise.all([
            db.boards.toArray(),
            db.columns.toArray(),
            db.tasks.toArray(),
            db.settings.get('app'),
          ])
          return { boards, columns, tasks, settings } satisfies DataSnapshot
        }),
      ),
    replaceAll: (snapshot) =>
      guard(() =>
        db.transaction('rw', [db.boards, db.columns, db.tasks, db.settings, db.outbox], async () => {
          await Promise.all([db.boards.clear(), db.columns.clear(), db.tasks.clear(), db.settings.clear()])
          await db.boards.bulkAdd(snapshot.boards)
          await db.columns.bulkAdd(snapshot.columns)
          await db.tasks.bulkAdd(snapshot.tasks)
          if (snapshot.settings) await db.settings.put(snapshot.settings)
          await mark('board', snapshot.boards.map((b) => b.id))
          await mark('column', snapshot.columns.map((c) => c.id))
          await mark('task', snapshot.tasks.map((t) => t.id))
          if (snapshot.settings) await mark('settings', [snapshot.settings.id])
        }),
      ),
  }
}

export async function openDatabase(name?: string): Promise<KanbanDatabase> {
  if (typeof indexedDB === 'undefined') throw classifyDbError({ name: 'MissingAPIError' })
  const db = new KanbanDatabase(name)
  try {
    await db.open()
  } catch (error) {
    throw classifyDbError(error)
  }
  return db
}
