import type { KanbanDatabase } from '@/db/database'
import { PBKDF2_ITERATIONS, createKeyCheck, deriveKey, randomSalt, verifyKeyCheck } from './crypto'
import { SyncError, type RemoteStore } from './remote'
import { SyncEngine, clearLocalData, isPristine, markEverythingDirty, type SyncResult } from './syncEngine'

/** Login with a 6-digit e-mail code. Implemented by SupabaseAuth (and a fake in tests). */
export interface AuthAdapter {
  currentEmail(): Promise<string | undefined>
  sendCode(email: string): Promise<void>
  verifyCode(email: string, code: string): Promise<void>
  /** Fallback: sign in with a link copied from the login e-mail (or the page it opened). */
  verifyLink(link: string): Promise<void>
  signOut(): Promise<void>
}

const KEY_META = 'sync.key'

export type ConnectResult = { ok: true; replacedLocal: boolean } | { ok: false; reason: 'wrongPassphrase' | 'noKeyYet' | 'keyExists' }

/**
 * Orchestrates encryption key, first connection and syncing for one device.
 * UI-free so it can be tested with an in-memory cloud.
 */
export class SyncService {
  private engine?: SyncEngine

  constructor(
    private db: KanbanDatabase,
    private remote: RemoteStore,
    private iterations = PBKDF2_ITERATIONS,
  ) {}

  /** Restores the key saved on this device (non-extractable CryptoKey in IndexedDB). */
  async restoreKey(): Promise<boolean> {
    const stored = (await this.db.meta.get(KEY_META))?.value
    if (stored && typeof stored === 'object' && 'algorithm' in stored) {
      this.engine = new SyncEngine(this.db, this.remote, stored as CryptoKey)
      return true
    }
    return false
  }

  get ready(): boolean {
    return !!this.engine
  }

  /** Whether the account already has a sync passphrase (set on another device). */
  async hasRemoteKey(): Promise<boolean> {
    return !!(await this.remote.getKeyMaterial())
  }

  /** First device: sets the passphrase for the account and uploads the local data. */
  async createPassphrase(passphrase: string): Promise<ConnectResult> {
    if (await this.remote.getKeyMaterial()) return { ok: false, reason: 'keyExists' }
    const salt = randomSalt()
    const key = await deriveKey(passphrase, salt, this.iterations)
    await this.remote.putKeyMaterial({ salt, keyCheck: await createKeyCheck(key), iterations: this.iterations })
    // Another device may have been faster: then the stored material wins and we use it.
    return this.unlock(passphrase)
  }

  /**
   * Other devices: verifies the passphrase. A device without own tasks takes over the cloud state;
   * a device with tasks merges its data into the account.
   */
  async unlock(passphrase: string): Promise<ConnectResult> {
    const material = await this.remote.getKeyMaterial()
    if (!material) return { ok: false, reason: 'noKeyYet' }
    const key = await deriveKey(passphrase, material.salt, material.iterations)
    if (!(await verifyKeyCheck(key, material.keyCheck))) return { ok: false, reason: 'wrongPassphrase' }

    const remoteHasData = (await this.remote.pull(undefined, 2)).some((r) => !r.id.startsWith('meta:'))
    const replaceLocal = remoteHasData && (await isPristine(this.db))
    if (replaceLocal) await clearLocalData(this.db)
    else await markEverythingDirty(this.db)

    try {
      await this.db.meta.put({ key: KEY_META, value: key })
    } catch {
      // Some browsers cannot store CryptoKeys; then the passphrase is asked again after a restart.
    }
    this.engine = new SyncEngine(this.db, this.remote, key)
    await this.engine.sync()
    return { ok: true, replacedLocal: replaceLocal }
  }

  async sync(): Promise<SyncResult> {
    if (!this.engine) throw new SyncError('auth', 'Sync is not unlocked')
    return this.engine.sync()
  }

  /** Forgets the key on this device. Local data and unsynced changes stay. */
  async lock(): Promise<void> {
    this.engine = undefined
    await this.db.meta.delete(KEY_META)
    await this.db.meta.delete('sync.cursor')
  }
}
