import { createAppStore } from '@/state/appStore'
import { createDexieRepositories, openDatabase } from '@/db/repositories/dexieRepositories'
import type { KanbanDatabase } from '@/db/database'
import { createKeyCheck, decryptJson, deriveKey, encryptJson, randomSalt, verifyKeyCheck } from './crypto'
import { MemoryRemote } from './memoryRemote'
import { SyncEngine, clearLocalData, isPristine, markEverythingDirty } from './syncEngine'

const ITERATIONS = 1_000 // fast for tests; the app uses 600 000
let dbCounter = 0

async function device(remote: MemoryRemote, key: CryptoKey) {
  const db = await openDatabase(`sync-device-${++dbCounter}`)
  const repos = createDexieRepositories(db)
  const store = createAppStore()
  await store.getState().init(repos)
  const engine = new SyncEngine(db, remote, key)
  const s = () => store.getState()
  const flush = () => new Promise((resolve) => setTimeout(resolve, 30))
  const sync = async () => {
    await flush()
    const result = await engine.sync()
    await s().reload()
    return result
  }
  const col = (role: string) => s().boardColumns().find((c) => c.role === role)!
  return { db, store, s, engine, sync, flush, col }
}

/** Second device that joins an existing account (takes over the cloud state). */
async function joiningDevice(remote: MemoryRemote, key: CryptoKey) {
  const d = await device(remote, key)
  if (await isPristine(d.db as KanbanDatabase)) await clearLocalData(d.db)
  await d.sync()
  return d
}

let key: CryptoKey
beforeAll(async () => {
  key = await deriveKey('richtig gutes passwort', randomSalt(), ITERATIONS)
})

describe('crypto', () => {
  it('round-trips records and binds them to their id', async () => {
    const payload = await encryptJson(key, 'task:1', { title: 'Geheim' })
    expect(payload).not.toContain('Geheim')
    expect(await decryptJson(key, 'task:1', payload)).toEqual({ title: 'Geheim' })
    await expect(decryptJson(key, 'task:2', payload)).rejects.toThrow()
  })

  it('verifies the passphrase with the key check', async () => {
    const salt = randomSalt()
    const right = await deriveKey('pass', salt, ITERATIONS)
    const check = await createKeyCheck(right)
    expect(await verifyKeyCheck(await deriveKey('pass', salt, ITERATIONS), check)).toBe(true)
    expect(await verifyKeyCheck(await deriveKey('falsch', salt, ITERATIONS), check)).toBe(false)
  })
})

describe('sync between two devices', () => {
  it('a new device takes over the cloud state without creating a second board', async () => {
    const remote = new MemoryRemote()
    const a = await device(remote, key)
    a.s().addTask('Steuer', a.col('inbox').id)
    await markEverythingDirty(a.db)
    await a.sync()

    const b = await joiningDevice(remote, key)
    expect(b.s().boards).toHaveLength(1)
    expect(b.s().boards[0]!.id).toBe(a.s().boards[0]!.id)
    expect(b.s().tasks.map((t) => t.title)).toEqual(['Steuer'])
    expect(b.s().boardColumns().map((c) => c.role)).toEqual(a.s().boardColumns().map((c) => c.role))
  })

  it('syncs changes in both directions, including layout, settings and deletions', async () => {
    const remote = new MemoryRemote()
    const a = await device(remote, key)
    await markEverythingDirty(a.db)
    await a.sync()
    const b = await joiningDevice(remote, key)

    const task = a.s().addTask('Newsletter', a.col('inbox').id)!
    a.s().updateSettings({ colorLabels: { blue: 'Arbeit' } })
    a.s().splitColumn(a.col('doing').id)
    await a.sync()
    await b.sync()
    expect(b.s().tasks.find((t) => t.id === task.id)!.title).toBe('Newsletter')
    expect(b.s().settings.colorLabels).toEqual({ blue: 'Arbeit' })
    expect(b.s().columns.some((c) => c.kind === 'group')).toBe(true)

    b.s().updateTask(task.id, { priority: 'urgent' })
    b.s().moveToColumn(task.id, b.col('doing').id)
    await b.sync()
    await a.sync()
    expect(a.s().tasks.find((t) => t.id === task.id)).toMatchObject({ priority: 'urgent', columnId: b.col('doing').id })

    a.s().deleteTask(task.id)
    await a.sync()
    await b.sync()
    expect(b.s().tasks.find((t) => t.id === task.id)!.deletedAt).toBeDefined()
  })

  it('resolves conflicts per record: the newer change wins on every device', async () => {
    const remote = new MemoryRemote()
    const a = await device(remote, key)
    const task = a.s().addTask('Original', a.col('inbox').id)!
    await markEverythingDirty(a.db)
    await a.sync()
    const b = await joiningDevice(remote, key)

    // Both edit the same task while offline; B edits later.
    remote.offline = true
    a.s().updateTask(task.id, { title: 'Von A' })
    await new Promise((resolve) => setTimeout(resolve, 5))
    b.s().updateTask(task.id, { title: 'Von B' })
    await expect(a.sync()).rejects.toMatchObject({ kind: 'offline' })
    remote.offline = false

    await a.sync()
    await b.sync()
    await a.sync()
    expect(a.s().tasks[0]!.title).toBe('Von B')
    expect(b.s().tasks[0]!.title).toBe('Von B')
  })

  it('stores only ciphertext in the cloud', async () => {
    const remote = new MemoryRemote()
    const a = await device(remote, key)
    a.s().addTask('Streng vertraulich', a.col('inbox').id, { tags: ['Privat'] })
    await markEverythingDirty(a.db)
    await a.sync()
    const everything = JSON.stringify([...remote.records.values()])
    expect(everything).not.toContain('Streng vertraulich')
    expect(everything).not.toContain('Privat')
    expect(everything).not.toContain('Persönlich')
  })

  it('refuses to apply records encrypted with another passphrase', async () => {
    const remote = new MemoryRemote()
    const a = await device(remote, key)
    await markEverythingDirty(a.db)
    await a.sync()
    const otherKey = await deriveKey('anderes passwort', randomSalt(), ITERATIONS)
    const b = await device(remote, otherKey)
    await expect(b.engine.pull()).rejects.toMatchObject({ kind: 'decrypt' })
  })

  it('keeps local changes in the outbox while offline and uploads them later', async () => {
    const remote = new MemoryRemote()
    const a = await device(remote, key)
    await markEverythingDirty(a.db)
    await a.sync()
    remote.offline = true
    a.s().addTask('Offline erfasst', a.col('inbox').id)
    await a.flush()
    await expect(a.engine.sync()).rejects.toMatchObject({ kind: 'offline' })
    expect(await a.db.outbox.count()).toBeGreaterThan(0)
    remote.offline = false
    await a.sync()
    expect(await a.db.outbox.count()).toBe(0)
    const b = await joiningDevice(remote, key)
    expect(b.s().tasks.map((t) => t.title)).toEqual(['Offline erfasst'])
  })
})
