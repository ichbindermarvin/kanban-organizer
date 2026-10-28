import { useEffect, useMemo, useRef, useState } from 'react'
import { LOCALES, THEMES, type Settings } from '@/features/tasks/models/schemas'
import { parseBackup } from '@/features/settings/services/backup'
import type { DataSnapshot } from '@/db/repositories/types'
import { columnTitle, useAppStore } from '@/state/appStore'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { Icon } from '@/shared/components/Icon'
import { useT } from '@/shared/hooks/useT'
import { formatTimestamp } from '@/shared/utils/format'
import { exportBackup } from './backupActions'

type StorageStatus = 'persisted' | 'not-persisted' | 'unknown'

export function SettingsView() {
  const t = useT()
  const settings = useAppStore((s) => s.settings)
  const allColumns = useAppStore((s) => s.columns)
  const boardId = useAppStore((s) => s.activeBoardId())
  const columns = useMemo(() => allColumns.filter((c) => c.boardId === boardId).sort((a, b) => a.position - b.position), [allColumns, boardId])
  const { updateSettings, updateColumn, importSnapshot, showToast, setHelpOpen } = useAppStore.getState()
  const fileRef = useRef<HTMLInputElement>(null)
  const [importError, setImportError] = useState<string>()
  const [pendingImport, setPendingImport] = useState<DataSnapshot>()
  const [storage, setStorage] = useState<StorageStatus>('unknown')

  useEffect(() => {
    navigator.storage
      ?.persisted?.()
      .then((persisted) => setStorage(persisted ? 'persisted' : 'not-persisted'))
      .catch(() => setStorage('unknown'))
  }, [])

  const onFile = async (file: File | undefined) => {
    setImportError(undefined)
    if (!file) return
    const result = parseBackup(await file.text())
    if (fileRef.current) fileRef.current.value = ''
    if (!result.ok) {
      setImportError(`${t(`import.error.${result.code}`)} ${t('import.unchanged')}`)
      return
    }
    setPendingImport(result.snapshot)
  }

  const confirmImport = async () => {
    const snapshot = pendingImport
    setPendingImport(undefined)
    if (!snapshot) return
    // Safety net: keep a copy of the current state before replacing it.
    exportBackup({ silent: true })
    const result = await importSnapshot(snapshot)
    if (result.ok) showToast({ message: t('toast.imported') })
    else setImportError(t('import.error.write'))
  }

  return (
    <div className="view view--settings">
      <div className="view__header">
        <h1 className="view__title">{t('settings.title')}</h1>
      </div>

      <section className="settings-section" aria-labelledby="settings-appearance">
        <h2 id="settings-appearance">{t('settings.appearance')}</h2>
        <fieldset className="settings-row">
          <legend>{t('settings.theme')}</legend>
          <div className="segmented">
            {THEMES.map((theme) => (
              <label key={theme} className={`segmented__item${settings.theme === theme ? ' segmented__item--on' : ''}`}>
                <input type="radio" name="theme" className="visually-hidden" checked={settings.theme === theme} onChange={() => updateSettings({ theme })} />
                {t(`settings.theme.${theme}`)}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="settings-row">
          <legend>{t('settings.language')}</legend>
          <div className="segmented">
            {LOCALES.map((locale) => (
              <label key={locale} className={`segmented__item${settings.locale === locale ? ' segmented__item--on' : ''}`}>
                <input
                  type="radio"
                  name="locale"
                  className="visually-hidden"
                  checked={settings.locale === locale}
                  onChange={() => updateSettings({ locale: locale as Settings['locale'] })}
                />
                {t(`settings.language.${locale}`)}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="settings-row">
          <button type="button" className="btn btn--ghost" onClick={() => setHelpOpen(true)}>
            <Icon name="keyboard" />
            {t('settings.shortcuts')}
          </button>
        </div>
      </section>

      <section className="settings-section" aria-labelledby="settings-board">
        <h2 id="settings-board">{t('settings.wipLimits')}</h2>
        <p className="muted small">{t('settings.wipHint')}</p>
        <div className="wip-grid">
          {columns
            .filter((column) => column.role !== 'done')
            .map((column) => (
              <label key={column.id} className="wip-grid__item">
                <span>{columnTitle(column, settings.locale)}</span>
                <input
                  type="number"
                  min={1}
                  max={99}
                  className="input input--small input--number"
                  aria-label={t('settings.wipFor', { column: columnTitle(column, settings.locale) })}
                  value={column.wipLimit ?? ''}
                  placeholder={t('common.none')}
                  onChange={(e) => {
                    const value = Number(e.target.value)
                    updateColumn(column.id, { wipLimit: e.target.value && value >= 1 ? Math.floor(value) : undefined })
                  }}
                />
              </label>
            ))}
        </div>
      </section>

      <section className="settings-section" aria-labelledby="settings-data">
        <h2 id="settings-data">{t('settings.data')}</h2>
        <p className="muted">{t('settings.dataInfo')}</p>
        <p className="small">{settings.lastBackupAt ? t('settings.lastBackup', { date: formatTimestamp(settings.lastBackupAt, settings.locale) }) : t('settings.noBackup')}</p>
        <div className="settings-row settings-row--buttons">
          <button type="button" className="btn btn--primary" onClick={() => exportBackup()}>
            <Icon name="download" />
            {t('settings.export')}
          </button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" />
            {t('settings.import')}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="visually-hidden"
            tabIndex={-1}
            aria-label={t('settings.import')}
            data-testid="import-input"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
        </div>
        <p className="muted small">{t('settings.importHint')}</p>
        {importError && (
          <p className="error-text" role="alert">
            {importError}
          </p>
        )}

        <h3 className="settings-subtitle">{t('settings.storage')}</h3>
        <p className="muted small">
          {storage === 'persisted' ? t('settings.storagePersisted') : storage === 'not-persisted' ? t('settings.storageNotPersisted') : t('settings.storageUnknown')}
        </p>
        {storage === 'not-persisted' && (
          <button
            type="button"
            className="btn btn--small"
            onClick={() =>
              navigator.storage
                .persist()
                .then((ok) => setStorage(ok ? 'persisted' : 'not-persisted'))
                .catch(() => undefined)
            }
          >
            {t('settings.storageRequest')}
          </button>
        )}
      </section>

      {pendingImport && (
        <ConfirmDialog
          title={t('settings.importConfirmTitle')}
          message={t('settings.importConfirm', { tasks: pendingImport.tasks.filter((task) => !task.deletedAt).length })}
          confirmLabel={t('settings.importConfirmButton')}
          tone="danger"
          onConfirm={() => void confirmImport()}
          onCancel={() => setPendingImport(undefined)}
        />
      )}
    </div>
  )
}
