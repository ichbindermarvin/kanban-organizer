import Dexie, { type Table } from 'dexie'
import type { Board, Column, Settings, Task } from '@/features/tasks/models/schemas'
import { DB_MIGRATIONS } from './migrations'

export const DB_NAME = 'kanban-organizer'

export class KanbanDatabase extends Dexie {
  boards!: Table<Board, string>
  columns!: Table<Column, string>
  tasks!: Table<Task, string>
  settings!: Table<Settings, string>

  constructor(name = DB_NAME) {
    super(name)
    for (const migration of DB_MIGRATIONS) {
      const version = this.version(migration.version).stores(migration.stores)
      if (migration.upgrade) version.upgrade(migration.upgrade)
    }
  }
}

export type StorageErrorKind = 'unavailable' | 'migration' | 'write' | 'unknown'

/** Error with a kind the UI can translate into an understandable message. */
export class StorageError extends Error {
  constructor(
    public kind: StorageErrorKind,
    cause?: unknown,
  ) {
    super(`Storage error: ${kind}`, { cause })
  }
}

export function classifyDbError(error: unknown): StorageError {
  if (error instanceof StorageError) return error
  const name = (error as { name?: string })?.name ?? ''
  if (name === 'MissingAPIError' || name === 'InvalidStateError' || name === 'SecurityError') return new StorageError('unavailable', error)
  if (name === 'UpgradeError' || name === 'VersionError' || name === 'VersionChangeError') return new StorageError('migration', error)
  if (name === 'QuotaExceededError' || name === 'AbortError' || name === 'ConstraintError') return new StorageError('write', error)
  return new StorageError('unknown', error)
}
