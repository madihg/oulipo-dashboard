import type { AreaRow, TodoRow } from "./database";

/**
 * Contract for todos created by the daily Claude routine (scheduled task
 * "daily-desk" running in Claude Code). The routine inserts ordinary inbox
 * rows (state='inbox', no area/project) stamped metadata.claude; the Inbox
 * view renders them in the "from claude" section.
 *
 * kind:
 *  - task     - a suggested task extracted from meetings / Day One / email
 *  - decision - a genuine values-level or relationship call of Halim's
 *  - offer    - work Claude ALREADY DID; the row is a receipt, not a request
 *
 * status: the routine runs with no approval gate (2026-08-07), so it only
 * ever writes two of these:
 *  - "done"     - every offer row, always. The work is already finished and
 *                 the deliverable is in the linked todo's notes or Gmail.
 *  - "proposed" - tasks and decisions only. Means "unsorted, for you", NOT
 *                 "awaiting approval". keep/dismiss here is filing.
 *
 * "kept" and "dismissed" are written by this app when Halim files a row.
 * "approved" is LEGACY: it belonged to the removed approve gate, which
 * queued an hmart.claude_tasks row for the next run to execute. The routine
 * no longer produces it and no longer waits on it. The value stays in the
 * union so historical rows still typecheck.
 *
 * suggested_area: the area slug the routine thinks this belongs to. It is
 * NOT written to todos.area_id - the inbox is defined as "no area, no
 * project, no date", so a real area_id would file the row out of the inbox
 * before it was ever seen. The slug rides in metadata, renders as a chip,
 * and keep() applies it for real. Unroutable suggestions may omit it and
 * stay unfiled.
 */
export interface ClaudeMeta {
  suggested: true;
  kind: "task" | "decision" | "offer";
  source: "granola" | "dayone" | "gmail" | "hmart";
  source_id?: string;
  reason?: string;
  offer?: string;
  suggested_area?: string;
  status?: "proposed" | "kept" | "approved" | "done" | "dismissed";
  proposed_at?: string;
}

export function claudeMetaOf(t: TodoRow): ClaudeMeta | null {
  const meta = (t.metadata ?? {}) as { claude?: ClaudeMeta };
  return meta.claude?.suggested ? meta.claude : null;
}

/**
 * Resolve metadata.claude.suggested_area to a real area. Matches on slug
 * first, then on the area's name with emoji and spacing stripped, so a
 * routine that wrote "health" still lands on "🩺 health". Returns null when
 * there is no suggestion or nothing matches - the caller then leaves the
 * todo unfiled rather than guessing.
 */
export function resolveSuggestedArea(
  meta: ClaudeMeta,
  areas: AreaRow[],
): AreaRow | null {
  const want = normalizeAreaKey(meta.suggested_area ?? "");
  if (!want) return null;
  return (
    areas.find((a) => normalizeAreaKey(a.slug) === want) ??
    areas.find((a) => normalizeAreaKey(a.name) === want) ??
    null
  );
}

function normalizeAreaKey(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z]/g, "");
}
