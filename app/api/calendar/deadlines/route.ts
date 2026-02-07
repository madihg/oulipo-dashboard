import { NextRequest, NextResponse } from 'next/server'
import { isGoogleConnected } from '@/lib/google-auth'
import fs from 'fs'
import path from 'path'

const LOCAL_DEADLINES_FILE = path.join(process.cwd(), '.deadlines.json')

// Local file storage for deadlines (used when Google is not connected)
function readLocalDeadlines(): Array<{
  id: string
  name: string
  date: string
  organization: string
  link: string
}> {
  try {
    if (!fs.existsSync(LOCAL_DEADLINES_FILE)) return []
    const data = fs.readFileSync(LOCAL_DEADLINES_FILE, 'utf-8')
    return JSON.parse(data)
  } catch {
    return []
  }
}

function writeLocalDeadlines(deadlines: Array<{
  id: string
  name: string
  date: string
  organization: string
  link: string
}>) {
  fs.writeFileSync(LOCAL_DEADLINES_FILE, JSON.stringify(deadlines, null, 2), 'utf-8')
}

export async function GET() {
  try {
    const connected = isGoogleConnected()

    if (!connected) {
      // Fall back to local deadlines file
      const localDeadlines = readLocalDeadlines()
      // Filter to upcoming deadlines only
      const now = new Date().toISOString().split('T')[0]
      const upcoming = localDeadlines.filter((d) => d.date >= now)
      // Sort by date ascending
      upcoming.sort((a, b) => a.date.localeCompare(b.date))

      return NextResponse.json({
        deadlines: upcoming,
        googleConnected: false,
      })
    }

    // Dynamically import googleapis only when needed
    const { google } = await import('googleapis')
    const { getAuthenticatedClient } = await import('@/lib/google-auth')
    const auth = getAuthenticatedClient()

    if (!auth) {
      // Fall back to local deadlines
      const localDeadlines = readLocalDeadlines()
      const now = new Date().toISOString().split('T')[0]
      const upcoming = localDeadlines.filter((d) => d.date >= now)
      upcoming.sort((a, b) => a.date.localeCompare(b.date))

      return NextResponse.json({
        deadlines: upcoming,
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
    // Final fallback to local deadlines
    // Preserve the googleConnected status based on whether tokens exist,
    // even if the Google API call failed (e.g., due to network issues)
    const connected = isGoogleConnected()
    const localDeadlines = readLocalDeadlines()
    const now = new Date().toISOString().split('T')[0]
    const upcoming = localDeadlines.filter((d) => d.date >= now)
    upcoming.sort((a, b) => a.date.localeCompare(b.date))

    return NextResponse.json({
      deadlines: upcoming,
      googleConnected: connected,
    })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, date, organization, link, forceLocal } = body

    if (!name || !date) {
      return NextResponse.json(
        { error: 'Deadline name and date are required' },
        { status: 400 }
      )
    }

    // Try Google Calendar first (unless forceLocal is set)
    const connected = isGoogleConnected()
    if (connected && !forceLocal) {
      try {
        const { getAuthenticatedClient } = await import('@/lib/google-auth')
        const auth = getAuthenticatedClient()

        if (auth) {
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
                date: date,
              },
              end: {
                date: date,
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
                  { method: 'popup', minutes: 1440 },
                  { method: 'popup', minutes: 10080 },
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
        }
      } catch (googleErr: unknown) {
        // Check if this is an auth/token expiry error
        const errMsg = googleErr instanceof Error ? googleErr.message : String(googleErr)
        const isAuthError = errMsg.includes('invalid_grant') ||
          errMsg.includes('Token has been expired') ||
          errMsg.includes('Token has been revoked') ||
          errMsg.includes('Invalid Credentials') ||
          (typeof googleErr === 'object' && googleErr !== null && 'code' in googleErr && (googleErr as { code: number }).code === 401)

        if (isAuthError) {
          console.error('Google token expired/revoked, requesting re-auth:', errMsg)
          return NextResponse.json({
            success: false,
            needsReauth: true,
            error: 'Google connection expired. Please reconnect to sync to Google Calendar.',
          }, { status: 401 })
        }

        console.error('Google Calendar failed, falling back to local storage:', googleErr)
        // Fall through to local storage
      }
    }

    // Fallback: save to local file
    const deadlines = readLocalDeadlines()
    const newDeadline = {
      id: `local-${Date.now()}`,
      name,
      date,
      organization: organization || '',
      link: link || '',
    }
    deadlines.push(newDeadline)

    // Sort by date
    deadlines.sort((a, b) => a.date.localeCompare(b.date))
    writeLocalDeadlines(deadlines)

    return NextResponse.json({
      success: true,
      deadline: newDeadline,
    })
  } catch (err) {
    console.error('Failed to create deadline:', err)
    return NextResponse.json(
      { error: 'Failed to create deadline' },
      { status: 500 }
    )
  }
}
