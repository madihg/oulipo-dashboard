import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

let _client: SupabaseClient | null = null

export function getSupabaseAdmin(): SupabaseClient | null {
  if (!supabaseUrl || !supabaseServiceKey) return null
  if (!_client) {
    _client = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return _client
}

export function isSupabaseConfigured(): boolean {
  return !!(supabaseUrl && supabaseServiceKey)
}

export function getSupabaseDiagnostics() {
  const url = supabaseUrl || ''
  const key = supabaseServiceKey || ''

  let hostname = 'not set'
  try { hostname = url ? new URL(url).hostname : 'not set' } catch { hostname = 'invalid URL' }

  const keyPrefix = key ? key.slice(0, 10) + '...' : 'not set'
  const isPat = key.startsWith('sbp_')
  const isJwt = key.startsWith('eyJ')

  return {
    hostname,
    keyPrefix,
    keyType: isPat ? 'PAT (INVALID for DB)' : isJwt ? 'JWT (correct)' : key ? 'unknown' : 'not set',
    isPat,
    isJwt,
    warning: isPat
      ? 'SUPABASE_SERVICE_ROLE_KEY is a Personal Access Token (sbp_*). This does NOT work for database access. You need the service_role JWT: Supabase Dashboard > Project Settings > API > service_role (secret).'
      : (!isJwt && key)
        ? 'SUPABASE_SERVICE_ROLE_KEY does not look like a JWT. Expected a key starting with "eyJ..." from Supabase Dashboard > Project Settings > API > service_role.'
        : undefined,
  }
}

export function getEventsTable(): string {
  return process.env.SUPABASE_EVENTS_TABLE || 'events'
}
