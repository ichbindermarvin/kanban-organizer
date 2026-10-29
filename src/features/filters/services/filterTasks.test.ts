import { filterTasks, sortTasks, EMPTY_FILTER } from './filterTasks'
import { searchTasks } from '@/features/search/services/searchTasks'
import { makeBoard, makeTask } from '@/tests/factories'

const TODAY = '2026-08-19' // Wednesday

describe('filterTasks', () => {
  const { inbox } = makeBoard()
  const high = makeTask(inbox, { priority: 'high', dueDate: '2026-08-18', tags: ['Content'] })
  const urgent = makeTask(inbox, { priority: 'urgent', dueDate: TODAY, tags: ['Admin'] })
  const week = makeTask(inbox, { priority: 'low', dueDate: '2026-08-23', tags: ['Content', 'Privat'] })
  const nextWeek = makeTask(inbox, { priority: 'medium', dueDate: '2026-08-24' })
  const noDate = makeTask(inbox, { priority: 'medium', tags: ['privat'] })
  const all = [high, urgent, week, nextWeek, noDate]
  const ids = (list: { id: string }[]) => list.map((t) => t.id)

  it('without filters returns everything', () => {
    expect(filterTasks(all, EMPTY_FILTER, TODAY)).toHaveLength(5)
  })
  it('filters by priority (OR inside the category)', () => {
    expect(ids(filterTasks(all, { ...EMPTY_FILTER, priorities: ['high', 'urgent'] }, TODAY))).toEqual([high.id, urgent.id])
  })
  it('filters by due state', () => {
    expect(ids(filterTasks(all, { ...EMPTY_FILTER, due: ['overdue'] }, TODAY))).toEqual([high.id])
    expect(ids(filterTasks(all, { ...EMPTY_FILTER, due: ['today'] }, TODAY))).toEqual([urgent.id])
    expect(ids(filterTasks(all, { ...EMPTY_FILTER, due: ['week'] }, TODAY))).toEqual([urgent.id, week.id])
    expect(ids(filterTasks(all, { ...EMPTY_FILTER, due: ['none'] }, TODAY))).toEqual([noDate.id])
  })
  it('filters by tags case-insensitively', () => {
    expect(ids(filterTasks(all, { ...EMPTY_FILTER, tags: ['Privat'] }, TODAY))).toEqual([week.id, noDate.id])
  })
  it('filters by color, including tasks without color', () => {
    const blue = makeTask(inbox, { color: 'blue' })
    const green = makeTask(inbox, { color: 'green', priority: 'high' })
    const plain = makeTask(inbox)
    const list = [blue, green, plain]
    expect(ids(filterTasks(list, { ...EMPTY_FILTER, colors: ['blue'] }, TODAY))).toEqual([blue.id])
    expect(ids(filterTasks(list, { ...EMPTY_FILTER, colors: ['blue', 'none'] }, TODAY))).toEqual([blue.id, plain.id])
    expect(ids(filterTasks(list, { ...EMPTY_FILTER, colors: ['blue', 'green'], priorities: ['high'] }, TODAY))).toEqual([green.id])
  })

  it('combines categories with AND', () => {
    expect(ids(filterTasks(all, { priorities: ['low', 'high'], due: ['week', 'overdue'], tags: ['Content'], colors: [] }, TODAY))).toEqual([high.id, week.id])
    expect(filterTasks(all, { priorities: ['urgent'], due: ['none'], tags: [], colors: [] }, TODAY)).toEqual([])
  })
})

describe('sortTasks', () => {
  it('sorts by deadline with undated tasks last', () => {
    const { inbox } = makeBoard()
    const a = makeTask(inbox, { dueDate: '2026-09-01' })
    const b = makeTask(inbox)
    const c = makeTask(inbox, { dueDate: '2026-08-01' })
    expect(sortTasks([a, b, c], 'dueDate').map((t) => t.id)).toEqual([c.id, a.id, b.id])
  })
})

describe('searchTasks', () => {
  const { inbox } = makeBoard()
  const a = makeTask(inbox, { title: 'Newsletter August vorbereiten' })
  const b = makeTask(inbox, { title: 'Steuer', description: 'Belege für die Prüfung sammeln' })
  const c = makeTask(inbox, { title: 'Training', tags: ['Handball'] })
  const deleted = makeTask(inbox, { title: 'Newsletter alt', deletedAt: '2026-08-19T00:00:00.000Z' })
  const all = [a, b, c, deleted]

  it('finds by title', () => expect(searchTasks(all, 'newsletter').map((t) => t.id)).toEqual([a.id]))
  it('finds by description, ignoring accents', () => expect(searchTasks(all, 'prufung').map((t) => t.id)).toEqual([b.id]))
  it('finds by tag', () => expect(searchTasks(all, 'handball').map((t) => t.id)).toEqual([c.id]))
  it('finds by color name and user-defined color meaning', () => {
    const blue = makeTask(inbox, { title: 'Angebot', color: 'blue' })
    const terms = { blue: 'Blau Arbeit', green: 'Grün' }
    expect(searchTasks([blue, a], 'arbeit', terms).map((t) => t.id)).toEqual([blue.id])
    expect(searchTasks([blue, a], 'blau', terms).map((t) => t.id)).toEqual([blue.id])
    expect(searchTasks([blue, a], 'grün', terms)).toEqual([])
    expect(searchTasks([blue, a], 'arbeit')).toEqual([])
  })
  it('finds by "waiting for"', () => {
    const blocked = makeTask(inbox, { title: 'Vertrag', waitingFor: 'Unterschrift von Anna' })
    expect(searchTasks([blocked, a], 'anna').map((t) => t.id)).toEqual([blocked.id])
  })
  it('requires all words', () => expect(searchTasks(all, 'newsletter steuer')).toEqual([]))
  it('returns nothing for an empty query', () => expect(searchTasks(all, '  ')).toEqual([]))
})
