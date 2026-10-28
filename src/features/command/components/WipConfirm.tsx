import { columnTitle, useAppStore } from '@/state/appStore'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { useT } from '@/shared/hooks/useT'

export function WipConfirm() {
  const t = useT()
  const pending = useAppStore((s) => s.pendingMove)
  const column = useAppStore((s) => s.columns.find((c) => c.id === s.pendingMove?.toColumnId))
  const locale = useAppStore((s) => s.settings.locale)
  const { confirmPendingMove, cancelPendingMove } = useAppStore.getState()
  if (!pending || !column) return null
  return (
    <ConfirmDialog
      title={t('wip.title')}
      message={t('wip.message', { limit: column.wipLimit ?? 0, column: columnTitle(column, locale) })}
      confirmLabel={t('wip.confirm')}
      onConfirm={confirmPendingMove}
      onCancel={cancelPendingMove}
    />
  )
}
