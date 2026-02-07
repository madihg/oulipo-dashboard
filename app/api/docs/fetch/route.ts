import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const url = searchParams.get('url')

  if (!url) {
    return NextResponse.json(
      { error: 'Google Doc URL is required' },
      { status: 400 }
    )
  }

  // Fetch Google Doc content via Drive API
  // Parse into plain text for Claude processing
  // Will be implemented here

  return NextResponse.json(
    { error: 'Google Docs fetch not yet implemented' },
    { status: 501 }
  )
}
