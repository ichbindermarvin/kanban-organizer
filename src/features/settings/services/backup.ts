import { z } from 'zod'
import { boardSchema, columnSchema, settingsSchema, taskSchema, timestampSchema } from '@/features/tasks/models/schemas'
import type { DataSnapshot } from '@/db/repositories/types'

/** Version of the backup file format. Bump it and add an entry to BACKUP_MIGRATIONS when the format changes. */
export const BACKUP_SCHEMA_VERSION = 1

export const backupFileSchema = z.object({
  schemaVersion: z.literal(BACKUP_SCHEMA_VERSION),
  exportedAt: timestampSchema,
  app: z.string().optional(),
  boards: z.array(boardSchema),
  columns: z.array(columnSchema),
  tasks: z.array(taskSchema),
  settings: settingsSchema.optional(),
})
export type BackupFile = z.infer<typeof backupFileSchema>

/** Migrations from older backup versions: key = source version, returns data of version key + 1. */
const BACKUP_MIGRATIONS: Record<number, (data: Record<string, unknown>) => Record<string, unknown>> = {}

export function buildBackup(snapshot: DataSnapshot, now: string): BackupFile {
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: now,
    app: 'kanban-organizer',
    boards: snapshot.boards,
    columns: snapshot.columns,
    tasks: snapshot.tasks,
    ...(snapshot.settings ? { settings: snapshot.settings } : {}),
  }
}

export function backupFileName(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `kanban-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`
}

export type ImportErrorCode = 'parse' | 'structure' | 'version-newer' | 'version-unknown' | 'ids' | 'references' | 'empty'

export type ImportResult = { ok: true; snapshot: DataSnapshot } | { ok: false; code: ImportErrorCode; detail?: string }

/**
 * Parses and fully validates a backup file before anything is written.
 * Steps: parse JSON → check schemaVersion → migrate → validate structure → check IDs and references.
 */
export function parseBackup(text: string): ImportResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, code: 'parse' }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, code: 'structure' }

  let data = raw as Record<string, unknown>
  const version = data.schemaVersion
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) return { ok: false, code: 'version-unknown' }
  if (version > BACKUP_SCHEMA_VERSION) return { ok: false, code: 'version-newer', detail: String(version) }
  for (let v = version; v < BACKUP_SCHEMA_VERSION; v++) {
    const migrate = BACKUP_MIGRATIONS[v]
    if (!migrate) return { ok: false, code: 'version-unknown', detail: String(v) }
    data = { ...migrate(data), schemaVersion: v + 1 }
  }

  const parsed = backupFileSchema.safeParse(data)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { ok: false, code: 'structure', detail: issue ? `${issue.path.join('.')}: ${issue.message}` : undefined }
  }
  const file = parsed.data
  if (file.boards.length === 0 || file.columns.length === 0) return { ok: false, code: 'empty' }

  for (const list of [file.boards, file.columns, file.tasks]) {
    const ids = new Set<string>()
    for (const item of list) {
      if (ids.has(item.id)) return { ok: false, code: 'ids', detail: item.id }
      ids.add(item.id)
    }
  }

  const boardIds = new Set(file.boards.map((b) => b.id))
  const columnsById = new Map(file.columns.map((c) => [c.id, c]))
  for (const column of file.columns) {
    if (!boardIds.has(column.boardId)) return { ok: false, code: 'references', detail: column.id }
  }
  for (const task of file.tasks) {
    const column = columnsById.get(task.columnId)
    if (!boardIds.has(task.boardId) || !column || column.boardId !== task.boardId) {
      return { ok: false, code: 'references', detail: task.id }
    }
  }

  return {
    ok: true,
    snapshot: { boards: file.boards, columns: file.columns, tasks: file.tasks, ...(file.settings ? { settings: file.settings } : {}) },
  }
}
