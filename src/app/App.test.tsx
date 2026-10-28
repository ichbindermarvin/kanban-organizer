import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from './App'
import { useAppStore } from '@/state/appStore'
import { createDexieRepositories, openDatabase } from '@/db/repositories/dexieRepositories'

let counter = 0

async function renderApp() {
  window.history.replaceState(null, '', '/')
  const db = await openDatabase(`ui-test-${++counter}`)
  useAppStore.setState({ view: 'today', drawerTaskId: undefined, quickCapture: { open: false, role: 'inbox' }, toasts: [], searchQuery: '' })
  await act(async () => {
    await useAppStore.getState().init(createDexieRepositories(db))
  })
  const user = userEvent.setup()
  render(<App />)
  return { user }
}

describe('App (React Testing Library)', () => {
  it('starts with the Today view', async () => {
    await renderApp()
    expect(screen.getByRole('heading', { level: 1, name: 'Heute' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Hauptnavigation' })).toBeInTheDocument()
  })

  it('quick capture: N opens the dialog, Enter saves to the Inbox', async () => {
    const { user } = await renderApp()
    await user.keyboard('n')
    const dialog = screen.getByRole('dialog', { name: 'Neue Aufgabe' })
    expect(within(dialog).getByRole('radio', { name: 'Inbox' })).toHaveAttribute('aria-checked', 'true')
    await user.keyboard('Versicherung prüfen{Enter}')
    expect(screen.queryByRole('dialog', { name: 'Neue Aufgabe' })).not.toBeInTheDocument()
    const task = useAppStore.getState().tasks[0]!
    expect(task.title).toBe('Versicherung prüfen')
    expect(useAppStore.getState().columns.find((c) => c.id === task.columnId)!.role).toBe('inbox')
  })

  it('does not trigger shortcuts while typing in an input', async () => {
    const { user } = await renderApp()
    await user.click(screen.getByRole('searchbox', { name: 'Aufgaben durchsuchen' }))
    await user.keyboard('n')
    expect(screen.queryByRole('dialog', { name: 'Neue Aufgabe' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Suche' })).toBeInTheDocument()
  })

  it('Escape closes the task drawer and keeps edits', async () => {
    const { user } = await renderApp()
    const inbox = useAppStore.getState().columns.find((c) => c.role === 'inbox')!
    act(() => {
      useAppStore.getState().addTask('Steuer', inbox.id)
      useAppStore.getState().setView('board')
    })
    await user.click(screen.getByRole('button', { name: 'Steuer' }))
    const drawer = screen.getByRole('dialog', { name: 'Aufgabendetails' })
    await user.click(within(drawer).getByRole('radio', { name: 'Dringend' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Aufgabendetails' })).not.toBeInTheDocument()
    expect(useAppStore.getState().tasks[0]!.priority).toBe('urgent')
  })

  it('switches the UI language to English', async () => {
    await renderApp()
    act(() => useAppStore.getState().updateSettings({ locale: 'en' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Today' })).toBeInTheDocument()
    act(() => useAppStore.getState().updateSettings({ locale: 'de' }))
  })
})
