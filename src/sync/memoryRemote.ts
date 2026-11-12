import { KEY_RECORD_ID, SyncError, type KeyMaterial, type RemoteRecord, type RemoteStore } from './remote'

/**
 * In-memory cloud with the same semantics as the Supabase table: newer updatedAt wins, every
 * stored record gets a fresh, increasing serverUpdatedAt. Used in tests (several "devices" share one).
 */
export class MemoryRemote implements RemoteStore {
  records = new Map<string, Required<RemoteRecord>>()
  offline = false
  private clock = Date.parse('2026-01-01T00:00:00.000Z')

  private now(): string {
    this.clock += 1
    return new Date(this.clock).toISOString()
  }

  private check() {
    if (this.offline) throw new SyncError('offline')
  }

  async pull(since: string | undefined, limit: number): Promise<RemoteRecord[]> {
    this.check()
    return [...this.records.values()]
      .filter((r) => !since || r.serverUpdatedAt > since)
      .sort((a, b) => a.serverUpdatedAt.localeCompare(b.serverUpdatedAt))
      .slice(0, limit)
      .map((r) => ({ ...r }))
  }

  async push(records: RemoteRecord[]): Promise<void> {
    this.check()
    for (const record of records) {
      const existing = this.records.get(record.id)
      if (existing && existing.updatedAt >= record.updatedAt) continue
      this.records.set(record.id, { ...record, serverUpdatedAt: this.now() })
    }
  }

  async getKeyMaterial(): Promise<KeyMaterial | undefined> {
    this.check()
    const record = this.records.get(KEY_RECORD_ID)
    return record ? (JSON.parse(record.payload) as KeyMaterial) : undefined
  }

  async putKeyMaterial(material: KeyMaterial): Promise<void> {
    // First writer wins (fixed early timestamp), like the Supabase implementation.
    await this.push([{ id: KEY_RECORD_ID, updatedAt: '2000-01-01T00:00:00.000Z', payload: JSON.stringify(material) }])
  }
}
