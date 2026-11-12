import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { KEY_RECORD_ID, SyncError, type KeyMaterial, type RemoteRecord, type RemoteStore } from './remote'
import type { AuthAdapter } from './syncService'
import { normalizeSupabaseUrl, type SupabaseConfig } from './config'

export function createSupabase(config: SupabaseConfig): SupabaseClient {
  return createClient(normalizeSupabaseUrl(config.url), config.anonKey.trim(), {
    // Code-based login (no redirect links): works the same in Safari and in the installed iPhone app.
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'kanban-organizer.auth' },
  })
}

function toSyncError(error: unknown): SyncError {
  if (error instanceof SyncError) return error
  const e = error as { message?: string; status?: number; code?: string }
  const message = e?.message ?? String(error)
  if (typeof navigator !== 'undefined' && !navigator.onLine) return new SyncError('offline', message, { cause: error })
  if (/fetch|network|load failed/i.test(message)) return new SyncError('offline', message, { cause: error })
  if (e?.status === 401 || e?.status === 403 || e?.code === 'PGRST301' || /jwt/i.test(message)) return new SyncError('auth', message, { cause: error })
  return new SyncError('server', message, { cause: error })
}

export class SupabaseRemote implements RemoteStore {
  constructor(private client: SupabaseClient) {}

  async pull(since: string | undefined, limit: number): Promise<RemoteRecord[]> {
    let query = this.client.from('records').select('id, updated_at, server_updated_at, payload').order('server_updated_at', { ascending: true }).limit(limit)
    if (since) query = query.gt('server_updated_at', since)
    const { data, error } = await query
    if (error) throw toSyncError(error)
    return (data ?? []).map((row) => ({ id: row.id, updatedAt: new Date(row.updated_at).toISOString(), serverUpdatedAt: row.server_updated_at, payload: row.payload }))
  }

  async push(records: RemoteRecord[]): Promise<void> {
    const { error } = await this.client.rpc('push_records', { rows: records.map((r) => ({ id: r.id, updated_at: r.updatedAt, payload: r.payload })) })
    if (error) throw toSyncError(error)
  }

  async getKeyMaterial(): Promise<KeyMaterial | undefined> {
    const { data, error } = await this.client.from('records').select('payload').eq('id', KEY_RECORD_ID).maybeSingle()
    if (error) throw toSyncError(error)
    return data ? (JSON.parse(data.payload) as KeyMaterial) : undefined
  }

  async putKeyMaterial(material: KeyMaterial): Promise<void> {
    // Fixed early timestamp: the first device that sets a passphrase wins, nobody overwrites it later.
    await this.push([{ id: KEY_RECORD_ID, updatedAt: '2000-01-01T00:00:00.000Z', payload: JSON.stringify(material) }])
  }
}

export class SupabaseAuth implements AuthAdapter {
  constructor(private client: SupabaseClient) {}

  async currentEmail(): Promise<string | undefined> {
    const { data } = await this.client.auth.getSession()
    return data.session?.user.email ?? undefined
  }

  async sendCode(email: string): Promise<void> {
    const { error } = await this.client.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
    if (error) throw toSyncError(error)
  }

  async verifyCode(email: string, code: string): Promise<void> {
    const { error } = await this.client.auth.verifyOtp({ email, token: code, type: 'email' })
    if (error) throw new SyncError('auth', error.message, { cause: error })
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut({ scope: 'local' })
  }
}
