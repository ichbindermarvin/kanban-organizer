import { describeAuthError } from './authErrors'
import { SyncError } from './remote'

const supabaseError = (status: number, code: string, message: string) => Object.assign(new Error(message), { status, code, name: 'AuthApiError' })

describe('describeAuthError', () => {
  it.each([
    [supabaseError(422, 'signup_disabled', 'Signups not allowed for otp'), 'signupDisabled'],
    [supabaseError(429, 'over_email_send_rate_limit', 'email rate limit exceeded'), 'rateLimit'],
    [supabaseError(401, '', 'Invalid API key'), 'invalidKey'],
    [supabaseError(400, 'email_address_invalid', 'Email address "x" is invalid'), 'emailInvalid'],
    [supabaseError(400, 'email_provider_disabled', 'Email logins are disabled'), 'emailProviderDisabled'],
    [supabaseError(500, 'unexpected_failure', 'Error sending magic link email'), 'emailSendFailed'],
    [new TypeError('Failed to fetch'), 'offline'],
  ])('%s → %s', (error, problem) => {
    expect(describeAuthError(error).problem).toBe(problem)
  })

  it('looks through SyncError wrappers and keeps the original message as detail', () => {
    const wrapped = new SyncError('server', 'x', { cause: supabaseError(500, 'unexpected_failure', 'Error sending magic link email') })
    expect(describeAuthError(wrapped)).toEqual({ problem: 'emailSendFailed', detail: 'HTTP 500 · unexpected_failure · Error sending magic link email' })
  })
})
