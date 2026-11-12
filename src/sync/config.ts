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
