/**
 * Converts a drop position inside the *visible* (possibly filtered) list of a column into an index
 * inside the *full* column, so hidden tasks keep their relative order.
 */
export function toFullIndex(fullIdsWithoutActive: string[], visibleIdsAfterDrop: string[], activeId: string): number {
  const i = visibleIdsAfterDrop.indexOf(activeId)
  const next = visibleIdsAfterDrop[i + 1]
  if (next !== undefined) {
    const index = fullIdsWithoutActive.indexOf(next)
    if (index >= 0) return index
  }
  const prev = visibleIdsAfterDrop[i - 1]
  if (prev !== undefined) {
    const index = fullIdsWithoutActive.indexOf(prev)
    if (index >= 0) return index + 1
  }
  return fullIdsWithoutActive.length
}
