import { NextResponse } from 'next/server'

export async function GET() {
  // Check if Google OAuth tokens exist and are valid
  // Will be implemented here

  return NextResponse.json({
    connected: false,
    scopes: [],
  })
}
