import { NextRequest, NextResponse } from 'next/server'
import { isGoogleConnected } from '@/lib/google-auth'

export async function GET() {
  try {
    const connected = isGoogleConnected()

    if (!connected) {
      return NextResponse.json({
        deadlines: [],
        googleConnected: false,
      })
    }

    // Dynamically import googleapis only when needed
    const { google } = await import('googleapis')
    const { getAuthenticatedClient } = await import('@/lib/google-auth')
    const auth = getAuthenticatedClient()

    if (!auth) {
      return NextResponse.json({
        deadlines: [],
        googleConnected: false,
      })
    }

    const calendar = google.calendar({ version: 'v3', auth })
    const APPLICATION_DEADLINES_CALENDAR = 'Application Deadlines'

    // Find the deadlines calendar
    const calendarList = await calendar.calendarList.list()
    const deadlinesCal = calendarList.data.items?.find(
      (cal) => cal.summary === APPLICATION_DEADLINES_CALENDAR
    )

    if (!deadlinesCal) {
      return NextResponse.json({
        deadlines: [],
        googleConnected: true,
      })
    }

    // Fetch upcoming events
    const now = new Date()
    const events = await calendar.events.list({
      calendarId: deadlinesCal.id!,
      timeMin: now.toISOString(),
      maxResults: 50,
      singleEvents: true,
      orderBy: 'startTime',
    })

    const deadlines = (events.data.items || []).map((event) => ({
      id: event.id,
      name: event.summary || '',
      date: event.start?.date || event.start?.dateTime || '',
      organization: event.extendedProperties?.private?.organization || '',
      link: event.description || '',
    }))

    return NextResponse.json({
      deadlines,
      googleConnected: true,
    })
  } catch (err) {
    console.error('Failed to fetch deadlines:', err)
    return NextResponse.json({
      deadlines: [],
      googleConnected: false,
    })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { getAuthenticatedClient } = await import('@/lib/google-auth')
    const auth = getAuthenticatedClient()

    if (!auth) {
      return NextResponse.json(
        { error: 'Google Calendar not connected. Please connect Google first.' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { name, date, organization, link } = body

    if (!name || !date) {
      return NextResponse.json(
        { error: 'Deadline name and date are required' },
        { status: 400 }
      )
    }

    const { google } = await import('googleapis')
    const calendar = google.calendar({ version: 'v3', auth })
    const APPLICATION_DEADLINES_CALENDAR = 'Application Deadlines'

    // Find or create the deadlines calendar
    const calendarList = await calendar.calendarList.list()
    let deadlinesCal = calendarList.data.items?.find(
      (cal) => cal.summary === APPLICATION_DEADLINES_CALENDAR
    )

    if (!deadlinesCal) {
      const created = await calendar.calendars.insert({
        requestBody: {
          summary: APPLICATION_DEADLINES_CALENDAR,
          description: 'Application deadlines tracked via Oulipo Dashboard',
        },
      })
      deadlinesCal = { id: created.data.id }
    }

    // Create an all-day event for the deadline
    const event = await calendar.events.insert({
      calendarId: deadlinesCal.id!,
      requestBody: {
        summary: `${name}${organization ? ` \u2014 ${organization}` : ''}`,
        description: link || '',
        start: {
          date: date, // All-day event: use date (YYYY-MM-DD) not dateTime
        },
        end: {
          date: date, // Same day for deadlines
        },
        extendedProperties: {
          private: {
            organization: organization || '',
            source: 'oulipo-dashboard',
          },
        },
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'popup', minutes: 1440 }, // 1 day before
            { method: 'popup', minutes: 10080 }, // 1 week before
          ],
        },
      },
    })

    return NextResponse.json({
      success: true,
      deadline: {
        id: event.data.id,
        name,
        date,
        organization,
        link,
      },
    })
  } catch (err) {
    console.error('Failed to create deadline:', err)
    return NextResponse.json(
      { error: 'Failed to create deadline in Google Calendar' },
      { status: 500 }
    )
  }
}
