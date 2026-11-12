import { create } from 'zustand'
import type { Area, Board, Column, ColumnRole, Settings, Task } from '@/features/tasks/models/schemas'
import type { DataSnapshot, Repositories } from '@/db/repositories/types'
import { StorageError, type StorageErrorKind } from '@/db/database'
import { MAX_BOARDS, columnByRole, createDefaultBoard } from '@/features/board/services/defaults'
import { normalizeBoards } from '@/features/board/services/normalize'
import * as layout from '@/features/board/services/layout'
import { isLeaf, leafColumnsInOrder, type AreaMove, type LayoutChange } from '@/features/board/services/layout'
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

/** Result of a layout change that may be refused to keep the board usable. */
export type LayoutResult = { ok: true } | { ok: false; reason: 'lastColumn' | 'lastInbox' | 'lastDone' | 'lastArea' }

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
  /** Resolves when all queued writes are stored (used before reloads in tests). */
  whenSaved(): Promise<void>
  reload(): Promise<void>
  tick(): void

  activeBoardId(): string
  boardColumns(): Column[]
  activeBoards(): Board[]

  createBoard(name: string): Board | undefined
  renameBoard(boardId: string, name: string): void
  setActiveBoard(boardId: string): void
  deleteBoard(boardId: string): void
  undoDeleteBoard(boardId: string, deletedAt: string): void

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
  updateColumn(columnId: string, patch: Partial<Pick<Column, 'wipLimit' | 'title' | 'collapsed' | 'role'>>): LayoutResult

  /* Flexible layout */
  insertColumn(refId: string, where: 'left' | 'right' | 'below'): Column | undefined
  moveColumn(columnId: string, direction: 'left' | 'right' | 'up' | 'down'): void
  moveColumnToArea(columnId: string, areaId: string): void
  moveColumnToNewArea(columnId: string): void
  splitColumn(columnId: string): void
  unsplitColumn(groupId: string): void
  removeColumn(columnId: string): LayoutResult
  addColumnToArea(areaId: string): Column | undefined
  addArea(title: string): Area | undefined
  moveArea(areaId: string, move: AreaMove): void
  updateArea(areaId: string, patch: Partial<Pick<Area, 'title' | 'collapsed' | 'size'>>): void
  removeArea(areaId: string): LayoutResult
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

    /**
     * Writes run strictly one after another in the order the changes happened, so an older write can
     * never overwrite a newer one. On failure the UI is rolled back to the last stored state.
     */
    let writeQueue: Promise<void> = Promise.resolve()
    const persist = (operation: (repos: Repositories) => Promise<void>) => {
      const repos = get().repos
      if (!repos) return Promise.resolve()
      writeQueue = writeQueue.then(() =>
        operation(repos).catch(async (error: unknown) => {
          console.error(error)
          get().showToast({ message: t('toast.saveFailed'), tone: 'error' })
          await get().reload().catch(() => undefined)
        }),
      )
      return writeQueue
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

    /** Applies a layout change: removed columns leave the UI, everything is persisted in order. */
    const applyLayout = (change: LayoutChange) => {
      const { columns, tasks, board } = change
      if (!columns.length && !tasks.length && !board) return
      const cleaned = columns.map(stripUndefined)
      const byId = new Map(cleaned.map((c) => [c.id, c]))
      const existing = new Set(get().columns.map((c) => c.id))
      set((state) => ({
        columns: [...state.columns.map((c) => byId.get(c.id) ?? c), ...cleaned.filter((c) => !existing.has(c.id))].filter((c) => !c.deletedAt),
        boards: board ? state.boards.map((b) => (b.id === board.id ? board : b)) : state.boards,
      }))
      void persist(async (repos) => {
        if (board) await repos.boards.saveMany([board])
        if (cleaned.length) await repos.columns.saveMany(cleaned)
      })
      commitTasks(tasks)
    }

    const findTask = (id: string) => get().tasks.find((task) => task.id === id)

    const applySnapshot = (snapshot: DataSnapshot) => {
      set({
        boards: snapshot.boards,
        // Removed columns stay in the database as tombstones but never reach the UI.
        columns: snapshot.columns.filter((c) => !c.deletedAt),
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
          const normalized = withNormalizedBoards(snapshot, now)
          if (normalized.changed) {
            await repos.boards.saveMany(normalized.snapshot.boards)
            await repos.columns.saveMany(normalized.snapshot.columns)
            Object.assign(snapshot, normalized.snapshot)
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

      whenSaved() {
        return writeQueue
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
        return leafColumnsInOrder(
          get().boards.find((b) => b.id === boardId),
          get().columns,
        )
      },

      activeBoards() {
        return get()
          .boards.filter((b) => !b.archivedAt)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      },

      createBoard(name) {
        const trimmed = name.trim()
        if (!trimmed || get().activeBoards().length >= MAX_BOARDS) return undefined
        const { board, columns } = createDefaultBoard(nowTimestamp(), trimmed)
        set((state) => ({ boards: [...state.boards, board], columns: [...state.columns, ...columns] }))
        void persist(async (repos) => {
          await repos.boards.saveMany([board])
          await repos.columns.saveMany(columns)
        })
        get().setActiveBoard(board.id)
        return board
      },

      renameBoard(boardId, name) {
        const board = get().boards.find((b) => b.id === boardId)
        const trimmed = name.trim()
        if (!board || !trimmed || trimmed === board.name) return
        const updated = { ...board, name: trimmed, updatedAt: nowTimestamp() }
        set((state) => ({ boards: state.boards.map((b) => (b.id === boardId ? updated : b)) }))
        void persist((repos) => repos.boards.saveMany([updated]))
      },

      setActiveBoard(boardId) {
        if (get().settings.activeBoardId !== boardId) get().updateSettings({ activeBoardId: boardId })
        set({ filter: EMPTY_FILTER, view: 'board', searchQuery: '' })
      },

      deleteBoard(boardId) {
        const remaining = get().activeBoards().filter((b) => b.id !== boardId)
        const board = get().boards.find((b) => b.id === boardId)
        // The last board can never be deleted.
        if (!board || remaining.length === 0) return
        const now = nowTimestamp()
        const archivedBoard = { ...board, archivedAt: now, updatedAt: now }
        set((state) => ({ boards: state.boards.map((b) => (b.id === boardId ? archivedBoard : b)) }))
        void persist((repos) => repos.boards.saveMany([archivedBoard]))
        // Tasks become tombstones (same timestamp) so the deletion can be undone and later synced.
        commitTasks(get().tasks.filter((task) => task.boardId === boardId && !task.deletedAt).map((task) => ({ ...task, deletedAt: now, updatedAt: now })))
        if (get().activeBoardId() === boardId || get().settings.activeBoardId === boardId) get().updateSettings({ activeBoardId: remaining[0]!.id })
        if (get().drawerTaskId && get().tasks.find((task) => task.id === get().drawerTaskId)?.boardId === boardId) set({ drawerTaskId: undefined })
        get().showToast({
          message: t('toast.boardDeleted', { name: board.name }),
          actionLabel: t('common.undo'),
          action: () => get().undoDeleteBoard(boardId, now),
        })
      },

      undoDeleteBoard(boardId, deletedAt) {
        const board = get().boards.find((b) => b.id === boardId)
        if (!board?.archivedAt || get().activeBoards().length >= MAX_BOARDS) return
        const now = nowTimestamp()
        const { archivedAt: _removed, ...restored } = board
        const updated = { ...restored, updatedAt: now }
        set((state) => ({ boards: state.boards.map((b) => (b.id === boardId ? updated : b)) }))
        void persist((repos) => repos.boards.saveMany([updated]))
        commitTasks(
          get()
            .tasks.filter((task) => task.boardId === boardId && task.deletedAt === deletedAt)
            .map((task) => {
              const { deletedAt: _d, ...rest } = task
              return { ...rest, updatedAt: now }
            }),
        )
        get().setActiveBoard(boardId)
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
        if (!task || !target || !isLeaf(target)) return false

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
        if (!task || !target || !isLeaf(target) || task.columnId === toColumnId) return false
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
        if (!column) return { ok: true }
        const updated = stripUndefined({ ...column, ...patch, updatedAt: nowTimestamp() })
        if (patch.role && patch.role !== column.role) {
          const refusal = checkLeaves(get().columns.map((c) => (c.id === columnId ? updated : c)), column.boardId)
          if (refusal) return refusal
        }
        set((state) => ({ columns: state.columns.map((c) => (c.id === columnId ? updated : c)) }))
        void persist((repos) => repos.columns.saveMany([updated]))
        return { ok: true }
      },

      insertColumn(refId, where) {
        const ref = get().columns.find((c) => c.id === refId)
        if (!ref) return undefined
        // A new column is a regular "open" column; type and name are set right after in the dialog.
        const change = layout.insertColumn(get().columns, ref, where, 'planned', nowTimestamp())
        applyLayout(change)
        return change.created
      },

      moveColumn(columnId, direction) {
        const column = get().columns.find((c) => c.id === columnId)
        if (!column) return
        const now = nowTimestamp()
        const horizontal = direction === 'left' || direction === 'right'
        const delta = direction === 'left' || direction === 'up' ? -1 : 1
        // Sub-columns move within their group; top-level columns move their whole track or within the stack.
        if (column.parentId) applyLayout(horizontal ? layout.moveWithinStack(get().columns, column, delta, now) : { columns: [], tasks: [] })
        else applyLayout(horizontal ? layout.moveTrack(get().columns, column, delta, now) : layout.moveWithinStack(get().columns, column, delta, now))
      },

      moveColumnToArea(columnId, areaId) {
        const column = get().columns.find((c) => c.id === columnId)
        if (column) applyLayout(layout.moveColumnToArea(get().columns, column, areaId, nowTimestamp()))
      },

      moveColumnToNewArea(columnId) {
        const column = get().columns.find((c) => c.id === columnId)
        const board = get().boards.find((b) => b.id === column?.boardId)
        if (!column || !board || column.parentId) return
        const now = nowTimestamp()
        // The new area sits directly above the column's current area and is named after the column.
        const created = layout.addArea(board, columnTitle(column, get().settings.locale), now, { empty: true, aboveAreaId: column.areaId })
        applyLayout(created)
        applyLayout(layout.moveColumnToArea(get().columns, column, created.area.id, now))
      },

      splitColumn(columnId) {
        const column = get().columns.find((c) => c.id === columnId)
        if (!column || column.parentId || column.kind === 'group') return
        applyLayout(layout.splitColumn(column, nowTimestamp(), [t('column.splitFirst'), t('column.splitSecond')]))
      },

      unsplitColumn(groupId) {
        const group = get().columns.find((c) => c.id === groupId)
        if (!group || group.kind !== 'group') return
        applyLayout(layout.unsplitGroup(get().columns, get().tasks, group, nowTimestamp()))
      },

      removeColumn(columnId) {
        const column = get().columns.find((c) => c.id === columnId)
        if (!column) return { ok: true }
        const removedIds = new Set([column.id, ...get().columns.filter((c) => c.parentId === column.id).map((c) => c.id)])
        const remaining = get().columns.filter((c) => !removedIds.has(c.id))
        const refusal = checkLeaves(remaining, column.boardId)
        if (refusal) return refusal
        const target = fallbackColumn(remaining, column.boardId)!
        applyLayout(layout.deleteColumn(get().columns, get().tasks, column, target.id, nowTimestamp()))
        return { ok: true }
      },

      addColumnToArea(areaId) {
        const board = get().boards.find((b) => (b.areas ?? []).some((a) => a.id === areaId))
        if (!board) return undefined
        const inArea = get().columns.filter((c) => c.areaId === areaId && !c.parentId)
        const track = inArea.length ? Math.max(...inArea.map((c) => c.track ?? 0)) + 1 : 0
        const created = layout.createColumn(board.id, 'planned', nowTimestamp(), { areaId, track, stack: 0 })
        applyLayout({ columns: [created], tasks: [] })
        return created
      },

      addArea(title) {
        const board = get().boards.find((b) => b.id === get().activeBoardId())
        if (!board) return undefined
        const change = layout.addArea(board, title.trim(), nowTimestamp())
        applyLayout(change)
        return change.area
      },

      moveArea(areaId, move) {
        const board = get().boards.find((b) => b.id === get().activeBoardId())
        if (board) applyLayout({ board: layout.moveArea(board, areaId, move, nowTimestamp()), columns: [], tasks: [] })
      },

      updateArea(areaId, patch) {
        const board = get().boards.find((b) => (b.areas ?? []).some((a) => a.id === areaId))
        if (board) applyLayout({ board: layout.updateArea(board, areaId, patch, nowTimestamp()), columns: [], tasks: [] })
      },

      removeArea(areaId) {
        const board = get().boards.find((b) => (b.areas ?? []).some((a) => a.id === areaId))
        if (!board) return { ok: true }
        if ((board.areas ?? []).length <= 1) return { ok: false, reason: 'lastArea' }
        const inArea = new Set(get().columns.filter((c) => c.areaId === areaId).map((c) => c.id))
        const remaining = get().columns.filter((c) => !inArea.has(c.id) && !(c.parentId && inArea.has(c.parentId)))
        const refusal = checkLeaves(remaining, board.id)
        if (refusal) return refusal
        const target = fallbackColumn(remaining, board.id)!
        applyLayout(layout.deleteArea(board, get().columns, get().tasks, areaId, target.id, nowTimestamp()))
        return { ok: true }
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
          // Older backups have no layout yet (and may lack the backlog/blocked columns).
          const now = nowTimestamp()
          const normalized = withNormalizedBoards(snapshot, now).snapshot
          await repos.replaceAll(asReplacement(normalized, { boards: get().boards, columns: (await repos.loadAll()).columns, tasks: get().tasks }, now))
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

/** Applies {@link normalizeBoards} to a snapshot and merges the changed records back in. */
function withNormalizedBoards(snapshot: DataSnapshot, now: string): { snapshot: DataSnapshot; changed: boolean } {
  const changed = normalizeBoards(snapshot.boards, snapshot.columns, now)
  if (!changed.boards.length && !changed.columns.length) return { snapshot, changed: false }
  const boards = new Map(snapshot.boards.map((b) => [b.id, b]))
  for (const board of changed.boards) boards.set(board.id, board)
  const columns = new Map(snapshot.columns.map((c) => [c.id, c]))
  for (const column of changed.columns) columns.set(column.id, column)
  return { snapshot: { ...snapshot, boards: [...boards.values()], columns: [...columns.values()] }, changed: true }
}

/** A board must keep at least one task column, one "Eingang" (quick capture) and one "Erledigt". */
function checkLeaves(columns: Column[], boardId: string): LayoutResult | undefined {
  const leaves = columns.filter((c) => c.boardId === boardId && isLeaf(c) && !c.deletedAt)
  if (leaves.length === 0) return { ok: false, reason: 'lastColumn' }
  if (!leaves.some((c) => c.role === 'inbox')) return { ok: false, reason: 'lastInbox' }
  if (!leaves.some((c) => c.role === 'done')) return { ok: false, reason: 'lastDone' }
  return undefined
}

/** Where tasks of a removed column go: the board's first "Eingang" column. */
function fallbackColumn(columns: Column[], boardId: string): Column | undefined {
  return columnByRole(columns, boardId, 'inbox') ?? columns.find((c) => c.boardId === boardId && isLeaf(c) && !c.deletedAt)
}

/**
 * Makes an imported backup win everywhere: imported records get a fresh updatedAt (a backup is
 * usually older than the cloud copy), and records that exist now but not in the backup become
 * tombstones, so the import also replaces the data on synced devices.
 */
function asReplacement(snapshot: DataSnapshot, current: Pick<DataSnapshot, 'boards' | 'columns' | 'tasks'>, now: string): DataSnapshot {
  const touch = <T extends { updatedAt: string }>(record: T): T => ({ ...record, updatedAt: now })
  const ids = (list: { id: string }[]) => new Set(list.map((r) => r.id))
  const boardIds = ids(snapshot.boards)
  const columnIds = ids(snapshot.columns)
  const taskIds = ids(snapshot.tasks)
  return {
    boards: [
      ...snapshot.boards.map(touch),
      ...current.boards.filter((b) => !boardIds.has(b.id)).map((b) => ({ ...b, archivedAt: b.archivedAt ?? now, updatedAt: now })),
    ],
    columns: [
      ...snapshot.columns.map(touch),
      ...current.columns.filter((c) => !columnIds.has(c.id)).map((c) => ({ ...c, deletedAt: c.deletedAt ?? now, updatedAt: now })),
    ],
    tasks: [
      ...snapshot.tasks.map(touch),
      ...current.tasks.filter((t) => !taskIds.has(t.id)).map((t) => ({ ...t, deletedAt: t.deletedAt ?? now, updatedAt: now })),
    ],
    ...(snapshot.settings ? { settings: touch(snapshot.settings) } : {}),
  }
}
