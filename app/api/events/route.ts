import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { getEvents, setEvents, isVercelEnvironment } from '@/lib/storage'

const OULIPO_REPO_PATH = process.env.OULIPO_REPO_PATH || '/Users/halim/Documents/oulipo'
const EVENTS_FILE = path.join(OULIPO_REPO_PATH, 'events.json')

export async function GET() {
  try {
    // On Vercel, use KV storage; locally, use filesystem
    const eventsFilePath = isVercelEnvironment() ? undefined : EVENTS_FILE
    const events = await getEvents(eventsFilePath)
    return NextResponse.json({ events })
  } catch {
    return NextResponse.json(
      { error: 'Failed to read events' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const event = await request.json()

    // Validate required fields
    if (!event.title || !event.date) {
      return NextResponse.json(
        { error: 'Event title and date are required.' },
        { status: 400 }
      )
    }

    const onVercel = isVercelEnvironment()
    const eventsFilePath = onVercel ? undefined : EVENTS_FILE

    // On local dev, ensure the oulipo repo directory exists
    if (!onVercel && !fs.existsSync(OULIPO_REPO_PATH)) {
      return NextResponse.json(
        { error: 'Could not access the oulipo repository directory. Check that OULIPO_REPO_PATH is correct.' },
        { status: 500 }
      )
    }

    // Read existing events
    let events: Record<string, unknown>[]
    try {
      events = await getEvents(eventsFilePath)
    } catch (readErr) {
      console.error('Failed to read existing events:', readErr)
      return NextResponse.json(
        { error: 'Could not read existing events. The data may be corrupted.' },
        { status: 500 }
      )
    }

    // Insert in chronological order
    const newDate = new Date(event.date as string)
    let insertIndex = events.length
    for (let i = 0; i < events.length; i++) {
      if (new Date(events[i].date as string) > newDate) {
        insertIndex = i
        break
      }
    }
    events.splice(insertIndex, 0, event)

    // Save events
    try {
      await setEvents(events, eventsFilePath)
    } catch (writeErr) {
      console.error('Failed to write events:', writeErr)
      const errMsg = writeErr instanceof Error ? writeErr.message : 'Unknown write error'
      return NextResponse.json(
        { error: `Failed to save events: ${errMsg}. Your data was not modified.` },
        { status: 500 }
      )
    }

    // Update HTML files only on local dev (filesystem required)
    let htmlWarning = ''
    if (!onVercel) {
      try {
        updateHtmlFile(path.join(OULIPO_REPO_PATH, 'upcoming', 'index.html'), events)
        updateHtmlFile(path.join(OULIPO_REPO_PATH, 'cv', 'index.html'), events)
      } catch (htmlError) {
        console.error('Failed to update HTML files:', htmlError)
        htmlWarning = 'Event saved to events.json, but HTML files could not be updated.'
      }
    }

    return NextResponse.json({ success: true, event, ...(htmlWarning ? { warning: htmlWarning } : {}) })
  } catch (err) {
    console.error('Event save error:', err)
    const message = err instanceof Error ? err.message : 'An unexpected error occurred'
    return NextResponse.json(
      { error: `Failed to save event: ${message}. Please try again.` },
      { status: 500 }
    )
  }
}

function updateHtmlFile(filePath: string, events: Record<string, unknown>[]) {
  if (!fs.existsSync(filePath)) return

  let html = fs.readFileSync(filePath, 'utf-8')

  // Update the inline EVENTS const
  const eventsJsonString = JSON.stringify(events, null, 4)
  const regex = /const\s+EVENTS\s*=\s*\[[\s\S]*?\];/
  const replacement = `const EVENTS = ${eventsJsonString};`

  if (regex.test(html)) {
    html = html.replace(regex, replacement)
    const tempFile = filePath + '.tmp'
    fs.writeFileSync(tempFile, html, 'utf-8')
    fs.renameSync(tempFile, filePath)
  }
}
