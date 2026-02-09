import { getGoogleTokens, setGoogleTokens } from '@/lib/storage'

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

export function getAuthUrl(redirectTo?: string): string {
  const oauth2Client = getOAuth2Client()
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
    state: redirectTo || '',
  })
}

export async function saveTokens(tokens: Record<string, unknown>) {
  await setGoogleTokens(tokens)
}

export async function loadTokens(): Promise<Record<string, unknown> | null> {
  return getGoogleTokens()
}

export async function getAuthenticatedClient() {
  const oauth2Client = getOAuth2Client()
  const tokens = await loadTokens()

  if (!tokens) {
    return null
  }

  oauth2Client.setCredentials(tokens)

  // Set up automatic token refresh
  oauth2Client.on('tokens', async (newTokens: Record<string, unknown>) => {
    const current = (await loadTokens()) || {}
    await saveTokens({ ...current, ...newTokens })
  })

  return oauth2Client
}

export async function isGoogleConnected(): Promise<boolean> {
  const tokens = await loadTokens()
  return tokens !== null && !!tokens.access_token
}
