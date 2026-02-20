import { NextResponse } from 'next/server'
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase'

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      configured: false,
      message: 'Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to your environment (Vercel: Project Settings → Environment Variables).',
    })
  }

  const supabase = getSupabaseAdmin()!
  const configuredTable = process.env.SUPABASE_EVENTS_TABLE || 'oulipo-events'

  const tableVariants = [
    configuredTable,
    configuredTable.replace(/-/g, '_'),
    'events',
    'oulipo_events',
  ].filter((v, i, a) => a.indexOf(v) === i)

  for (const table of tableVariants) {
    try {
      const { error } = await supabase.from(table).select('id').limit(1)
      if (!error) {
        return NextResponse.json({
          configured: true,
          connected: true,
          table,
          configuredTable,
        })
      }
      if (error.code !== '42P01' && error.code !== 'PGRST204') {
        return NextResponse.json({
          configured: true,
          connected: false,
          table,
          error: error.message,
          code: error.code,
          hint: error.code === '42501'
            ? 'Permission denied. Ensure SUPABASE_SERVICE_ROLE_KEY is the service_role key (not the anon key).'
            : error.message,
        })
      }
    } catch (err) {
      return NextResponse.json({
        configured: true,
        connected: false,
        table,
        error: err instanceof Error ? err.message : 'Connection failed',
      })
    }
  }

  return NextResponse.json({
    configured: true,
    connected: false,
    tablesAttempted: tableVariants,
    error: `No events table found. Tried: ${tableVariants.join(', ')}`,
    hint: 'Check your Supabase Table Editor for the exact table name, then set SUPABASE_EVENTS_TABLE in your environment variables.',
  })
}
