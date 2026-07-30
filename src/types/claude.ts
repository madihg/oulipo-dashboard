import type { TodoRow } from "./database";

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
 */
export interface ClaudeMeta {
  suggested: true;
  kind: "task" | "decision" | "offer";
  source: "granola" | "dayone" | "gmail" | "hmart";
  source_id?: string;
  reason?: string;
  offer?: string;
  status?: "proposed" | "kept" | "approved" | "done" | "dismissed";
  proposed_at?: string;
}

export function claudeMetaOf(t: TodoRow): ClaudeMeta | null {
  const meta = (t.metadata ?? {}) as { claude?: ClaudeMeta };
  return meta.claude?.suggested ? meta.claude : null;
}
