import { NextResponse } from 'next/server'
import { isVercelEnvironment } from '@/lib/storage'

export async function GET() {
  const onVercel = isVercelEnvironment()

  const checks: Record<string, unknown> = {
    server: 'ok',
    environment: onVercel ? 'vercel' : 'local',
    env: {
      DASHBOARD_PASSWORD: !!process.env.DASHBOARD_PASSWORD,
      ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
      GOOGLE_CLIENT_ID: !!process.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: !!process.env.GOOGLE_CLIENT_SECRET,
      UPSTASH_REDIS_REST_URL: !!process.env.UPSTASH_REDIS_REST_URL,
    },
  }

  return NextResponse.json(checks)
}
