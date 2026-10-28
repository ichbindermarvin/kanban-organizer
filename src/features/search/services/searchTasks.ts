import type { Task } from '@/features/tasks/models/schemas'

export function normalize(value: string): string {
  return value.toLocaleLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Every word of the query must appear in the title, the description or a tag (case- and accent-insensitive). */
export function searchTasks(tasks: Task[], query: string): Task[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return []
  return tasks.filter((task) => {
    if (task.deletedAt) return false
    const haystack = normalize([task.title, task.description ?? '', ...task.tags.map((t) => `#${t} ${t}`)].join(' \n '))
    return terms.every((term) => haystack.includes(term))
  })
}
