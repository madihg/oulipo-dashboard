import type { TodoRow } from "../types/database";
import {
  belongsInToday,
  isoDate,
  nextMondayISO,
  todayISO,
  tomorrowISO,
} from "./when";

/**
 * Horizon buckets for the Today "horizon" view: what's scheduled next week,
 * the week after, and the ongoing lane - alongside today itself. Buckets are
 * mutually exclusive and drag-consistent: anything that already belongs in
 * Today stays out of the future buckets, and ongoing-priority tasks live in
 * the ongoing lane rather than a week.
 */

export type HorizonKey =
  "today" | "this_week" | "next_week" | "week_after" | "ongoing";

export interface HorizonBuckets {
  thisWeek: TodoRow[];
  nextWeek: TodoRow[];
  weekAfter: TodoRow[];
  ongoing: TodoRow[];
}

function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y!, (m ?? 1) - 1, d ?? 1);
  dt.setDate(dt.getDate() + days);
  return isoDate(dt);
}

/** Monday after next - the start of the "week after" bucket. */
export function weekAfterMondayISO(now: Date = new Date()): string {
  return addDaysISO(nextMondayISO(now), 7);
}

export function bucketHorizon(
  todos: TodoRow[],
  now: Date = new Date(),
): HorizonBuckets {
  const today = todayISO(now);
  const nextMon = nextMondayISO(now);
  const afterMon = weekAfterMondayISO(now);
  const afterEnd = addDaysISO(afterMon, 6);
  const out: HorizonBuckets = {
    thisWeek: [],
    nextWeek: [],
    weekAfter: [],
    ongoing: [],
  };
  for (const t of todos) {
    if (
      t.state === "completed" ||
      t.state === "cancelled" ||
      t.state === "logbook"
    )
      continue;
    // Already in the today lane - never duplicated into a future bucket.
    if (belongsInToday(t, today)) continue;
    if (t.priority === "ongoing") {
      out.ongoing.push(t);
      continue;
    }
    const sd = t.start_date;
    if (!sd) continue;
    if (sd > today && sd < nextMon) out.thisWeek.push(t);
    else if (sd >= nextMon && sd < afterMon) out.nextWeek.push(t);
    else if (sd >= afterMon && sd <= afterEnd) out.weekAfter.push(t);
    // Later than two weeks out: fetched but not shown - the Upcoming view
    // owns the long tail.
  }
  return out;
}

/** The write a drop into each horizon lane performs. */
export function horizonDropPatch(
  bucket: HorizonKey,
  now: Date = new Date(),
): Partial<TodoRow> {
  switch (bucket) {
    case "today":
      return { state: "today", start_date: null, evening: false };
    case "this_week":
      return { state: "anytime", start_date: tomorrowISO(now), evening: false };
    case "next_week":
      return {
        state: "anytime",
        start_date: nextMondayISO(now),
        evening: false,
      };
    case "week_after":
      return {
        state: "anytime",
        start_date: weekAfterMondayISO(now),
        evening: false,
      };
    case "ongoing":
      // Becoming ongoing also clears the schedule so the card settles in the
      // ongoing lane instead of staying pinned to a week.
      return {
        state: "anytime",
        start_date: null,
        evening: false,
        priority: "ongoing",
      };
  }
}
