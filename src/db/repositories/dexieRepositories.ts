import { KanbanDatabase, classifyDbError } from '../database'
import type { DataSnapshot, Repositories } from './types'

async function guard<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    throw classifyDbError(error)
  }
}

export function createDexieRepositories(db: KanbanDatabase): Repositories {
  return {
    tasks: {
      getAll: () => guard(() => db.tasks.toArray()),
      getById: (id) => guard(() => db.tasks.get(id)),
      create: (task) => guard(async () => void (await db.tasks.add(task))),
      update: (task) => guard(async () => void (await db.tasks.put(task))),
      delete: (id) => guard(() => db.tasks.delete(id)),
      saveMany: (tasks) => guard(async () => void (await db.tasks.bulkPut(tasks))),
    },
    boards: {
      getAll: () => guard(() => db.boards.toArray()),
      saveMany: (boards) => guard(async () => void (await db.boards.bulkPut(boards))),
    },
    columns: {
      getAll: () => guard(() => db.columns.toArray()),
      saveMany: (columns) => guard(async () => void (await db.columns.bulkPut(columns))),
    },
    settings: {
      get: () => guard(() => db.settings.get('app')),
      save: (settings) => guard(async () => void (await db.settings.put(settings))),
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
        db.transaction('rw', [db.boards, db.columns, db.tasks, db.settings], async () => {
          await Promise.all([db.boards.clear(), db.columns.clear(), db.tasks.clear(), db.settings.clear()])
          await db.boards.bulkAdd(snapshot.boards)
          await db.columns.bulkAdd(snapshot.columns)
          await db.tasks.bulkAdd(snapshot.tasks)
          if (snapshot.settings) await db.settings.put(snapshot.settings)
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
