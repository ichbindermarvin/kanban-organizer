import { Fragment, useCallback, useMemo, useState } from 'react'
import { NameDialog } from '@/shared/components/NameDialog'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  closestCorners,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core'
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import type { Column, Task } from '@/features/tasks/models/schemas'
import { columnTitle, useAppStore } from '@/state/appStore'
import { filterTasks, isFilterActive, sortTasks, type SortMode } from '@/features/filters/services/filterTasks'
import { tasksInColumn } from '@/features/tasks/services/taskQueries'
import { FilterPopover, ResetFilterButton } from '@/features/filters/components/FilterPopover'
import { TaskCard } from '@/features/tasks/components/TaskCard'
import { useT } from '@/shared/hooks/useT'
import { Icon } from '@/shared/components/Icon'
import { BoardColumn, COLUMN_PREFIX } from './BoardColumn'
import { toFullIndex } from '../services/dropIndex'

type Items = Record<string, string[]>

const SORT_MODES: SortMode[] = ['manual', 'priority', 'dueDate', 'created']

/**
 * Multi-column collision detection: use what is under the pointer (or overlapping the dragged card
 * for keyboard drags), prefer cards over column containers so empty and tall columns work as targets.
 */
const detectCollision: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args)
  const hits = pointerHits.length > 0 ? pointerHits : rectIntersection(args)
  const cardHits = hits.filter((hit) => !String(hit.id).startsWith(COLUMN_PREFIX))
  if (cardHits.length > 0) {
    const ids = new Set(cardHits.map((hit) => hit.id))
    return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => ids.has(c.id)) })
  }
  return hits.length > 0 ? hits : closestCorners(args)
}

export function BoardView() {
  const t = useT()
  const locale = useAppStore((s) => s.settings.locale)
  const allColumns = useAppStore((s) => s.columns)
  const tasks = useAppStore((s) => s.tasks)
  const filter = useAppStore((s) => s.filter)
  const sortMode = useAppStore((s) => s.sortMode)
  const setSortMode = useAppStore((s) => s.setSortMode)
  const today = useAppStore((s) => s.today)
  const boardId = useAppStore((s) => s.activeBoardId())
  const moveTask = useAppStore((s) => s.moveTask)
  // Until the user chooses, the backlog starts collapsed on smaller screens to give the flow columns room.
  const board = useAppStore((s) => s.boards.find((b) => b.id === boardId))
  const renameBoard = useAppStore((s) => s.renameBoard)
  const [renaming, setRenaming] = useState(false)
  const backlogCollapsed = useAppStore((s) => s.settings.backlogCollapsed) ?? window.innerWidth < 1400
  const updateSettings = useAppStore((s) => s.updateSettings)
  const updateColumn = useAppStore((s) => s.updateColumn)

  const columns = useMemo(() => allColumns.filter((c) => c.boardId === boardId).sort((a, b) => a.position - b.position), [allColumns, boardId])
  const tasksById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks])
  const { visible, totals } = useMemo(() => {
    const visible: Record<string, Task[]> = {}
    const totals: Record<string, number> = {}
    for (const column of columns) {
      const all = tasksInColumn(tasks, column.id)
      totals[column.id] = all.length
      visible[column.id] = sortTasks(filterTasks(all, filter, today), sortMode)
    }
    return { visible, totals }
  }, [columns, tasks, filter, today, sortMode])

  const baseItems = useMemo<Items>(() => Object.fromEntries(Object.entries(visible).map(([id, list]) => [id, list.map((task) => task.id)])), [visible])
  const [dragItems, setDragItems] = useState<Items | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const items = dragItems ?? baseItems
  const dragDisabled = sortMode !== 'manual'
  // Collapsed columns show no cards; dropping on them appends the task.
  const collapsedIds = useMemo(() => {
    const ids = new Set<string>()
    const backlog = columns.find((c) => c.role === 'backlog')
    if (backlog && backlogCollapsed) ids.add(backlog.id)
    for (const column of columns) if (column.role === 'blocked' && column.collapsed) ids.add(column.id)
    return ids
  }, [columns, backlogCollapsed])
  /** Board tracks: "Blockiert" shares the track of "Geplant" and is rendered below it. */
  const tracks = useMemo(() => {
    const blocked = columns.find((c) => c.role === 'blocked')
    const planned = columns.find((c) => c.role === 'planned')
    return columns
      .filter((c) => !(c.role === 'blocked' && planned))
      .map((c) => (c.role === 'planned' && blocked ? [c, blocked] : [c]))
  }, [columns])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const findContainer = useCallback(
    (id: UniqueIdentifier, source: Items): string | undefined => {
      const key = String(id)
      if (key.startsWith(COLUMN_PREFIX)) return key.slice(COLUMN_PREFIX.length)
      return Object.keys(source).find((columnId) => source[columnId]!.includes(key))
    },
    [],
  )

  const onDragStart = ({ active }: DragStartEvent) => {
    setActiveId(String(active.id))
    setDragItems(baseItems)
  }

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over || !dragItems) return
    const from = findContainer(active.id, dragItems)
    const to = findContainer(over.id, dragItems)
    // A collapsed column shows no cards; dropping on it appends (handled in onDragEnd).
    if (!from || !to || from === to || collapsedIds.has(to)) return
    setDragItems((prev) => {
      if (!prev) return prev
      const source = prev[from]!.filter((id) => id !== active.id)
      const target = [...prev[to]!]
      const overIndex = target.indexOf(String(over.id))
      const isBelow =
        over.rect && active.rect.current.translated ? active.rect.current.translated.top > over.rect.top + over.rect.height / 2 : false
      const index = overIndex >= 0 ? overIndex + (isBelow ? 1 : 0) : target.length
      target.splice(index, 0, String(active.id))
      return { ...prev, [from]: source, [to]: target }
    })
  }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const current = dragItems
    setDragItems(null)
    setActiveId(null)
    if (!current || !over) return
    const overId = String(over.id)
    if (overId.startsWith(COLUMN_PREFIX) && collapsedIds.has(overId.slice(COLUMN_PREFIX.length))) {
      const target = overId.slice(COLUMN_PREFIX.length)
      const task = tasksById.get(String(active.id))
      if (task && task.columnId !== target) moveTask(task.id, target, tasksInColumn(tasks, target).length)
      return
    }
    const columnId = findContainer(active.id, current)
    if (!columnId) return
    let list = current[columnId]!
    const overContainer = findContainer(over.id, current)
    if (overContainer === columnId && over.id !== active.id && !String(over.id).startsWith(COLUMN_PREFIX)) {
      list = arrayMove(list, list.indexOf(String(active.id)), list.indexOf(String(over.id)))
    }
    const fullIds = tasksInColumn(tasks, columnId)
      .map((task) => task.id)
      .filter((id) => id !== active.id)
    const index = toFullIndex(fullIds, list, String(active.id))
    const task = tasksById.get(String(active.id))
    if (!task) return
    const unchanged = task.columnId === columnId && tasksInColumn(tasks, columnId).findIndex((x) => x.id === task.id) === index
    if (!unchanged) moveTask(task.id, columnId, index)
  }

  const titleOf = (id: UniqueIdentifier) => tasksById.get(String(id))?.title ?? ''
  const columnNameOf = (id: UniqueIdentifier | undefined) => {
    if (id === undefined) return ''
    const columnId = findContainer(id, items)
    const column = columns.find((c) => c.id === columnId)
    return column ? columnTitle(column, locale) : ''
  }
  const announcements: Announcements = {
    onDragStart: ({ active }) => t('board.dnd.start', { title: titleOf(active.id) }),
    onDragOver: ({ active, over }) => (over ? t('board.dnd.over', { title: titleOf(active.id), column: columnNameOf(over.id) }) : undefined),
    onDragEnd: ({ active, over }) => (over ? t('board.dnd.end', { title: titleOf(active.id), column: columnNameOf(over.id) }) : t('board.dnd.cancel')),
    onDragCancel: () => t('board.dnd.cancel'),
  }

  const activeTask = activeId ? tasksById.get(activeId) : undefined
  const flowLabel = tracks.map((track) => track.map((column) => columnTitle(column, locale)).join(' / ')).join(' → ')
  // Grid tracks: column, arrow, column, … The backlog is set apart by a wider, dashed connector.
  const template = tracks
    .map((track, index) => {
      const previous = tracks[index - 1]?.[0]
      const arrow = previous ? (previous.role === 'backlog' ? 'var(--flow-gap-detached) ' : 'var(--flow-gap) ') : ''
      const collapsedStrip = track.length === 1 && collapsedIds.has(track[0]!.id) && track[0]!.role === 'backlog'
      return arrow + (collapsedStrip ? 'var(--column-collapsed-w)' : 'minmax(var(--column-min-w), 1fr)')
    })
    .join(' ')
  const filtered = isFilterActive(filter)

  return (
    <div className="view view--board">
      <div className="view__header">
        <div className="view__title-row">
          <h1 className="view__title">{board?.name ?? t('board.title')}</h1>
          {board && (
            <button type="button" className="icon-btn" aria-label={t('boards.renameButton', { name: board.name })} onClick={() => setRenaming(true)}>
              <Icon name="edit" />
            </button>
          )}
        </div>
        <div className="toolbar">
          <ResetFilterButton />
          <FilterPopover />
          <label className="select-label">
            <span className="visually-hidden">{t('board.sort')}</span>
            <select className="select" value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)} aria-label={t('board.sort')}>
              {SORT_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {t('board.sort')}: {t(`board.sort.${mode}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      {dragDisabled && <p className="hint">{t('board.sortedHint')}</p>}
      <DndContext
        sensors={sensors}
        collisionDetection={detectCollision}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setDragItems(null)
          setActiveId(null)
        }}
        accessibility={{ announcements, screenReaderInstructions: { draggable: t('board.dragInstructions') } }}
      >
        <div className="board" style={{ gridTemplateColumns: template }} role="group" aria-label={t('board.flow', { flow: flowLabel })}>
          {tracks.map((track, index) => {
            const previous = tracks[index - 1]?.[0]
            const renderColumn = (column: Column) => (
              <BoardColumn
                key={column.id}
                column={column}
                tasks={(items[column.id] ?? []).map((id) => tasksById.get(id)).filter((task): task is Task => !!task)}
                totalCount={totals[column.id] ?? 0}
                dragDisabled={dragDisabled}
                collapsed={collapsedIds.has(column.id)}
                onToggleCollapse={
                  column.role === 'backlog'
                    ? () => updateSettings({ backlogCollapsed: !backlogCollapsed })
                    : column.role === 'blocked'
                      ? () => updateColumn(column.id, { collapsed: !column.collapsed })
                      : undefined
                }
              />
            )
            return (
              <Fragment key={track[0]!.id}>
                {previous && (
                  <FlowArrow
                    detached={previous.role === 'backlog'}
                    branch={
                      track.length > 1
                        ? { collapsed: track.some((c) => collapsedIds.has(c.id)), toward: 'next' }
                        : tracks[index - 1]!.length > 1
                          ? { collapsed: tracks[index - 1]!.some((c) => collapsedIds.has(c.id)), toward: 'previous' }
                          : undefined
                    }
                  />
                )}
                {track.length > 1 ? (
                  <div className={`column-stack${track.some((c) => collapsedIds.has(c.id)) ? ' column-stack--collapsed' : ''}`}>
                    {renderColumn(track[0]!)}
                    {/* Hinted flow from "Geplant" down into "Blockiert". */}
                    <div className="flow-arrow-down" aria-hidden="true">
                      <span className="flow-arrow-down__line" />
                      <Icon name="chevronDown" size={12} />
                    </div>
                    {track.slice(1).map(renderColumn)}
                  </div>
                ) : (
                  renderColumn(track[0]!)
                )}
              </Fragment>
            )
          })}
        </div>
        <DragOverlay dropAnimation={{ duration: 160, easing: 'ease-out' }}>
          {activeTask ? <TaskCard task={activeTask} done={columns.find((c) => c.id === activeTask.columnId)?.role === 'done'} overlay /> : null}
        </DragOverlay>
      </DndContext>
      {filtered && Object.values(visible).every((list) => list.length === 0) && <p className="hint">{t('filter.resultEmpty')}</p>}
      {renaming && board && (
        <NameDialog
          title={t('boards.renameTitle')}
          label={t('boards.name')}
          initialValue={board.name}
          submitLabel={t('common.save')}
          onSubmit={(name) => renameBoard(board.id, name)}
          onClose={() => setRenaming(false)}
        />
      )}
    </div>
  )
}

/**
 * Decorative connector between two tracks. When the next track is the "Geplant/Blockiert" stack,
 * a second, hinted (dashed) arrow leads into "Blockiert"; its cell mirrors the stack's layout so the
 * arrow lines up with the "Blockiert" header in both expanded and collapsed state.
 */
function FlowArrow({ detached, branch }: { detached: boolean; branch?: { collapsed: boolean; toward: 'next' | 'previous' } }) {
  // toward 'next': the stack is on the right (Inbox → Blockiert). 'previous': the stack is on the left (In Arbeit → Blockiert).
  const arrow = (hinted: boolean) => (
    <div
      className={`flow-arrow${detached ? ' flow-arrow--detached' : ''}${hinted ? ' flow-arrow--hinted' : ''}${hinted && branch?.toward === 'previous' ? ' flow-arrow--back' : ''}`}
    >
      <span className="flow-arrow__line" />
      <Icon name="chevronRight" size={14} />
    </div>
  )
  if (!branch) return <div aria-hidden="true">{arrow(false)}</div>
  return (
    <div className={`flow-arrow-cell${branch.collapsed ? ' flow-arrow-cell--collapsed' : ''}`} aria-hidden="true">
      <div className="flow-arrow-cell__top">{arrow(false)}</div>
      <div className="flow-arrow-cell__bottom">{arrow(true)}</div>
    </div>
  )
}
