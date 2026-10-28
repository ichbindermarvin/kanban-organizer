import { format } from 'date-fns'
import type { Locale } from '@/features/tasks/models/schemas'
import { dateLocale, translate } from '@/shared/i18n'
import { daysBetween, fromIsoDate } from './dates'

export type DueState = 'overdue' | 'today' | 'tomorrow' | 'future'

export function dueState(dueDate: string, today: string): DueState {
  const diff = daysBetween(today, dueDate)
  if (diff < 0) return 'overdue'
  if (diff === 0) return 'today'
  if (diff === 1) return 'tomorrow'
  return 'future'
}

/** "23.08." / "Aug 23"; the year is only shown when it differs from the current year. */
export function formatShortDate(dueDate: string, today: string, locale: Locale): string {
  const sameYear = dueDate.slice(0, 4) === today.slice(0, 4)
  const pattern = locale === 'de' ? (sameYear ? 'dd.MM.' : 'dd.MM.yyyy') : sameYear ? 'MMM d' : 'MMM d, yyyy'
  return format(fromIsoDate(dueDate), pattern, { locale: dateLocale(locale) })
}

/** Relative label for deadlines: Heute, Morgen, Gestern, or a short date. */
export function formatDue(dueDate: string, today: string, locale: Locale): string {
  const diff = daysBetween(today, dueDate)
  if (diff === 0) return translate(locale, 'due.today')
  if (diff === 1) return translate(locale, 'due.tomorrow')
  if (diff === -1) return translate(locale, 'due.yesterday')
  return formatShortDate(dueDate, today, locale)
}

export function formatLongDate(date: Date, locale: Locale): string {
  return format(date, locale === 'de' ? 'EEEE, d. MMMM' : 'EEEE, MMMM d', { locale: dateLocale(locale) })
}

export function formatTimestamp(timestamp: string, locale: Locale): string {
  return format(new Date(timestamp), locale === 'de' ? 'dd.MM.yyyy, HH:mm' : 'MMM d, yyyy, h:mm a', { locale: dateLocale(locale) })
}
