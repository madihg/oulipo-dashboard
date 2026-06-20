import type { TodoRow, TodoState } from "../types/database";

/**
 * Things-3-style "When" scheduling helpers. Maps a chosen "when" to the three
 * todo columns that drive scheduling (state / start_date / evening). deadline is
 * deliberately NOT part of "when" - a due date is a separate concept.
 *
 * All dates are LOCAL ISO (YYYY-MM-DD). Never use toISOString() here: it is UTC
 * and shifts the day for anyone west of UTC, which would put "today" on the
 * wrong calendar day.
 */

export type WhenKey =
  | "today"
  | "evening"
  | "tomorrow"
  | "weekend"
  | "someday"
  | "date"
  | "clear";

export interface WhenPatch {
  state: TodoState;
  start_date: string | null;
  evening: boolean;
}

export interface EffectiveWhen {
  key: WhenKey | null;
  label: string | null;
}

export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
export function todayISO(now: Date = new Date()): string {
  return isoDate(now);
}
export function tomorrowISO(now: Date = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  return isoDate(d);
}
/** The coming Saturday. If today is Saturday, jumps to next Saturday. */
export function thisSaturdayISO(now: Date = new Date()): string {
  const d = new Date(now);
  const delta = (6 - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + delta);
  return isoDate(d);
}

/** Quick options shown in the WhenPicker menu (custom date + clear are separate). */
export const WHEN_OPTIONS: Array<{ key: WhenKey; label: string }> = [
  { key: "today", label: "today" },
  { key: "evening", label: "this evening" },
  { key: "tomorrow", label: "tomorrow" },
  { key: "weekend", label: "this weekend" },
  { key: "someday", label: "someday" },
];

/** Map a chosen "when" to the bundled {state,start_date,evening} write. */
export function whenPatch(
  key: WhenKey,
  opts: { now?: Date; date?: string } = {},
): WhenPatch {
  const now = opts.now ?? new Date();
  switch (key) {
    case "today":
      return { state: "today", start_date: null, evening: false };
    case "evening":
      return { state: "today", start_date: null, evening: true };
    case "tomorrow":
      return { state: "anytime", start_date: tomorrowISO(now), evening: false };
    case "weekend":
      return {
        state: "anytime",
        start_date: thisSaturdayISO(now),
        evening: false,
      };
    case "someday":
      return { state: "someday", start_date: null, evening: false };
    case "date":
      return {
        state: "anytime",
        start_date: opts.date || null,
        evening: false,
      };
    case "clear":
      return { state: "anytime", start_date: null, evening: false };
  }
}

function formatWhenLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y!, (m ?? 1) - 1, d ?? 1);
  return dt
    .toLocaleDateString("en-US", { month: "short", day: "numeric" })
    .toLowerCase();
}

/**
 * Infer the effective "when" of a todo for display + active-option highlight.
 * Reads the meaning, not just the raw state, so a legacy row like
 * {state:'anytime', start_date: today} still reads as "today".
 */
export function effectiveWhen(
  t: Pick<TodoRow, "state" | "start_date" | "evening">,
  now: Date = new Date(),
): EffectiveWhen {
  if (t.state === "today" && t.evening)
    return { key: "evening", label: "evening" };
  if (t.state === "today") return { key: "today", label: "today" };
  if (t.state === "someday") return { key: "someday", label: "someday" };
  if (t.start_date) {
    const sd = t.start_date;
    if (sd === todayISO(now)) return { key: "today", label: "today" };
    if (sd === tomorrowISO(now)) return { key: "tomorrow", label: "tomorrow" };
    if (sd === thisSaturdayISO(now))
      return { key: "weekend", label: "weekend" };
    return { key: "date", label: formatWhenLabel(sd) };
  }
  return { key: null, label: null };
}
