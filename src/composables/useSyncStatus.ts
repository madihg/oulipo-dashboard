import { reactive, readonly } from "vue";
import { supabase } from "../lib/supabase";
import { failed, pending, subscribe } from "../lib/pendingWrites";

/**
 * One sync state for the whole app.
 *
 * Ten views render the status bar. Each used to open its own realtime
 * heartbeat channel and stamp "last sync" once at mount, which then aged
 * without ever being true. This is a module-level singleton: created on the
 * first call, one channel total, never torn down per view. It reports four
 * facts and nothing else - how many writes are staged, how many of those the
 * server has refused, whether the browser thinks it is online, and whether the
 * realtime socket is joined.
 */
export type Realtime = "connecting" | "connected" | "disconnected";

export type SyncStatus = {
  /** Staged todo writes not yet confirmed by the server. */
  pendingCount: number;
  /**
   * Staged writes the server has rejected at least once; replay will try
   * again on reconnect or focus.
   */
  failedCount: number;
  /** navigator.onLine, kept current by the window online/offline events. */
  online: boolean;
  realtime: Realtime;
};

let state: SyncStatus | null = null;

function countPending(): number {
  return pending().filter((p) => Object.keys(p.patch).length > 0).length;
}

function openChannel(s: SyncStatus): void {
  // A client built without env warns but does not throw here; a test stub
  // without channel() would, so a failure just reads as "not connected".
  try {
    supabase.channel("sync-status").subscribe((status) => {
      if (status === "SUBSCRIBED") s.realtime = "connected";
      else if (
        status === "CLOSED" ||
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT"
      )
        s.realtime = "disconnected";
      else s.realtime = "connecting";
    });
  } catch {
    s.realtime = "disconnected";
  }
}

function create(): SyncStatus {
  const s = reactive<SyncStatus>({
    pendingCount: countPending(),
    failedCount: failed().length,
    online:
      typeof navigator === "undefined" || typeof navigator.onLine !== "boolean"
        ? true
        : navigator.onLine,
    realtime: "connecting",
  });

  subscribe(() => {
    s.pendingCount = countPending();
    s.failedCount = failed().length;
  });

  if (typeof window !== "undefined" && window.addEventListener) {
    window.addEventListener("online", () => {
      s.online = true;
    });
    window.addEventListener("offline", () => {
      s.online = false;
    });
  }

  openChannel(s);
  return s;
}

/** The shared, read-only sync state. Safe to call from any number of views. */
export function useSyncStatus(): Readonly<SyncStatus> {
  if (!state) state = create();
  return readonly(state);
}
