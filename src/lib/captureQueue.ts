/**
 * Capture queue: write to IndexedDB FIRST (instant), then POST in background.
 * Failed POSTs stay in the queue and retry on `online` event + on next call.
 *
 * Each queued entry corresponds to one row eventually landing in the
 * `captures` Supabase table. Once the row exists, we trigger `route_capture`
 * Edge Function so Sonnet can classify + draft prep work.
 */

import { supabase } from "./supabase";

const DB_NAME = "hmart-capture";
const STORE = "queue";
const DB_VERSION = 1;

export type CaptureSource = "mobile" | "web" | "dispatch" | "obsidian";
export type QueuedCapture = {
  client_id: string; // uuid generated locally
  raw_text: string;
  source: CaptureSource;
  created_at: string; // ISO when user typed it
  sent: boolean;
  capture_id?: string; // server id once posted
};

let dbPromise: Promise<IDBDatabase> | null = null;
function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "client_id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    const result = Promise.resolve(fn(store));
    t.oncomplete = () => result.then(resolve, reject);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function enqueue(
  raw_text: string,
  source: CaptureSource = "web",
): Promise<QueuedCapture> {
  const entry: QueuedCapture = {
    client_id: crypto.randomUUID(),
    raw_text,
    source,
    created_at: new Date().toISOString(),
    sent: false,
  };
  await tx("readwrite", (s) => {
    s.put(entry);
  });
  // Try to send right away; failures stay queued
  void flush();
  return entry;
}

export async function listPending(): Promise<QueuedCapture[]> {
  return tx("readonly", (s) => {
    return new Promise<QueuedCapture[]>((resolve, reject) => {
      const req = s.getAll();
      req.onsuccess = () =>
        resolve((req.result as QueuedCapture[]).filter((e) => !e.sent));
      req.onerror = () => reject(req.error);
    });
  });
}

export async function flush(): Promise<{ sent: number; failed: number }> {
  const pending = await listPending();
  let sent = 0;
  let failed = 0;
  for (const entry of pending) {
    try {
      await sendOne(entry);
      sent++;
    } catch (e) {
      failed++;
      console.warn("[capture] queue send failed, will retry", e);
    }
  }
  return { sent, failed };
}

async function sendOne(entry: QueuedCapture): Promise<void> {
  await supabase.auth.getSession();
  const { data: sess } = await supabase.auth.getSession();
  const userId = sess.session?.user?.id;
  if (!userId) throw new Error("not signed in");
  // Insert into captures preserving the original created_at
  const { data, error } = await supabase
    .from("captures")
    .insert({
      user_id: userId,
      raw_text: entry.raw_text,
      source: entry.source,
      state: "pending",
      created_at: entry.created_at,
    } as never)
    .select()
    .single();
  if (error || !data) throw error ?? new Error("insert failed");

  // Mark sent locally with the server id
  entry.sent = true;
  entry.capture_id = data.id as string;
  await tx("readwrite", (s) => {
    s.put(entry);
  });

  // Fire the router. Don't await; the inbox UI subscribes via Realtime.
  void invokeRouter(data.id as string);
}

async function invokeRouter(captureId: string): Promise<void> {
  try {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/route_capture`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ capture_id: captureId }),
      },
    );
  } catch (e) {
    console.warn("[capture] router invoke failed (will retry server-side)", e);
  }
}

export async function clearSent(
  olderThanMs = 1000 * 60 * 60 * 24,
): Promise<void> {
  const cutoff = Date.now() - olderThanMs;
  await tx("readwrite", (s) => {
    return new Promise<void>((resolve, reject) => {
      const req = s.getAll();
      req.onsuccess = () => {
        const all = req.result as QueuedCapture[];
        for (const e of all) {
          if (e.sent && new Date(e.created_at).getTime() < cutoff) {
            s.delete(e.client_id);
          }
        }
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  });
}

// Auto-retry on reconnect
if (typeof window !== "undefined") {
  window.addEventListener("online", () => void flush());
}
