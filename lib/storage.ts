/**
 * Storage abstraction layer for Oulipo Dashboard.
 *
 * - On Vercel (when UPSTASH_REDIS_REST_URL is set): uses Upstash Redis
 * - Locally (no Redis URL): uses filesystem JSON files
 *
 * This lets the same codebase work in both environments.
 */

import fs from 'fs'
import path from 'path'

// Storage keys
export const STORAGE_KEYS = {
  GOOGLE_TOKENS: 'oulipo:google-tokens',
  EVENTS: 'oulipo:events',
  DEADLINES: 'oulipo:deadlines',
} as const

// Detect if we're running on Vercel with Redis configured
function isRedisConfigured(): boolean {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
}

// Lazy-init Redis client (only created when needed)
let redisClient: import('@upstash/redis').Redis | null = null

async function getRedis() {
  if (!redisClient) {
    const { Redis } = await import('@upstash/redis')
    redisClient = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  }
  return redisClient
}

// ── Generic get/set ──────────────────────────────────────────────────

export async function getItem<T>(key: string, fallbackPath?: string): Promise<T | null> {
  if (isRedisConfigured()) {
    const redis = await getRedis()
    const data = await redis.get<T>(key)
    return data ?? null
  }

  // Filesystem fallback for local development
  if (!fallbackPath) return null
  try {
    if (!fs.existsSync(fallbackPath)) return null
    const raw = fs.readFileSync(fallbackPath, 'utf-8')
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export async function setItem<T>(key: string, value: T, fallbackPath?: string): Promise<void> {
  if (isRedisConfigured()) {
    const redis = await getRedis()
    await redis.set(key, value)
    return
  }

  // Filesystem fallback for local development
  if (!fallbackPath) return
  const tempFile = fallbackPath + '.tmp'
  try {
    fs.writeFileSync(tempFile, JSON.stringify(value, null, 2), 'utf-8')
    fs.renameSync(tempFile, fallbackPath)
  } catch (err) {
    try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile) } catch { /* ignore */ }
    throw err
  }
}

// ── Convenience helpers ──────────────────────────────────────────────

const LOCAL_TOKENS_FILE = path.join(process.cwd(), '.google-tokens.json')
const LOCAL_DEADLINES_FILE = path.join(process.cwd(), '.deadlines.json')

export async function getGoogleTokens(): Promise<Record<string, unknown> | null> {
  return getItem<Record<string, unknown>>(STORAGE_KEYS.GOOGLE_TOKENS, LOCAL_TOKENS_FILE)
}

export async function setGoogleTokens(tokens: Record<string, unknown>): Promise<void> {
  return setItem(STORAGE_KEYS.GOOGLE_TOKENS, tokens, LOCAL_TOKENS_FILE)
}

export async function getEvents(eventsFilePath?: string): Promise<Record<string, unknown>[]> {
  return (await getItem<Record<string, unknown>[]>(STORAGE_KEYS.EVENTS, eventsFilePath)) || []
}

export async function setEvents(events: Record<string, unknown>[], eventsFilePath?: string): Promise<void> {
  return setItem(STORAGE_KEYS.EVENTS, events, eventsFilePath)
}

export interface Deadline {
  id: string
  name: string
  date: string
  organization: string
  link: string
}

export async function getDeadlines(): Promise<Deadline[]> {
  return (await getItem<Deadline[]>(STORAGE_KEYS.DEADLINES, LOCAL_DEADLINES_FILE)) || []
}

export async function setDeadlines(deadlines: Deadline[]): Promise<void> {
  return setItem(STORAGE_KEYS.DEADLINES, deadlines, LOCAL_DEADLINES_FILE)
}

/** Check if we're running on Vercel (no local filesystem for oulipo repo) */
export function isVercelEnvironment(): boolean {
  return !!process.env.VERCEL
}
