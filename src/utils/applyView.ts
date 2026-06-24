import type { ApplyOpportunityRow, ApplyStatus } from "../types/database";

/**
 * Sort + filter for the Apply reservoir view. Pure so it can be unit-tested.
 *
 * - sort "deadline": soonest deadline first (undated last), then priority, then
 *   created_at.
 * - sort "priority": P0 -> P1 -> P2 -> none, then soonest deadline, then created.
 * - hidden: statuses to filter out (e.g. "skipped").
 */
export type ApplySort = "deadline" | "priority";

const PRIORITY_RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2 };
function prioRank(p: string | null): number {
  return p ? (PRIORITY_RANK[p] ?? 3) : 3;
}
function deadlineKey(d: string | null): number {
  return d ? new Date(d).getTime() : Infinity; // undated sorts last
}
function createdKey(c: string): number {
  const t = new Date(c).getTime();
  return Number.isNaN(t) ? 0 : t;
}

export function viewApplyOpportunities(
  rows: ApplyOpportunityRow[],
  opts: { sort: ApplySort; hidden: Set<ApplyStatus | string> },
): ApplyOpportunityRow[] {
  const filtered = rows.filter((r) => !opts.hidden.has(r.status));
  const sorted = [...filtered];
  if (opts.sort === "priority") {
    sorted.sort(
      (a, b) =>
        prioRank(a.priority) - prioRank(b.priority) ||
        deadlineKey(a.deadline) - deadlineKey(b.deadline) ||
        createdKey(a.created_at) - createdKey(b.created_at),
    );
  } else {
    sorted.sort(
      (a, b) =>
        deadlineKey(a.deadline) - deadlineKey(b.deadline) ||
        prioRank(a.priority) - prioRank(b.priority) ||
        createdKey(a.created_at) - createdKey(b.created_at),
    );
  }
  return sorted;
}
