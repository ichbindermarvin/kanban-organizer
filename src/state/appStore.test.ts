import { createAppStore } from './appStore'
import { createDexieRepositories, openDatabase } from '@/db/repositories/dexieRepositories'
import { buildBackup, parseBackup } from '@/features/settings/services/backup'
import type { Repositories } from '@/db/repositories/types'
import { todayIso, addDaysIso } from '@/shared/utils/dates'

let dbCounter = 0

async function setup() {
  const db = await openDatabase(`test-${++dbCounter}`)
  const repos = createDexieRepositories(db)
  const store = createAppStore()
  await store.getState().init(repos)
  const s = () => store.getState()
  const col = (role: string) => s().columns.find((c) => c.role === role)!
  /** Simulates a page reload: a fresh store reading the same database. */
  const reloadStore = async () => {
    const fresh = createAppStore()
    await fresh.getState().init(repos)
    return fresh.getState()
  }
  const flush = () => new Promise((resolve) => setTimeout(resolve, 20))
  return { store, s, col, repos, reloadStore, flush, db }
}

describe('app store with IndexedDB', () => {
  it('creates a default board with four columns and WIP limit 3 for "In Arbeit"', async () => {
    const { s } = await setup()
    expect(s().status).toBe('ready')
    expect(s().boardColumns().map((c) => c.role)).toEqual(['inbox', 'planned', 'doing', 'done'])
    expect(s().boardColumns().find((c) => c.role === 'doing')!.wipLimit).toBe(3)
  })

  it('task CRUD persists across reloads', async () => {
    const { s, col, reloadStore, flush } = await setup()
    const task = s().addTask('Newsletter vorbereiten', col('inbox').id)!
    s().updateTask(task.id, { description: 'Details', priority: 'high', tags: ['Content'] })
    await flush()
    let reloaded = await reloadStore()
    expect(reloaded.tasks.find((t) => t.id === task.id)).toMatchObject({ title: 'Newsletter vorbereiten', description: 'Details', priority: 'high', tags: ['Content'] })

    s().deleteTask(task.id)
    await flush()
    reloaded = await reloadStore()
    expect(reloaded.tasks.find((t) => t.id === task.id)!.deletedAt).toBeDefined()

    s().undoDelete(task.id)
    await flush()
    reloaded = await reloadStore()
    expect(reloaded.tasks.find((t) => t.id === task.id)!.deletedAt).toBeUndefined()
  })

  it('archives and restores tasks', async () => {
    const { s, col, reloadStore, flush } = await setup()
    const task = s().addTask('Hotel buchen', col('inbox').id)!
    s().toggleComplete(task.id)
    expect(s().archiveDone()).toBe(1)
    await flush()
    expect((await reloadStore()).tasks[0]!.archivedAt).toBeDefined()
    s().restoreTask(task.id)
    await flush()
    const restored = (await reloadStore()).tasks[0]!
    expect(restored.archivedAt).toBeUndefined()
    expect(restored.columnId).toBe(col('done').id)
  })

  it('moves tasks within and between columns and keeps the order after reload', async () => {
    const { s, col, reloadStore, flush } = await setup()
    const a = s().addTask('A', col('inbox').id)!
    const b = s().addTask('B', col('inbox').id)!
    const c = s().addTask('C', col('inbox').id)!
    s().moveTask(c.id, col('inbox').id, 0)
    s().moveTask(a.id, col('planned').id, 0)
    await flush()
    const reloaded = await reloadStore()
    const inColumn = (role: string) =>
      reloaded.tasks.filter((t) => t.columnId === col(role).id).sort((x, y) => x.position - y.position).map((t) => t.title)
    expect(inColumn('inbox')).toEqual(['C', 'B'])
    expect(inColumn('planned')).toEqual(['A'])
    expect(reloaded.tasks.find((t) => t.id === b.id)!.position).toBe(1)
  })

  it('sets and clears completedAt when moving to and from "Erledigt"', async () => {
    const { s, col } = await setup()
    const task = s().addTask('A', col('planned').id)!
    s().moveToColumn(task.id, col('done').id)
    expect(s().tasks[0]!.completedAt).toBeDefined()
    s().moveToColumn(task.id, col('doing').id)
    expect(s().tasks[0]!.completedAt).toBeUndefined()
  })

  it('asks before exceeding the WIP limit and moves after confirmation', async () => {
    const { s, col } = await setup()
    for (const title of ['1', '2', '3']) s().addTask(title, col('doing').id)
    const extra = s().addTask('4', col('inbox').id)!
    expect(s().moveToColumn(extra.id, col('doing').id)).toBe(false)
    expect(s().pendingMove).toMatchObject({ taskId: extra.id })
    expect(s().tasks.find((t) => t.id === extra.id)!.columnId).toBe(col('inbox').id)
    s().confirmPendingMove()
    expect(s().tasks.find((t) => t.id === extra.id)!.columnId).toBe(col('doing').id)
  })

  it('completing a recurring task creates exactly one next instance; stopping prevents further ones', async () => {
    const { s, col, reloadStore, flush } = await setup()
    const due = addDaysIso(todayIso(), -30)
    const task = s().addTask('Täglich', col('planned').id, { dueDate: due })!
    s().updateTask(task.id, { recurrence: { frequency: 'daily', interval: 1 } })
    s().toggleComplete(task.id)
    await flush()
    const reloaded = await reloadStore()
    const series = reloaded.tasks.filter((t) => t.recurrenceSeriesId === task.id)
    expect(series).toHaveLength(2)
    const next = series.find((t) => t.id !== task.id)!
    expect(next.dueDate).toBe(addDaysIso(todayIso(), 1))
    expect(next.columnId).toBe(col('planned').id)
    expect(series.find((t) => t.id === task.id)!.completedAt).toBeDefined()

    // Reopen and complete again → no duplicate successor
    s().toggleComplete(task.id)
    s().toggleComplete(task.id)
    expect(s().tasks.filter((t) => t.recurrenceSeriesId === task.id)).toHaveLength(2)

    // Stop recurrence on the new instance → completing creates nothing
    s().updateTask(next.id, { recurrence: undefined })
    s().toggleComplete(next.id)
    expect(s().tasks.filter((t) => t.recurrenceSeriesId === task.id)).toHaveLength(2)
  })

  it('duplicates tasks', async () => {
    const { s, col } = await setup()
    const task = s().addTask('Vorlage', col('planned').id, { tags: ['X'] })!
    const copy = s().duplicateTask(task.id)!
    expect(copy).toMatchObject({ columnId: col('planned').id, tags: ['X'], title: 'Vorlage (Kopie)' })
    expect(s().tasks).toHaveLength(2)
  })

  it('persists settings', async () => {
    const { s, reloadStore, flush } = await setup()
    s().updateSettings({ theme: 'dark', locale: 'en' })
    await flush()
    expect((await reloadStore()).settings).toMatchObject({ theme: 'dark', locale: 'en' })
  })

  it('imports a backup and restores the previous state', async () => {
    const { s, col, flush } = await setup()
    s().addTask('Original', col('inbox').id)
    await flush()
    const backup = JSON.stringify(buildBackup(s().exportSnapshot(), new Date().toISOString()))
    s().addTask('Nach dem Export', col('inbox').id)
    await flush()
    const parsed = parseBackup(backup)
    if (!parsed.ok) throw new Error(parsed.code)
    expect(await s().importSnapshot(parsed.snapshot)).toEqual({ ok: true })
    expect(s().tasks.map((t) => t.title)).toEqual(['Original'])
  })

  it('a failing import leaves the existing database unchanged', async () => {
    const { s, col, repos, flush } = await setup()
    s().addTask('Bleibt erhalten', col('inbox').id)
    await flush()
    const snapshot = s().exportSnapshot()
    // Two tasks with the same ID make bulkAdd fail inside the transaction.
    const broken = { ...snapshot, tasks: [snapshot.tasks[0]!, snapshot.tasks[0]!] }
    expect(await s().importSnapshot(broken)).toEqual({ ok: false })
    const stored = await repos.loadAll()
    expect(stored.tasks.map((t) => t.title)).toEqual(['Bleibt erhalten'])
    expect(stored.columns).toHaveLength(4)
  })

  it('rolls back the UI when a write fails', async () => {
    const { s, col, repos, flush } = await setup()
    const failing: Repositories = { ...repos, tasks: { ...repos.tasks, saveMany: () => Promise.reject(new Error('quota')) } }
    useFailing(s, failing)
    s().addTask('Geht verloren', col('inbox').id)
    expect(s().tasks).toHaveLength(1)
    await flush()
    expect(s().tasks).toHaveLength(0)
    expect(s().toasts.at(-1)!.tone).toBe('error')
  })

  it('reports an error state when the database cannot be read', async () => {
    const store = createAppStore()
    const { repos } = await setup()
    await store.getState().init({ ...repos, loadAll: () => Promise.reject(Object.assign(new Error('x'), { name: 'MissingAPIError' })) })
    expect(store.getState().status).toBe('error')
  })
})

function useFailing(s: () => { repos?: Repositories }, repos: Repositories) {
  // Swap repositories on the live store (test-only).
  ;(s() as { repos?: Repositories }).repos = repos
}
