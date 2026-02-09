import { NextRequest, NextResponse } from 'next/server'
import { getOAuth2Client, saveTokens } from '@/lib/google-auth'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const state = searchParams.get('state') || ''

  // Determine redirect target based on OAuth state parameter
  const defaultRedirect = '/gallery/deadline-calendar'
  const allowedRedirects = ['/gallery/content-publisher', '/gallery/deadline-calendar']
  const redirectTarget = allowedRedirects.includes(state) ? state : defaultRedirect

  if (error) {
    // User denied consent - redirect back to originating page
    return NextResponse.redirect(new URL(`${redirectTarget}?google_error=denied`, request.url))
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
    await saveTokens(tokens as Record<string, unknown>)

    // Redirect back to originating page
    return NextResponse.redirect(new URL(`${redirectTarget}?google_connected=true`, request.url))
  } catch {
    return NextResponse.redirect(new URL(`${redirectTarget}?google_error=failed`, request.url))
  }
}
