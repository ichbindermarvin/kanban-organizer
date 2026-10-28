import { useAppStore } from '@/state/appStore'
import { backupFileName, buildBackup } from '@/features/settings/services/backup'
import { translate } from '@/shared/i18n'

function download(text: string, fileName: string) {
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Downloads a versioned JSON backup of all local data. */
export function exportBackup(options: { silent?: boolean } = {}) {
  const store = useAppStore.getState()
  const now = new Date()
  const file = buildBackup(store.exportSnapshot(), now.toISOString())
  download(JSON.stringify(file, null, 2), backupFileName(now))
  store.updateSettings({ lastBackupAt: now.toISOString() })
  if (!options.silent) store.showToast({ message: translate(store.settings.locale, 'toast.exported') })
}
