import { addDays, differenceInCalendarDays, format, isValid, parseISO } from 'date-fns'

/** Local calendar date of `date` as YYYY-MM-DD. */
export function toIsoDate(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

/** Parses a YYYY-MM-DD string as a local calendar date (midnight local time). */
export function fromIsoDate(value: string): Date {
  return parseISO(value)
}

export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && isValid(parseISO(value))
}

export function todayIso(now: Date = new Date()): string {
  return toIsoDate(now)
}

export function addDaysIso(value: string, days: number): string {
  return toIsoDate(addDays(fromIsoDate(value), days))
}

/** Calendar-day distance from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: string, to: string): number {
  return differenceInCalendarDays(fromIsoDate(to), fromIsoDate(from))
}

export function nowTimestamp(): string {
  return new Date().toISOString()
}
