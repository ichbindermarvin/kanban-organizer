import { useEffect } from 'react'
import { useAppStore, type View } from '@/state/appStore'

const ROUTABLE: View[] = ['today', 'board', 'overdue', 'high', 'archive', 'settings']

export function viewFromHash(hash: string): View | undefined {
  const name = hash.replace(/^#\/?/, '') as View
  return ROUTABLE.includes(name) ? name : undefined
}

/** Keeps the current view in the URL hash so reload and browser back/forward work. Hash routing works on any static host. */
export function useHashRoute() {
  useEffect(() => {
    const initial = viewFromHash(window.location.hash)
    if (initial) useAppStore.getState().setView(initial)

    const unsubscribe = useAppStore.subscribe((state, previous) => {
      if (state.view === previous.view || !ROUTABLE.includes(state.view)) return
      const hash = `#/${state.view}`
      if (window.location.hash !== hash) window.history.pushState(null, '', hash)
    })
    const onHashChange = () => {
      const view = viewFromHash(window.location.hash)
      if (view && view !== useAppStore.getState().view) useAppStore.getState().setView(view)
    }
    window.addEventListener('popstate', onHashChange)
    window.addEventListener('hashchange', onHashChange)
    return () => {
      unsubscribe()
      window.removeEventListener('popstate', onHashChange)
      window.removeEventListener('hashchange', onHashChange)
    }
  }, [])
}
