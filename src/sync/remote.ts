/**
 * The cloud as seen by the sync engine: a store of opaque, encrypted records per user.
 * Implemented by {@link ./supabaseRemote} for production and by an in-memory store in tests.
 */

export interface RemoteRecord {
  /** Record key, e.g. "task:<uuid>". Not secret (random ids), never contains content. */
  id: string
  /** The record's own updatedAt (ISO). Newer wins on conflicts. */
  updatedAt: string
  /** Set by the server when the record was stored. Used as pull cursor. */
  serverUpdatedAt?: string
  /** Encrypted content (base64). */
  payload: string
}

/** Public key material: salt for key derivation and an encrypted key check. Stored as a record. */
export interface KeyMaterial {
  salt: string
  keyCheck: string
  iterations: number
}

export const KEY_RECORD_ID = 'meta:key'

export interface RemoteStore {
  /** Records stored after `since` (exclusive), oldest first, at most `limit`. */
  pull(since: string | undefined, limit: number): Promise<RemoteRecord[]>
  /** Uploads records; the server keeps whichever version has the newer updatedAt. */
  push(records: RemoteRecord[]): Promise<void>
  getKeyMaterial(): Promise<KeyMaterial | undefined>
  putKeyMaterial(material: KeyMaterial): Promise<void>
}

export type SyncErrorKind = 'offline' | 'auth' | 'server' | 'decrypt'

export class SyncError extends Error {
  constructor(
    public kind: SyncErrorKind,
    message?: string,
    options?: { cause?: unknown },
  ) {
    super(message ?? kind, options)
  }
}
