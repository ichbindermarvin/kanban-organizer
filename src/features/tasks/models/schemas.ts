import { z } from 'zod'

/** Calendar date without time, e.g. "2026-08-10". Used for deadlines to avoid timezone drift. */
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
/** ISO-8601 timestamp, always written via `new Date().toISOString()`. */
export const timestampSchema = z.string().datetime({ offset: true })

export const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const
export const prioritySchema = z.enum(PRIORITIES)
export type Priority = z.infer<typeof prioritySchema>

export const COLUMN_ROLES = ['inbox', 'planned', 'doing', 'done'] as const
export const columnRoleSchema = z.enum(COLUMN_ROLES)
export type ColumnRole = z.infer<typeof columnRoleSchema>

export const recurrenceRuleSchema = z
  .object({
    frequency: z.enum(['daily', 'weekly', 'monthly']),
    interval: z.number().int().min(1).max(365),
    /** 0 = Sunday … 6 = Saturday (same as Date#getDay). Only for weekly. */
    daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
    /** 1–31. Only for monthly. Months without that day use their last day. */
    dayOfMonth: z.number().int().min(1).max(31).optional(),
    endDate: isoDateSchema.optional(),
  })
  .refine((r) => r.frequency !== 'weekly' || !r.daysOfWeek || r.daysOfWeek.length > 0, {
    message: 'Weekly rules need at least one weekday',
  })
export type RecurrenceRule = z.infer<typeof recurrenceRuleSchema>

export const subtaskSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  completed: z.boolean(),
  position: z.number(),
})
export type Subtask = z.infer<typeof subtaskSchema>

export const boardSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  archivedAt: timestampSchema.optional(),
})
export type Board = z.infer<typeof boardSchema>

export const columnSchema = z.object({
  id: z.string().min(1),
  boardId: z.string().min(1),
  /** Custom title. Empty string = localized default name for the role. */
  title: z.string(),
  /** Semantic role. Business rules (completion, Today view) depend on the role, never on the title. */
  role: columnRoleSchema,
  position: z.number(),
  wipLimit: z.number().int().min(1).optional(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})
export type Column = z.infer<typeof columnSchema>

export const taskSchema = z.object({
  id: z.string().min(1),
  boardId: z.string().min(1),
  columnId: z.string().min(1),
  title: z.string(),
  description: z.string().optional(),
  position: z.number(),
  priority: prioritySchema,
  dueDate: isoDateSchema.optional(),
  tags: z.array(z.string()),
  subtasks: z.array(subtaskSchema),
  recurrence: recurrenceRuleSchema.optional(),
  recurrenceSeriesId: z.string().optional(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  completedAt: timestampSchema.optional(),
  archivedAt: timestampSchema.optional(),
  /** Tombstone: deleted tasks are kept as markers so a future sync can propagate deletions. */
  deletedAt: timestampSchema.optional(),
})
export type Task = z.infer<typeof taskSchema>

export const THEMES = ['system', 'light', 'dark'] as const
export const LOCALES = ['de', 'en'] as const

export const settingsSchema = z.object({
  id: z.literal('app'),
  theme: z.enum(THEMES),
  locale: z.enum(LOCALES),
  activeBoardId: z.string().optional(),
  lastBackupAt: timestampSchema.optional(),
  updatedAt: timestampSchema,
})
export type Settings = z.infer<typeof settingsSchema>
export type Theme = Settings['theme']
export type Locale = Settings['locale']
