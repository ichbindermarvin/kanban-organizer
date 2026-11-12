import { looksLikeLink, parseAuthLink } from './authLink'

describe('parseAuthLink', () => {
  it('reads the session from the redirect page', () => {
    expect(parseAuthLink('http://localhost:3000/#access_token=AT&expires_in=3600&refresh_token=RT&token_type=bearer&type=magiclink')).toEqual({
      kind: 'session',
      accessToken: 'AT',
      refreshToken: 'RT',
    })
  })

  it('reads the token from the e-mail link', () => {
    expect(parseAuthLink('https://abc.supabase.co/auth/v1/verify?token=abc123&type=magiclink&redirect_to=http://localhost:3000')).toEqual({
      kind: 'tokenHash',
      tokenHash: 'abc123',
      type: 'magiclink',
    })
    expect(parseAuthLink('https://abc.supabase.co/auth/v1/verify?token=x&type=signup')).toMatchObject({ type: 'signup' })
  })

  it('distinguishes codes from links', () => {
    expect(looksLikeLink('123456')).toBe(false)
    expect(looksLikeLink('https://abc.supabase.co/auth/v1/verify?token=x')).toBe(true)
    expect(parseAuthLink('https://example.com/')).toBeUndefined()
  })
})
