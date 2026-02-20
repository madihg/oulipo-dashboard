import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase'

const EVENT_FIELDS = ['org', 'title', 'description', 'type', 'location', 'date', 'dateEnd', 'dateDisplay', 'link'] as const

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: 'Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.' },
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

    const { data: insertedEvent, error: eventError } = await supabase
      .from('oulipo-events')
      .insert(payload)
      .select('id')
      .single()

    if (eventError) {
      console.error('Supabase oulipo-events insert error:', eventError)
      return NextResponse.json(
        { error: `Failed to save event: ${eventError.message}` },
        { status: 500 }
      )
    }

    const eventId = insertedEvent?.id

    if (eventId && (postingIdea || event.title)) {
      const { error: taskError } = await supabase.from('postable_tasks').insert({
        title: String(event.title),
        notes: '',
        posting_idea: postingIdea || `Post about: ${event.title}`,
        status: 'active',
        source_event_id: eventId,
      })
      if (taskError) {
        console.warn('Postable task insert failed (non-fatal):', taskError)
      }
    }

    return NextResponse.json({ success: true, event: { ...payload, id: eventId } })
  } catch (err) {
    console.error('Upcoming events API error:', err)
    const message = err instanceof Error ? err.message : 'An unexpected error occurred'
    return NextResponse.json({ error: `Failed to save: ${message}` }, { status: 500 })
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
