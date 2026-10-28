import { useMemo } from 'react'
import { differenceInCalendarDays } from 'date-fns'
import { useAppStore, type View } from '@/state/appStore'
import { selectToday, selectHighPriority } from '@/features/today/services/selectToday'
import { useT } from '@/shared/hooks/useT'
import { Icon, type IconName } from '@/shared/components/Icon'
import type { TranslationKey } from '@/shared/i18n'

interface NavItem {
  view: View
  label: TranslationKey
  icon: IconName
  count?: number
  tone?: 'alert'
}

export function Sidebar() {
  const t = useT()
  const view = useAppStore((s) => s.view)
  const tasks = useAppStore((s) => s.tasks)
  const columns = useAppStore((s) => s.columns)
  const today = useAppStore((s) => s.today)
  const lastBackupAt = useAppStore((s) => s.settings.lastBackupAt)
  const boardId = useAppStore((s) => s.activeBoardId())
  const { setView, openQuickCapture, setHelpOpen } = useAppStore.getState()

  const counts = useMemo(() => {
    const boardTasks = tasks.filter((task) => task.boardId === boardId)
    const sections = selectToday(boardTasks, columns, today)
    return {
      today: sections.overdue.length + sections.dueToday.length + sections.inProgress.length,
      overdue: sections.overdue.length,
      high: selectHighPriority(boardTasks, columns).length,
      total: tasks.filter((task) => !task.deletedAt).length,
    }
  }, [tasks, columns, today, boardId])

  const backupAge = lastBackupAt ? differenceInCalendarDays(new Date(), new Date(lastBackupAt)) : undefined
  const showBackupHint = counts.total >= 5 && (backupAge === undefined || backupAge >= 7)

  const primary: NavItem[] = [
    { view: 'today', label: 'nav.today', icon: 'today', count: counts.today },
    { view: 'board', label: 'nav.board', icon: 'board' },
  ]
  const views: NavItem[] = [
    { view: 'overdue', label: 'nav.overdue', icon: 'overdue', count: counts.overdue, tone: 'alert' },
    { view: 'high', label: 'nav.highPriority', icon: 'flag', count: counts.high },
  ]

  const renderItem = (item: NavItem) => (
    <li key={item.view}>
      <a
        href={`#/${item.view}`}
        className={`nav__item${view === item.view ? ' nav__item--active' : ''}`}
        aria-current={view === item.view ? 'page' : undefined}
        onClick={(e) => {
          e.preventDefault()
          setView(item.view)
        }}
      >
        <Icon name={item.icon} />
        <span className="nav__label">{t(item.label)}</span>
        {item.count ? <span className={`nav__count${item.tone === 'alert' ? ' nav__count--alert' : ''}`}>{item.count}</span> : null}
      </a>
    </li>
  )

  return (
    <nav className="sidebar" aria-label={t('nav.main')}>
      <div className="sidebar__brand">
        <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width={20} height={20} />
        <span>{t('app.name')}</span>
      </div>

      <button type="button" className="btn btn--primary sidebar__new" onClick={() => openQuickCapture()}>
        <Icon name="plus" />
        <span>{t('nav.newTask')}</span>
        <kbd className="kbd kbd--on-primary" aria-hidden="true">
          N
        </kbd>
      </button>

      <ul className="nav">{primary.map(renderItem)}</ul>
      <p className="nav__heading" id="nav-views">
        {t('nav.views')}
      </p>
      <ul className="nav" aria-labelledby="nav-views">
        {views.map(renderItem)}
      </ul>
      <ul className="nav">{renderItem({ view: 'archive', label: 'nav.archive', icon: 'archive' })}</ul>

      <div className="sidebar__footer">
        {showBackupHint && (
          <a
            href="#/settings"
            className="sidebar__hint"
            onClick={(e) => {
              e.preventDefault()
              setView('settings')
            }}
          >
            <Icon name="alert" size={14} />
            {backupAge === undefined ? t('nav.backupNever') : t('nav.backupHint', { days: backupAge })}
          </a>
        )}
        <ul className="nav">{renderItem({ view: 'settings', label: 'nav.settings', icon: 'settings' })}</ul>
        <button type="button" className="nav__item nav__item--button" onClick={() => setHelpOpen(true)}>
          <Icon name="keyboard" />
          <span className="nav__label">{t('nav.shortcuts')}</span>
          <kbd className="kbd" aria-hidden="true">
            ?
          </kbd>
        </button>
      </div>
    </nav>
  )
}
