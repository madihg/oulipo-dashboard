import { NextResponse } from "next/server";

export async function GET() {
  const checks: Record<string, unknown> = {
    server: "ok",
    environment: process.env.VERCEL ? "vercel" : "local",
    env: {
      DASHBOARD_PASSWORD: !!process.env.DASHBOARD_PASSWORD,
      ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
      OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
    },
  };

  return NextResponse.json(checks);
}
