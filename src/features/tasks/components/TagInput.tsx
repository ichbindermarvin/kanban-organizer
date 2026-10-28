import { useId, useMemo, useState } from 'react'
import { useAppStore } from '@/state/appStore'
import { allTags } from '@/features/tasks/services/taskQueries'
import { useT } from '@/shared/hooks/useT'
import { Icon } from '@/shared/components/Icon'

export function TagInput({ tags, onChange, labelId }: { tags: string[]; onChange: (tags: string[]) => void; labelId: string }) {
  const t = useT()
  const tasks = useAppStore((s) => s.tasks)
  const known = useMemo(() => allTags(tasks), [tasks])
  const [value, setValue] = useState('')
  const listId = useId()
  const lower = tags.map((tag) => tag.toLocaleLowerCase())
  const query = value.trim().toLocaleLowerCase()
  const suggestions = known.filter((tag) => !lower.includes(tag.toLocaleLowerCase()) && (!query || tag.toLocaleLowerCase().includes(query))).slice(0, 8)

  const add = (raw: string) => {
    const tag = raw.trim().replace(/^#/, '')
    if (!tag) return
    // Reuse the existing spelling of a known tag ("content" → "Content").
    const existing = known.find((k) => k.toLocaleLowerCase() === tag.toLocaleLowerCase()) ?? tag
    if (!lower.includes(existing.toLocaleLowerCase())) onChange([...tags, existing])
    setValue('')
  }

  return (
    <div className="tag-input">
      <ul className="tag-input__list" aria-labelledby={labelId}>
        {tags.map((tag) => (
          <li key={tag} className="tag">
            <span>{tag}</span>
            <button type="button" className="tag__remove" aria-label={t('task.removeTag', { tag })} onClick={() => onChange(tags.filter((x) => x !== tag))}>
              <Icon name="close" size={12} />
            </button>
          </li>
        ))}
      </ul>
      <input
        className="input input--small"
        value={value}
        placeholder={t('task.addTag')}
        aria-label={t('task.addTag')}
        aria-describedby={suggestions.length ? listId : undefined}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            const exact = suggestions.find((s) => s.toLocaleLowerCase() === query)
            add(exact ?? (query && suggestions.length === 1 && suggestions[0]!.toLocaleLowerCase().startsWith(query) ? suggestions[0]! : value))
          } else if (e.key === 'Backspace' && !value && tags.length) {
            onChange(tags.slice(0, -1))
          }
        }}
        onBlur={() => value.trim() && add(value)}
      />
      {suggestions.length > 0 && (
        <div id={listId} className="tag-input__suggestions">
          {suggestions.map((tag) => (
            <button key={tag} type="button" className="tag tag--suggestion" onMouseDown={(e) => e.preventDefault()} onClick={() => add(tag)}>
              <Icon name="plus" size={12} />
              {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
