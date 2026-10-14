import type {
  TrashEntry,
  TrashKind,
  TrashRestoreResult,
} from "../types/database";
import { isoDate } from "./when";

/**
 * Pure helpers for the trash page: what a deleted thing is called, when it
 * went, who sent it there and what comes back with it. Lowercase, the app's
 * own words, no table names where a person reads.
 */

/** source_table -> what a person calls one of them. */
export const KIND_LABELS: Record<string, string> = {
  todos: "task",
  checklist_items: "checklist item",
  projects: "project",
  areas: "area",
  headings: "heading",
  captures: "capture",
  tags: "tag",
  board_notes: "board note",
  learn_items: "reading",
  learn_wikis: "wiki",
  make_wikis: "make wiki",
  memory_entries: "note",
  network_contacts: "person",
  apply_opportunities: "opportunity",
  share_items: "post",
  outings_events: "event",
  write_drafts: "draft",
  area_goals: "goal",
  claude_tasks: "claude task",
  repeating_rules: "repeat rule",
  todo_tags: "tag link",
  surfaced_from: "source link",
};

/** One of them: "task". An unknown table reads as its name, spaced. */
export function kindLabel(table: string): string {
  return KIND_LABELS[table] ?? table.replace(/_/g, " ");
}

/** The plural of a label: "tasks", "people", "opportunities". A name that
 *  already ends in s (an unknown table, usually) is left alone. */
export function pluralize(label: string): string {
  if (/\bperson$/.test(label)) return label.replace(/person$/, "people");
  if (/s$/.test(label)) return label;
  if (/[^aeiou]y$/.test(label)) return label.slice(0, -1) + "ies";
  return label + "s";
}

/** "1 task", "12 checklist items": the noun for a count. */
export function kindNoun(table: string, n: number): string {
  const one = kindLabel(table);
  return n === 1 ? one : pluralize(one);
}

const DELETED_BY: Record<string, string> = {
  app: "by app",
  routine: "by routine",
  claude: "by claude",
  backup: "from backup",
};
/** "by app", "by claude", "from backup". */
export function byLabel(deletedBy: string | null | undefined): string {
  if (!deletedBy) return "";
  return DELETED_BY[deletedBy] ?? `by ${deletedBy}`;
}

const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
] as const;

/** "oct 2", or "oct 2 2025" outside the current year. */
export function shortDate(d: Date, now: Date = new Date()): string {
  const base = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === now.getFullYear()
    ? base
    : `${base} ${d.getFullYear()}`;
}

/** "just now", "5m ago", "2h ago", "3d ago", then the date: "oct 2". */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  const s = Math.floor((now.getTime() - t.getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return shortDate(t, now);
}

/** The day header: "today", "yesterday", "oct 10". Local days. */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "earlier";
  const key = isoDate(t);
  if (key === isoDate(now)) return "today";
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (key === isoDate(y)) return "yesterday";
  return shortDate(t, now);
}

/** When it went. A backup row's date is only a bound: it was gone by then. */
export function whenLabel(e: TrashEntry, now: Date = new Date()): string {
  if (e.deleted_by === "backup") {
    const t = new Date(e.deleted_at);
    return Number.isNaN(t.getTime())
      ? ""
      : `deleted after ${shortDate(t, now)}`;
  }
  return relativeTime(e.deleted_at, now);
}

/** The row's one caption: "task · admin · 2h ago · by app". */
export function captionOf(e: TrashEntry, now: Date = new Date()): string {
  return [
    kindLabel(e.source_table),
    e.context ?? "",
    whenLabel(e, now),
    byLabel(e.deleted_by),
  ]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" · ");
}

/** "with 12 checklist items, 2 tag links": what comes back with it. Biggest
 *  first. Empty when nothing cascaded. */
export function childrenSummary(
  children: Record<string, number> | null | undefined,
  childCount = 0,
): string {
  const parts = Object.entries(children ?? {})
    .map(([table, n]) => [table, Number(n) || 0] as const)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || kindLabel(a[0]).localeCompare(kindLabel(b[0])))
    .map(([table, n]) => `${n} ${kindNoun(table, n)}`);
  if (parts.length) return `with ${parts.join(", ")}`;
  if (childCount > 0)
    return `with ${childCount} linked row${childCount === 1 ? "" : "s"}`;
  return "";
}

export type TrashDay = { key: string; label: string; entries: TrashEntry[] };

/** Entries (newest first) under their local day, in the order they came. */
export function groupByDay(
  entries: TrashEntry[],
  now: Date = new Date(),
): TrashDay[] {
  const out: TrashDay[] = [];
  const byKey = new Map<string, TrashDay>();
  for (const e of entries) {
    const t = new Date(e.deleted_at);
    const key = Number.isNaN(t.getTime()) ? "unknown" : isoDate(t);
    let day = byKey.get(key);
    if (!day) {
      day = { key, label: dayLabel(e.deleted_at, now), entries: [] };
      byKey.set(key, day);
      out.push(day);
    }
    day.entries.push(e);
  }
  return out;
}

/** A title cut to n characters, an ellipsis marking the cut. */
export function clip(s: string, n = 40): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

/** Whether the entry's OWN row came back. Its children or a batch sibling
 *  coming back is not the same thing. */
export function isSelfBack(
  e: Pick<TrashEntry, "source_table" | "row_id">,
  result: TrashRestoreResult,
): boolean {
  return result.restored.some(
    (r) => r.table === e.source_table && String(r.id) === e.row_id,
  );
}

/**
 * The receipt after a restore. `selfBack` is whether the entry itself came
 * back; `alsoBack` how many other listed entries came back with it (a batch).
 * A skip names its reason: the entry's own when it stayed, else the first.
 */
export function restoreMessage(
  e: Pick<TrashEntry, "source_table" | "title">,
  result: TrashRestoreResult,
  selfBack: boolean,
  alsoBack = 0,
): string {
  const t = `"${clip(e.title, 40)}"`;
  const others =
    alsoBack > 0 ? `${alsoBack} other${alsoBack === 1 ? "" : "s"}` : "";
  if (!selfBack) {
    const own =
      result.skipped.find(
        (s) => s.table === e.source_table && s.title === e.title,
      ) ??
      result.skipped.find((s) => s.table === e.source_table) ??
      result.skipped[0];
    const head = own
      ? `could not restore ${t}: ${own.reason}`
      : `could not restore ${t}`;
    return others ? `${head}. ${others} came back` : head;
  }
  const head = others ? `restored ${t} and ${alsoBack} more` : `restored ${t}`;
  const first = result.skipped[0];
  if (!first) return head;
  const n = result.skipped.length;
  return n === 1
    ? `${head}, skipped "${clip(first.title, 30)}" (${first.reason})`
    : `${head}, skipped ${n} (${first.reason})`;
}

/** An RPC row made safe to render: numbers as numbers, no null children. */
export function normalizeEntry(raw: Partial<TrashEntry>): TrashEntry {
  return {
    id: String(raw.id ?? ""),
    source_table: String(raw.source_table ?? ""),
    row_id: String(raw.row_id ?? ""),
    title: raw.title || "untitled",
    detail: raw.detail ?? null,
    context: raw.context ?? null,
    deleted_at: String(raw.deleted_at ?? ""),
    deleted_by: (raw.deleted_by ?? "app") as TrashEntry["deleted_by"],
    tx_id: String(raw.tx_id ?? ""),
    child_count: Number(raw.child_count ?? 0) || 0,
    children: (raw.children ?? {}) as Record<string, number>,
    hits: raw.hits?.length ? raw.hits : null,
    batch_count: Math.max(1, Number(raw.batch_count ?? 1) || 1),
  };
}

/** trash_kinds rows, counts as numbers, biggest first. */
export function normalizeKinds(raw: Partial<TrashKind>[]): TrashKind[] {
  return raw
    .map((k) => ({
      source_table: String(k.source_table ?? ""),
      n: Number(k.n ?? 0) || 0,
    }))
    .filter((k) => k.source_table && k.n > 0)
    .sort(
      (a, b) =>
        b.n - a.n ||
        kindLabel(a.source_table).localeCompare(kindLabel(b.source_table)),
    );
}

/** A restore result with both lists present. */
export function normalizeResult(raw: unknown): TrashRestoreResult {
  const r = (raw ?? {}) as Partial<TrashRestoreResult>;
  return {
    restored: Array.isArray(r.restored) ? r.restored : [],
    skipped: Array.isArray(r.skipped) ? r.skipped : [],
  };
}
