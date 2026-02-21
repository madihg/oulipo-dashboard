import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin, isSupabaseConfigured, getSupabaseDiagnostics, getEventsTable } from '@/lib/supabase'

const EVENT_FIELDS = ['org', 'title', 'description', 'type', 'location', 'date', 'dateEnd', 'dateDisplay', 'link'] as const

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: 'Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to your environment variables (Vercel > Settings > Environment Variables).' },
      { status: 503 }
    )
  }

  const diag = getSupabaseDiagnostics()

  if (diag.isPat) {
    return NextResponse.json({
      error: 'SUPABASE_SERVICE_ROLE_KEY is a Personal Access Token (sbp_*), which cannot access the database. Replace it with the secret key from: Supabase Dashboard > Project Settings > API > secret.',
      detail: { diagnostics: { hostname: diag.hostname, keyType: diag.keyType } },
    }, { status: 500 })
  }

  try {
    const body = await request.json()
    const { event, postingIdea } = body as { event: Record<string, unknown>; postingIdea?: string }

    if (!event || typeof event !== 'object') {
      return NextResponse.json({ error: 'Event object is required.' }, { status: 400 })
    }

    if (!event.title || !event.date) {
      return NextResponse.json({ error: 'Event title and date are required.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()!
    const table = getEventsTable()

    // Discover actual columns by fetching one row (or empty set)
    const { data: probe, error: probeErr } = await supabase.from(table).select('*').limit(1)

    if (probeErr) {
      console.error(`[Upcoming] Probe failed: [${probeErr.code}] ${probeErr.message}`)
      let hint = ''
      if (probeErr.code === '42P01' || probeErr.message?.includes('schema cache')) {
        hint = `Table "${table}" not found. Verify it exists in Supabase Table Editor, or set SUPABASE_EVENTS_TABLE env var.`
      }
      return NextResponse.json({
        error: `Cannot access table "${table}": ${probeErr.message}`,
        detail: { hint: hint || undefined, diagnostics: { hostname: diag.hostname, keyType: diag.keyType } },
      }, { status: 500 })
    }

    // Get column names from the first row, or fall back to accepting all
    const tableColumns = probe && probe.length > 0
      ? new Set(Object.keys(probe[0]))
      : null

    console.log(`[Upcoming] Table "${table}" columns:`, tableColumns ? Array.from(tableColumns).join(', ') : '(empty table, sending all fields)')

    const toSnake = (s: string) => s.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '')

    // Build payload, trying both snake_case and camelCase for each field
    const payload: Record<string, unknown> = {}
    for (const key of EVENT_FIELDS) {
      if (event[key] === undefined || event[key] === null) continue

      const snake = toSnake(key)
      if (!tableColumns) {
        // Empty table: try snake_case first
        payload[snake] = event[key]
      } else if (tableColumns.has(snake)) {
        payload[snake] = event[key]
      } else if (tableColumns.has(key)) {
        payload[key] = event[key]
      }
      // Skip fields that don't match any column
    }

    // Auto-generate date_display if the column exists and we have date
    const hasDateDisplay = !tableColumns || tableColumns.has('date_display') || tableColumns.has('dateDisplay')
    const dateDisplayKey = tableColumns?.has('dateDisplay') ? 'dateDisplay' : 'date_display'
    if (hasDateDisplay && !payload[dateDisplayKey] && (payload.date || payload['date'])) {
      const d = (payload.date || payload['date']) as string
      const de = (payload.date_end || payload['dateEnd']) as string | undefined
      payload[dateDisplayKey] = formatDateDisplay(d, de)
    }

    console.log(`[Upcoming] Insert payload:`, JSON.stringify(payload))

    const { data, error } = await supabase
      .from(table)
      .insert(payload)
      .select('id')
      .single()

    if (!error && data) {
      console.log(`[Upcoming] Success: id=${data.id}`)
      await createPostableTask(supabase, data.id, event, postingIdea)
      return NextResponse.json({ success: true, table, event: { ...payload, id: data.id } })
    }

    console.error(`[Upcoming] Insert failed: [${error.code}] ${error.message}`)

    return NextResponse.json({
      error: `Failed to save event: ${error.message}`,
      detail: {
        table,
        errorCode: error.code,
        payloadKeys: Object.keys(payload),
        tableColumns: tableColumns ? Array.from(tableColumns) : null,
        diagnostics: { hostname: diag.hostname, keyType: diag.keyType },
      },
    }, { status: 500 })
  } catch (err) {
    console.error('[Upcoming] Unhandled error:', err)
    const message = err instanceof Error ? err.message : 'An unexpected error occurred'
    return NextResponse.json({ error: `Failed to save: ${message}` }, { status: 500 })
  }
}

async function createPostableTask(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  eventId: string,
  event: Record<string, unknown>,
  postingIdea?: string
) {
  if (!supabase) return
  try {
    const { error } = await supabase.from('postable_tasks').insert({
      title: String(event.title),
      notes: '',
      posting_idea: postingIdea || `Post about: ${event.title}`,
      status: 'active',
      source_event_id: eventId,
    })
    if (error) {
      console.warn('[Upcoming] Postable task insert failed (non-fatal):', error.message)
    }
  } catch (e) {
    console.warn('[Upcoming] Postable task error (non-fatal):', e)
  }
}

function formatDateDisplay(date: string, dateEnd?: string): string {
  try {
    const [y, m, d] = date.split('-').map(Number)
    const dt = new Date(y, m - 1, d)
    if (isNaN(dt.getTime())) return date
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const formatted = `${months[dt.getMonth()]} ${dt.getDate()}`
    if (dateEnd) {
      const [ey, em, ed] = dateEnd.split('-').map(Number)
      const endDt = new Date(ey, em - 1, ed)
      if (!isNaN(endDt.getTime()) && dt.getMonth() === endDt.getMonth()) {
        return `${formatted}–${endDt.getDate()}`
      }
    }
    return formatted
  } catch {
    return date
  }
}
