import { NextResponse } from 'next/server'
import { getAuthUrl } from '@/lib/google-auth'

export async function GET() {
  try {
    const url = getAuthUrl()
    return NextResponse.json({ url })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Google OAuth not configured'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
