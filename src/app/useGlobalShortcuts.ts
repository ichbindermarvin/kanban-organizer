import { useEffect } from 'react'
import { useAppStore } from '@/state/appStore'
import { focusSearch } from './focusSearch'

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag === 'INPUT') {
    const type = (target as HTMLInputElement).type
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'range', 'color'].includes(type)
  }
  return false
}

function focusedTaskId(): string | undefined {
  const element = document.activeElement?.closest<HTMLElement>('[data-task-id]')
  return element?.dataset.taskId
}

/** Single-key shortcuts. Ignored while typing in a field or while a modal dialog is open. */
export function useGlobalShortcuts() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const store = useAppStore.getState()
      if (store.status !== 'ready') return
      const modalOpen = !!document.querySelector('[aria-modal="true"]')

      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') {
        if (modalOpen && !store.paletteOpen) return
        event.preventDefault()
        store.setPaletteOpen(!store.paletteOpen)
        return
      }
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return
      if (modalOpen || isTypingTarget(event.target)) return
      if (document.querySelector('[role="menu"]')) return

      const taskId = focusedTaskId()
      const key = event.key
      switch (key) {
        case 'n':
        case 'N':
          event.preventDefault()
          store.openQuickCapture()
          break
        case '/':
          event.preventDefault()
          focusSearch()
          break
        case '?':
          event.preventDefault()
          store.setHelpOpen(true)
          break
        case 'e':
        case 'E':
          if (taskId) {
            event.preventDefault()
            store.openDrawer(taskId)
          }
          break
        case 'x':
        case 'X':
          if (taskId) {
            event.preventDefault()
            store.toggleComplete(taskId)
          }
          break
        case 'd':
        case 'D':
          if (taskId) {
            event.preventDefault()
            const copy = store.duplicateTask(taskId)
            if (copy) store.openDrawer(copy.id)
          }
          break
        case '1':
          store.setView('today')
          break
        case '2':
          store.setView('board')
          break
        case 'Escape':
          if (store.searchQuery) store.clearSearch()
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
