import { NextResponse } from 'next/server'
import { isGoogleConnected } from '@/lib/google-auth'

export async function GET() {
  try {
    const connected = isGoogleConnected()
    return NextResponse.json({
      connected,
      scopes: connected ? ['drive.readonly', 'calendar'] : [],
    })
  } catch {
    return NextResponse.json({
      connected: false,
      scopes: [],
    })
  }
}
