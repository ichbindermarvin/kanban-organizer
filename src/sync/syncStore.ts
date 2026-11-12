import { create } from 'zustand'
import type { KanbanDatabase } from '@/db/database'
import type { Repositories } from '@/db/repositories/types'
import type { useAppStore } from '@/state/appStore'
import { SyncError } from './remote'
import { describeAuthError, type AuthProblem } from './authErrors'
import { SyncService, type AuthAdapter } from './syncService'
import { envConfig, type SupabaseConfig } from './config'

export type SyncPhase = 'unconfigured' | 'signedOut' | 'codeSent' | 'needsPassphrase' | 'ready'
export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error'
export type SyncMessage = 'wrongPassphrase' | 'keyExists' | 'decrypt' | 'server' | 'auth' | 'code' | 'config' | `auth.${AuthProblem}`

interface SyncState {
  phase: SyncPhase
  status: SyncStatus
  email?: string
  remoteHasKey?: boolean
  lastSyncAt?: string
  message?: SyncMessage
  /** Technical detail of the last error (original message from the server), shown for diagnosis. */
  detail?: string
  busy: boolean
  config?: SupabaseConfig
  configFromEnv: boolean

  start(config: SupabaseConfig): Promise<void>
  saveConfig(config: SupabaseConfig): Promise<void>
  resetConfig(): Promise<void>
  sendCode(email: string): Promise<void>
  verifyCode(code: string): Promise<void>
  createPassphrase(passphrase: string): Promise<void>
  unlock(passphrase: string): Promise<void>
  syncNow(): Promise<void>
  signOut(): Promise<void>
}

const CONFIG_META = 'sync.config'

interface Context {
  db: KanbanDatabase
  repos: Repositories
  appStore: typeof useAppStore
  auth?: AuthAdapter
  service?: SyncService
}

let context: Context | undefined
let running: Promise<void> | undefined
let again = false

export const useSyncStore = create<SyncState>()((set, get) => {
  const ctx = () => {
    if (!context) throw new Error('Sync not initialized')
    return context
  }

  const fail = (error: unknown) => {
    const kind = error instanceof SyncError ? error.kind : 'server'
    console.error(error)
    if (kind === 'offline') set({ status: 'offline' })
    else set({ status: 'error', message: kind === 'decrypt' ? 'decrypt' : kind === 'auth' ? 'auth' : 'server', detail: describeAuthError(error).detail })
  }

  const connect = async (config: SupabaseConfig) => {
    // Loaded on demand: devices without sync never download the Supabase client.
    const { SupabaseAuth, SupabaseRemote, createSupabase } = await import('./supabaseRemote')
    const client = createSupabase(config)
    const c = ctx()
    c.auth = new SupabaseAuth(client)
    c.service = new SyncService(c.db, new SupabaseRemote(client))
    set({ config })
    const email = await c.auth.currentEmail()
    if (!email) return set({ phase: 'signedOut', email: undefined })
    set({ email })
    if (await c.service.restoreKey()) {
      set({ phase: 'ready' })
      void get().syncNow()
    } else {
      set({ phase: 'needsPassphrase' })
      try {
        set({ remoteHasKey: await c.service.hasRemoteKey() })
      } catch (error) {
        fail(error)
      }
    }
  }

  /** After the first connection the app reloads everything (and re-creates a board if none exists). */
  const afterConnect = async () => {
    const c = ctx()
    await c.appStore.getState().init(c.repos)
    set({ phase: 'ready', status: 'idle', lastSyncAt: new Date().toISOString(), message: undefined })
  }

  return {
    phase: 'unconfigured',
    status: 'idle',
    busy: false,
    configFromEnv: false,

    async start(config) {
      await connect(config)
    },

    async saveConfig(config) {
      const c = ctx()
      await c.db.meta.put({ key: CONFIG_META, value: config })
      set({ message: undefined, configFromEnv: false })
      await connect(config)
    },

    async resetConfig() {
      await ctx().db.meta.delete(CONFIG_META)
      const env = envConfig()
      if (env) {
        set({ configFromEnv: true })
        await connect(env)
      } else set({ phase: 'unconfigured', config: undefined })
    },

    async sendCode(email) {
      set({ busy: true, message: undefined, detail: undefined })
      try {
        await ctx().auth!.sendCode(email.trim())
        set({ phase: 'codeSent', email: email.trim() })
      } catch (error) {
        console.error(error)
        const { problem, detail } = describeAuthError(error)
        set({ message: `auth.${problem}`, detail })
      } finally {
        set({ busy: false })
      }
    },

    async verifyCode(code) {
      set({ busy: true, message: undefined, detail: undefined })
      try {
        await ctx().auth!.verifyCode(get().email!, code.trim())
        set({ phase: 'needsPassphrase', remoteHasKey: await ctx().service!.hasRemoteKey() })
      } catch (error) {
        console.error(error)
        set({ message: 'code', detail: describeAuthError(error).detail })
      } finally {
        set({ busy: false })
      }
    },

    async createPassphrase(passphrase) {
      set({ busy: true, message: undefined })
      try {
        const result = await ctx().service!.createPassphrase(passphrase)
        if (!result.ok) set({ message: result.reason === 'keyExists' ? 'keyExists' : 'wrongPassphrase', remoteHasKey: true })
        else await afterConnect()
      } catch (error) {
        fail(error)
      } finally {
        set({ busy: false })
      }
    },

    async unlock(passphrase) {
      set({ busy: true, message: undefined })
      try {
        const result = await ctx().service!.unlock(passphrase)
        if (!result.ok) set({ message: 'wrongPassphrase' })
        else await afterConnect()
      } catch (error) {
        fail(error)
      } finally {
        set({ busy: false })
      }
    },

    /** Single-flight: a request during a running sync triggers exactly one more run afterwards. */
    async syncNow() {
      const service = context?.service
      if (!service?.ready || get().phase !== 'ready') return
      if (running) {
        again = true
        return running
      }
      running = (async () => {
        do {
          again = false
          set({ status: 'syncing' })
          try {
            const result = await service.sync()
            if (result.pulled > 0) await ctx().appStore.getState().reload()
            set({ status: 'idle', lastSyncAt: new Date().toISOString(), message: undefined })
          } catch (error) {
            fail(error)
            if (error instanceof SyncError && error.kind === 'decrypt') {
              // The passphrase was changed elsewhere: ask for it again.
              await service.lock()
              set({ phase: 'needsPassphrase', remoteHasKey: true })
            }
            again = false
          }
        } while (again)
      })().finally(() => {
        running = undefined
      })
      return running
    },

    async signOut() {
      const c = ctx()
      await c.service?.lock()
      await c.auth?.signOut().catch(() => undefined)
      set({ phase: 'signedOut', status: 'idle', email: undefined, lastSyncAt: undefined, message: undefined })
    },
  }
})

/** Wires sync into the app: restores the session and syncs on changes, focus, reconnect and every minute. */
export async function initSync(db: KanbanDatabase, repos: Repositories, appStore: typeof useAppStore): Promise<void> {
  context = { db, repos, appStore }
  const stored = (await db.meta.get(CONFIG_META))?.value as SupabaseConfig | undefined
  const env = envConfig()
  useSyncStore.setState({ configFromEnv: !stored && !!env })
  const config = stored ?? env
  if (config) {
    try {
      await useSyncStore.getState().start(config)
    } catch (error) {
      console.error(error)
      useSyncStore.setState({ status: 'offline' })
    }
  }

  const syncSoon = debounce(() => void useSyncStore.getState().syncNow(), 2000)
  // Local changes: the four synced collections are replaced immutably on every change.
  appStore.subscribe((state, previous) => {
    if (state.tasks !== previous.tasks || state.columns !== previous.columns || state.boards !== previous.boards || state.settings !== previous.settings) syncSoon()
  })
  window.addEventListener('online', () => void useSyncStore.getState().syncNow())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void useSyncStore.getState().syncNow()
  })
  window.setInterval(() => {
    if (document.visibilityState === 'visible') void useSyncStore.getState().syncNow()
  }, 60_000)
}

function debounce(fn: () => void, ms: number): () => void {
  let timeout: number | undefined
  return () => {
    window.clearTimeout(timeout)
    timeout = window.setTimeout(fn, ms)
  }
}
