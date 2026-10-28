import { calculateNextOccurrence, validateRecurrenceRule } from './nextOccurrence'

describe('calculateNextOccurrence', () => {
  it('daily: completed on the due date → next day', () => {
    expect(calculateNextOccurrence({ frequency: 'daily', interval: 1 }, '2026-08-19', '2026-08-19')).toBe('2026-08-20')
  })

  it('daily every 2 days keeps its rhythm', () => {
    expect(calculateNextOccurrence({ frequency: 'daily', interval: 2 }, '2026-08-19', '2026-08-19')).toBe('2026-08-21')
    expect(calculateNextOccurrence({ frequency: 'daily', interval: 2 }, '2026-08-19', '2026-08-20')).toBe('2026-08-21')
    expect(calculateNextOccurrence({ frequency: 'daily', interval: 2 }, '2026-08-19', '2026-08-21')).toBe('2026-08-23')
  })

  it('weekly: due Monday, completed Wednesday → following Monday (rhythm kept)', () => {
    // 2026-08-10 is a Monday
    expect(calculateNextOccurrence({ frequency: 'weekly', interval: 1, daysOfWeek: [1] }, '2026-08-10', '2026-08-12')).toBe('2026-08-17')
  })

  it('weekly without explicit days uses the weekday of the deadline', () => {
    expect(calculateNextOccurrence({ frequency: 'weekly', interval: 1 }, '2026-08-10', '2026-08-10')).toBe('2026-08-17')
  })

  it('weekly on Monday + Thursday', () => {
    const rule = { frequency: 'weekly' as const, interval: 1, daysOfWeek: [1, 4] }
    expect(calculateNextOccurrence(rule, '2026-08-10', '2026-08-10')).toBe('2026-08-13')
    expect(calculateNextOccurrence(rule, '2026-08-13', '2026-08-13')).toBe('2026-08-17')
  })

  it('every 2 weeks on Friday', () => {
    const rule = { frequency: 'weekly' as const, interval: 2, daysOfWeek: [5] }
    // 2026-08-14 is a Friday
    expect(calculateNextOccurrence(rule, '2026-08-14', '2026-08-14')).toBe('2026-08-28')
    // completed late (in the off week) → still the series rhythm
    expect(calculateNextOccurrence(rule, '2026-08-14', '2026-08-22')).toBe('2026-08-28')
    // completed after the next occurrence passed → skip to the following active week
    expect(calculateNextOccurrence(rule, '2026-08-14', '2026-08-29')).toBe('2026-09-11')
  })

  it('monthly on the 1st and 15th', () => {
    expect(calculateNextOccurrence({ frequency: 'monthly', interval: 1, dayOfMonth: 1 }, '2026-08-01', '2026-08-03')).toBe('2026-09-01')
    expect(calculateNextOccurrence({ frequency: 'monthly', interval: 1, dayOfMonth: 15 }, '2026-08-15', '2026-08-15')).toBe('2026-09-15')
  })

  it('monthly on the 31st uses the last day of shorter months and returns to the 31st', () => {
    const rule = { frequency: 'monthly' as const, interval: 1, dayOfMonth: 31 }
    expect(calculateNextOccurrence(rule, '2026-01-31', '2026-01-31')).toBe('2026-02-28')
    expect(calculateNextOccurrence(rule, '2026-02-28', '2026-02-28')).toBe('2026-03-31')
    expect(calculateNextOccurrence(rule, '2026-03-31', '2026-03-31')).toBe('2026-04-30')
    expect(calculateNextOccurrence(rule, '2028-01-31', '2028-01-31')).toBe('2028-02-29')
  })

  it('monthly without dayOfMonth uses the day of the deadline', () => {
    expect(calculateNextOccurrence({ frequency: 'monthly', interval: 1 }, '2026-01-31', '2026-01-31')).toBe('2026-02-28')
  })

  it('every 3 months', () => {
    expect(calculateNextOccurrence({ frequency: 'monthly', interval: 3, dayOfMonth: 10 }, '2026-01-10', '2026-01-10')).toBe('2026-04-10')
  })

  it('long overdue series produces exactly one next instance after today', () => {
    expect(calculateNextOccurrence({ frequency: 'daily', interval: 1 }, '2026-07-01', '2026-07-31')).toBe('2026-08-01')
    expect(calculateNextOccurrence({ frequency: 'weekly', interval: 1, daysOfWeek: [1] }, '2026-06-01', '2026-08-12')).toBe('2026-08-17')
    expect(calculateNextOccurrence({ frequency: 'monthly', interval: 1, dayOfMonth: 5 }, '2026-01-05', '2026-08-12')).toBe('2026-09-05')
  })

  it('completed early: next instance follows the deadline, not today', () => {
    expect(calculateNextOccurrence({ frequency: 'daily', interval: 1 }, '2026-08-25', '2026-08-19')).toBe('2026-08-26')
  })

  it('returns null after the end date', () => {
    expect(calculateNextOccurrence({ frequency: 'daily', interval: 1, endDate: '2026-08-19' }, '2026-08-19', '2026-08-19')).toBeNull()
    expect(calculateNextOccurrence({ frequency: 'daily', interval: 1, endDate: '2026-08-20' }, '2026-08-19', '2026-08-19')).toBe('2026-08-20')
  })

  it('handles year boundaries', () => {
    expect(calculateNextOccurrence({ frequency: 'monthly', interval: 1, dayOfMonth: 15 }, '2026-12-15', '2026-12-15')).toBe('2027-01-15')
    expect(calculateNextOccurrence({ frequency: 'weekly', interval: 1, daysOfWeek: [1] }, '2026-12-28', '2026-12-28')).toBe('2027-01-04')
  })
})

describe('validateRecurrenceRule', () => {
  it('rejects invalid rules', () => {
    expect(validateRecurrenceRule({ frequency: 'daily', interval: 0 }).ok).toBe(false)
    expect(validateRecurrenceRule({ frequency: 'yearly', interval: 1 }).ok).toBe(false)
    expect(validateRecurrenceRule({ frequency: 'weekly', interval: 1, daysOfWeek: [] }).ok).toBe(false)
    expect(validateRecurrenceRule({ frequency: 'monthly', interval: 1, dayOfMonth: 32 }).ok).toBe(false)
  })
  it('accepts valid rules', () => {
    expect(validateRecurrenceRule({ frequency: 'weekly', interval: 2, daysOfWeek: [5] }).ok).toBe(true)
  })
})
