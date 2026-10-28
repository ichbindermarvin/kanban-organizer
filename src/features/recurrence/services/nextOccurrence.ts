import { addDays, addMonths, getDate, getDay, getDaysInMonth, startOfMonth, startOfWeek } from 'date-fns'
import type { RecurrenceRule } from '@/features/tasks/models/schemas'
import { recurrenceRuleSchema } from '@/features/tasks/models/schemas'
import { daysBetween, fromIsoDate, toIsoDate } from '@/shared/utils/dates'

/**
 * Calculates the deadline of the next instance of a recurring task.
 *
 * Rules (documented in README → "Wiederkehrende Aufgaben"):
 * - The series keeps its rhythm: occurrences are derived from the current deadline,
 *   not from the completion date (weekly on Monday stays on Monday).
 * - Exactly one next instance is produced, and it lies strictly after both the current
 *   deadline and today. A long overdue series therefore skips the missed dates instead
 *   of flooding the board with past instances.
 * - Monthly rules use `dayOfMonth` (or the day of the current deadline). Months that are
 *   too short use their last day; the rule keeps the original day for later months
 *   (31.01. → 28.02. → 31.03.).
 * - Returns `null` when the next date would be after `endDate`.
 */
export function calculateNextOccurrence(rule: RecurrenceRule, currentDue: string, today: string): string | null {
  const threshold = currentDue > today ? currentDue : today
  const interval = Math.max(1, Math.floor(rule.interval))
  let next: string

  switch (rule.frequency) {
    case 'daily': {
      const diff = daysBetween(currentDue, threshold)
      const steps = Math.floor(diff / interval) + 1
      next = toIsoDate(addDays(fromIsoDate(currentDue), steps * interval))
      break
    }
    case 'weekly': {
      next = nextWeekly(rule, currentDue, threshold, interval)
      break
    }
    case 'monthly': {
      next = nextMonthly(rule, currentDue, threshold, interval)
      break
    }
  }

  if (rule.endDate && next > rule.endDate) return null
  return next
}

function nextWeekly(rule: RecurrenceRule, currentDue: string, threshold: string, interval: number): string {
  const due = fromIsoDate(currentDue)
  const days = rule.daysOfWeek && rule.daysOfWeek.length > 0 ? rule.daysOfWeek : [getDay(due)]
  const anchorWeek = startOfWeek(due, { weekStartsOn: 1 })
  let candidate = addDays(fromIsoDate(threshold), 1)
  // Within (interval + 1) weeks every allowed weekday occurs in an active week at least once.
  for (let i = 0; i < 7 * (interval + 1); i++) {
    const week = startOfWeek(candidate, { weekStartsOn: 1 })
    const weekIndex = Math.round(daysBetween(toIsoDate(anchorWeek), toIsoDate(week)) / 7)
    if (weekIndex % interval === 0 && days.includes(getDay(candidate))) return toIsoDate(candidate)
    candidate = addDays(candidate, 1)
  }
  /* c8 ignore next */
  throw new Error('No weekly occurrence found')
}

function nextMonthly(rule: RecurrenceRule, currentDue: string, threshold: string, interval: number): string {
  const due = fromIsoDate(currentDue)
  const day = rule.dayOfMonth ?? getDate(due)
  const anchorMonth = startOfMonth(due)
  const thresholdDate = fromIsoDate(threshold)
  const monthDiff =
    (thresholdDate.getFullYear() - anchorMonth.getFullYear()) * 12 + (thresholdDate.getMonth() - anchorMonth.getMonth())
  let k = Math.max(0, Math.floor(monthDiff / interval))
  for (;;) {
    const month = addMonths(anchorMonth, k * interval)
    const clamped = Math.min(day, getDaysInMonth(month))
    const candidate = toIsoDate(new Date(month.getFullYear(), month.getMonth(), clamped))
    if (candidate > threshold) return candidate
    k++
  }
}

export type RecurrenceValidation = { ok: true; rule: RecurrenceRule } | { ok: false; reason: 'invalid' }

export function validateRecurrenceRule(rule: unknown): RecurrenceValidation {
  const parsed = recurrenceRuleSchema.safeParse(rule)
  return parsed.success ? { ok: true, rule: parsed.data } : { ok: false, reason: 'invalid' }
}
