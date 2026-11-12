export interface SupabaseConfig {
  url: string
  anonKey: string
}

/** Build-time default (GitHub repository variables), can be overridden on the device. */
export function envConfig(): SupabaseConfig | undefined {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  return url && anonKey ? { url, anonKey } : undefined
}

/**
 * Reduces whatever was copied to the project base URL, e.g.
 *   https://abc.supabase.co/rest/v1/            → https://abc.supabase.co
 *   https://supabase.com/dashboard/project/abc  → https://abc.supabase.co
 * The client appends its own paths (/auth/v1, /rest/v1); an extra path makes every request fail
 * with "Invalid path specified in request URL".
 */
export function normalizeSupabaseUrl(value: string): string {
  const trimmed = value.trim()
  try {
    const url = new URL(/^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`)
    const dashboard = url.hostname.endsWith('supabase.com') && url.pathname.match(/\/project\/([a-z0-9]+)/i)
    if (dashboard) return `https://${dashboard[1]}.supabase.co`
    return url.origin
  } catch {
    return trimmed.replace(/\/+$/, '')
  }
}
