import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase'

const EVENT_FIELDS = ['org', 'title', 'description', 'type', 'location', 'date', 'dateEnd', 'dateDisplay', 'link'] as const

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: 'Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to your environment variables (Vercel → Settings → Environment Variables).' },
      { status: 503 }
    )
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
    const configuredTable = process.env.SUPABASE_EVENTS_TABLE || 'oulipo-events'

    const payload: Record<string, unknown> = {}
    const toSnake = (s: string) => s.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '')
    for (const key of EVENT_FIELDS) {
      if (event[key] !== undefined && event[key] !== null) {
        payload[toSnake(key)] = event[key]
      }
    }
    if (!payload.date_display && payload.date) {
      payload.date_display = formatDateDisplay(payload.date as string, payload.date_end as string | undefined)
    }

    console.log('[Upcoming] Insert payload:', JSON.stringify(payload))

    const tableVariants = uniqueStrings([
      configuredTable,
      configuredTable.replace(/-/g, '_'),
      'events',
      'oulipo_events',
    ])

    let insertedEvent: { id: string } | null = null
    let lastError: { message: string; code?: string } | null = null
    let usedTable = configuredTable

    for (const table of tableVariants) {
      console.log(`[Upcoming] Trying table: "${table}"`)
      const { data, error } = await supabase
        .from(table)
        .insert(payload)
        .select('id')
        .single()

      if (!error && data) {
        insertedEvent = data
        usedTable = table
        console.log(`[Upcoming] Success: inserted into "${table}", id=${data.id}`)
        break
      }

      lastError = { message: error.message, code: error.code }
      console.warn(`[Upcoming] Table "${table}" failed: [${error.code}] ${error.message}`)

      if (error.code !== '42P01' && error.code !== 'PGRST204') {
        break
      }
    }

    if (!insertedEvent) {
      return NextResponse.json({
        error: `Failed to save event: ${lastError?.message || 'Unknown error'}`,
        detail: {
          tablesAttempted: tableVariants,
          errorCode: lastError?.code,
          payloadKeys: Object.keys(payload),
          hint: lastError?.code === '42P01'
            ? 'None of the table names exist. Check your Supabase Table Editor for the exact table name and set SUPABASE_EVENTS_TABLE accordingly.'
            : lastError?.code === '42501'
              ? 'Permission denied. Check that your SUPABASE_SERVICE_ROLE_KEY is the service_role key (not anon).'
              : undefined,
        },
      }, { status: 500 })
    }

    const eventId = insertedEvent.id

    if (eventId && (postingIdea || event.title)) {
      const { error: taskError } = await supabase.from('postable_tasks').insert({
        title: String(event.title),
        notes: '',
        posting_idea: postingIdea || `Post about: ${event.title}`,
        status: 'active',
        source_event_id: eventId,
      })
      if (taskError) {
        console.warn('[Upcoming] Postable task insert failed (non-fatal):', taskError.message)
      }
    }

    return NextResponse.json({ success: true, table: usedTable, event: { ...payload, id: eventId } })
  } catch (err) {
    console.error('[Upcoming] Unhandled error:', err)
    const message = err instanceof Error ? err.message : 'An unexpected error occurred'
    return NextResponse.json({ error: `Failed to save: ${message}` }, { status: 500 })
  }
}

function uniqueStrings(arr: string[]): string[] {
  const seen = new Set<string>()
  return arr.filter(s => { if (seen.has(s)) return false; seen.add(s); return true })
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
