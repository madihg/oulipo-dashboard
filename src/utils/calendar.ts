/**
 * Calendar model for the "when" picker.
 *
 * Pure functions over dates - no DOM, no component state - so the grid's
 * behaviour at month boundaries, across DST, and in leap years is testable
 * without mounting anything.
 *
 * Everything is LOCAL ISO (YYYY-MM-DD). Never toISOString() here: it is UTC and
 * shifts the day for anyone west of it, which would put "today" on the wrong
 * calendar square. Same rule as utils/when.ts.
 */

import { isoDate, todayISO } from "./when";

export const WEEKDAYS = [
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
] as const;

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

export interface CalendarCell {
  /** Local ISO date, or "" for a pad cell. */
  iso: string;
  /** Day of month, or 0 for a pad cell. */
  day: number;
  isToday: boolean;
  /** Strictly before today. Rendered dim and never selectable. */
  isPast: boolean;
  /** The 1st of a month, which carries the stacked month badge. */
  isFirstOfMonth: boolean;
  /** Lowercase month abbreviation, only on the 1st. */
  monthLabel: string | null;
  /**
   * A blank square before today in the opening week. The grid always starts on
   * a Sunday so the columns line up under the weekday header, but the days of
   * that week that have already gone are shown as holes rather than as dates
   * you cannot pick.
   */
  isPad: boolean;
}

/** Local ISO -> a Date at local midnight. Avoids the UTC parse of new Date(iso). */
export function fromISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** The Sunday on or before `d`. */
function startOfWeek(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  out.setDate(out.getDate() - out.getDay());
  return out;
}

/** Last day of the month `n` months after `d`'s month. */
function endOfMonthsAhead(d: Date, n: number): Date {
  // Day 0 of month+n+1 is the last day of month+n, and the Date constructor
  // normalises the overflow across a year boundary for us.
  return new Date(d.getFullYear(), d.getMonth() + n + 1, 0);
}

/**
 * Week rows for the picker, starting on the Sunday of today's week and running
 * to the end of the month `months - 1` ahead. Rows never break at a month
 * boundary: the 1st simply carries a month badge, which is what makes the grid
 * read as one continuous ribbon of time rather than a set of month pages.
 */
export function buildCalendar(
  opts: { now?: Date; months?: number } = {},
): CalendarCell[][] {
  const now = opts.now ?? new Date();
  const months = Math.max(1, opts.months ?? 12);
  const today = isoDate(now);

  const cursor = startOfWeek(now);
  const last = endOfMonthsAhead(now, months - 1);

  const weeks: CalendarCell[][] = [];
  let week: CalendarCell[] = [];
  const pad = (): CalendarCell => ({
    iso: "",
    day: 0,
    isToday: false,
    isPast: false,
    isFirstOfMonth: false,
    monthLabel: null,
    isPad: true,
  });

  while (cursor <= last) {
    const iso = isoDate(cursor);
    const isPast = iso < today;
    const day = cursor.getDate();
    // Only the opening week can hold leading pads; once today has passed every
    // square is a real, pickable date.
    if (isPast && weeks.length === 0) {
      week.push(pad());
    } else {
      week.push({
        iso,
        day,
        isToday: iso === today,
        isPast,
        isFirstOfMonth: day === 1,
        monthLabel: day === 1 ? (MONTHS[cursor.getMonth()] ?? null) : null,
        isPad: false,
      });
    }

    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
    // Rebuild at local midnight rather than adding a day in place. In a zone
    // whose DST transition lands at 00:00 the cursor drifts to 01:00 (or
    // 23:00 the day before), and the "cursor <= last" test then drops the
    // final day of the offered range.
    cursor.setHours(12, 0, 0, 0);
    cursor.setDate(cursor.getDate() + 1);
    cursor.setHours(0, 0, 0, 0);
  }

  // Close the final row with holes rather than spilling into the next month:
  // the grid must offer exactly the range it promised, or arrow-key clamping
  // and the "last selectable date" both drift past it.
  if (week.length > 0) {
    while (week.length < 7) week.push(pad());
    weeks.push(week);
  }
  return weeks;
}

/** Index of the week row holding today, for scrolling the grid to it on open. */
export function todayRowIndex(weeks: CalendarCell[][]): number {
  return weeks.findIndex((w) => w.some((c) => c.isToday));
}

/** "sat 29 aug" - the accessible name for a day cell. */
export function cellLabel(cell: CalendarCell): string {
  if (cell.isPad || !cell.iso) return "";
  const d = fromISO(cell.iso);
  const wd = WEEKDAYS[d.getDay()];
  const mo = MONTHS[d.getMonth()];
  return `${wd} ${cell.day} ${mo} ${d.getFullYear()}`;
}

/**
 * Move a caret date by `days`, clamped into the grid's range. Used by the
 * arrow keys, so the roving focus can never leave the offered dates.
 */
export function shiftWithin(
  weeks: CalendarCell[][],
  iso: string,
  days: number,
): string {
  const flat = weeks.flat().filter((c) => !c.isPad && c.iso && !c.isPast);
  if (flat.length === 0) return iso;
  const first = flat[0]!.iso;
  const lastIso = flat[flat.length - 1]!.iso;
  const d = fromISO(iso || first);
  d.setDate(d.getDate() + days);
  const next = isoDate(d);
  if (next < first) return first;
  if (next > lastIso) return lastIso;
  return next;
}

/** Today as local ISO, re-exported so the picker has one date source. */
export { todayISO };
