import type { ShareItemRow, ShareStatus } from "../types/database";

/**
 * Sort + filter for the Share reservoir view. Pure so it can be unit-tested.
 *
 * - sort "slot": soonest target slot first (unslotted last), then priority,
 *   then created_at.
 * - sort "priority": P0 -> P1 -> P2 -> none, then soonest slot, then created.
 * - hidden: statuses to filter out (e.g. shipped / dropped / slot_skipped).
 */
export type ShareSort = "slot" | "priority";

const PRIORITY_RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2 };
function prioRank(p: string | null): number {
  return p ? (PRIORITY_RANK[p] ?? 3) : 3;
}
function slotKey(d: string | null): number {
  return d ? new Date(d).getTime() : Infinity; // unslotted sorts last
}
function createdKey(c: string): number {
  const t = new Date(c).getTime();
  return Number.isNaN(t) ? 0 : t;
}

export function viewShareItems(
  rows: ShareItemRow[],
  opts: { sort: ShareSort; hidden: Set<ShareStatus | string> },
): ShareItemRow[] {
  const filtered = rows.filter((r) => !opts.hidden.has(r.status));
  const sorted = [...filtered];
  if (opts.sort === "priority") {
    sorted.sort(
      (a, b) =>
        prioRank(a.priority) - prioRank(b.priority) ||
        slotKey(a.target_slot_at) - slotKey(b.target_slot_at) ||
        createdKey(a.created_at) - createdKey(b.created_at),
    );
  } else {
    sorted.sort(
      (a, b) =>
        slotKey(a.target_slot_at) - slotKey(b.target_slot_at) ||
        prioRank(a.priority) - prioRank(b.priority) ||
        createdKey(a.created_at) - createdKey(b.created_at),
    );
  }
  return sorted;
}
