import { useState } from 'react'
import { getDate, getDay } from 'date-fns'
import type { RecurrenceRule } from '@/features/tasks/models/schemas'
import { calculateNextOccurrence, validateRecurrenceRule } from '@/features/recurrence/services/nextOccurrence'
import { useAppStore } from '@/state/appStore'
import { useT } from '@/shared/hooks/useT'
import { dateLocale } from '@/shared/i18n'
import { fromIsoDate } from '@/shared/utils/dates'
import { formatShortDate } from '@/shared/utils/format'

type Mode = 'none' | 'daily' | 'weekly' | 'monthly' | 'custom'
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]

function presetFor(mode: Exclude<Mode, 'none' | 'custom'>, dueDate: string): RecurrenceRule {
  const date = fromIsoDate(dueDate)
  if (mode === 'weekly') return { frequency: 'weekly', interval: 1, daysOfWeek: [getDay(date)] }
  if (mode === 'monthly') return { frequency: 'monthly', interval: 1, dayOfMonth: getDate(date) }
  return { frequency: 'daily', interval: 1 }
}

function modeOf(rule: RecurrenceRule | undefined, dueDate: string | undefined): Mode {
  if (!rule) return 'none'
  if (!dueDate || rule.interval !== 1 || rule.endDate) return 'custom'
  const preset = presetFor(rule.frequency, dueDate)
  if (rule.frequency === 'weekly' && (rule.daysOfWeek ?? preset.daysOfWeek)!.join() !== preset.daysOfWeek!.join()) return 'custom'
  if (rule.frequency === 'monthly' && (rule.dayOfMonth ?? preset.dayOfMonth) !== preset.dayOfMonth) return 'custom'
  return rule.frequency
}

interface RecurrenceEditorProps {
  rule: RecurrenceRule | undefined
  dueDate: string | undefined
  onChange: (rule: RecurrenceRule | undefined) => void
  onSetDueDate: (date: string) => void
}

export function RecurrenceEditor({ rule, dueDate, onChange, onSetDueDate }: RecurrenceEditorProps) {
  const t = useT()
  const today = useAppStore((s) => s.today)
  const locale = useAppStore((s) => s.settings.locale)
  const [customOpen, setCustomOpen] = useState(false)
  const mode: Mode = customOpen && rule ? 'custom' : modeOf(rule, dueDate)

  if (!dueDate) {
    // No hidden assumption: a series needs an explicit start date.
    return (
      <div className="recurrence">
        <p className="hint hint--inline">{t('recurrence.needsDate')}</p>
        <button type="button" className="btn btn--small" onClick={() => onSetDueDate(today)}>
          {t('recurrence.useToday')}
        </button>
      </div>
    )
  }

  const setRule = (next: RecurrenceRule) => {
    const valid = validateRecurrenceRule(next)
    if (valid.ok) onChange(valid.rule)
  }

  const onModeChange = (next: Mode) => {
    if (next === 'none') {
      setCustomOpen(false)
      onChange(undefined)
    } else if (next === 'custom') {
      setCustomOpen(true)
      if (!rule) setRule(presetFor('weekly', dueDate))
    } else {
      setCustomOpen(false)
      setRule(presetFor(next, dueDate))
    }
  }

  const valid = rule ? validateRecurrenceRule(rule).ok : true
  const next = rule && valid ? calculateNextOccurrence(rule, dueDate, today) : null
  const weekdayName = (day: number) => dateLocale(locale).localize.day(day as 0, { width: 'short' })

  return (
    <div className="recurrence">
      <select className="select" value={mode} aria-label={t('recurrence.label')} onChange={(e) => onModeChange(e.target.value as Mode)}>
        <option value="none">{t('recurrence.none')}</option>
        <option value="daily">{t('recurrence.daily')}</option>
        <option value="weekly">{t('recurrence.weekly')}</option>
        <option value="monthly">{t('recurrence.monthly')}</option>
        <option value="custom">{t('recurrence.custom')}…</option>
      </select>

      {rule && mode === 'custom' && (
        <div className="recurrence__custom">
          <div className="recurrence__row">
            <label htmlFor="recurrence-interval">{t('recurrence.every')}</label>
            <input
              id="recurrence-interval"
              className="input input--small input--number"
              type="number"
              min={1}
              max={365}
              value={rule.interval}
              onChange={(e) => {
                const interval = Number(e.target.value)
                if (interval >= 1) setRule({ ...rule, interval })
              }}
            />
            <select
              className="select select--small"
              aria-label={t('recurrence.label')}
              value={rule.frequency}
              onChange={(e) => {
                const frequency = e.target.value as RecurrenceRule['frequency']
                const preset = presetFor(frequency, dueDate)
                setRule({ ...preset, interval: rule.interval, ...(rule.endDate ? { endDate: rule.endDate } : {}) })
              }}
            >
              <option value="daily">{t('recurrence.unit.daily')}</option>
              <option value="weekly">{t('recurrence.unit.weekly')}</option>
              <option value="monthly">{t('recurrence.unit.monthly')}</option>
            </select>
          </div>

          {rule.frequency === 'weekly' && (
            <fieldset className="recurrence__days">
              <legend>{t('recurrence.onDays')}</legend>
              {WEEK_ORDER.map((day) => {
                const days = rule.daysOfWeek ?? [getDay(fromIsoDate(dueDate))]
                const checked = days.includes(day)
                return (
                  <label key={day} className={`day-toggle${checked ? ' day-toggle--on' : ''}`}>
                    <input
                      type="checkbox"
                      className="visually-hidden"
                      checked={checked}
                      onChange={() => {
                        const nextDays = checked ? days.filter((d) => d !== day) : [...days, day].sort()
                        if (nextDays.length) setRule({ ...rule, daysOfWeek: nextDays })
                      }}
                    />
                    <span aria-hidden="true">{weekdayName(day)}</span>
                    <span className="visually-hidden">{dateLocale(locale).localize.day(day as 0, { width: 'wide' })}</span>
                  </label>
                )
              })}
            </fieldset>
          )}

          {rule.frequency === 'monthly' && (
            <div className="recurrence__row">
              <label htmlFor="recurrence-dom">{t('recurrence.onDayOfMonth')}</label>
              <input
                id="recurrence-dom"
                className="input input--small input--number"
                type="number"
                min={1}
                max={31}
                value={rule.dayOfMonth ?? getDate(fromIsoDate(dueDate))}
                onChange={(e) => {
                  const dayOfMonth = Number(e.target.value)
                  if (dayOfMonth >= 1 && dayOfMonth <= 31) setRule({ ...rule, dayOfMonth })
                }}
              />
              {(rule.dayOfMonth ?? 0) > 28 && <span className="muted small">{t('recurrence.monthEndHint')}</span>}
            </div>
          )}

          <div className="recurrence__row">
            <label htmlFor="recurrence-end">{t('recurrence.endDate')}</label>
            <input
              id="recurrence-end"
              className="input input--small"
              type="date"
              value={rule.endDate ?? ''}
              min={dueDate}
              onChange={(e) => {
                const { endDate: _old, ...rest } = rule
                setRule(e.target.value ? { ...rest, endDate: e.target.value } : rest)
              }}
            />
          </div>
        </div>
      )}

      {rule && (
        <p className="muted small" role="status">
          {!valid ? t('recurrence.invalid') : next ? t('recurrence.next', { date: formatShortDate(next, today, locale) }) : t('recurrence.ended')}
        </p>
      )}
      {rule && (
        <button
          type="button"
          className="btn btn--small btn--ghost"
          onClick={() => {
            setCustomOpen(false)
            onChange(undefined)
          }}
        >
          {t('recurrence.stop')}
        </button>
      )}
    </div>
  )
}
