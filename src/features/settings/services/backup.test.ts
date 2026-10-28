import { buildBackup, parseBackup, BACKUP_SCHEMA_VERSION } from './backup'
import { makeBoard, makeTask, NOW } from '@/tests/factories'

function sample() {
  const { board, columns, planned, done } = makeBoard()
  const recurring = makeTask(planned, {
    dueDate: '2026-08-24',
    color: 'blue',
    recurrence: { frequency: 'weekly', interval: 1, daysOfWeek: [1] },
    recurrenceSeriesId: 'series-1',
  })
  const history = makeTask(done, { dueDate: '2026-08-17', recurrenceSeriesId: 'series-1', completedAt: NOW })
  return { boards: [board], columns, tasks: [recurring, history] }
}

describe('backup export', () => {
  it('creates a versioned, valid file including recurrence rules', () => {
    const file = buildBackup(sample(), NOW)
    expect(file.schemaVersion).toBe(BACKUP_SCHEMA_VERSION)
    expect(file.exportedAt).toBe(NOW)
    const text = JSON.stringify(file)
    expect(text).toContain('"recurrence"')
    expect(parseBackup(text).ok).toBe(true)
  })
})

describe('backup import', () => {
  it('reconstructs tasks and recurrence series', () => {
    const data = sample()
    const result = parseBackup(JSON.stringify(buildBackup(data, NOW)))
    if (!result.ok) throw new Error(result.code)
    expect(result.snapshot.tasks).toEqual(data.tasks)
    expect(result.snapshot.tasks.filter((t) => t.recurrenceSeriesId === 'series-1')).toHaveLength(2)
  })

  it('rejects invalid JSON', () => {
    expect(parseBackup('{oops')).toEqual({ ok: false, code: 'parse' })
  })

  it('rejects wrong structure', () => {
    const file = buildBackup(sample(), NOW) as unknown as Record<string, unknown>
    expect(parseBackup(JSON.stringify({ ...file, tasks: [{ id: 1 }] }))).toMatchObject({ ok: false, code: 'structure' })
    expect(parseBackup('[]')).toMatchObject({ ok: false, code: 'structure' })
  })

  it('handles unknown and newer schema versions', () => {
    const file = buildBackup(sample(), NOW)
    expect(parseBackup(JSON.stringify({ ...file, schemaVersion: 99 }))).toMatchObject({ ok: false, code: 'version-newer' })
    expect(parseBackup(JSON.stringify({ ...file, schemaVersion: 'x' }))).toMatchObject({ ok: false, code: 'version-unknown' })
  })

  it('rejects duplicate IDs', () => {
    const file = buildBackup(sample(), NOW)
    expect(parseBackup(JSON.stringify({ ...file, tasks: [file.tasks[0], file.tasks[0]] }))).toMatchObject({ ok: false, code: 'ids' })
  })

  it('rejects tasks pointing to unknown columns', () => {
    const file = buildBackup(sample(), NOW)
    const broken = { ...file, tasks: [{ ...file.tasks[0]!, columnId: 'missing' }] }
    expect(parseBackup(JSON.stringify(broken))).toMatchObject({ ok: false, code: 'references' })
  })

  it('keeps color meanings from the settings', () => {
    const settings = { id: 'app' as const, theme: 'system' as const, locale: 'de' as const, colorLabels: { blue: 'Arbeit' }, updatedAt: NOW }
    const result = parseBackup(JSON.stringify(buildBackup({ ...sample(), settings }, NOW)))
    if (!result.ok) throw new Error(result.code)
    expect(result.snapshot.settings?.colorLabels).toEqual({ blue: 'Arbeit' })
    const broken = { ...buildBackup({ ...sample(), settings }, NOW), settings: { ...settings, colorLabels: { gold: 'x' } } }
    expect(parseBackup(JSON.stringify(broken))).toMatchObject({ ok: false, code: 'structure' })
  })

  it('rejects unknown card colors', () => {
    const file = buildBackup(sample(), NOW)
    const broken = { ...file, tasks: [{ ...file.tasks[0]!, color: 'gold' }] }
    expect(parseBackup(JSON.stringify(broken))).toMatchObject({ ok: false, code: 'structure' })
  })

  it('rejects invalid recurrence rules', () => {
    const file = buildBackup(sample(), NOW)
    const broken = { ...file, tasks: [{ ...file.tasks[0]!, recurrence: { frequency: 'weekly', interval: 0 } }] }
    expect(parseBackup(JSON.stringify(broken))).toMatchObject({ ok: false, code: 'structure' })
  })
})
