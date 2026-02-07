import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export async function GET() {
  const oulipoRepoPath = process.env.OULIPO_REPO_PATH || '/Users/halim/Documents/oulipo'

  const checks = {
    server: 'ok',
    env: {
      DASHBOARD_PASSWORD: !!process.env.DASHBOARD_PASSWORD,
      ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
      GOOGLE_CLIENT_ID: !!process.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: !!process.env.GOOGLE_CLIENT_SECRET,
    },
    fileSystem: {
      oulipoRepo: fs.existsSync(oulipoRepoPath),
      eventsJson: fs.existsSync(path.join(oulipoRepoPath, 'events.json')),
      upcomingHtml: fs.existsSync(path.join(oulipoRepoPath, 'upcoming', 'index.html')),
      cvHtml: fs.existsSync(path.join(oulipoRepoPath, 'cv', 'index.html')),
    },
  }

  return NextResponse.json(checks)
}
