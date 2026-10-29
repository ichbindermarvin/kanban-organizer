import { useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { nextMonday } from 'date-fns'
import { PRIORITIES, type Task } from '@/features/tasks/models/schemas'
import { columnTitle, useAppStore } from '@/state/appStore'
import { useFocusTrap } from '@/shared/hooks/useFocusTrap'
import { useAutosave } from '@/shared/hooks/useAutosave'
import { useT } from '@/shared/hooks/useT'
import { Icon } from '@/shared/components/Icon'
import { addDaysIso, fromIsoDate, toIsoDate } from '@/shared/utils/dates'
import { formatTimestamp } from '@/shared/utils/format'
import { RecurrenceEditor } from '@/features/recurrence/components/RecurrenceEditor'
import { TagInput } from './TagInput'
import { SubtaskList } from './SubtaskList'
import { DueBadge } from './TaskMeta'
import { ColorPicker } from './ColorPicker'

export function TaskDrawerHost() {
  const taskId = useAppStore((s) => s.drawerTaskId)
  const task = useAppStore((s) => (s.drawerTaskId ? s.tasks.find((x) => x.id === s.drawerTaskId && !x.deletedAt) : undefined))
  if (!taskId || !task) return null
  return <TaskDrawer key={taskId} task={task} />
}

function TaskDrawer({ task }: { task: Task }) {
  const t = useT()
  const locale = useAppStore((s) => s.settings.locale)
  const today = useAppStore((s) => s.today)
  const columns = useAppStore((s) => s.columns)
  const boardName = useAppStore((s) => (s.boards.filter((b) => !b.archivedAt).length > 1 ? s.boards.find((b) => b.id === task.boardId)?.name : undefined))
  const { updateTask, moveToColumn, closeDrawer, archiveTask, restoreTask, deleteTask, duplicateTask, openDrawer } = useAppStore.getState()
  const ref = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLTextAreaElement>(null)
  const ids = { heading: useId(), tags: useId(), subtasks: useId(), recurrence: useId(), color: useId(), status: useId(), waiting: useId(), due: useId(), desc: useId() }

  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description ?? '')
  const [waitingFor, setWaitingFor] = useState(task.waitingFor ?? '')
  const flushWaitingFor = useAutosave(waitingFor, task.waitingFor ?? '', (value) => updateTask(task.id, { waitingFor: value.trim() || undefined }))
  const flushTitle = useAutosave(title, task.title, (value) => value.trim() && updateTask(task.id, { title: value.trim() }))
  const flushDescription = useAutosave(description, task.description ?? '', (value) => updateTask(task.id, { description: value || undefined }))

  useFocusTrap(ref, closeDrawer, titleRef)

  const boardColumns = columns.filter((c) => c.boardId === task.boardId).sort((a, b) => a.position - b.position)
  const current = boardColumns.find((c) => c.id === task.columnId)
  const setDue = (dueDate: string | undefined) => updateTask(task.id, { dueDate })
  const quickDates: { label: string; value: string | undefined }[] = [
    { label: t('due.today'), value: today },
    { label: t('due.tomorrow'), value: addDaysIso(today, 1) },
    { label: t('due.nextWeek'), value: toIsoDate(nextMonday(fromIsoDate(today))) },
    { label: t('due.none'), value: undefined },
  ]

  return createPortal(
    <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && closeDrawer()}>
      <div ref={ref} className={`drawer${task.color ? ` drawer--colored color-${task.color}` : ''}`} role="dialog" aria-modal="true" aria-labelledby={ids.heading}>
        <header className="drawer__header">
          <h2 id={ids.heading} className="visually-hidden">
            {t('drawer.label')}
          </h2>
          <span className={`badge badge--column badge--col-${current?.role}`}>
            {boardName ? `${boardName} · ` : ''}
            {current ? columnTitle(current, locale) : ''}
          </span>
          {task.archivedAt && <span className="badge badge--subtle">{t('search.archived')}</span>}
          <button type="button" className="icon-btn" aria-label={t('drawer.close')} onClick={closeDrawer}>
            <Icon name="close" />
          </button>
        </header>

        <div className="drawer__body">
          <textarea
            ref={titleRef}
            className="drawer__title"
            value={title}
            rows={1}
            aria-label={t('task.title')}
            onChange={(e) => setTitle(e.target.value.replace(/\n/g, ''))}
            onBlur={() => {
              if (!title.trim()) setTitle(task.title)
              else flushTitle()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                e.currentTarget.blur()
              }
            }}
          />

          <dl className="fields">
            <div className="field">
              <dt>
                <label htmlFor={ids.status}>{t('task.status')}</label>
              </dt>
              <dd>
                <select
                  id={ids.status}
                  className="select"
                  value={task.columnId}
                  disabled={!!task.archivedAt}
                  onChange={(e) => moveToColumn(task.id, e.target.value)}
                >
                  {boardColumns.map((column) => (
                    <option key={column.id} value={column.id}>
                      {columnTitle(column, locale)}
                    </option>
                  ))}
                </select>
              </dd>
            </div>

            {/* Only relevant (and visible) while the task is blocked, or if a value is still set. */}
            {(current?.role === 'blocked' || task.waitingFor) && (
              <div className="field">
                <dt>
                  <label htmlFor={ids.waiting}>{t('task.waitingFor')}</label>
                </dt>
                <dd>
                  <input
                    id={ids.waiting}
                    className="input input--small input--full"
                    value={waitingFor}
                    maxLength={200}
                    placeholder={t('task.waitingForPlaceholder')}
                    onChange={(e) => setWaitingFor(e.target.value)}
                    onBlur={flushWaitingFor}
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                  />
                </dd>
              </div>
            )}

            <div className="field">
              <dt id="priority-label">{t('priority.label')}</dt>
              <dd>
                <div className="segmented" role="radiogroup" aria-labelledby="priority-label">
                  {PRIORITIES.map((priority) => (
                    <button
                      key={priority}
                      type="button"
                      role="radio"
                      aria-checked={task.priority === priority}
                      className={`segmented__item segmented__item--${priority}`}
                      onClick={() => updateTask(task.id, { priority })}
                      onKeyDown={(e) => {
                        const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
                        if (!delta) return
                        e.preventDefault()
                        const next = PRIORITIES[(PRIORITIES.indexOf(priority) + delta + PRIORITIES.length) % PRIORITIES.length]!
                        updateTask(task.id, { priority: next })
                        const group = e.currentTarget.parentElement
                        requestAnimationFrame(() => group?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus())
                      }}
                      tabIndex={task.priority === priority ? 0 : -1}
                    >
                      {t(`priority.${priority}`)}
                    </button>
                  ))}
                </div>
              </dd>
            </div>

            <div className="field">
              <dt id={ids.color}>{t('color.label')}</dt>
              <dd>
                <ColorPicker value={task.color} labelledBy={ids.color} onChange={(color) => updateTask(task.id, { color })} />
              </dd>
            </div>

            <div className="field">
              <dt>
                <label htmlFor={ids.due}>{t('due.label')}</label>
              </dt>
              <dd>
                <div className="due-field">
                  <input id={ids.due} className="input input--small" type="date" value={task.dueDate ?? ''} onChange={(e) => setDue(e.target.value || undefined)} />
                  {task.dueDate && <DueBadge dueDate={task.dueDate} completed={current?.role === 'done'} />}
                </div>
                <div className="chips">
                  {quickDates.map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      className={`chip${task.dueDate === option.value ? ' chip--on' : ''}`}
                      aria-pressed={task.dueDate === option.value}
                      onClick={() => setDue(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </dd>
            </div>

            <div className="field">
              <dt id={ids.recurrence}>{t('recurrence.label')}</dt>
              <dd>
                <RecurrenceEditor rule={task.recurrence} dueDate={task.dueDate} onChange={(recurrence) => updateTask(task.id, { recurrence })} onSetDueDate={setDue} />
              </dd>
            </div>

            <div className="field">
              <dt id={ids.tags}>{t('task.tags')}</dt>
              <dd>
                <TagInput tags={task.tags} labelId={ids.tags} onChange={(tags) => updateTask(task.id, { tags })} />
              </dd>
            </div>
          </dl>

          <section className="drawer__section">
            <h3 className="drawer__section-title">
              <label htmlFor={ids.desc}>{t('task.description')}</label>
            </h3>
            <textarea
              id={ids.desc}
              className="textarea"
              value={description}
              rows={4}
              placeholder={t('task.descriptionPlaceholder')}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={flushDescription}
            />
          </section>

          <section className="drawer__section">
            <h3 className="drawer__section-title" id={ids.subtasks}>
              {t('task.subtasks')}
            </h3>
            <SubtaskList subtasks={task.subtasks} labelId={ids.subtasks} onChange={(subtasks) => updateTask(task.id, { subtasks })} />
          </section>
        </div>

        <footer className="drawer__footer">
          <span className="muted small">
            {task.completedAt ? t('task.completedAt', { date: formatTimestamp(task.completedAt, locale) }) : t('task.created', { date: formatTimestamp(task.createdAt, locale) })}
          </span>
          <div className="drawer__actions">
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => {
                const copy = duplicateTask(task.id)
                if (copy) openDrawer(copy.id)
              }}
            >
              <Icon name="copy" size={14} />
              {task.archivedAt || current?.role === 'done' ? t('task.reuse') : t('task.duplicate')}
            </button>
            {task.archivedAt ? (
              <button type="button" className="btn btn--ghost btn--small" onClick={() => restoreTask(task.id)}>
                <Icon name="restore" size={14} />
                {t('task.restore')}
              </button>
            ) : (
              <button type="button" className="btn btn--ghost btn--small" onClick={() => archiveTask(task.id)}>
                <Icon name="archive" size={14} />
                {t('task.archive')}
              </button>
            )}
            <button type="button" className="btn btn--ghost btn--small btn--danger-text" onClick={() => deleteTask(task.id)}>
              <Icon name="trash" size={14} />
              {t('task.delete')}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
