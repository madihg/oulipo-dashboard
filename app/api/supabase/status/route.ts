import { NextResponse } from 'next/server'
import { getSupabaseAdmin, isSupabaseConfigured, getSupabaseDiagnostics, getEventsTable } from '@/lib/supabase'

export async function GET() {
  const diag = getSupabaseDiagnostics()

  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      configured: false,
      diagnostics: diag,
      message: 'Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to your environment (Vercel: Project Settings > Environment Variables).',
    })
  }

  if (diag.isPat) {
    return NextResponse.json({
      configured: true,
      connected: false,
      diagnostics: diag,
      error: 'Invalid key type: Personal Access Token (sbp_*) cannot access the database.',
      hint: diag.warning,
    })
  }

  if (!diag.isJwt) {
    return NextResponse.json({
      configured: true,
      connected: false,
      diagnostics: diag,
      error: 'SUPABASE_SERVICE_ROLE_KEY does not look like a valid JWT.',
      hint: diag.warning,
    })
  }

  const supabase = getSupabaseAdmin()!
  const table = getEventsTable()

  try {
    const { data, error } = await supabase.from(table).select('id').limit(1)

    if (!error) {
      return NextResponse.json({
        configured: true,
        connected: true,
        table,
        rowCount: Array.isArray(data) ? data.length : 0,
        diagnostics: { hostname: diag.hostname, keyType: diag.keyType },
      })
    }

    let hint = ''
    if (error.code === '42P01' || error.code === 'PGRST204') {
      hint = `Table "${table}" not found. Verify it exists in Supabase Table Editor. If the name differs, set SUPABASE_EVENTS_TABLE in Vercel env vars.`
    } else if (error.code === '42501') {
      hint = 'Permission denied. Ensure SUPABASE_SERVICE_ROLE_KEY is the service_role key (not anon).'
    } else if (error.code === 'PGRST301' || error.message?.includes('JWT')) {
      hint = 'JWT authentication failed. The service_role key may be invalid or from a different project.'
    }

    return NextResponse.json({
      configured: true,
      connected: false,
      table,
      error: error.message,
      code: error.code,
      hint: hint || error.message,
      diagnostics: { hostname: diag.hostname, keyType: diag.keyType },
    })
  } catch (err) {
    return NextResponse.json({
      configured: true,
      connected: false,
      table,
      error: err instanceof Error ? err.message : 'Connection failed',
      diagnostics: { hostname: diag.hostname, keyType: diag.keyType },
    })
  }
}
