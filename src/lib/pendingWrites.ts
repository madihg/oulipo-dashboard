/**
 * Write-ahead log for todo updates.
 *
 * Every todo patch is written to localStorage SYNCHRONOUSLY before it is sent.
 * That is the whole point: iOS can evict a backgrounded PWA between "user typed"
 * and "network call resolved", and a debounce or an in-memory retry queue dies
 * with the page. A synchronous localStorage write does not.
 *
 * An entry is dropped only once the server has confirmed that exact value, so a
 * failed, zero-row, or never-sent write stays queued and is replayed on the next
 * load / reconnect / tab-focus.
 */

const KEY = "hmart:pending-todo-writes";
const MAX_ENTRIES = 50;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type Patch = Record<string, unknown>;
type Entry = { patch: Patch; ts: number };
type Log = Record<string, Entry>;

/**
 * Storage backend. localStorage is preferred because it survives the page being
 * killed, but it is not always usable - Safari private mode throws on write,
 * and some embedded webviews expose a stubbed object without the methods. In
 * those cases we fall back to an in-memory store: worse than durable, far
 * better than dropping the user's edit on the floor.
 */
let memory: string | null = null;
function backing(): Pick<Storage, "getItem" | "setItem" | "removeItem"> | null {
  try {
    const ls = globalThis.localStorage;
    if (
      ls &&
      typeof ls.getItem === "function" &&
      typeof ls.setItem === "function"
    ) {
      return ls;
    }
  } catch {
    /* accessing localStorage can itself throw */
  }
  return null;
}
function readRaw(): string | null {
  // Prefer the in-memory copy whenever this session has written one. In Safari
  // private mode getItem() works but setItem() throws, so trusting localStorage
  // here would keep handing back a stale snapshot and silently lose every edit
  // made in the session - exactly the case the fallback exists for.
  if (memory !== null) return memory;
  const ls = backing();
  if (!ls) return null;
  try {
    return ls.getItem(KEY);
  } catch {
    return null;
  }
}
function writeRaw(value: string): void {
  memory = value;
  const ls = backing();
  if (!ls) return;
  try {
    ls.setItem(KEY, value);
  } catch {
    // Quota or private-mode failure - the in-memory copy above still stands.
  }
}

function read(): Log {
  try {
    const raw = readRaw();
    if (!raw) return {};
    return JSON.parse(raw) as Log;
  } catch {
    return {};
  }
}

function write(log: Log): void {
  // Drop anything stale, then cap to the newest MAX_ENTRIES.
  const cutoff = Date.now() - MAX_AGE_MS;
  const fresh = Object.entries(log)
    .filter(([, e]) => e.ts >= cutoff)
    .sort((a, b) => b[1].ts - a[1].ts)
    .slice(0, MAX_ENTRIES);
  writeRaw(JSON.stringify(Object.fromEntries(fresh)));
}

/** Record an intent to write. Synchronous, call before awaiting anything. */
export function stage(id: string, patch: Patch): void {
  const log = read();
  const prev = log[id]?.patch ?? {};
  log[id] = { patch: { ...prev, ...patch }, ts: Date.now() };
  write(log);
}

/**
 * Confirm a write landed. Only clears the fields whose staged value still
 * matches what the server accepted - if the user edited again while the
 * request was in flight, the newer value stays queued instead of being lost.
 */
export function settle(id: string, patch: Patch): void {
  const log = read();
  const entry = log[id];
  if (!entry) return;
  for (const [k, v] of Object.entries(patch)) {
    if (JSON.stringify(entry.patch[k]) === JSON.stringify(v)) {
      delete entry.patch[k];
    }
  }
  if (!Object.keys(entry.patch).length) delete log[id];
  write(log);
}

export function pending(): Array<{ id: string; patch: Patch }> {
  return Object.entries(read()).map(([id, e]) => ({ id, patch: e.patch }));
}

export function clearAll(): void {
  memory = null;
  const ls = backing();
  if (!ls) return;
  try {
    ls.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Re-send everything still queued. `send` returns true when the server
 * confirmed; a false leaves the entry for the next attempt.
 */
export async function replay(
  send: (id: string, patch: Patch) => Promise<boolean>,
): Promise<number> {
  let replayed = 0;
  for (const { id, patch } of pending()) {
    if (!Object.keys(patch).length) continue;
    const ok = await send(id, patch);
    if (ok) {
      // replay owns the settle so no caller can forget and loop forever.
      settle(id, patch);
      replayed++;
    }
  }
  return replayed;
}
