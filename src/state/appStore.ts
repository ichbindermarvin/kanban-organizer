import { create } from 'zustand'
import type { Board, Column, ColumnRole, Settings, Task } from '@/features/tasks/models/schemas'
import type { DataSnapshot, Repositories } from '@/db/repositories/types'
import { StorageError, type StorageErrorKind } from '@/db/database'
import { columnByRole, createDefaultBoard } from '@/features/board/services/defaults'
import { moveTask as computeMove, wouldExceedWip } from '@/features/board/services/moveTask'
import { applyCompletionState, buildNextRecurrence, createTask, duplicateTask } from '@/features/tasks/services/taskOperations'
import { tasksInColumn } from '@/features/tasks/services/taskQueries'
import { archiveCompleted } from '@/features/archive/archiveService'
import { EMPTY_FILTER, type SortMode, type TaskFilter } from '@/features/filters/services/filterTasks'
import { translate, type TranslationKey } from '@/shared/i18n'
import { formatShortDate } from '@/shared/utils/format'
import { nowTimestamp, todayIso } from '@/shared/utils/dates'
import { stripUndefined } from '@/shared/utils/object'
import { buildSeedTasks } from '@/app/seed'

export type View = 'today' | 'board' | 'overdue' | 'high' | 'archive' | 'settings' | 'search'

export interface Toast {
  id: number
  message: string
  tone: 'info' | 'error'
  actionLabel?: string
  action?: () => void
}

export interface PendingMove {
  taskId: string
  toColumnId: string
  toIndex: number
}

export interface AppState {
  status: 'loading' | 'ready' | 'error'
  errorKind?: StorageErrorKind
  repos?: Repositories

  boards: Board[]
  columns: Column[]
  tasks: Task[]
  settings: Settings
  today: string

  view: View
  viewBeforeSearch: View
  drawerTaskId?: string
  selectedTaskId?: string
  quickCapture: { open: boolean; role: ColumnRole }
  searchQuery: string
  filter: TaskFilter
  sortMode: SortMode
  pendingMove?: PendingMove
  toasts: Toast[]
  paletteOpen: boolean
  helpOpen: boolean

  init(repos: Repositories, options?: { seed?: boolean }): Promise<void>
  reload(): Promise<void>
  tick(): void

  activeBoardId(): string
  boardColumns(): Column[]

  addTask(title: string, columnId: string, extra?: Partial<Pick<Task, 'dueDate' | 'priority' | 'tags'>>): Task | undefined
  updateTask(id: string, patch: Partial<Omit<Task, 'id' | 'columnId' | 'position' | 'createdAt'>>): void
  moveTask(taskId: string, toColumnId: string, toIndex: number, options?: { force?: boolean }): boolean
  moveToColumn(taskId: string, toColumnId: string): boolean
  confirmPendingMove(): void
  cancelPendingMove(): void
  toggleComplete(taskId: string): void
  deleteTask(taskId: string): void
  undoDelete(taskId: string): void
  archiveTask(taskId: string): void
  restoreTask(taskId: string): void
  duplicateTask(taskId: string): Task | undefined
  archiveDone(olderThanDays?: number): number
  updateColumn(columnId: string, patch: Partial<Pick<Column, 'wipLimit' | 'title'>>): void
  updateSettings(patch: Partial<Omit<Settings, 'id' | 'updatedAt'>>): void
  importSnapshot(snapshot: DataSnapshot): Promise<{ ok: true } | { ok: false }>
  exportSnapshot(): DataSnapshot

  setView(view: View): void
  openDrawer(taskId: string): void
  closeDrawer(): void
  selectTask(taskId?: string): void
  openQuickCapture(role?: ColumnRole): void
  closeQuickCapture(): void
  setSearchQuery(query: string): void
  clearSearch(): void
  setFilter(filter: TaskFilter): void
  resetFilter(): void
  setSortMode(mode: SortMode): void
  showToast(toast: Omit<Toast, 'id' | 'tone'> & { tone?: Toast['tone'] }): void
  dismissToast(id: number): void
  setPaletteOpen(open: boolean): void
  setHelpOpen(open: boolean): void
}

const DEFAULT_SETTINGS = (now: string): Settings => ({ id: 'app', theme: 'system', locale: 'de', updatedAt: now })

let toastCounter = 0

export function createAppStore() {
  return create<AppState>()((set, get) => {
    const t = (key: TranslationKey, params?: Record<string, string | number>) => translate(get().settings.locale, key, params)

    /** Persists in the background. On failure the UI is rolled back to the last stored state. */
    const persist = (operation: (repos: Repositories) => Promise<void>) => {
      const repos = get().repos
      if (!repos) return Promise.resolve()
      return operation(repos).catch(async (error: unknown) => {
        console.error(error)
        get().showToast({ message: t('toast.saveFailed'), tone: 'error' })
        await get().reload().catch(() => undefined)
      })
    }

    /** Optimistically merges changed tasks into state and persists them. */
    const commitTasks = (changed: Task[]) => {
      if (changed.length === 0) return
      const cleaned = changed.map(stripUndefined)
      const byId = new Map(cleaned.map((task) => [task.id, task]))
      const existing = new Set(get().tasks.map((task) => task.id))
      set((state) => ({
        tasks: [...state.tasks.map((task) => byId.get(task.id) ?? task), ...cleaned.filter((task) => !existing.has(task.id))],
      }))
      void persist((repos) => repos.tasks.saveMany(cleaned))
    }

    const findTask = (id: string) => get().tasks.find((task) => task.id === id)

    const applySnapshot = (snapshot: DataSnapshot) => {
      set({
        boards: snapshot.boards,
        columns: snapshot.columns,
        tasks: snapshot.tasks,
        settings: snapshot.settings ?? DEFAULT_SETTINGS(nowTimestamp()),
      })
      mirrorTheme(get().settings.theme)
    }

    return {
      status: 'loading',
      boards: [],
      columns: [],
      tasks: [],
      settings: DEFAULT_SETTINGS(new Date(0).toISOString()),
      today: todayIso(),

      view: 'today',
      viewBeforeSearch: 'today',
      quickCapture: { open: false, role: 'inbox' },
      searchQuery: '',
      filter: EMPTY_FILTER,
      sortMode: 'manual',
      toasts: [],
      paletteOpen: false,
      helpOpen: false,

      async init(repos, options) {
        set({ repos, status: 'loading', errorKind: undefined })
        try {
          const snapshot = await repos.loadAll()
          const now = nowTimestamp()
          if (snapshot.boards.length === 0) {
            const { board, columns } = createDefaultBoard(now)
            const tasks = options?.seed ? buildSeedTasks(board.id, columns, todayIso(), now) : []
            await repos.boards.saveMany([board])
            await repos.columns.saveMany(columns)
            if (tasks.length) await repos.tasks.saveMany(tasks)
            snapshot.boards = [board]
            snapshot.columns = columns
            snapshot.tasks = tasks
          }
          if (!snapshot.settings) {
            snapshot.settings = DEFAULT_SETTINGS(now)
            await repos.settings.save(snapshot.settings)
          }
          applySnapshot(snapshot)
          set({ status: 'ready', today: todayIso() })
        } catch (error) {
          console.error(error)
          set({ status: 'error', errorKind: error instanceof StorageError ? error.kind : 'unknown' })
        }
      },

      async reload() {
        const repos = get().repos
        if (!repos) return
        applySnapshot(await repos.loadAll())
      },

      tick() {
        const today = todayIso()
        if (today !== get().today) set({ today })
      },

      activeBoardId() {
        const { settings, boards } = get()
        const active = boards.find((b) => b.id === settings.activeBoardId && !b.archivedAt)
        return (active ?? boards.find((b) => !b.archivedAt) ?? boards[0])?.id ?? ''
      },

      boardColumns() {
        const boardId = get().activeBoardId()
        return get()
          .columns.filter((c) => c.boardId === boardId)
          .sort((a, b) => a.position - b.position)
      },

      addTask(title, columnId, extra) {
        const trimmed = title.trim()
        const column = get().columns.find((c) => c.id === columnId)
        if (!trimmed || !column) return undefined
        const now = nowTimestamp()
        let task = createTask({ boardId: column.boardId, columnId, title: trimmed, ...extra }, get().tasks, now)
        task = applyCompletionState(task, column, now)
        commitTasks([task])
        return task
      },

      updateTask(id, patch) {
        const task = findTask(id)
        if (!task) return
        const updated: Task = { ...task, ...patch, updatedAt: nowTimestamp() }
        if (updated.recurrence && !updated.recurrenceSeriesId) updated.recurrenceSeriesId = task.id
        commitTasks([updated])
      },

      moveTask(taskId, toColumnId, toIndex, options) {
        const state = get()
        const task = findTask(taskId)
        const target = state.columns.find((c) => c.id === toColumnId)
        if (!task || !target) return false

        if (task.columnId !== toColumnId && !options?.force && wouldExceedWip(target, state.tasks, taskId)) {
          set({ pendingMove: { taskId, toColumnId, toIndex } })
          return false
        }

        const now = nowTimestamp()
        const changed = computeMove(state.tasks, taskId, toColumnId, toIndex, now).map((t) =>
          t.id === taskId ? applyCompletionState(t, target, now) : t,
        )
        const moved = changed.find((t) => t.id === taskId)
        const wasDone = state.columns.find((c) => c.id === task.columnId)?.role === 'done'
        if (moved && target.role === 'done' && !wasDone) {
          const next = buildNextRecurrence(moved, state.columns, state.tasks, state.today, now)
          if (next) {
            changed.push(next)
            get().showToast({ message: t('toast.nextInstance', { date: formatShortDate(next.dueDate!, state.today, state.settings.locale) }) })
          }
        }
        commitTasks(changed)
        return true
      },

      moveToColumn(taskId, toColumnId) {
        const task = findTask(taskId)
        const target = get().columns.find((c) => c.id === toColumnId)
        if (!task || !target || task.columnId === toColumnId) return false
        // Completed tasks go to the top of "Erledigt" (most recent first), everything else to the end.
        const index = target.role === 'done' ? 0 : tasksInColumn(get().tasks, toColumnId).length
        return get().moveTask(taskId, toColumnId, index)
      },

      confirmPendingMove() {
        const pending = get().pendingMove
        set({ pendingMove: undefined })
        if (pending) get().moveTask(pending.taskId, pending.toColumnId, pending.toIndex, { force: true })
      },

      cancelPendingMove() {
        set({ pendingMove: undefined })
      },

      toggleComplete(taskId) {
        const task = findTask(taskId)
        if (!task) return
        const columns = get().columns
        const current = columns.find((c) => c.id === task.columnId)
        // Reopened tasks go back to "Geplant": they were already triaged once.
        const target = columnByRole(columns, task.boardId, current?.role === 'done' ? 'planned' : 'done')
        if (target) get().moveToColumn(taskId, target.id)
      },

      deleteTask(taskId) {
        const task = findTask(taskId)
        if (!task) return
        const now = nowTimestamp()
        commitTasks([{ ...task, deletedAt: now, updatedAt: now }])
        if (get().drawerTaskId === taskId) set({ drawerTaskId: undefined })
        get().showToast({ message: t('toast.deleted'), actionLabel: t('common.undo'), action: () => get().undoDelete(taskId) })
      },

      undoDelete(taskId) {
        const task = findTask(taskId)
        if (!task?.deletedAt) return
        const { deletedAt: _removed, ...rest } = task
        commitTasks([{ ...rest, updatedAt: nowTimestamp() }])
      },

      archiveTask(taskId) {
        const task = findTask(taskId)
        if (!task || task.archivedAt) return
        const now = nowTimestamp()
        commitTasks([{ ...task, archivedAt: now, updatedAt: now }])
        if (get().drawerTaskId === taskId) set({ drawerTaskId: undefined })
        get().showToast({ message: t('toast.archived'), actionLabel: t('common.undo'), action: () => get().restoreTask(taskId) })
      },

      restoreTask(taskId) {
        const task = findTask(taskId)
        if (!task?.archivedAt) return
        const { archivedAt: _removed, ...rest } = task
        const siblings = tasksInColumn(get().tasks, task.columnId)
        const last = siblings[siblings.length - 1]
        commitTasks([{ ...rest, position: last ? last.position + 1 : 0, updatedAt: nowTimestamp() }])
      },

      duplicateTask(taskId) {
        const task = findTask(taskId)
        if (!task) return undefined
        const { copy, shifted } = duplicateTask(task, get().columns, get().tasks, nowTimestamp(), t('task.copySuffix'))
        commitTasks([...shifted, copy])
        get().showToast({ message: t('toast.duplicated') })
        return copy
      },

      archiveDone(olderThanDays) {
        const boardId = get().activeBoardId()
        const boardTasks = get().tasks.filter((task) => task.boardId === boardId)
        const archived = archiveCompleted(boardTasks, get().columns, new Date(), olderThanDays)
        commitTasks(archived)
        get().showToast({ message: archived.length ? t('toast.archivedMany', { count: archived.length }) : t('toast.nothingToArchive') })
        return archived.length
      },

      updateColumn(columnId, patch) {
        const column = get().columns.find((c) => c.id === columnId)
        if (!column) return
        const updated = stripUndefined({ ...column, ...patch, updatedAt: nowTimestamp() })
        set((state) => ({ columns: state.columns.map((c) => (c.id === columnId ? updated : c)) }))
        void persist((repos) => repos.columns.saveMany([updated]))
      },

      updateSettings(patch) {
        const settings = stripUndefined({ ...get().settings, ...patch, updatedAt: nowTimestamp() })
        set({ settings })
        mirrorTheme(settings.theme)
        void persist((repos) => repos.settings.save(settings))
      },

      async importSnapshot(snapshot) {
        const repos = get().repos
        if (!repos) return { ok: false }
        try {
          await repos.replaceAll(snapshot)
        } catch (error) {
          console.error(error)
          return { ok: false }
        }
        await get().reload()
        set({ drawerTaskId: undefined, selectedTaskId: undefined, filter: EMPTY_FILTER })
        return { ok: true }
      },

      exportSnapshot() {
        const { boards, columns, tasks, settings } = get()
        return { boards, columns, tasks, settings }
      },

      setView(view) {
        set((state) => ({
          view,
          searchQuery: view === 'search' ? state.searchQuery : '',
          viewBeforeSearch: view === 'search' ? state.viewBeforeSearch : view,
        }))
      },
      openDrawer(taskId) {
        set({ drawerTaskId: taskId, selectedTaskId: taskId })
      },
      closeDrawer() {
        set({ drawerTaskId: undefined })
      },
      selectTask(taskId) {
        set({ selectedTaskId: taskId })
      },
      openQuickCapture(role = 'inbox') {
        set({ quickCapture: { open: true, role } })
      },
      closeQuickCapture() {
        set((state) => ({ quickCapture: { ...state.quickCapture, open: false } }))
      },
      setSearchQuery(query) {
        set((state) => {
          if (!query) return { searchQuery: '', view: state.view === 'search' ? state.viewBeforeSearch : state.view }
          return {
            searchQuery: query,
            view: 'search',
            viewBeforeSearch: state.view === 'search' ? state.viewBeforeSearch : state.view,
          }
        })
      },
      clearSearch() {
        get().setSearchQuery('')
      },
      setFilter(filter) {
        set({ filter })
      },
      resetFilter() {
        set({ filter: EMPTY_FILTER })
      },
      setSortMode(sortMode) {
        set({ sortMode })
      },
      showToast(toast) {
        const id = ++toastCounter
        set((state) => ({ toasts: [...state.toasts.slice(-2), { tone: 'info', ...toast, id }] }))
      },
      dismissToast(id) {
        set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }))
      },
      setPaletteOpen(paletteOpen) {
        set({ paletteOpen })
      },
      setHelpOpen(helpOpen) {
        set({ helpOpen })
      },
    }
  })
}

/** Mirrors the theme into localStorage so index.html can apply it before first paint (IndexedDB is async). */
function mirrorTheme(theme: Settings['theme']) {
  try {
    localStorage.setItem('kanban.theme', theme)
  } catch {
    // Storage blocked – the theme is still applied once IndexedDB has loaded.
  }
  if (typeof document !== 'undefined') {
    if (theme === 'system') delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = theme
  }
}

export const useAppStore = createAppStore()

/** Display name of a column: custom title or the localized default for its role. */
export function columnTitle(column: Column, locale: Settings['locale']): string {
  return column.title || translate(locale, `column.${column.role}`)
}
