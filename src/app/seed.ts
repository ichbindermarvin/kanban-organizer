import { nextMonday } from 'date-fns'
import type { Column, Task } from '@/features/tasks/models/schemas'
import { createTask } from '@/features/tasks/services/taskOperations'
import { addDaysIso, fromIsoDate, toIsoDate } from '@/shared/utils/dates'

/** Example data – only used in development mode (`npm run dev`) on an empty database. */
export function buildSeedTasks(boardId: string, columns: Column[], today: string, now: string): Task[] {
  const col = (role: Column['role']) => columns.find((c) => c.role === role)!.id
  const tasks: Task[] = []
  const add = (title: string, role: Column['role'], extra: Partial<Task> = {}) => {
    const task = { ...createTask({ boardId, columnId: col(role), title }, tasks, now), ...extra }
    tasks.push(task)
    return task
  }
  add('Garage aufräumen', 'backlog', { priority: 'low', tags: ['Privat'] })
  add('Spanisch-Kurs recherchieren', 'backlog', { priority: 'low' })
  add('Versicherung prüfen', 'inbox', { tags: ['Finanzen'] })
  add('Geschenk bestellen', 'inbox', { tags: ['Privat'], dueDate: addDaysIso(today, -1) })
  add('Newsletter vorbereiten', 'planned', {
    priority: 'high',
    dueDate: today,
    tags: ['Content', 'Newsletter'],
    subtasks: [
      { id: crypto.randomUUID(), title: 'Recherche', completed: true, position: 0 },
      { id: crypto.randomUUID(), title: 'Gliederung', completed: true, position: 1 },
      { id: crypto.randomUUID(), title: 'Text finalisieren', completed: false, position: 2 },
    ],
  })
  add('Monatsplanung', 'planned', { dueDate: addDaysIso(today, 3), tags: ['Organisation'] })
  add('Website-Texte finalisieren', 'doing', { priority: 'urgent', tags: ['Content'] })
  add('Hotel buchen', 'done', { completedAt: now, tags: ['Privat'] })
  const weekly = add('Wochenplanung', 'planned', {
    dueDate: toIsoDate(nextMonday(fromIsoDate(today))),
    recurrence: { frequency: 'weekly', interval: 1, daysOfWeek: [1] },
    tags: ['Organisation'],
  })
  weekly.recurrenceSeriesId = weekly.id
  return tasks
}
