import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedClient } from '@/lib/google-auth'

/**
 * Extract Google Doc ID from various URL formats:
 * - https://docs.google.com/document/d/DOC_ID/edit
 * - https://docs.google.com/document/d/DOC_ID/
 * - https://docs.google.com/document/d/DOC_ID
 * - Direct doc ID string
 */
function extractDocId(url: string): string | null {
  // Try to match Google Docs URL pattern
  const match = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/)
  if (match) return match[1]

  // If it looks like a plain doc ID (alphanumeric + hyphens/underscores)
  if (/^[a-zA-Z0-9_-]+$/.test(url.trim())) {
    return url.trim()
  }

  return null
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const url = searchParams.get('url')

  if (!url) {
    return NextResponse.json(
      { error: 'Google Doc URL is required' },
      { status: 400 }
    )
  }

  // Validate it looks like a Google Docs URL or doc ID
  const docId = extractDocId(url)
  if (!docId) {
    return NextResponse.json(
      { error: 'Invalid Google Doc URL. Please provide a valid Google Docs link.' },
      { status: 400 }
    )
  }

  // Check Google OAuth authentication
  const auth = getAuthenticatedClient()
  if (!auth) {
    return NextResponse.json(
      { error: 'Google not connected. Please connect your Google account first.', needsAuth: true },
      { status: 401 }
    )
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { google } = require('googleapis')
    const drive = google.drive({ version: 'v3', auth })

    // Export the document as plain text
    const response = await drive.files.export({
      fileId: docId,
      mimeType: 'text/plain',
    })

    const content = response.data
    if (!content || (typeof content === 'string' && content.trim().length === 0)) {
      return NextResponse.json(
        { error: 'The Google Doc appears to be empty.' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      content: typeof content === 'string' ? content : String(content),
      docId,
    })
  } catch (err: unknown) {
    const error = err as { code?: number; message?: string; errors?: Array<{ reason?: string }> }

    // Handle specific Google API errors
    if (error.code === 404) {
      return NextResponse.json(
        { error: 'Google Doc not found. Check the URL and make sure you have access.' },
        { status: 404 }
      )
    }

    if (error.code === 403) {
      const reason = error.errors?.[0]?.reason
      if (reason === 'insufficientPermissions' || reason === 'forbidden') {
        return NextResponse.json(
          { error: 'Permission denied. Make sure you have access to this document and Drive is connected.', needsAuth: true },
          { status: 403 }
        )
      }
      return NextResponse.json(
        { error: 'Access denied to this document. Check sharing settings.' },
        { status: 403 }
      )
    }

    if (error.code === 401) {
      return NextResponse.json(
        { error: 'Google authentication expired. Please reconnect your Google account.', needsAuth: true },
        { status: 401 }
      )
    }

    console.error('Google Docs fetch error:', error.message || error)
    return NextResponse.json(
      { error: 'Failed to fetch Google Doc content. Please try again.' },
      { status: 500 }
    )
  }
}
