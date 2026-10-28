import { useId, useMemo, useRef, useState } from 'react'
import { useAppStore } from '@/state/appStore'
import { Dialog } from '@/shared/components/Dialog'
import { useT } from '@/shared/hooks/useT'
import { normalize } from '@/features/search/services/searchTasks'
import { exportBackup } from '@/features/settings/components/backupActions'
import { focusSearch } from '@/app/focusSearch'

interface Command {
  id: string
  label: string
  run: () => void
}

export function CommandPalette() {
  const open = useAppStore((s) => s.paletteOpen)
  if (!open) return null
  return <Palette />
}

function Palette() {
  const t = useT()
  const s = useAppStore.getState
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()

  const commands = useMemo<Command[]>(
    () => [
      { id: 'new', label: t('palette.newTask'), run: () => s().openQuickCapture() },
      { id: 'today', label: t('palette.goToday'), run: () => s().setView('today') },
      { id: 'board', label: t('palette.goBoard'), run: () => s().setView('board') },
      { id: 'overdue', label: t('palette.goOverdue'), run: () => s().setView('overdue') },
      { id: 'high', label: t('palette.goHigh'), run: () => s().setView('high') },
      { id: 'archive', label: t('palette.goArchive'), run: () => s().setView('archive') },
      { id: 'search', label: t('palette.search'), run: () => focusSearch() },
      { id: 'settings', label: t('palette.settings'), run: () => s().setView('settings') },
      { id: 'export', label: t('palette.export'), run: () => exportBackup() },
      {
        id: 'theme',
        label: t('palette.theme'),
        run: () => {
          const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches)
          s().updateSettings({ theme: dark ? 'light' : 'dark' })
        },
      },
      { id: 'shortcuts', label: t('palette.shortcuts'), run: () => s().setHelpOpen(true) },
    ],
    [t, s],
  )

  const results = commands.filter((command) => normalize(command.label).includes(normalize(query.trim())))
  const active = Math.min(index, Math.max(0, results.length - 1))
  const close = () => s().setPaletteOpen(false)
  const run = (command: Command | undefined) => {
    if (!command) return
    close()
    // Run after the dialog closed and restored focus, so the command can move focus itself.
    requestAnimationFrame(command.run)
  }

  return (
    <Dialog title={t('palette.label')} hideTitle onClose={close} initialFocus={inputRef} position="top" size="md">
      <input
        ref={inputRef}
        className="input input--large"
        role="combobox"
        aria-expanded="true"
        aria-controls={listId}
        aria-activedescendant={results[active] ? `${listId}-${results[active]!.id}` : undefined}
        aria-label={t('palette.label')}
        placeholder={t('palette.placeholder')}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setIndex(0)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setIndex((active + 1) % Math.max(1, results.length))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setIndex((active - 1 + results.length) % Math.max(1, results.length))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            run(results[active])
          }
        }}
      />
      <ul id={listId} role="listbox" className="palette__list" aria-label={t('palette.label')}>
        {results.map((command, i) => (
          <li
            key={command.id}
            id={`${listId}-${command.id}`}
            role="option"
            aria-selected={i === active}
            className={`palette__item${i === active ? ' palette__item--active' : ''}`}
            onMouseEnter={() => setIndex(i)}
            onClick={() => run(command)}
          >
            {command.label}
          </li>
        ))}
        {results.length === 0 && <li className="palette__empty">{t('palette.empty')}</li>}
      </ul>
    </Dialog>
  )
}
