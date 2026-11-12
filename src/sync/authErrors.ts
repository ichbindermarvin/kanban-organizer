/**
 * Turns Supabase auth errors into a specific, understandable reason. The original message is kept
 * as "detail" so problems in the Supabase project setup can be diagnosed from the app.
 */
export type AuthProblem =
  | 'signupDisabled'
  | 'rateLimit'
  | 'invalidKey'
  | 'emailInvalid'
  | 'emailProviderDisabled'
  | 'emailSendFailed'
  | 'offline'
  | 'unknown'

export function describeAuthError(error: unknown): { problem: AuthProblem; detail: string } {
  const raw = ((error as { cause?: unknown })?.cause ?? error) as { message?: string; status?: number; code?: string; name?: string }
  const message = raw?.message ?? String(error)
  const code = raw?.code ?? ''
  const status = raw?.status ?? 0
  const detail = [status ? `HTTP ${status}` : '', code, message].filter(Boolean).join(' · ')
  const test = (pattern: RegExp) => pattern.test(code) || pattern.test(message)

  if (test(/signup.?disabled|signups not allowed/i)) return { problem: 'signupDisabled', detail }
  if (status === 429 || test(/rate.?limit|only request this after|too many/i)) return { problem: 'rateLimit', detail }
  if (test(/invalid api key|no api key|apikey/i) || status === 401) return { problem: 'invalidKey', detail }
  if (test(/email_address_invalid|invalid.*email|email.*invalid/i)) return { problem: 'emailInvalid', detail }
  if (test(/email_provider_disabled|email logins are disabled|provider.*disabled/i)) return { problem: 'emailProviderDisabled', detail }
  if (test(/error sending|sending.*email|smtp|template/i) || status >= 500) return { problem: 'emailSendFailed', detail }
  if (test(/fetch|network|load failed/i) || (typeof navigator !== 'undefined' && !navigator.onLine)) return { problem: 'offline', detail }
  return { problem: 'unknown', detail }
}
