import type { Transaction } from 'dexie'

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
  // Example for a future change:
  // { version: 2, stores: { tasks: 'id, boardId, columnId, recurrenceSeriesId, dueDate' },
  //   upgrade: async (tx) => { await tx.table('tasks').toCollection().modify((t) => { ... }) } },
]

export const CURRENT_DB_VERSION = DB_MIGRATIONS[DB_MIGRATIONS.length - 1]!.version
