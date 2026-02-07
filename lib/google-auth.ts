import fs from 'fs'
import path from 'path'

const TOKENS_FILE = path.join(process.cwd(), '.google-tokens.json')

const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/calendar',
]

export function getOAuth2Client() {
  // Dynamic import of googleapis to avoid bundle issues
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { google } = require('googleapis')

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth not configured')
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/google/callback`

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri)
}

export function getAuthUrl(): string {
  const oauth2Client = getOAuth2Client()
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  })
}

export function saveTokens(tokens: Record<string, unknown>) {
  // Atomic write: write to temp file then rename to prevent corruption
  const tempFile = TOKENS_FILE + '.tmp'
  try {
    fs.writeFileSync(tempFile, JSON.stringify(tokens, null, 2), 'utf-8')
    fs.renameSync(tempFile, TOKENS_FILE)
  } catch (err) {
    // Clean up temp file on failure
    try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile) } catch { /* ignore cleanup error */ }
    throw err
  }
}

export function loadTokens(): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(TOKENS_FILE)) return null
    const data = fs.readFileSync(TOKENS_FILE, 'utf-8')
    return JSON.parse(data)
  } catch {
    return null
  }
}

export function getAuthenticatedClient() {
  const oauth2Client = getOAuth2Client()
  const tokens = loadTokens()

  if (!tokens) {
    return null
  }

  oauth2Client.setCredentials(tokens)

  // Set up automatic token refresh
  oauth2Client.on('tokens', (newTokens: Record<string, unknown>) => {
    const current = loadTokens() || {}
    saveTokens({ ...current, ...newTokens })
  })

  return oauth2Client
}

export function isGoogleConnected(): boolean {
  const tokens = loadTokens()
  return tokens !== null && !!tokens.access_token
}
