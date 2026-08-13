import type { AreaRow, TodoRow } from "./database";
import { whenPatch, todayISO, type WhenPatch } from "../utils/when";

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
 *
 * suggested_when: the do-date the routine proposes, same indirection and for
 * the same reason (a real start_date would leak the row into Today before
 * Halim accepts it). Either a WhenPicker key ('today' | 'evening' |
 * 'tomorrow' | 'weekend' | 'next_week' | 'someday') or an ISO date
 * (YYYY-MM-DD). Renders as a chip; keep() applies it via whenPatch so the
 * kept row lands scheduled, not in anytime.
 */
export interface ClaudeMeta {
  suggested: true;
  kind: "task" | "decision" | "offer";
  source: "granola" | "dayone" | "gmail" | "hmart";
  source_id?: string;
  reason?: string;
  offer?: string;
  suggested_area?: string;
  suggested_when?: string;
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

const WHEN_KEYS = [
  "today",
  "evening",
  "tomorrow",
  "weekend",
  "next_week",
  "someday",
] as const;
const WHEN_CHIP_LABEL: Record<(typeof WHEN_KEYS)[number], string> = {
  today: "today",
  evening: "this evening",
  tomorrow: "tomorrow",
  weekend: "this weekend",
  next_week: "next week",
  someday: "someday",
};

/**
 * Resolve metadata.claude.suggested_when to the {state, start_date, evening}
 * write keep() applies, plus the chip label. Accepts the WhenPicker keys or
 * an ISO date; an ISO date that already passed resolves to 'today' (a stale
 * do-date means do it now, not backdate it). Returns null when nothing is
 * suggested or the value is malformed - keep() then leaves scheduling alone.
 */
export function resolveSuggestedWhen(
  meta: ClaudeMeta,
  now: Date = new Date(),
): { patch: WhenPatch; label: string } | null {
  const raw = (meta.suggested_when ?? "").trim();
  if (!raw) return null;
  if ((WHEN_KEYS as readonly string[]).includes(raw)) {
    const key = raw as (typeof WHEN_KEYS)[number];
    return { patch: whenPatch(key, { now }), label: WHEN_CHIP_LABEL[key] };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    if (raw <= todayISO(now)) {
      return { patch: whenPatch("today", { now }), label: "today" };
    }
    const [y, m, d] = raw.split("-").map(Number);
    const label = new Date(y!, (m ?? 1) - 1, d ?? 1)
      .toLocaleDateString("en-US", { month: "short", day: "numeric" })
      .toLowerCase();
    return { patch: whenPatch("date", { now, date: raw }), label };
  }
  return null;
}
