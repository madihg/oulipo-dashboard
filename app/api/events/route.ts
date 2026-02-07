import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const OULIPO_REPO_PATH = process.env.OULIPO_REPO_PATH || '/Users/halim/Documents/oulipo'
const EVENTS_FILE = path.join(OULIPO_REPO_PATH, 'events.json')

export async function GET() {
  try {
    if (!fs.existsSync(EVENTS_FILE)) {
      return NextResponse.json({ events: [] })
    }

    const data = fs.readFileSync(EVENTS_FILE, 'utf-8')
    const events = JSON.parse(data)

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

    // Ensure the oulipo repo directory exists
    if (!fs.existsSync(OULIPO_REPO_PATH)) {
      return NextResponse.json(
        { error: 'Could not access the oulipo repository directory. Check that OULIPO_REPO_PATH is correct.' },
        { status: 500 }
      )
    }

    // Read existing events
    let events: Record<string, unknown>[] = []
    if (fs.existsSync(EVENTS_FILE)) {
      try {
        const data = fs.readFileSync(EVENTS_FILE, 'utf-8')
        events = JSON.parse(data)
      } catch (readErr) {
        console.error('Failed to read existing events.json:', readErr)
        return NextResponse.json(
          { error: 'Could not read existing events file. The file may be corrupted.' },
          { status: 500 }
        )
      }
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

    // Write events.json atomically (temp file + rename prevents corruption)
    const tempFile = EVENTS_FILE + '.tmp'
    try {
      fs.writeFileSync(tempFile, JSON.stringify(events, null, 2), 'utf-8')
      fs.renameSync(tempFile, EVENTS_FILE)
    } catch (writeErr) {
      // Clean up temp file if it was created but rename failed
      try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile) } catch { /* ignore cleanup error */ }
      console.error('Failed to write events.json:', writeErr)
      const errMsg = writeErr instanceof Error ? writeErr.message : 'Unknown write error'
      return NextResponse.json(
        { error: `Failed to save events file: ${errMsg}. Your data was not modified.` },
        { status: 500 }
      )
    }

    // Update HTML files (best-effort — events.json is already saved)
    let htmlWarning = ''
    try {
      updateHtmlFile(path.join(OULIPO_REPO_PATH, 'upcoming', 'index.html'), events)
      updateHtmlFile(path.join(OULIPO_REPO_PATH, 'cv', 'index.html'), events)
    } catch (htmlError) {
      console.error('Failed to update HTML files:', htmlError)
      htmlWarning = 'Event saved to events.json, but HTML files could not be updated.'
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
