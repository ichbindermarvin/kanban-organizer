/** Globally unique, collision-safe IDs (never IndexedDB auto-increment) so data can later be synced or merged. */
export function newId(): string {
  return crypto.randomUUID()
}
