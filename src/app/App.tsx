import { useEffect, useRef } from 'react'
import { useAppStore } from '@/state/appStore'
import { Sidebar } from './Sidebar'
import { useGlobalShortcuts } from './useGlobalShortcuts'
import { useHashRoute } from './useHashRoute'
import { TodayView } from '@/features/today/components/TodayView'
import { SmartListView } from '@/features/today/components/SmartListView'
import { BoardView } from '@/features/board/components/BoardView'
import { ArchiveView } from '@/features/archive/components/ArchiveView'
import { SettingsView } from '@/features/settings/components/SettingsView'
import { SearchView } from '@/features/search/components/SearchView'
import { SearchBox } from '@/features/search/components/SearchBox'
import { TaskDrawerHost } from '@/features/tasks/components/TaskDrawer'
import { QuickCapture } from '@/features/command/components/QuickCapture'
import { CommandPalette } from '@/features/command/components/CommandPalette'
import { ShortcutHelp } from '@/features/command/components/ShortcutHelp'
import { WipConfirm } from '@/features/command/components/WipConfirm'
import { Toasts } from '@/shared/components/Toasts'
import { useT } from '@/shared/hooks/useT'

function CurrentView() {
  const view = useAppStore((s) => s.view)
  switch (view) {
    case 'today':
      return <TodayView />
    case 'board':
      return <BoardView />
    case 'overdue':
      return <SmartListView kind="overdue" />
    case 'high':
      return <SmartListView kind="high" />
    case 'archive':
      return <ArchiveView />
    case 'settings':
      return <SettingsView />
    case 'search':
      return <SearchView />
  }
}

function StatusScreen() {
  const t = useT()
  const status = useAppStore((s) => s.status)
  const errorKind = useAppStore((s) => s.errorKind)
  const repos = useAppStore((s) => s.repos)
  if (status === 'loading') return <div className="main__loading" aria-busy="true" aria-label={t('app.loading')} />
  const message = errorKind === 'unavailable' ? t('error.unavailable') : errorKind === 'migration' ? t('error.migration') : t('error.unknown')
  return (
    <div className="fatal" role="alert">
      <h1>{t('error.title')}</h1>
      <p>{message}</p>
      <button type="button" className="btn btn--primary" onClick={() => (repos ? void useAppStore.getState().init(repos) : window.location.reload())}>
        {t('common.retry')}
      </button>
    </div>
  )
}

export function App() {
  const status = useAppStore((s) => s.status)
  const locale = useAppStore((s) => s.settings.locale)
  const view = useAppStore((s) => s.view)
  const mainRef = useRef<HTMLElement>(null)
  useGlobalShortcuts()
  useHashRoute()

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  useEffect(() => {
    // Keeps "today" correct when the app stays open over midnight.
    const interval = window.setInterval(() => useAppStore.getState().tick(), 60_000)
    const onVisible = () => document.visibilityState === 'visible' && useAppStore.getState().tick()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  useEffect(() => {
    mainRef.current?.scrollTo?.({ top: 0 })
  }, [view])

  // The shell renders immediately; only the content area waits for IndexedDB.
  return (
    <div className="app">
      <Sidebar />
      <div className="main-wrap">
        <header className="topbar">
          <SearchBox />
        </header>
        <main ref={mainRef} className="main" id="main">
          {status === 'ready' ? <CurrentView /> : <StatusScreen />}
        </main>
      </div>
      {status === 'ready' && (
        <>
          <TaskDrawerHost />
          <QuickCapture />
          <CommandPalette />
          <ShortcutHelp />
          <WipConfirm />
        </>
      )}
      <Toasts />
    </div>
  )
}
