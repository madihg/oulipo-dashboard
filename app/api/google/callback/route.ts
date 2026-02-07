import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.json(
      { error: 'Authorization code missing' },
      { status: 400 }
    )
  }

  // Exchange code for tokens and store server-side
  // Will be implemented here

  return NextResponse.json(
    { error: 'Google OAuth callback not yet implemented' },
    { status: 501 }
  )
}
