/**
 * Supabase client for Upcoming events and Postable tasks.
 * Uses service role key for server-side API routes.
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export function getSupabaseAdmin() {
  if (!supabaseUrl || !supabaseServiceKey) return null
  return createClient(supabaseUrl, supabaseServiceKey)
}

export function isSupabaseConfigured(): boolean {
  return !!(supabaseUrl && supabaseServiceKey)
}
