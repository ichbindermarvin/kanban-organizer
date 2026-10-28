import { useMemo, useState } from 'react'
import { useAppStore } from '@/state/appStore'
import { searchTasks } from '@/features/search/services/searchTasks'
import { TaskRow } from '@/features/tasks/components/TaskList'
import { useT } from '@/shared/hooks/useT'
import { formatTimestamp } from '@/shared/utils/format'
import { Icon } from '@/shared/components/Icon'

export function ArchiveView() {
  const t = useT()
  const tasks = useAppStore((s) => s.tasks)
  const locale = useAppStore((s) => s.settings.locale)
  const archiveDone = useAppStore((s) => s.archiveDone)
  const [query, setQuery] = useState('')

  const archived = useMemo(() => {
    const list = tasks.filter((task) => task.archivedAt && !task.deletedAt)
    const matched = query.trim() ? searchTasks(list, query) : list
    return matched.sort((a, b) => (b.archivedAt ?? '').localeCompare(a.archivedAt ?? ''))
  }, [tasks, query])

  return (
    <div className="view view--list">
      <div className="view__header">
        <div>
          <h1 className="view__title">{t('archive.title')}</h1>
          <p className="view__subtitle">{t('archive.count', { count: archived.length })}</p>
        </div>
        <div className="toolbar">
          <button type="button" className="btn btn--ghost" onClick={() => archiveDone(30)}>
            <Icon name="archive" />
            {t('column.archiveOld')}
          </button>
        </div>
      </div>
      <div className="search search--inline">
        <Icon name="search" />
        <input
          type="search"
          className="search__input"
          placeholder={t('archive.filter')}
          aria-label={t('archive.filter')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {archived.length === 0 ? (
        <p className="empty-state">{t('archive.empty')}</p>
      ) : (
        <ul className="task-list" aria-label={t('archive.title')}>
          {archived.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              extra={<span className="muted small">{t('task.archivedAt', { date: formatTimestamp(task.archivedAt!, locale) })}</span>}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
