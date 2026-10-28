import { useRef, useState } from 'react'
import type { Subtask } from '@/features/tasks/models/schemas'
import { useT } from '@/shared/hooks/useT'
import { Icon } from '@/shared/components/Icon'
import { newId } from '@/shared/utils/id'

function SubtaskTitle({ subtask, onRename }: { subtask: Subtask; onRename: (title: string) => void }) {
  const t = useT()
  const [value, setValue] = useState(subtask.title)
  return (
    <input
      className={`subtask__title${subtask.completed ? ' subtask__title--done' : ''}`}
      value={value}
      aria-label={t('task.subtaskTitle')}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => (value.trim() ? value !== subtask.title && onRename(value.trim()) : setValue(subtask.title))}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
    />
  )
}

export function SubtaskList({ subtasks, onChange, labelId }: { subtasks: Subtask[]; onChange: (subtasks: Subtask[]) => void; labelId: string }) {
  const t = useT()
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const ordered = [...subtasks].sort((a, b) => a.position - b.position)
  const done = ordered.filter((s) => s.completed).length

  const commit = (list: Subtask[]) => onChange(list.map((s, position) => ({ ...s, position })))
  const update = (id: string, patch: Partial<Subtask>) => commit(ordered.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  const move = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= ordered.length) return
    const list = [...ordered]
    const [item] = list.splice(index, 1)
    list.splice(target, 0, item!)
    commit(list)
  }

  return (
    <div className="subtasks">
      {ordered.length > 0 && (
        <>
          <div className="progress" aria-hidden="true">
            <div className="progress__bar" style={{ width: `${(done / ordered.length) * 100}%` }} />
          </div>
          <p className="visually-hidden">{t('task.subtaskProgress', { done, total: ordered.length })}</p>
        </>
      )}
      <ul className="subtasks__list" aria-labelledby={labelId}>
        {ordered.map((subtask, index) => (
          <li key={subtask.id} className="subtask">
            <input
              type="checkbox"
              className="subtask__check"
              checked={subtask.completed}
              aria-label={subtask.title}
              onChange={(e) => update(subtask.id, { completed: e.target.checked })}
            />
            <SubtaskTitle subtask={subtask} onRename={(title) => update(subtask.id, { title })} />
            <div className="subtask__actions">
              <button type="button" className="icon-btn icon-btn--sm" aria-label={t('task.moveSubtaskUp')} disabled={index === 0} onClick={() => move(index, -1)}>
                <Icon name="up" size={14} />
              </button>
              <button
                type="button"
                className="icon-btn icon-btn--sm"
                aria-label={t('task.moveSubtaskDown')}
                disabled={index === ordered.length - 1}
                onClick={() => move(index, 1)}
              >
                <Icon name="down" size={14} />
              </button>
              <button type="button" className="icon-btn icon-btn--sm" aria-label={t('task.deleteSubtask')} onClick={() => commit(ordered.filter((s) => s.id !== subtask.id))}>
                <Icon name="trash" size={14} />
              </button>
            </div>
          </li>
        ))}
      </ul>
      <form
        className="subtasks__add"
        onSubmit={(e) => {
          e.preventDefault()
          if (!draft.trim()) return
          commit([...ordered, { id: newId(), title: draft.trim(), completed: false, position: ordered.length }])
          setDraft('')
          inputRef.current?.focus()
        }}
      >
        <Icon name="plus" size={14} />
        <input ref={inputRef} className="input input--small input--bare" value={draft} placeholder={t('task.addSubtask')} aria-label={t('task.addSubtask')} onChange={(e) => setDraft(e.target.value)} />
      </form>
    </div>
  )
}
