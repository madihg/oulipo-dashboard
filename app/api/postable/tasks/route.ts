import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase'

export interface PostableTask {
  id: string
  title: string
  notes: string
  posting_idea?: string
  status: 'active' | 'archived'
  source_event_id?: string
  created_at?: string
}

export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ tasks: [], source: 'none' })
  }

  try {
    const supabase = getSupabaseAdmin()!
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') as 'active' | 'archived' | null

    let query = supabase.from('postable_tasks').select('id, title, notes, posting_idea, status, source_event_id, created_at').order('created_at', { ascending: false })

    if (status) {
      query = query.eq('status', status)
    }

    const { data, error } = await query

    if (error) {
      console.error('Postable tasks fetch error:', error)
      return NextResponse.json({ tasks: [], source: 'error' })
    }

    return NextResponse.json({ tasks: data || [], source: 'supabase' })
  } catch {
    return NextResponse.json({ tasks: [], source: 'error' })
  }
}

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  try {
    const body = await request.json()
    const { title, notes, posting_idea, status } = body as Partial<PostableTask>

    if (!title || typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()!
    const { data, error } = await supabase
      .from('postable_tasks')
      .insert({ title: title.trim(), notes: notes || '', posting_idea: posting_idea || null, status: status || 'active' })
      .select('id, title, notes, posting_idea, status, created_at')
      .single()

    if (error) {
      console.error('Postable task insert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ task: data })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  try {
    const body = await request.json()
    const { id, title, notes, status } = body

    if (!id) {
      return NextResponse.json({ error: 'Task id is required' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()!
    const updates: Record<string, unknown> = {}
    if (title !== undefined) updates.title = title
    if (notes !== undefined) updates.notes = notes
    if (status !== undefined) updates.status = status

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('postable_tasks')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Postable task update error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ task: data })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
