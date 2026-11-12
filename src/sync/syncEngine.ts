import type { ZodType } from 'zod'
import { boardSchema, columnSchema, settingsSchema, taskSchema } from '@/features/tasks/models/schemas'
import type { KanbanDatabase, RecordKind } from '@/db/database'
import { recordKey } from '@/db/database'
import { decryptJson, encryptJson } from './crypto'
import { SyncError, type RemoteRecord, type RemoteStore } from './remote'

/*
 * Sync engine: local-first, end-to-end encrypted, last-write-wins per record.
 *
 * - Local writes are marked in the outbox (same transaction as the write, see dexieRepositories).
 * - push(): encrypts outbox records and uploads them; the server keeps the newer version.
 * - pull(): fetches records stored since the last cursor, decrypts them and applies every record
 *   that is newer than the local copy. The cursor overlaps by a few seconds; applying is idempotent.
 * - Deletions travel as tombstones (deletedAt / archivedAt), so they reach other devices too.
 */

const TABLES: Record<RecordKind, { table: 'boards' | 'columns' | 'tasks' | 'settings'; schema: ZodType }> = {
  board: { table: 'boards', schema: boardSchema },
  column: { table: 'columns', schema: columnSchema },
  task: { table: 'tasks', schema: taskSchema },
  settings: { table: 'settings', schema: settingsSchema },
}

const CURSOR_KEY = 'sync.cursor'
const CURSOR_OVERLAP_MS = 30_000
const PAGE_SIZE = 500
const PUSH_BATCH = 200

interface Envelope {
  kind: RecordKind
  data: { id: string; updatedAt: string }
}

function parseKey(key: string): { kind: RecordKind; id: string } | undefined {
  const index = key.indexOf(':')
  const kind = key.slice(0, index) as RecordKind
  return index > 0 && kind in TABLES ? { kind, id: key.slice(index + 1) } : undefined
}

function classify(error: unknown): SyncError {
  if (error instanceof SyncError) return error
  return new SyncError('server', error instanceof Error ? error.message : String(error), { cause: error })
}

export interface SyncResult {
  pushed: number
  pulled: number
}

export class SyncEngine {
  constructor(
    private db: KanbanDatabase,
    private remote: RemoteStore,
    private key: CryptoKey,
  ) {}

  /** Uploads all outbox records. Returns the number of uploaded records. */
  async push(): Promise<number> {
    const entries = await this.db.outbox.toArray()
    let pushed = 0
    for (let i = 0; i < entries.length; i += PUSH_BATCH) {
      const batch = entries.slice(i, i + PUSH_BATCH)
      const records: RemoteRecord[] = []
      const done: typeof batch = []
      for (const entry of batch) {
        const parsed = parseKey(entry.key)
        const data = parsed ? ((await this.db.table(TABLES[parsed.kind].table).get(parsed.id)) as Envelope['data'] | undefined) : undefined
        if (parsed && data) {
          const envelope: Envelope = { kind: parsed.kind, data }
          records.push({ id: entry.key, updatedAt: data.updatedAt, payload: await encryptJson(this.key, entry.key, envelope) })
        }
        done.push(entry)
      }
      try {
        if (records.length) await this.remote.push(records)
      } catch (error) {
        throw classify(error)
      }
      // Remove only entries that were not marked again while uploading.
      await this.db.transaction('rw', this.db.outbox, async () => {
        for (const entry of done) {
          const current = await this.db.outbox.get(entry.key)
          if (current && current.markedAt === entry.markedAt) await this.db.outbox.delete(entry.key)
        }
      })
      pushed += records.length
    }
    return pushed
  }

  /** Downloads and applies newer remote records. Returns the number of records changed locally. */
  async pull(): Promise<number> {
    const cursor = (await this.db.meta.get(CURSOR_KEY))?.value as string | undefined
    let since = cursor ? new Date(new Date(cursor).getTime() - CURSOR_OVERLAP_MS).toISOString() : undefined
    let maxSeen = cursor
    let applied = 0
    for (;;) {
      let rows: RemoteRecord[]
      try {
        rows = await this.remote.pull(since, PAGE_SIZE)
      } catch (error) {
        throw classify(error)
      }
      applied += await this.apply(rows)
      for (const row of rows) if (row.serverUpdatedAt && (!maxSeen || row.serverUpdatedAt > maxSeen)) maxSeen = row.serverUpdatedAt
      if (rows.length < PAGE_SIZE) break
      since = rows[rows.length - 1]!.serverUpdatedAt
    }
    if (maxSeen) await this.db.meta.put({ key: CURSOR_KEY, value: maxSeen })
    return applied
  }

  async sync(): Promise<SyncResult> {
    const pushed = await this.push()
    const pulled = await this.pull()
    return { pushed, pulled }
  }

  private async apply(rows: RemoteRecord[]): Promise<number> {
    const decoded: Envelope[] = []
    for (const row of rows) {
      if (!parseKey(row.id)) continue // e.g. "meta:key"
      try {
        decoded.push(await decryptJson<Envelope>(this.key, row.id, row.payload))
      } catch (error) {
        throw new SyncError('decrypt', 'Record could not be decrypted', { cause: error })
      }
    }
    if (!decoded.length) return 0
    let applied = 0
    await this.db.transaction('rw', [this.db.boards, this.db.columns, this.db.tasks, this.db.settings], async () => {
      for (const { kind, data } of decoded) {
        const { table, schema } = TABLES[kind]
        const parsed = schema.safeParse(data)
        if (!parsed.success) continue // never let a malformed record into the local database
        const local = (await this.db.table(table).get(data.id)) as { updatedAt: string } | undefined
        if (local && local.updatedAt >= data.updatedAt) continue
        // Written directly (not through the repositories), so it does not land in the outbox again.
        await this.db.table(table).put(parsed.data)
        applied++
      }
    })
    return applied
  }
}

/** Marks every local record for upload (first connection, or after choosing to merge). */
export async function markEverythingDirty(db: KanbanDatabase): Promise<void> {
  const markedAt = Date.now() * 1000
  const entries: { key: string; markedAt: number }[] = []
  for (const [kind, { table }] of Object.entries(TABLES) as [RecordKind, (typeof TABLES)[RecordKind]][]) {
    const ids = (await db.table(table).toCollection().primaryKeys()) as string[]
    ids.forEach((id) => entries.push({ key: recordKey(kind, id), markedAt }))
  }
  await db.outbox.bulkPut(entries)
}

/**
 * A device that has never been used for tasks (only the automatically created default board).
 * When such a device joins an existing cloud account, its local data is replaced instead of merged,
 * so the user does not end up with a second, empty "Persönlich" board.
 */
export async function isPristine(db: KanbanDatabase): Promise<boolean> {
  return (await db.tasks.count()) === 0 && (await db.boards.count()) <= 1
}

/** Removes all local boards, columns and tasks (before taking over the cloud state). */
export async function clearLocalData(db: KanbanDatabase): Promise<void> {
  await db.transaction('rw', [db.boards, db.columns, db.tasks, db.outbox, db.meta], async () => {
    await Promise.all([db.boards.clear(), db.columns.clear(), db.tasks.clear(), db.outbox.clear(), db.meta.delete(CURSOR_KEY)])
  })
}
