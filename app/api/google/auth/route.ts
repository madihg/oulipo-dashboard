import { NextResponse } from 'next/server'

export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: 'Google OAuth not configured' },
      { status: 500 }
    )
  }

  // Google OAuth flow will be implemented here
  // Scopes: Drive (read-only), Calendar (read + write)

  return NextResponse.json(
    { error: 'Google OAuth not yet implemented' },
    { status: 501 }
  )
}
