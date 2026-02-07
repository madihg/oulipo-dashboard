import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  // Fetch upcoming deadlines from Google Calendar "Application Deadlines" calendar
  // Will be implemented here

  return NextResponse.json({
    deadlines: [],
  })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, date, organization, link } = body

    if (!name || !date) {
      return NextResponse.json(
        { error: 'Deadline name and date are required' },
        { status: 400 }
      )
    }

    // Create event in Google Calendar "Application Deadlines" calendar
    // Auto-create calendar if it doesn't exist
    // Will be implemented here

    return NextResponse.json(
      { error: 'Google Calendar integration not yet implemented' },
      { status: 501 }
    )
  } catch {
    return NextResponse.json(
      { error: 'Failed to create deadline' },
      { status: 500 }
    )
  }
}
