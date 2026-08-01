import type { AreaRow, TodoRow } from "./database";

/**
 * Contract for todos created by the daily Claude routine (scheduled task
 * "daily-desk" running in Claude Code). The routine inserts ordinary inbox
 * rows (state='inbox', no area/project) stamped metadata.claude; the Inbox
 * view renders them in the "from claude" section.
 *
 * kind:
 *  - task     - a suggested task extracted from meetings / Day One / email
 *  - decision - something only Halim can decide; the question is the title
 *  - offer    - work Claude can do itself; approving inserts a queued
 *               hmart.claude_tasks row that the next routine run executes
 *
 * status: proposed -> kept (accepted as a normal task) | approved (offer
 * queued for execution) | done (offer executed) | dismissed.
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
