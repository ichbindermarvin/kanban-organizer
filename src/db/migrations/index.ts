import type { Transaction } from 'dexie'
import type { Board, Column } from '@/features/tasks/models/schemas'
import { missingDefaultColumns } from '@/features/board/services/defaults'

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
]

export const CURRENT_DB_VERSION = DB_MIGRATIONS[DB_MIGRATIONS.length - 1]!.version
