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
      error: 'SUPABASE_SERVICE_ROLE_KEY is a Personal Access Token (sbp_*), which cannot access the database. Replace it with the service_role JWT from: Supabase Dashboard > Project Settings > API > service_role (secret).',
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

    const snakePayload: Record<string, unknown> = {}
    const camelPayload: Record<string, unknown> = {}
    const toSnake = (s: string) => s.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '')

    for (const key of EVENT_FIELDS) {
      if (event[key] !== undefined && event[key] !== null) {
        snakePayload[toSnake(key)] = event[key]
        camelPayload[key] = event[key]
      }
    }
    if (!snakePayload.date_display && snakePayload.date) {
      snakePayload.date_display = formatDateDisplay(snakePayload.date as string, snakePayload.date_end as string | undefined)
    }
    if (!camelPayload.dateDisplay && camelPayload.date) {
      camelPayload.dateDisplay = formatDateDisplay(camelPayload.date as string, camelPayload.dateEnd as string | undefined)
    }

    console.log(`[Upcoming] Inserting into "${table}" (snake_case):`, JSON.stringify(snakePayload))

    const { data, error } = await supabase
      .from(table)
      .insert(snakePayload)
      .select('id')
      .single()

    if (!error && data) {
      console.log(`[Upcoming] Success: inserted into "${table}", id=${data.id}`)
      await createPostableTask(supabase, data.id, event, postingIdea)
      return NextResponse.json({ success: true, table, event: { ...snakePayload, id: data.id } })
    }

    console.warn(`[Upcoming] snake_case insert failed: [${error.code}] ${error.message}`)

    if (error.code === '42703' || error.message?.includes('column')) {
      console.log(`[Upcoming] Retrying with camelCase columns...`)
      const { data: data2, error: error2 } = await supabase
        .from(table)
        .insert(camelPayload)
        .select('id')
        .single()

      if (!error2 && data2) {
        console.log(`[Upcoming] camelCase success: inserted into "${table}", id=${data2.id}`)
        await createPostableTask(supabase, data2.id, event, postingIdea)
        return NextResponse.json({ success: true, table, event: { ...camelPayload, id: data2.id } })
      }
      console.warn(`[Upcoming] camelCase insert also failed: [${error2.code}] ${error2.message}`)
    }

    let hint = ''
    if (error.code === '42P01' || error.code === 'PGRST204') {
      hint = `Table "${table}" not found in PostgREST schema cache. This usually means: (1) the table does not exist, (2) the Supabase URL points to the wrong project (currently: ${diag.hostname}), or (3) the service_role key is invalid so PostgREST falls back to the anon role which cannot see the table.`
    } else if (error.code === '42501') {
      hint = 'Permission denied. Replace SUPABASE_SERVICE_ROLE_KEY with the service_role key (not anon).'
    } else if (error.code === '42703') {
      hint = 'Column mismatch. The event payload columns do not match the table schema. Check your table columns in Supabase Table Editor.'
    } else if (error.code === 'PGRST301' || error.message?.includes('JWT')) {
      hint = 'JWT auth failed. The key may be invalid or from a different Supabase project.'
    }

    return NextResponse.json({
      error: `Failed to save event: ${error.message}`,
      detail: {
        table,
        errorCode: error.code,
        payloadKeys: Object.keys(snakePayload),
        hint: hint || undefined,
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
