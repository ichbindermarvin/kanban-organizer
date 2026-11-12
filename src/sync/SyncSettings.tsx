import { useId, useState, type FormEvent } from 'react'
import { useAppStore } from '@/state/appStore'
import { useT } from '@/shared/hooks/useT'
import { Icon } from '@/shared/components/Icon'
import { formatTimestamp } from '@/shared/utils/format'
import { useSyncStore } from './syncStore'
import { normalizeSupabaseUrl } from './config'
import { looksLikeLink } from './authLink'

const MIN_PASSPHRASE = 10

/** Sync status as one short line (also used in the sidebar). */
export function useSyncStatusText(): { text: string; tone: 'ok' | 'muted' | 'warn' } | undefined {
  const t = useT()
  const locale = useAppStore((s) => s.settings.locale)
  const { phase, status, lastSyncAt } = useSyncStore()
  if (phase !== 'ready') return undefined
  if (status === 'syncing') return { text: t('sync.status.syncing'), tone: 'muted' }
  if (status === 'offline') return { text: t('sync.status.offline'), tone: 'warn' }
  if (status === 'error') return { text: t('sync.status.error'), tone: 'warn' }
  return { text: lastSyncAt ? t('sync.status.idleAt', { time: formatTimestamp(lastSyncAt, locale) }) : t('sync.status.idle'), tone: 'ok' }
}

export function SyncSettings() {
  const t = useT()
  const sync = useSyncStore()
  const status = useSyncStatusText()

  return (
    <section className="settings-section" aria-labelledby="settings-sync">
      <h2 id="settings-sync">{t('sync.title')}</h2>
      <p className="muted small">{t('sync.intro')}</p>

      {sync.phase === 'unconfigured' && <ConfigForm />}
      {sync.phase === 'signedOut' && <EmailForm />}
      {sync.phase === 'codeSent' && <CodeForm />}
      {sync.phase === 'needsPassphrase' && (sync.remoteHasKey === false ? <CreatePassphraseForm /> : <UnlockForm />)}
      {sync.phase === 'ready' && (
        <div className="sync-ready">
          {status && (
            <p className={`sync-status sync-status--${status.tone}`} role="status">
              <Icon name="cloud" size={14} />
              {status.text}
            </p>
          )}
          {sync.email && <p className="small muted">{t('sync.signedInAs', { email: sync.email })}</p>}
          <div className="settings-row settings-row--buttons">
            <button type="button" className="btn" onClick={() => void sync.syncNow()} disabled={sync.status === 'syncing'}>
              {t('sync.syncNow')}
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => void sync.signOut()}>
              {t('sync.signOut')}
            </button>
          </div>
          <p className="muted small">{t('sync.signOutHint')}</p>
        </div>
      )}

      {sync.message && (
        <div className="error-text" role="alert">
          <p>{t(`sync.message.${sync.message}`)}</p>
          {sync.detail && (
            <p className="small sync-detail">
              {t('sync.detail')}: <code>{sync.detail}</code>
            </p>
          )}
        </div>
      )}
      {sync.phase !== 'unconfigured' && sync.phase !== 'ready' && !sync.configFromEnv && (
        <button type="button" className="btn btn--ghost btn--small" onClick={() => void sync.resetConfig()}>
          {t('sync.changeServer')}
        </button>
      )}
    </section>
  )
}

function ConfigForm() {
  const t = useT()
  const saveConfig = useSyncStore((s) => s.saveConfig)
  const [url, setUrl] = useState('')
  const [anonKey, setAnonKey] = useState('')
  const ids = { url: useId(), key: useId() }
  // Secret keys (and legacy service_role JWTs) bypass Row Level Security: never accept them in the app.
  const isSecret = /^sb_secret_/.test(anonKey.trim()) || /service_role/.test(decodeJwtRole(anonKey.trim()))
  const valid = /^https:\/\/\S+$/.test(url.trim()) && anonKey.trim().length > 20 && !isSecret
  return (
    <form
      className="form-stack sync-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) void saveConfig({ url: normalizeSupabaseUrl(url), anonKey: anonKey.trim() })
      }}
    >
      <h3 className="settings-subtitle">{t('sync.configTitle')}</h3>
      <p className="muted small">{t('sync.configHint')}</p>
      <div>
        <label className="field-label" htmlFor={ids.url}>
          {t('sync.url')}
        </label>
        <input id={ids.url} className="input input--full" value={url} placeholder="https://xyz.supabase.co" onChange={(e) => setUrl(e.target.value)} autoComplete="off" />
      </div>
      <div>
        <label className="field-label" htmlFor={ids.key}>
          {t('sync.anonKey')}
        </label>
        <input
          id={ids.key}
          className="input input--full"
          value={anonKey}
          placeholder="sb_publishable_…"
          aria-invalid={isSecret}
          onChange={(e) => setAnonKey(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        {isSecret && (
          <p className="error-text small" role="alert">
            {t('sync.secretKey')}
          </p>
        )}
      </div>
      <div>
        <button type="submit" className="btn btn--primary" disabled={!valid}>
          {t('sync.saveConfig')}
        </button>
      </div>
    </form>
  )
}

function EmailForm() {
  const t = useT()
  const { sendCode, busy, email: lastEmail } = useSyncStore()
  const [email, setEmail] = useState(lastEmail ?? '')
  const id = useId()
  return (
    <form
      className="form-stack sync-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (email.includes('@')) void sendCode(email)
      }}
    >
      <div>
        <label className="field-label" htmlFor={id}>
          {t('sync.email')}
        </label>
        <input id={id} type="email" className="input input--full" value={email} autoComplete="email" onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <button type="submit" className="btn btn--primary" disabled={busy || !email.includes('@')}>
          {t('sync.sendCode')}
        </button>
      </div>
    </form>
  )
}

function CodeForm() {
  const t = useT()
  const { verifyCode, busy, email } = useSyncStore()
  const [code, setCode] = useState('')
  const id = useId()
  return (
    <form
      className="form-stack sync-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (code.trim().length >= 6) void verifyCode(code)
      }}
    >
      <p className="small">{t('sync.codeSent', { email: email ?? '' })}</p>
      <div>
        <label className="field-label" htmlFor={id}>
          {t('sync.code')}
        </label>
        <input
          id={id}
          className={`input ${looksLikeLink(code) ? 'input--full' : 'input--code'}`}
          value={code}
          inputMode={looksLikeLink(code) ? 'url' : 'numeric'}
          autoComplete="one-time-code"
          onChange={(e) => setCode(e.target.value.replace(/\s/g, ''))}
        />
        <p className="muted small dialog__hint">{t('sync.codeOrLink')}</p>
      </div>
      <div className="settings-row settings-row--buttons">
        <button type="submit" className="btn btn--primary" disabled={busy || code.trim().length < 6}>
          {t('sync.verify')}
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => useSyncStore.setState({ phase: 'signedOut', message: undefined })}>
          {t('sync.otherEmail')}
        </button>
      </div>
    </form>
  )
}

function CreatePassphraseForm() {
  const t = useT()
  const { createPassphrase, busy } = useSyncStore()
  const [passphrase, setPassphrase] = useState('')
  const [repeat, setRepeat] = useState('')
  const [understood, setUnderstood] = useState(false)
  const ids = { pass: useId(), repeat: useId(), hint: useId() }
  const tooShort = passphrase.length < MIN_PASSPHRASE
  const mismatch = repeat.length > 0 && repeat !== passphrase
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!tooShort && !mismatch && repeat === passphrase && understood) void createPassphrase(passphrase)
  }
  return (
    <form className="form-stack sync-form" onSubmit={submit}>
      <h3 className="settings-subtitle">{t('sync.createTitle')}</h3>
      <p id={ids.hint} className="muted small">
        {t('sync.createHint')}
      </p>
      <div>
        <label className="field-label" htmlFor={ids.pass}>
          {t('sync.passphrase')}
        </label>
        <input
          id={ids.pass}
          type="password"
          className="input input--full"
          value={passphrase}
          autoComplete="new-password"
          aria-describedby={ids.hint}
          onChange={(e) => setPassphrase(e.target.value)}
        />
        {passphrase.length > 0 && tooShort && <p className="muted small">{t('sync.passphraseShort')}</p>}
      </div>
      <div>
        <label className="field-label" htmlFor={ids.repeat}>
          {t('sync.passphraseRepeat')}
        </label>
        <input id={ids.repeat} type="password" className="input input--full" value={repeat} autoComplete="new-password" onChange={(e) => setRepeat(e.target.value)} />
        {mismatch && <p className="error-text small">{t('sync.passphraseMismatch')}</p>}
      </div>
      <label className="checkbox checkbox--top">
        <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
        <span className="small">{t('sync.understood')}</span>
      </label>
      <div>
        <button type="submit" className="btn btn--primary" disabled={busy || tooShort || repeat !== passphrase || !understood}>
          {t('sync.create')}
        </button>
      </div>
    </form>
  )
}

function UnlockForm() {
  const t = useT()
  const { unlock, busy } = useSyncStore()
  const [passphrase, setPassphrase] = useState('')
  const id = useId()
  return (
    <form
      className="form-stack sync-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (passphrase) void unlock(passphrase)
      }}
    >
      <h3 className="settings-subtitle">{t('sync.unlockTitle')}</h3>
      <p className="muted small">{t('sync.unlockHint')}</p>
      <div>
        <label className="field-label" htmlFor={id}>
          {t('sync.passphrase')}
        </label>
        <input id={id} type="password" className="input input--full" value={passphrase} autoComplete="current-password" onChange={(e) => setPassphrase(e.target.value)} />
      </div>
      <div>
        <button type="submit" className="btn btn--primary" disabled={busy || !passphrase}>
          {t('sync.unlock')}
        </button>
      </div>
    </form>
  )
}

/** Role claim of a legacy JWT key ("anon" / "service_role"), or "" for other keys. */
function decodeJwtRole(key: string): string {
  const part = key.split('.')[1]
  if (!key.startsWith('eyJ') || !part) return ''
  try {
    return String((JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as { role?: string }).role ?? '')
  } catch {
    return ''
  }
}
