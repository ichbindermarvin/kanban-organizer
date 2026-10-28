import { toFullIndex } from './dropIndex'

describe('toFullIndex', () => {
  it('maps a visible position to the full column', () => {
    // full: a b c d (b and d hidden by a filter); visible after drop: a X c
    expect(toFullIndex(['a', 'b', 'c', 'd'], ['a', 'X', 'c'], 'X')).toBe(2)
    expect(toFullIndex(['a', 'b', 'c', 'd'], ['X', 'a', 'c'], 'X')).toBe(0)
    expect(toFullIndex(['a', 'b', 'c', 'd'], ['a', 'c', 'X'], 'X')).toBe(3)
  })
  it('appends when the column is empty or everything is hidden', () => {
    expect(toFullIndex([], ['X'], 'X')).toBe(0)
    expect(toFullIndex(['a', 'b'], ['X'], 'X')).toBe(2)
  })
})
