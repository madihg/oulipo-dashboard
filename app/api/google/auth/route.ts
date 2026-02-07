import { NextRequest, NextResponse } from 'next/server'
import { getAuthUrl } from '@/lib/google-auth'

export async function GET(request: NextRequest) {
  try {
    // Support redirect parameter to return to the originating page after OAuth
    const redirectTo = request.nextUrl.searchParams.get('redirect') || ''
    const url = getAuthUrl(redirectTo)
    return NextResponse.json({ url })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Google OAuth not configured'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
