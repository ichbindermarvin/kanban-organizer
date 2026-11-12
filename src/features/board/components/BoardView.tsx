import { Fragment, useCallback, useMemo, useState } from 'react'
import { NameDialog } from '@/shared/components/NameDialog'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { Menu, type MenuEntry } from '@/shared/components/Menu'
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
import type { Area, Column, Task } from '@/features/tasks/models/schemas'
import { columnTitle, useAppStore } from '@/state/appStore'
import { filterTasks, isFilterActive, sortTasks, type SortMode } from '@/features/filters/services/filterTasks'
import { tasksInColumn } from '@/features/tasks/services/taskQueries'
import { FilterPopover, ResetFilterButton } from '@/features/filters/components/FilterPopover'
import { TaskCard } from '@/features/tasks/components/TaskCard'
import { useT } from '@/shared/hooks/useT'
import { Icon } from '@/shared/components/Icon'
import { BoardColumn, COLUMN_PREFIX, CollapsedColumn, GroupColumn, type CollapseProps } from './BoardColumn'
import { ColumnDialog } from './ColumnDialog'
import { buildLayout, leafColumnsInOrder, type AreaLayout, type Slot, type Track } from '../services/layout'
import type { LayoutResult } from '@/state/appStore'
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

type DialogState =
  | { kind: 'edit'; column: Column }
  | { kind: 'delete'; column: Column }
  | { kind: 'renameBoard' }
  | { kind: 'newArea' }
  | { kind: 'renameArea'; area: Area }
  | { kind: 'deleteArea'; area: Area }
  | undefined

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
  const board = useAppStore((s) => s.boards.find((b) => b.id === boardId))
  const backlogDefault = useAppStore((s) => s.settings.backlogCollapsed) ?? window.innerWidth < 1400
  const store = useAppStore.getState
  const [dialog, setDialog] = useState<DialogState>()

  const rows = useMemo(() => (board ? buildLayout(board, allColumns) : []), [board, allColumns])
  const leaves = useMemo(() => leafColumnsInOrder(board, allColumns), [board, allColumns])
  const areaCount = rows.reduce((sum, row) => sum + row.areas.length, 0)
  const tasksById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks])
  const { visible, totals } = useMemo(() => {
    const visible: Record<string, Task[]> = {}
    const totals: Record<string, number> = {}
    for (const column of leaves) {
      const all = tasksInColumn(tasks, column.id)
      totals[column.id] = all.length
      visible[column.id] = sortTasks(filterTasks(all, filter, today), sortMode)
    }
    return { visible, totals }
  }, [leaves, tasks, filter, today, sortMode])

  // Until the user decides, the backlog starts collapsed on smaller screens.
  const isCollapsed = useCallback((column: Column) => column.collapsed ?? (column.role === 'backlog' ? backlogDefault : false), [backlogDefault])
  // Leaf columns whose cards are not rendered (collapsed column, collapsed group or collapsed area).
  const collapsedIds = useMemo(() => {
    const ids = new Set<string>()
    for (const row of rows)
      for (const { area, tracks } of row.areas)
        for (const track of tracks)
          for (const slot of track.slots) {
            const hidden = area.collapsed || isCollapsed(slot.column)
            if (!hidden) continue
            if (slot.children.length) slot.children.forEach((c) => ids.add(c.id))
            else ids.add(slot.column.id)
          }
    return ids
  }, [rows, isCollapsed])

  const baseItems = useMemo<Items>(() => Object.fromEntries(Object.entries(visible).map(([id, list]) => [id, list.map((task) => task.id)])), [visible])
  const [dragItems, setDragItems] = useState<Items | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const items = dragItems ?? baseItems
  const dragDisabled = sortMode !== 'manual'

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const findContainer = useCallback((id: UniqueIdentifier, source: Items): string | undefined => {
    const key = String(id)
    if (key.startsWith(COLUMN_PREFIX)) return key.slice(COLUMN_PREFIX.length)
    return Object.keys(source).find((columnId) => source[columnId]!.includes(key))
  }, [])

  const onDragStart = ({ active }: DragStartEvent) => {
    setActiveId(String(active.id))
    setDragItems(baseItems)
  }

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over || !dragItems) return
    const from = findContainer(active.id, dragItems)
    const to = findContainer(over.id, dragItems)
    // A collapsed column shows no cards; dropping on it appends (handled in onDragEnd).
    if (!from || !to || from === to || collapsedIds.has(to) || !(to in dragItems)) return
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
      if (task && task.columnId !== target) store().moveTask(task.id, target, tasksInColumn(tasks, target).length)
      return
    }
    const columnId = findContainer(active.id, current)
    if (!columnId) return
    let list = current[columnId]!
    const overContainer = findContainer(over.id, current)
    if (overContainer === columnId && over.id !== active.id && !overId.startsWith(COLUMN_PREFIX)) {
      list = arrayMove(list, list.indexOf(String(active.id)), list.indexOf(overId))
    }
    const fullIds = tasksInColumn(tasks, columnId)
      .map((task) => task.id)
      .filter((id) => id !== active.id)
    const index = toFullIndex(fullIds, list, String(active.id))
    const task = tasksById.get(String(active.id))
    if (!task) return
    const unchanged = task.columnId === columnId && tasksInColumn(tasks, columnId).findIndex((x) => x.id === task.id) === index
    if (!unchanged) store().moveTask(task.id, columnId, index)
  }

  const titleOf = (id: UniqueIdentifier) => tasksById.get(String(id))?.title ?? ''
  const columnNameOf = (id: UniqueIdentifier | undefined) => {
    if (id === undefined) return ''
    const columnId = findContainer(id, items)
    const column = allColumns.find((c) => c.id === columnId)
    return column ? columnTitle(column, locale) : ''
  }
  const announcements: Announcements = {
    onDragStart: ({ active }) => t('board.dnd.start', { title: titleOf(active.id) }),
    onDragOver: ({ active, over }) => (over ? t('board.dnd.over', { title: titleOf(active.id), column: columnNameOf(over.id) }) : undefined),
    onDragEnd: ({ active, over }) => (over ? t('board.dnd.end', { title: titleOf(active.id), column: columnNameOf(over.id) }) : t('board.dnd.cancel')),
    onDragCancel: () => t('board.dnd.cancel'),
  }

  /* ───── Layout editing ───── */

  const report = (result: LayoutResult) => {
    if (!result.ok) store().showToast({ message: t(`layout.error.${result.reason}`), tone: 'error' })
  }
  const insert = (column: Column, where: 'left' | 'right' | 'below') => {
    const created = store().insertColumn(column.id, where)
    if (created) setDialog({ kind: 'edit', column: created })
  }
  const toggle = (column: Column) => store().updateColumn(column.id, { collapsed: !isCollapsed(column) })

  const archiveEntries = (column: Column): MenuEntry[] =>
    column.role === 'done'
      ? [
          { type: 'separator' },
          { type: 'item', label: t('column.archiveDone'), icon: <Icon name="archive" />, onSelect: () => store().archiveDone() },
          { type: 'item', label: t('column.archiveOld'), icon: <Icon name="archive" />, onSelect: () => store().archiveDone(30) },
        ]
      : []

  const otherAreas = (areaId: string | undefined) => (board?.areas ?? []).filter((a) => a.id !== areaId).sort((a, b) => a.row - b.row || a.position - b.position)

  const slotMenu = (slot: Slot, track: Track, slotIndex: number, trackIndex: number, trackCount: number): MenuEntry[] => {
    const column = slot.column
    const group = column.kind === 'group'
    return [
      { type: 'item', label: t('column.edit'), icon: <Icon name="edit" />, onSelect: () => setDialog({ kind: 'edit', column }) },
      { type: 'separator' },
      { type: 'item', label: t('column.insertLeft'), onSelect: () => insert(column, 'left') },
      { type: 'item', label: t('column.insertRight'), onSelect: () => insert(column, 'right') },
      { type: 'item', label: t('column.insertBelow'), onSelect: () => insert(column, 'below') },
      { type: 'separator' },
      { type: 'item', label: t('column.moveLeft'), disabled: trackIndex === 0, onSelect: () => store().moveColumn(column.id, 'left') },
      { type: 'item', label: t('column.moveRight'), disabled: trackIndex === trackCount - 1, onSelect: () => store().moveColumn(column.id, 'right') },
      { type: 'item', label: t('column.moveUp'), disabled: slotIndex === 0, onSelect: () => store().moveColumn(column.id, 'up') },
      { type: 'item', label: t('column.moveDown'), disabled: slotIndex === track.slots.length - 1, onSelect: () => store().moveColumn(column.id, 'down') },
      { type: 'item', label: t('column.moveToNewArea'), onSelect: () => store().moveColumnToNewArea(column.id) },
      ...otherAreas(column.areaId).map<MenuEntry>((area) => ({
        type: 'item',
        label: t('column.moveToArea', { name: area.title || t('area.main') }),
        onSelect: () => store().moveColumnToArea(column.id, area.id),
      })),
      { type: 'separator' },
      group
        ? { type: 'item', label: t('column.unsplit'), onSelect: () => store().unsplitColumn(column.id) }
        : { type: 'item', label: t('column.split'), onSelect: () => store().splitColumn(column.id) },
      { type: 'item', label: isCollapsed(column) ? t('column.expandItem') : t('column.collapseItem'), onSelect: () => toggle(column) },
      ...archiveEntries(column),
      { type: 'separator' },
      { type: 'item', label: t('column.delete'), icon: <Icon name="trash" />, danger: true, onSelect: () => setDialog({ kind: 'delete', column }) },
    ]
  }

  const childMenu = (child: Column, index: number, count: number): MenuEntry[] => [
    { type: 'item', label: t('column.edit'), icon: <Icon name="edit" />, onSelect: () => setDialog({ kind: 'edit', column: child }) },
    { type: 'separator' },
    { type: 'item', label: t('column.insertSubLeft'), onSelect: () => insert(child, 'left') },
    { type: 'item', label: t('column.insertSubRight'), onSelect: () => insert(child, 'right') },
    { type: 'item', label: t('column.moveLeft'), disabled: index === 0, onSelect: () => store().moveColumn(child.id, 'left') },
    { type: 'item', label: t('column.moveRight'), disabled: index === count - 1, onSelect: () => store().moveColumn(child.id, 'right') },
    ...archiveEntries(child),
    { type: 'separator' },
    { type: 'item', label: t('column.delete'), icon: <Icon name="trash" />, danger: true, onSelect: () => setDialog({ kind: 'delete', column: child }) },
  ]

  const columnProps = (column: Column) => ({
    column,
    tasks: (items[column.id] ?? []).map((id) => tasksById.get(id)).filter((task): task is Task => !!task),
    totalCount: totals[column.id] ?? 0,
    dragDisabled,
  })

  const renderSlot = (slot: Slot, track: Track, slotIndex: number, trackIndex: number, trackCount: number) => {
    const column = slot.column
    const stacked = track.slots.length > 1
    const collapse: CollapseProps = {
      collapsed: isCollapsed(column),
      collapseStyle: stacked ? 'bar' : 'strip',
      // Stacked columns, the backlog and "Erledigt" show their collapse button permanently.
      showToggle: stacked || column.role === 'backlog' || column.role === 'done',
      foldsRight: !stacked && trackCount > 1 && trackIndex === trackCount - 1,
      onToggleCollapse: () => toggle(column),
    }
    const menu = slotMenu(slot, track, slotIndex, trackIndex, trackCount)
    const total = slot.children.length ? slot.children.reduce((sum, c) => sum + (totals[c.id] ?? 0), 0) : (totals[column.id] ?? 0)
    if (collapse.collapsed)
      return <CollapsedColumn key={column.id} column={column} dropId={slot.children[0]?.id ?? column.id} totalCount={total} menuEntries={menu} {...collapse} />
    if (column.kind === 'group')
      return (
        <GroupColumn key={column.id} group={column} totalCount={total} menuEntries={menu} collapse={collapse}>
          {slot.children.map((child, index) => (
            <BoardColumn key={child.id} {...columnProps(child)} sub menuEntries={childMenu(child, index, slot.children.length)} />
          ))}
        </GroupColumn>
      )
    return <BoardColumn key={column.id} {...columnProps(column)} menuEntries={menu} collapse={collapse} />
  }

  const renderArea = ({ area, tracks }: AreaLayout) => {
    const showHeader = areaCount > 1 || !!area.title
    const areaName = area.title || t('area.main')
    const flowLabel = tracks
      .map((track) => track.slots.map((slot) => columnTitle(slot.column, locale)).join(' / '))
      .join(' → ')
    // Grid tracks: column, arrow, column, … The backlog is set apart by a wider, dashed connector.
    const template = tracks
      .map((track, index) => {
        const previous = tracks[index - 1]?.slots[0]?.column
        const arrow = previous ? (previous.role === 'backlog' ? 'var(--flow-gap-detached) ' : 'var(--flow-gap) ') : ''
        const strip = track.slots.length === 1 && isCollapsed(track.slots[0]!.column)
        const weight = Math.max(1, ...track.slots.map((s) => (isCollapsed(s.column) ? 1 : s.children.length)))
        const width = strip ? 'var(--column-collapsed-w)' : weight > 1 ? `minmax(calc(var(--column-min-w) * ${weight * 0.75}), ${weight}fr)` : 'minmax(var(--column-min-w), 1fr)'
        return arrow + width
      })
      .join(' ')
    const areaMenu: MenuEntry[] = [
      { type: 'item', label: t('area.rename'), icon: <Icon name="edit" />, onSelect: () => setDialog({ kind: 'renameArea', area }) },
      { type: 'item', label: t('area.addColumn'), icon: <Icon name="plus" />, onSelect: () => openNewColumn(area.id) },
      { type: 'label', label: t('area.size') },
      ...([1, 2, 3] as const).map<MenuEntry>((size) => ({
        type: 'item',
        label: t(`area.size${size}`),
        ariaLabel: `${t('area.size')}: ${t(`area.size${size}`)}`,
        icon: (area.size ?? 2) === size ? <Icon name="check" /> : undefined,
        onSelect: () => store().updateArea(area.id, { size }),
      })),
      { type: 'separator' },
      { type: 'item', label: t('area.moveUp'), onSelect: () => store().moveArea(area.id, 'up') },
      { type: 'item', label: t('area.moveDown'), onSelect: () => store().moveArea(area.id, 'down') },
      { type: 'item', label: t('area.beside'), onSelect: () => store().moveArea(area.id, 'beside') },
      { type: 'separator' },
      { type: 'item', label: t('area.delete'), icon: <Icon name="trash" />, danger: true, onSelect: () => setDialog({ kind: 'deleteArea', area }) },
    ]
    return (
      <section key={area.id} className={`area${area.collapsed ? ' area--collapsed' : ''}`} aria-label={showHeader ? areaName : undefined} style={{ flex: `${Math.max(1, tracks.length)} 1 0` }}>
        {showHeader && (
          <header className="area__header">
            <button
              type="button"
              className="icon-btn icon-btn--sm"
              aria-expanded={!area.collapsed}
              aria-label={area.collapsed ? t('area.expand', { name: areaName }) : t('area.collapse', { name: areaName })}
              onClick={() => store().updateArea(area.id, { collapsed: !area.collapsed })}
            >
              <Icon name={area.collapsed ? 'chevronRight' : 'chevronDown'} size={14} />
            </button>
            <h2 className="area__title">{areaName}</h2>
            <Menu label={t('area.menu', { name: areaName })} trigger={<Icon name="more" />} triggerClassName="icon-btn icon-btn--sm area__menu" entries={areaMenu} />
          </header>
        )}
        {!area.collapsed &&
          (tracks.length === 0 ? (
            <div className="area__empty">
              <p className="muted">{t('area.empty')}</p>
              <button type="button" className="btn btn--small" onClick={() => openNewColumn(area.id)}>
                <Icon name="plus" />
                {t('area.addColumn')}
              </button>
            </div>
          ) : (
            <div className="board" style={{ gridTemplateColumns: template }} role="group" aria-label={t('board.flow', { flow: flowLabel })}>
              {tracks.map((track, index) => (
                <Fragment key={track.slots[0]!.column.id}>
                  {index > 0 && <FlowArrowCell previous={tracks[index - 1]!} next={track} isCollapsed={isCollapsed} />}
                  {track.slots.length === 1 ? (
                    renderSlot(track.slots[0]!, track, 0, index, tracks.length)
                  ) : (
                    <div className="column-stack">
                      {track.slots.map((slot, slotIndex) => (
                        <Fragment key={slot.column.id}>
                          {/* Hinted flow from the column above into the stacked one. */}
                          {slotIndex > 0 && (
                            <div className="flow-arrow-down" aria-hidden="true">
                              <span className="flow-arrow-down__line" />
                              <Icon name="chevronDown" size={12} />
                            </div>
                          )}
                          {renderSlot(slot, track, slotIndex, index, tracks.length)}
                        </Fragment>
                      ))}
                    </div>
                  )}
                </Fragment>
              ))}
            </div>
          ))}
      </section>
    )
  }

  const openNewColumn = (areaId: string) => {
    const created = store().addColumnToArea(areaId)
    if (created) setDialog({ kind: 'edit', column: created })
  }

  const activeTask = activeId ? tasksById.get(activeId) : undefined
  const activeRole = activeTask ? allColumns.find((c) => c.id === activeTask.columnId)?.role : undefined
  const filtered = isFilterActive(filter)
  const firstArea = rows[0]?.areas[0]?.area

  const deletingColumn = dialog?.kind === 'delete' ? dialog.column : undefined
  const deletingIds = deletingColumn ? new Set([deletingColumn.id, ...allColumns.filter((c) => c.parentId === deletingColumn.id).map((c) => c.id)]) : undefined
  const deletingArea = dialog?.kind === 'deleteArea' ? dialog.area : undefined
  const areaColumnIds = deletingArea
    ? new Set(allColumns.filter((c) => c.areaId === deletingArea.id || allColumns.some((g) => g.id === c.parentId && g.areaId === deletingArea.id)).map((c) => c.id))
    : undefined
  const moveTarget = (excluded: Set<string>) =>
    leaves.find((c) => c.role === 'inbox' && !excluded.has(c.id)) ?? leaves.find((c) => !excluded.has(c.id))
  const countIn = (ids: Set<string>) => tasks.filter((task) => ids.has(task.columnId) && !task.deletedAt).length

  return (
    <div className="view view--board">
      <div className="view__header">
        <div className="view__title-row">
          <h1 className="view__title">{board?.name ?? t('board.title')}</h1>
          {board && (
            <button type="button" className="icon-btn" aria-label={t('boards.renameButton', { name: board.name })} onClick={() => setDialog({ kind: 'renameBoard' })}>
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
          <Menu
            label={t('layout.customize')}
            trigger={<Icon name="settings" />}
            triggerClassName="icon-btn"
            entries={[
              { type: 'item', label: t('layout.addColumn'), icon: <Icon name="plus" />, disabled: !firstArea, onSelect: () => firstArea && openNewColumn(firstArea.id) },
              { type: 'item', label: t('layout.addArea'), icon: <Icon name="board" />, onSelect: () => setDialog({ kind: 'newArea' }) },
            ]}
          />
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
        <div className="board-areas">
          {rows.map((row, index) => {
            const expanded = row.areas.filter((a) => !a.area.collapsed)
            const weight = expanded.length ? Math.max(...expanded.map((a) => a.area.size ?? 2)) : 0
            return (
              <div key={row.areas[0]?.area.id ?? index} className="area-row" style={{ flex: weight ? `${weight} 1 0` : '0 0 auto' }}>
                {row.areas.map(renderArea)}
              </div>
            )
          })}
        </div>
        <DragOverlay dropAnimation={{ duration: 160, easing: 'ease-out' }}>
          {activeTask ? <TaskCard task={activeTask} done={activeRole === 'done'} blocked={activeRole === 'blocked'} overlay /> : null}
        </DragOverlay>
      </DndContext>
      {filtered && Object.values(visible).every((list) => list.length === 0) && <p className="hint">{t('filter.resultEmpty')}</p>}

      {dialog?.kind === 'edit' && <ColumnDialog column={allColumns.find((c) => c.id === dialog.column.id) ?? dialog.column} onClose={() => setDialog(undefined)} />}
      {deletingColumn && deletingIds && (
        <ConfirmDialog
          title={t('column.deleteTitle')}
          message={
            countIn(deletingIds)
              ? t('column.deleteMessage', {
                  name: columnTitle(deletingColumn, locale),
                  count: countIn(deletingIds),
                  target: moveTarget(deletingIds) ? columnTitle(moveTarget(deletingIds)!, locale) : '',
                })
              : t('column.deleteEmpty', { name: columnTitle(deletingColumn, locale) })
          }
          confirmLabel={t('column.delete')}
          tone="danger"
          onConfirm={() => {
            report(store().removeColumn(deletingColumn.id))
            setDialog(undefined)
          }}
          onCancel={() => setDialog(undefined)}
        />
      )}
      {dialog?.kind === 'renameBoard' && board && (
        <NameDialog
          title={t('boards.renameTitle')}
          label={t('boards.name')}
          initialValue={board.name}
          submitLabel={t('common.save')}
          onSubmit={(name) => store().renameBoard(board.id, name)}
          onClose={() => setDialog(undefined)}
        />
      )}
      {dialog?.kind === 'newArea' && (
        <NameDialog
          title={t('layout.areaNewTitle')}
          label={t('layout.areaName')}
          placeholder={t('layout.areaPlaceholder')}
          submitLabel={t('boards.create')}
          onSubmit={(name) => store().addArea(name)}
          onClose={() => setDialog(undefined)}
        />
      )}
      {dialog?.kind === 'renameArea' && (
        <NameDialog
          title={t('area.rename')}
          label={t('layout.areaName')}
          initialValue={dialog.area.title}
          placeholder={t('area.main')}
          allowEmpty
          submitLabel={t('common.save')}
          onSubmit={(title) => store().updateArea(dialog.area.id, { title })}
          onClose={() => setDialog(undefined)}
        />
      )}
      {deletingArea && areaColumnIds && (
        <ConfirmDialog
          title={t('area.deleteTitle')}
          message={t('area.deleteMessage', {
            name: deletingArea.title || t('area.main'),
            count: countIn(areaColumnIds),
            target: moveTarget(areaColumnIds) ? columnTitle(moveTarget(areaColumnIds)!, locale) : '',
          })}
          confirmLabel={t('area.delete')}
          tone="danger"
          onConfirm={() => {
            report(store().removeArea(deletingArea.id))
            setDialog(undefined)
          }}
          onCancel={() => setDialog(undefined)}
        />
      )}
    </div>
  )
}

/**
 * Decorative connector between two tracks. Next to a stack, the cell mirrors the stack's layout:
 * the top row gets the regular arrow, the stacked columns get hinted (dashed) arrows – from the
 * left into the stack, or pointing back from the right (but never from a "Erledigt" column).
 */
function FlowArrowCell({ previous, next, isCollapsed }: { previous: Track; next: Track; isCollapsed: (column: Column) => boolean }) {
  const detached = previous.slots[0]!.column.role === 'backlog'
  const nextTop = next.slots[0]!.column
  const mirror =
    next.slots.length > 1
      ? { slots: next.slots, toward: 'next' as const }
      : previous.slots.length > 1 && nextTop.role !== 'done'
        ? { slots: previous.slots, toward: 'previous' as const }
        : undefined
  const arrow = (hinted: boolean, back: boolean) => (
    <div className={`flow-arrow${detached && !hinted ? ' flow-arrow--detached' : ''}${hinted ? ' flow-arrow--hinted' : ''}${back ? ' flow-arrow--back' : ''}`}>
      <span className="flow-arrow__line" />
      <Icon name="chevronRight" size={14} />
    </div>
  )
  if (!mirror) return <div aria-hidden="true">{arrow(false, false)}</div>
  return (
    <div className="flow-arrow-cell" aria-hidden="true">
      {mirror.slots.map((slot, index) => (
        <Fragment key={slot.column.id}>
          {index > 0 && <div className="flow-arrow-cell__gap" />}
          <div className={`flow-arrow-cell__row${isCollapsed(slot.column) ? ' flow-arrow-cell__row--bar' : ''}`}>
            {arrow(index > 0, index > 0 && mirror.toward === 'previous')}
          </div>
        </Fragment>
      ))}
    </div>
  )
}
