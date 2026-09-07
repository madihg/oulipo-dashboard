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
 * load / reconnect / tab-focus. A refused write is also marked, so the status
 * bar can say "unsaved" for it instead of "saving" until that replay lands.
 */

const KEY = "hmart:pending-todo-writes";
const MAX_ENTRIES = 50;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type Patch = Record<string, unknown>;
/**
 * `failedAt` is set once the server has refused the staged value at least once.
 * The entry stays queued either way; the mark only changes the word the status
 * bar uses for a write that is no longer in flight.
 */
type Entry = { patch: Patch; ts: number; failedAt?: number };
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

/**
 * Change listeners. The status bar counts what is queued; it must hear every
 * stage, settle and clear without polling. Listeners get no payload: read
 * pending() for the current state.
 */
type Listener = () => void;
const listeners = new Set<Listener>();

/** Hear every change to the log. Returns the unsubscribe. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(): void {
  // Snapshot so a listener that unsubscribes itself does not skip its neighbour.
  for (const listener of Array.from(listeners)) {
    try {
      listener();
    } catch {
      // One listener throwing must not stop the write or the others.
    }
  }
}

/** Record an intent to write. Synchronous, call before awaiting anything. */
export function stage(id: string, patch: Patch): void {
  const log = read();
  const prev = log[id]?.patch ?? {};
  // A fresh entry on purpose: a new edit is a new attempt, so a failedAt mark
  // from the last one is dropped here.
  log[id] = { patch: { ...prev, ...patch }, ts: Date.now() };
  write(log);
  notify();
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
  notify();
}

/**
 * Record that the server refused the staged value: an error, or zero rows
 * because the session expired or the row is gone. The entry stays queued for
 * the next replay; only the mark changes. Quiet when nothing is staged.
 */
export function fail(id: string): void {
  const log = read();
  const entry = log[id];
  if (!entry) return;
  entry.failedAt = Date.now();
  write(log);
  notify();
}

/** Ids of staged writes the server has refused at least once. */
export function failed(): string[] {
  return Object.entries(read())
    .filter(([, e]) => e.failedAt != null && Object.keys(e.patch).length > 0)
    .map(([id]) => id);
}

export function pending(): Array<{ id: string; patch: Patch }> {
  return Object.entries(read()).map(([id, e]) => ({ id, patch: e.patch }));
}

export function clearAll(): void {
  memory = null;
  const ls = backing();
  if (ls) {
    try {
      ls.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }
  notify();
}

/**
 * Re-send everything still queued. `send` returns true when the server
 * confirmed; a false leaves the entry for the next attempt, marked failed.
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
    } else {
      // ...and the failure mark, for the same reason.
      fail(id);
    }
  }
  return replayed;
}
