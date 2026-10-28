import { useAppStore } from '@/state/appStore'
import { Dialog } from '@/shared/components/Dialog'
import { useT } from '@/shared/hooks/useT'
import type { TranslationKey } from '@/shared/i18n'

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

const SHORTCUTS: { keys: string[]; label: TranslationKey }[] = [
  { keys: ['N'], label: 'shortcuts.new' },
  { keys: ['/'], label: 'shortcuts.search' },
  { keys: [isMac ? '⌘' : 'Strg', 'K'], label: 'shortcuts.palette' },
  { keys: ['E'], label: 'shortcuts.edit' },
  { keys: ['X'], label: 'shortcuts.complete' },
  { keys: ['D'], label: 'shortcuts.duplicate' },
  { keys: ['1'], label: 'shortcuts.goToday' },
  { keys: ['2'], label: 'shortcuts.goBoard' },
  { keys: ['Leertaste'], label: 'shortcuts.drag' },
  { keys: ['Esc'], label: 'shortcuts.close' },
  { keys: ['?'], label: 'shortcuts.help' },
]

export function ShortcutHelp() {
  const t = useT()
  const open = useAppStore((s) => s.helpOpen)
  const locale = useAppStore((s) => s.settings.locale)
  const setHelpOpen = useAppStore((s) => s.setHelpOpen)
  if (!open) return null
  const translateKey = (key: string) => (locale === 'en' ? key.replace('Strg', 'Ctrl').replace('Leertaste', 'Space') : key)
  return (
    <Dialog title={t('shortcuts.title')} onClose={() => setHelpOpen(false)} size="sm">
      <dl className="shortcut-list">
        {SHORTCUTS.map((shortcut) => (
          <div key={shortcut.label} className="shortcut-list__item">
            <dt>
              {shortcut.keys.map((key) => (
                <kbd key={key} className="kbd">
                  {translateKey(key)}
                </kbd>
              ))}
            </dt>
            <dd>{t(shortcut.label)}</dd>
          </div>
        ))}
      </dl>
      <div className="dialog__actions">
        <button type="button" className="btn" onClick={() => setHelpOpen(false)}>
          {t('common.close')}
        </button>
      </div>
    </Dialog>
  )
}
