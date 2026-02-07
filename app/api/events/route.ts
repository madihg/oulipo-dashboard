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

    // Read existing events
    let events: Record<string, unknown>[] = []
    if (fs.existsSync(EVENTS_FILE)) {
      const data = fs.readFileSync(EVENTS_FILE, 'utf-8')
      events = JSON.parse(data)
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

    // Write events.json atomically
    const tempFile = EVENTS_FILE + '.tmp'
    fs.writeFileSync(tempFile, JSON.stringify(events, null, 2), 'utf-8')
    fs.renameSync(tempFile, EVENTS_FILE)

    // Update HTML files
    try {
      updateHtmlFile(path.join(OULIPO_REPO_PATH, 'upcoming', 'index.html'), events)
      updateHtmlFile(path.join(OULIPO_REPO_PATH, 'cv', 'index.html'), events)
    } catch (htmlError) {
      console.error('Failed to update HTML files:', htmlError)
      // Events.json was already saved, so we continue
    }

    return NextResponse.json({ success: true, event })
  } catch {
    return NextResponse.json(
      { error: 'Failed to save event' },
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
