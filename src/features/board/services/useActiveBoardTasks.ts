import { useMemo } from 'react'
import { useAppStore } from '@/state/appStore'

/** Tasks of all boards that are not deleted. Today and the smart views span every board. */
export function useActiveBoardTasks() {
  const tasks = useAppStore((s) => s.tasks)
  const boards = useAppStore((s) => s.boards)
  return useMemo(() => {
    const ids = new Set(boards.filter((b) => !b.archivedAt).map((b) => b.id))
    return tasks.filter((task) => ids.has(task.boardId))
  }, [tasks, boards])
}
