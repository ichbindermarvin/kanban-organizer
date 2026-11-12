import { normalizeSupabaseUrl } from './config'

describe('normalizeSupabaseUrl', () => {
  it.each([
    ['https://abc.supabase.co', 'https://abc.supabase.co'],
    ['https://abc.supabase.co/', 'https://abc.supabase.co'],
    ['https://abc.supabase.co/rest/v1/', 'https://abc.supabase.co'],
    ['  https://abc.supabase.co/auth/v1  ', 'https://abc.supabase.co'],
    ['abc.supabase.co', 'https://abc.supabase.co'],
    ['https://supabase.com/dashboard/project/abcdefgh/settings/api', 'https://abcdefgh.supabase.co'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeSupabaseUrl(input)).toBe(expected)
  })
})
