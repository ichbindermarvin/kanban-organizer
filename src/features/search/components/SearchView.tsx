import { useMemo } from 'react'
import { useAppStore } from '@/state/appStore'
import { searchTasks } from '@/features/search/services/searchTasks'
import { TaskList } from '@/features/tasks/components/TaskList'
import { useT } from '@/shared/hooks/useT'

/** Global result list (board + archive) that updates while typing. */
export function SearchView() {
  const t = useT()
  const tasks = useAppStore((s) => s.tasks)
  const query = useAppStore((s) => s.searchQuery)
  const results = useMemo(() => searchTasks(tasks, query), [tasks, query])
  const active = results.filter((task) => !task.archivedAt)
  const archived = results.filter((task) => task.archivedAt)

  return (
    <div className="view view--list">
      <div className="view__header">
        <h1 className="view__title">{t('search.title')}</h1>
      </div>
      <p className="muted" role="status">
        {results.length ? t('search.results', { count: results.length, query }) : t('search.empty', { query })}
      </p>
      {active.length > 0 && <TaskList tasks={active} label={t('search.title')} />}
      {archived.length > 0 && (
        <section className="list-section" aria-labelledby="search-archived">
          <h2 id="search-archived" className="list-section__title">
            {t('search.archived')}
          </h2>
          <TaskList tasks={archived} showColumn={false} />
        </section>
      )}
    </div>
  )
}
