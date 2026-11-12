import { createAppStore } from '@/state/appStore'
import { createDexieRepositories, openDatabase } from '@/db/repositories/dexieRepositories'
import { MemoryRemote } from './memoryRemote'
import { SyncService } from './syncService'

let counter = 0

async function device(remote: MemoryRemote) {
  const db = await openDatabase(`service-device-${++counter}`)
  const repos = createDexieRepositories(db)
  const store = createAppStore()
  await store.getState().init(repos)
  const service = new SyncService(db, remote, 1_000)
  const s = () => store.getState()
  const flush = () => new Promise((resolve) => setTimeout(resolve, 30))
  /** What the UI does after connecting: reload everything (creates a board if none exists). */
  const refresh = () => s().init(repos)
  return { db, repos, store, s, service, flush, refresh, inbox: () => s().boardColumns().find((c) => c.role === 'inbox')!.id }
}

describe('SyncService – connecting devices', () => {
  it('first device sets the passphrase; a fresh second device takes over the cloud state', async () => {
    const remote = new MemoryRemote()
    const a = await device(remote)
    a.s().addTask('Von A', a.inbox())
    await a.flush()
    expect(await a.service.hasRemoteKey()).toBe(false)
    expect(await a.service.createPassphrase('mein sync passwort')).toEqual({ ok: true, replacedLocal: false })

    const b = await device(remote)
    expect(await b.service.hasRemoteKey()).toBe(true)
    expect(await b.service.unlock('falsch')).toEqual({ ok: false, reason: 'wrongPassphrase' })
    expect(await b.service.unlock('mein sync passwort')).toEqual({ ok: true, replacedLocal: true })
    await b.refresh()
    expect(b.s().boards.filter((x) => !x.archivedAt)).toHaveLength(1)
    expect(b.s().tasks.map((t) => t.title)).toEqual(['Von A'])
  })

  it('a device that already has tasks merges them into the account', async () => {
    const remote = new MemoryRemote()
    const a = await device(remote)
    a.s().addTask('Von A', a.inbox())
    await a.flush()
    await a.service.createPassphrase('pw')

    const b = await device(remote)
    b.s().addTask('Von B', b.inbox())
    await b.flush()
    expect(await b.service.unlock('pw')).toEqual({ ok: true, replacedLocal: false })
    await b.refresh()
    expect(b.s().tasks.map((t) => t.title).sort()).toEqual(['Von A', 'Von B'])

    await a.service.sync()
    await a.refresh()
    expect(a.s().tasks.map((t) => t.title).sort()).toEqual(['Von A', 'Von B'])
  })

  it('does not overwrite an existing passphrase', async () => {
    const remote = new MemoryRemote()
    const a = await device(remote)
    await a.service.createPassphrase('erstes')
    const b = await device(remote)
    expect(await b.service.createPassphrase('zweites')).toEqual({ ok: false, reason: 'keyExists' })
  })

  it('keeps the key on the device across restarts and forgets it on lock', async () => {
    const remote = new MemoryRemote()
    const a = await device(remote)
    await a.service.createPassphrase('pw')
    const restarted = new SyncService(a.db, remote, 1_000)
    expect(await restarted.restoreKey()).toBe(true)
    await restarted.lock()
    expect(await new SyncService(a.db, remote, 1_000).restoreKey()).toBe(false)
  })
})
