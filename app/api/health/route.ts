import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { isVercelEnvironment } from '@/lib/storage'

export async function GET() {
  const onVercel = isVercelEnvironment()
  const oulipoRepoPath = process.env.OULIPO_REPO_PATH || '/Users/halim/Documents/oulipo'

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

  // Only check filesystem on local dev
  if (!onVercel) {
    checks.fileSystem = {
      oulipoRepo: fs.existsSync(oulipoRepoPath),
      eventsJson: fs.existsSync(path.join(oulipoRepoPath, 'events.json')),
      upcomingHtml: fs.existsSync(path.join(oulipoRepoPath, 'upcoming', 'index.html')),
      cvHtml: fs.existsSync(path.join(oulipoRepoPath, 'cv', 'index.html')),
    }
  }

  return NextResponse.json(checks)
}
