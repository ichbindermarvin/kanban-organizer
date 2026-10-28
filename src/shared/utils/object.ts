/** Removes keys whose value is `undefined` so stored objects stay clean and serializable. */
export function stripUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T
}
