import Dexie, { type Table } from 'dexie'
import type { Board, Column, Settings, Task } from '@/features/tasks/models/schemas'
import { DB_MIGRATIONS } from './migrations'

export const DB_NAME = 'kanban-organizer'

export interface OutboxEntry {
  key: string
  /** Increasing counter; an entry is only removed if it was not marked again during an upload. */
  markedAt: number
}

export interface MetaEntry {
  key: string
  value: unknown
}

export type RecordKind = 'board' | 'column' | 'task' | 'settings'

export function recordKey(kind: RecordKind, id: string): string {
  return `${kind}:${id}`
}

let markCounter = 0
/** Monotonic marker for outbox entries (Date.now() alone can repeat within one millisecond). */
export function nextMark(): number {
  markCounter = Math.max(markCounter + 1, Date.now() * 1000)
  return markCounter
}

export class KanbanDatabase extends Dexie {
  boards!: Table<Board, string>
  columns!: Table<Column, string>
  tasks!: Table<Task, string>
  settings!: Table<Settings, string>
  /** Records changed locally that still have to be uploaded (cloud sync). Key: "task:<id>". */
  outbox!: Table<OutboxEntry, string>
  /** Device-local key/value data that is never synced (sync cursor, sync key, server config). */
  meta!: Table<MetaEntry, string>

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
