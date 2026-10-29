import type { CardColor, Task } from '@/features/tasks/models/schemas'

export function normalize(value: string): string {
  return value.toLocaleLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Searchable words per card color, e.g. { blue: 'Blau Arbeit' } (color name + user-defined meaning). */
export type ColorSearchTerms = Partial<Record<CardColor, string>>

/**
 * Every word of the query must appear in the title, the description, "waiting for", a tag or the card color's
 * name/meaning (case- and accent-insensitive).
 */
export function searchTasks(tasks: Task[], query: string, colorTerms: ColorSearchTerms = {}): Task[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return []
  return tasks.filter((task) => {
    if (task.deletedAt) return false
    const color = task.color ? (colorTerms[task.color] ?? '') : ''
    const haystack = normalize([task.title, task.description ?? '', task.waitingFor ?? '', ...task.tags.map((t) => `#${t} ${t}`), color].join(' \n '))
    return terms.every((term) => haystack.includes(term))
  })
}
