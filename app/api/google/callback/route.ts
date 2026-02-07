import { NextRequest, NextResponse } from 'next/server'
import { getOAuth2Client, saveTokens } from '@/lib/google-auth'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  if (error) {
    // User denied consent - redirect back to dashboard
    return NextResponse.redirect(new URL('/gallery/deadline-calendar?google_error=denied', request.url))
  }

  if (!code) {
    return NextResponse.json(
      { error: 'Authorization code missing' },
      { status: 400 }
    )
  }

  try {
    const oauth2Client = getOAuth2Client()
    const { tokens } = await oauth2Client.getToken(code)
    saveTokens(tokens as Record<string, unknown>)

    // Redirect back to Deadline Calendar
    return NextResponse.redirect(new URL('/gallery/deadline-calendar?google_connected=true', request.url))
  } catch {
    return NextResponse.redirect(new URL('/gallery/deadline-calendar?google_error=failed', request.url))
  }
}
