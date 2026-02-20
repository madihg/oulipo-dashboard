import { NextResponse } from 'next/server'

/**
 * Returns the expected events table schema for the Upcoming chat agent.
 * The agent uses this to understand required/optional fields.
 */
export async function GET() {
  const table = process.env.SUPABASE_EVENTS_TABLE || 'oulipo-events'
  return NextResponse.json({
    table,
    fields: [
      { name: 'org', type: 'string', required: false, description: 'Hosting organization' },
      { name: 'title', type: 'string', required: true, description: 'Event title' },
      { name: 'description', type: 'string', required: false, description: 'Brief description (3-8 words)' },
      { name: 'type', type: 'string', required: false, description: 'Workshop, Performance, Keynote, Panel, Exhibition, Talk, or empty' },
      { name: 'location', type: 'string', required: false, description: 'City or venue' },
      { name: 'date', type: 'string', required: true, description: 'ISO 8601 YYYY-MM-DD' },
      { name: 'date_end', type: 'string', required: false, description: 'ISO 8601 if multi-day' },
      { name: 'date_display', type: 'string', required: false, description: 'Human-readable e.g. Mar 15, Nov 18-20' },
      { name: 'link', type: 'string', required: false, description: 'Event URL' },
    ],
  })
}
