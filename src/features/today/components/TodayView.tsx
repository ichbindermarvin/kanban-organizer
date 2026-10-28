import { useMemo, useState } from 'react'
import { useAppStore } from '@/state/appStore'
import { useActiveBoardTasks } from '@/features/board/services/useActiveBoardTasks'
import { selectToday } from '@/features/today/services/selectToday'
import { columnByRole } from '@/features/board/services/defaults'
import { TaskList } from '@/features/tasks/components/TaskList'
import { useT } from '@/shared/hooks/useT'
import { formatLongDate } from '@/shared/utils/format'
import { fromIsoDate } from '@/shared/utils/dates'
import { Icon } from '@/shared/components/Icon'

export function TodayView() {
  const t = useT()
  const columns = useAppStore((s) => s.columns)
  const today = useAppStore((s) => s.today)
  const locale = useAppStore((s) => s.settings.locale)
  const boardId = useAppStore((s) => s.activeBoardId())
  const addTask = useAppStore((s) => s.addTask)
  const [title, setTitle] = useState('')

  const boardTasks = useActiveBoardTasks()
  const sections = useMemo(() => selectToday(boardTasks, columns, today), [boardTasks, columns, today])
  const empty = sections.overdue.length + sections.dueToday.length + sections.inProgress.length === 0
  const planned = columnByRole(columns, boardId, 'planned')

  return (
    <div className="view view--list">
      <div className="view__header">
        <div>
          <h1 className="view__title">{t('today.title')}</h1>
          <p className="view__subtitle">{formatLongDate(fromIsoDate(today), locale)}</p>
        </div>
      </div>

      {/* Adding here means: planned for today. */}
      <form
        className="inline-add"
        onSubmit={(e) => {
          e.preventDefault()
          if (planned && title.trim()) addTask(title, planned.id, { dueDate: today })
          setTitle('')
        }}
      >
        <Icon name="plus" />
        <input
          className="inline-add__input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={`${t('quick.placeholder')} (${t('due.today')})`}
          aria-label={`${t('nav.newTask')} – ${t('due.today')}`}
        />
      </form>

      {empty && <p className="empty-state">{t('today.emptyAll')}</p>}

      {sections.overdue.length > 0 && (
        <section className="list-section list-section--overdue" aria-labelledby="today-overdue">
          <h2 id="today-overdue" className="list-section__title">
            {t('today.overdue')} <span className="list-section__count">{sections.overdue.length}</span>
          </h2>
          <TaskList tasks={sections.overdue} dimBacklog />
        </section>
      )}
      {sections.dueToday.length > 0 && (
        <section className="list-section" aria-labelledby="today-due">
          <h2 id="today-due" className="list-section__title">
            {t('today.dueToday')} <span className="list-section__count">{sections.dueToday.length}</span>
          </h2>
          <TaskList tasks={sections.dueToday} dimBacklog />
        </section>
      )}
      {sections.inProgress.length > 0 && (
        <section className="list-section" aria-labelledby="today-doing">
          <h2 id="today-doing" className="list-section__title">
            {t('today.inProgress')} <span className="list-section__count">{sections.inProgress.length}</span>
          </h2>
          <TaskList tasks={sections.inProgress} showColumn={false} />
        </section>
      )}
    </div>
  )
}
