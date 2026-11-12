import { useMemo, useState } from 'react'
import { useAppStore, type View } from '@/state/appStore'
import { selectToday } from '@/features/today/services/selectToday'
import { useActiveBoardTasks } from '@/features/board/services/useActiveBoardTasks'
import { Dialog } from '@/shared/components/Dialog'
import { Icon, type IconName } from '@/shared/components/Icon'
import { useT } from '@/shared/hooks/useT'
import type { TranslationKey } from '@/shared/i18n'
import { useSyncStatusText } from '@/sync/SyncSettings'

/**
 * Bottom tab bar for phones (hidden on wider screens via CSS). Focus on the daily routine:
 * Today, the board, quick capture (+), overdue tasks and everything else under "More".
 */
export function MobileNav() {
  const t = useT()
  const view = useAppStore((s) => s.view)
  const columns = useAppStore((s) => s.columns)
  const today = useAppStore((s) => s.today)
  const tasks = useActiveBoardTasks()
  const { setView, openQuickCapture } = useAppStore.getState()
  const [moreOpen, setMoreOpen] = useState(false)
  const counts = useMemo(() => {
    const sections = selectToday(tasks, columns, today)
    return { today: sections.overdue.length + sections.dueToday.length + sections.inProgress.length, overdue: sections.overdue.length }
  }, [tasks, columns, today])

  const tab = (target: View, icon: IconName, label: TranslationKey, count?: number, alert?: boolean) => (
    <a
      href={`#/${target}`}
      className={`tabbar__item${view === target ? ' tabbar__item--active' : ''}`}
      aria-current={view === target ? 'page' : undefined}
      onClick={(e) => {
        e.preventDefault()
        setView(target)
      }}
    >
      <span className="tabbar__icon">
        <Icon name={icon} size={22} />
        {count ? <span className={`tabbar__badge${alert ? ' tabbar__badge--alert' : ''}`}>{count}</span> : null}
      </span>
      <span className="tabbar__label">{t(label)}</span>
    </a>
  )

  return (
    <>
      <nav className="tabbar" aria-label={t('nav.tabbar')}>
        {tab('today', 'today', 'nav.today', counts.today)}
        {tab('board', 'board', 'nav.board')}
        <button type="button" className="tabbar__add" aria-label={t('nav.newTask')} onClick={() => openQuickCapture()}>
          <Icon name="plus" size={26} />
        </button>
        {tab('overdue', 'overdue', 'nav.overdue', counts.overdue, true)}
        <button
          type="button"
          className={`tabbar__item${['high', 'archive', 'settings'].includes(view) ? ' tabbar__item--active' : ''}`}
          aria-haspopup="dialog"
          onClick={() => setMoreOpen(true)}
        >
          <span className="tabbar__icon">
            <Icon name="more" size={22} />
          </span>
          <span className="tabbar__label">{t('nav.more')}</span>
        </button>
      </nav>
      {moreOpen && <MoreSheet onClose={() => setMoreOpen(false)} />}
    </>
  )
}

function MoreSheet({ onClose }: { onClose: () => void }) {
  const t = useT()
  const allBoards = useAppStore((s) => s.boards)
  const activeId = useAppStore((s) => s.activeBoardId())
  const view = useAppStore((s) => s.view)
  const { setView, setActiveBoard } = useAppStore.getState()
  const boards = useMemo(() => allBoards.filter((b) => !b.archivedAt).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [allBoards])
  const syncStatus = useSyncStatusText()
  const go = (target: View) => {
    setView(target)
    onClose()
  }

  const item = (key: string, icon: IconName, label: string, onSelect: () => void, current: boolean) => (
    <li key={key}>
      <button type="button" className={`sheet__item${current ? ' sheet__item--active' : ''}`} aria-current={current ? 'page' : undefined} onClick={onSelect}>
        <Icon name={icon} size={20} />
        <span>{label}</span>
      </button>
    </li>
  )

  return (
    <Dialog title={t('nav.more')} onClose={onClose} position="bottom" size="md">
      <p className="sheet__heading">{t('boards.heading')}</p>
      <ul className="sheet__list">
        {boards.map((board) =>
          item(
            board.id,
            'board',
            board.name,
            () => {
              setActiveBoard(board.id)
              onClose()
            },
            view === 'board' && board.id === activeId,
          ),
        )}
      </ul>
      <p className="sheet__heading">{t('nav.views')}</p>
      <ul className="sheet__list">
        {item('high', 'flag', t('nav.highPriority'), () => go('high'), view === 'high')}
        {item('archive', 'archive', t('nav.archive'), () => go('archive'), view === 'archive')}
        {item('settings', 'settings', t('nav.settings'), () => go('settings'), view === 'settings')}
      </ul>
      {syncStatus && (
        <p className={`sync-status sync-status--${syncStatus.tone} sheet__sync`}>
          <Icon name="cloud" size={14} />
          {syncStatus.text}
        </p>
      )}
    </Dialog>
  )
}
