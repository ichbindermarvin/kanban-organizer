import { useMemo, useState } from 'react'
import { MAX_BOARDS } from '@/features/board/services/defaults'
import type { Board } from '@/features/tasks/models/schemas'
import { useAppStore } from '@/state/appStore'
import { useT } from '@/shared/hooks/useT'
import { Icon } from '@/shared/components/Icon'
import { Menu } from '@/shared/components/Menu'
import { NameDialog } from '@/shared/components/NameDialog'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'

type DialogState = { kind: 'create' } | { kind: 'rename'; board: Board } | { kind: 'delete'; board: Board } | undefined

export function SidebarBoards() {
  const t = useT()
  const allBoards = useAppStore((s) => s.boards)
  const tasks = useAppStore((s) => s.tasks)
  const view = useAppStore((s) => s.view)
  const activeId = useAppStore((s) => s.activeBoardId())
  const { setActiveBoard, createBoard, renameBoard, deleteBoard } = useAppStore.getState()
  const [dialog, setDialog] = useState<DialogState>()
  const boards = useMemo(() => allBoards.filter((b) => !b.archivedAt).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [allBoards])
  const limitReached = boards.length >= MAX_BOARDS
  const taskCount = (boardId: string) => tasks.filter((task) => task.boardId === boardId && !task.deletedAt).length

  return (
    <>
      <p className="nav__heading" id="nav-boards">
        {t('boards.heading')}
      </p>
      <ul className="nav" aria-labelledby="nav-boards">
        {boards.map((board) => {
          const current = view === 'board' && board.id === activeId
          return (
            <li key={board.id} className="nav__board">
              <a
                href="#/board"
                className={`nav__item${current ? ' nav__item--active' : ''}`}
                aria-current={current ? 'page' : undefined}
                onClick={(e) => {
                  e.preventDefault()
                  setActiveBoard(board.id)
                }}
              >
                <Icon name="board" />
                <span className="nav__label">{board.name}</span>
              </a>
              <Menu
                label={t('boards.actions', { name: board.name })}
                trigger={<Icon name="more" />}
                triggerClassName="icon-btn icon-btn--sm nav__board-menu"
                entries={[
                  { type: 'item', label: t('boards.rename'), onSelect: () => setDialog({ kind: 'rename', board }) },
                  {
                    type: 'item',
                    label: t('boards.delete'),
                    icon: <Icon name="trash" />,
                    danger: true,
                    disabled: boards.length <= 1,
                    onSelect: () => setDialog({ kind: 'delete', board }),
                  },
                ]}
              />
            </li>
          )
        })}
        <li>
          <button
            type="button"
            className="nav__item nav__item--button nav__item--add"
            disabled={limitReached}
            title={limitReached ? t('boards.limit', { max: MAX_BOARDS }) : undefined}
            onClick={() => setDialog({ kind: 'create' })}
          >
            <Icon name="plus" />
            <span className="nav__label">{t('boards.new')}</span>
            {limitReached && <span className="visually-hidden">({t('boards.limit', { max: MAX_BOARDS })})</span>}
          </button>
        </li>
      </ul>

      {dialog?.kind === 'create' && (
        <NameDialog
          title={t('boards.newTitle')}
          label={t('boards.name')}
          placeholder={t('boards.namePlaceholder')}
          submitLabel={t('boards.create')}
          onSubmit={(name) => createBoard(name)}
          onClose={() => setDialog(undefined)}
        />
      )}
      {dialog?.kind === 'rename' && (
        <NameDialog
          title={t('boards.renameTitle')}
          label={t('boards.name')}
          initialValue={dialog.board.name}
          submitLabel={t('common.save')}
          onSubmit={(name) => renameBoard(dialog.board.id, name)}
          onClose={() => setDialog(undefined)}
        />
      )}
      {dialog?.kind === 'delete' && (
        <ConfirmDialog
          title={t('boards.deleteTitle')}
          message={t('boards.deleteMessage', { name: dialog.board.name, count: taskCount(dialog.board.id) })}
          confirmLabel={t('boards.delete')}
          tone="danger"
          onConfirm={() => {
            deleteBoard(dialog.board.id)
            setDialog(undefined)
          }}
          onCancel={() => setDialog(undefined)}
        />
      )}
    </>
  )
}
