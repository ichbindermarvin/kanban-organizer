import type { Transaction } from 'dexie'
import type { Board, Column } from '@/features/tasks/models/schemas'
import { missingDefaultColumns } from '@/features/board/services/defaults'
import { normalizeBoards } from '@/features/board/services/normalize'

/**
 * IndexedDB schema history. Rules:
 * - Never edit or remove an existing entry – always append a new version.
 * - Upgrades transform data in place; they must never drop user data silently.
 * Dexie runs every missing upgrade in order inside one versionchange transaction,
 * so a failing upgrade aborts and leaves the previous version untouched.
 */
export interface DbMigration {
  version: number
  stores: Record<string, string | null>
  upgrade?: (tx: Transaction) => Promise<void>
}

export const DB_MIGRATIONS: DbMigration[] = [
  {
    version: 1,
    stores: {
      boards: 'id',
      columns: 'id, boardId',
      tasks: 'id, boardId, columnId, recurrenceSeriesId',
      settings: 'id',
    },
  },
  {
    // v2: adds the "Backlog" column in front of the inbox to every existing board. Tasks are untouched.
    version: 2,
    stores: {},
    upgrade: async (tx) => {
      const boards = (await tx.table('boards').toArray()) as Board[]
      const columns = (await tx.table('columns').toArray()) as Column[]
      const added = missingDefaultColumns(boards, columns, new Date().toISOString())
      if (added.length) await tx.table('columns').bulkAdd(added)
    },
  },
  {
    // v3: adds the optional "Blockiert" column (below "Geplant") to every existing board.
    version: 3,
    stores: {},
    upgrade: async (tx) => {
      const boards = (await tx.table('boards').toArray()) as Board[]
      const columns = (await tx.table('columns').toArray()) as Column[]
      const added = missingDefaultColumns(boards, columns, new Date().toISOString())
      if (added.length) await tx.table('columns').bulkAdd(added)
    },
  },
  {
    // v4: flexible layouts. Every board gets an area; columns get track/stack positions that
    // reproduce the previous look (Blockiert stacked below Geplant).
    version: 4,
    stores: {},
    upgrade: async (tx) => {
      const boards = (await tx.table('boards').toArray()) as Board[]
      const columns = (await tx.table('columns').toArray()) as Column[]
      const changed = normalizeBoards(boards, columns, new Date().toISOString())
      if (changed.boards.length) await tx.table('boards').bulkPut(changed.boards)
      if (changed.columns.length) await tx.table('columns').bulkPut(changed.columns)
    },
  },
  {
    // v5: cloud sync – outbox of unsynced changes and device-local metadata.
    // Every existing record is marked as changed so it is uploaded once sync is set up.
    version: 5,
    stores: { outbox: 'key', meta: 'key' },
    upgrade: async (tx) => {
      const mark = Date.now() * 1000
      const keys: { key: string; markedAt: number }[] = []
      for (const [table, kind] of [['boards', 'board'], ['columns', 'column'], ['tasks', 'task'], ['settings', 'settings']] as const) {
        const ids = (await tx.table(table).toCollection().primaryKeys()) as string[]
        ids.forEach((id) => keys.push({ key: `${kind}:${id}`, markedAt: mark }))
      }
      if (keys.length) await tx.table('outbox').bulkPut(keys)
    },
  },
]

export const CURRENT_DB_VERSION = DB_MIGRATIONS[DB_MIGRATIONS.length - 1]!.version
