import { CARD_COLORS, type CardColor, type Task } from '@/features/tasks/models/schemas'
import { columnTitle, useAppStore } from '@/state/appStore'
import { Menu, type MenuEntry } from '@/shared/components/Menu'
import { Icon } from '@/shared/components/Icon'
import { useT } from '@/shared/hooks/useT'
import { colorDescription } from '@/features/tasks/services/colorLabels'

/** "⋯" menu on cards and rows: move without drag-and-drop, start, duplicate, archive, delete. */
export function TaskActionsMenu({ task }: { task: Task }) {
  const t = useT()
  const locale = useAppStore((s) => s.settings.locale)
  const columns = useAppStore((s) => s.columns)
  const settings = useAppStore((s) => s.settings)
  const store = useAppStore.getState
  const boardColumns = columns.filter((c) => c.boardId === task.boardId).sort((a, b) => a.position - b.position)
  const current = boardColumns.find((c) => c.id === task.columnId)
  const title = task.title || t('task.untitled')

  const entries: MenuEntry[] = []
  if (task.archivedAt) {
    entries.push({ type: 'item', label: t('task.restore'), icon: <Icon name="restore" />, onSelect: () => store().restoreTask(task.id) })
    entries.push({ type: 'item', label: t('task.reuse'), icon: <Icon name="copy" />, onSelect: () => openCopy(task.id) })
  } else {
    entries.push({ type: 'label', label: t('task.moveTo') })
    for (const column of boardColumns) {
      if (column.id === task.columnId) continue
      const name = columnTitle(column, locale)
      entries.push({ type: 'item', label: name, ariaLabel: `${t('task.moveTo')} ${name}`, onSelect: () => store().moveToColumn(task.id, column.id) })
    }
    entries.push({ type: 'separator' })
    entries.push({ type: 'label', label: t('color.label') })
    entries.push({
      type: 'swatches',
      label: t('color.label'),
      options: [
        { value: 'none', label: t('color.none'), className: 'swatch--none', checked: !task.color },
        ...CARD_COLORS.map((color) => ({ value: color, label: t('color.set', { color: colorDescription(color, settings, t) }), className: `color-${color}`, checked: task.color === color })),
      ],
      onSelect: (value) => store().updateTask(task.id, { color: value === 'none' ? undefined : (value as CardColor) }),
    })
    entries.push({ type: 'separator' })
    entries.push({
      type: 'item',
      label: current?.role === 'done' ? t('task.reuse') : t('task.duplicate'),
      icon: <Icon name="copy" />,
      onSelect: () => openCopy(task.id),
    })
    entries.push({ type: 'item', label: t('task.archive'), icon: <Icon name="archive" />, onSelect: () => store().archiveTask(task.id) })
  }
  entries.push({ type: 'item', label: t('task.delete'), icon: <Icon name="trash" />, danger: true, onSelect: () => store().deleteTask(task.id) })

  return <Menu label={t('task.actions', { title })} entries={entries} trigger={<Icon name="more" />} triggerClassName="icon-btn task-menu-btn" />
}

/** Duplicates and opens the copy so it can be adjusted right away. */
function openCopy(taskId: string) {
  const copy = useAppStore.getState().duplicateTask(taskId)
  if (copy) useAppStore.getState().openDrawer(copy.id)
}
