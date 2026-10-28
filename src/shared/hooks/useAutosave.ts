import { useEffect, useRef } from 'react'

/**
 * Calls `commit` shortly after `value` stops changing, on blur (via the returned flush)
 * and on unmount, so typed text is never lost when the drawer closes or the page reloads.
 */
export function useAutosave(value: string, saved: string, commit: (value: string) => void, delay = 400) {
  const latest = useRef({ value, saved, commit })
  latest.current = { value, saved, commit }

  const flush = () => {
    const { value: v, saved: s, commit: c } = latest.current
    if (v !== s) c(v)
  }

  useEffect(() => {
    if (value === saved) return
    const timeout = window.setTimeout(flush, delay)
    return () => window.clearTimeout(timeout)
     
  }, [value, saved, delay])

   
  useEffect(() => () => flush(), [])

  return flush
}
