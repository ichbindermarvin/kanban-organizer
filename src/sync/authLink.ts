/**
 * Login links from Supabase e-mails, as a fallback to the 6-digit code (e.g. when an e-mail template
 * still contains the default link). Two shapes are understood:
 *   1. the link in the e-mail:  https://<project>.supabase.co/auth/v1/verify?token=…&type=magiclink&redirect_to=…
 *   2. the page it redirects to: http://localhost:3000/#access_token=…&refresh_token=…
 */
export type AuthLink =
  | { kind: 'session'; accessToken: string; refreshToken: string }
  | { kind: 'tokenHash'; tokenHash: string; type: 'magiclink' | 'signup' | 'email' }

export function looksLikeLink(value: string): boolean {
  return /^https?:\/\//i.test(value.trim()) || value.includes('access_token=') || value.includes('token=')
}

export function parseAuthLink(value: string): AuthLink | undefined {
  const text = value.trim()
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://x.invalid/${text.startsWith('#') ? text : `#${text}`}`)
  } catch {
    return undefined
  }
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''))
  const accessToken = hash.get('access_token') ?? url.searchParams.get('access_token')
  const refreshToken = hash.get('refresh_token') ?? url.searchParams.get('refresh_token')
  if (accessToken && refreshToken) return { kind: 'session', accessToken, refreshToken }
  const tokenHash = url.searchParams.get('token_hash') ?? url.searchParams.get('token')
  if (tokenHash) {
    const type = url.searchParams.get('type')
    return { kind: 'tokenHash', tokenHash, type: type === 'signup' || type === 'magiclink' ? type : 'email' }
  }
  return undefined
}
