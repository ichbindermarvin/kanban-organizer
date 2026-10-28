import { Component, type ReactNode } from 'react'
import { translate } from '@/shared/i18n'
import { useAppStore } from '@/state/appStore'

/** Last line of defence for rendering errors: data is already persisted, so a reload is safe. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {}

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error(error)
  }

  render() {
    if (!this.state.error) return this.props.children
    const locale = useAppStore.getState().settings.locale
    return (
      <div className="fatal" role="alert">
        <h1>{translate(locale, 'error.title')}</h1>
        <p>{translate(locale, 'error.render')}</p>
        <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
          {translate(locale, 'common.reload')}
        </button>
      </div>
    )
  }
}
