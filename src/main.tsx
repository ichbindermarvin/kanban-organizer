import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/app/App'
import { ErrorBoundary } from '@/app/ErrorBoundary'
import { useAppStore } from '@/state/appStore'
import { createDexieRepositories, openDatabase } from '@/db/repositories/dexieRepositories'
import { classifyDbError } from '@/db/database'
import { translate } from '@/shared/i18n'
import { initSync } from '@/sync/syncStore'
import '@/styles/index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

async function start() {
  try {
    const db = await openDatabase()
    // Another tab opened a newer schema version: release this connection and ask for a reload.
    db.on('versionchange', () => {
      db.close()
      useAppStore.getState().showToast({ message: translate(useAppStore.getState().settings.locale, 'error.otherTab'), tone: 'error' })
      return false
    })
    const repos = createDexieRepositories(db)
    await useAppStore.getState().init(repos, { seed: import.meta.env.DEV })
    requestPersistentStorage()
    // Cloud sync is optional; failures (offline, no server configured) never block the app.
    void initSync(db, repos, useAppStore).catch((error) => console.error(error))
  } catch (error) {
    console.error(error)
    useAppStore.setState({ status: 'error', errorKind: classifyDbError(error).kind })
  }
}

/** Asks the browser not to evict local data. Chromium/Edge/Safari decide silently; Firefox would show a prompt, so it is skipped there. */
function requestPersistentStorage() {
  if (!navigator.storage?.persist || /firefox/i.test(navigator.userAgent)) return
  navigator.storage
    .persisted()
    .then((persisted) => (persisted ? true : navigator.storage.persist()))
    .catch(() => undefined)
}

// Lets end-to-end tests wait until all changes are written before reloading the page.
;(window as unknown as { __kanbanWhenSaved?: () => Promise<void> }).__kanbanWhenSaved = () => useAppStore.getState().whenSaved()

void start()
