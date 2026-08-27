import { describe, it, expect } from "vitest";
import {
  buildCalendar,
  todayRowIndex,
  cellLabel,
  shiftWithin,
  fromISO,
  WEEKDAYS,
  type CalendarCell,
} from "../src/utils/calendar";

/**
 * The calendar the "when" picker draws. It is one continuous ribbon of weeks
 * rather than a set of month pages, so the interesting cases are all at the
 * seams: the opening partial week, month boundaries inside a row, the turn of
 * the year, leap day, and DST.
 */

/** Local-midnight Date, so tests never depend on the machine's UTC offset. */
const at = (iso: string) => fromISO(iso);
const flat = (w: CalendarCell[][]) => w.flat();
const real = (w: CalendarCell[][]) => flat(w).filter((c) => !c.isPad);

describe("grid shape", () => {
  it("every row has exactly seven cells", () => {
    const weeks = buildCalendar({ now: at("2026-08-27"), months: 3 });
    expect(weeks.length).toBeGreaterThan(0);
    for (const w of weeks) expect(w).toHaveLength(7);
  });

  it("starts on the Sunday of today's week", () => {
    // 2026-08-27 is a Thursday; its week starts Sunday 2026-08-23.
    const weeks = buildCalendar({ now: at("2026-08-27"), months: 1 });
    const firstReal = real(weeks)[0]!;
    expect(firstReal.iso).toBe("2026-08-27");
    // The four squares before it are holes, not unpickable dates.
    expect(weeks[0]!.slice(0, 4).every((c) => c.isPad)).toBe(true);
    expect(weeks[0]![4]!.iso).toBe("2026-08-27");
  });

  it("columns line up under the weekday header", () => {
    const weeks = buildCalendar({ now: at("2026-08-27"), months: 2 });
    for (const w of weeks) {
      for (let i = 0; i < 7; i++) {
        const c = w[i]!;
        if (c.isPad || !c.iso) continue;
        expect(fromISO(c.iso).getDay()).toBe(i);
      }
    }
  });

  it("opens on a Sunday with no pad at all when today IS Sunday", () => {
    // 2026-08-30 is a Sunday.
    const weeks = buildCalendar({ now: at("2026-08-30"), months: 1 });
    expect(weeks[0]![0]!.isPad).toBe(false);
    expect(weeks[0]![0]!.iso).toBe("2026-08-30");
  });
});

describe("today", () => {
  it("marks exactly one cell as today", () => {
    const weeks = buildCalendar({ now: at("2026-08-27"), months: 6 });
    expect(flat(weeks).filter((c) => c.isToday)).toHaveLength(1);
  });

  it("today is never past, and nothing offered after it is past", () => {
    const weeks = buildCalendar({ now: at("2026-08-27"), months: 2 });
    const cells = real(weeks);
    expect(cells.every((c) => !c.isPast)).toBe(true);
    expect(cells[0]!.isToday).toBe(true);
  });

  it("reports the row holding today so the grid can scroll to it", () => {
    const weeks = buildCalendar({ now: at("2026-08-27"), months: 3 });
    expect(todayRowIndex(weeks)).toBe(0);
    expect(weeks[todayRowIndex(weeks)]!.some((c) => c.isToday)).toBe(true);
  });
});

describe("month boundaries", () => {
  it("badges the 1st of each month and nothing else", () => {
    const weeks = buildCalendar({ now: at("2026-08-27"), months: 4 });
    for (const c of real(weeks)) {
      expect(c.isFirstOfMonth).toBe(c.day === 1);
      expect(c.monthLabel === null).toBe(c.day !== 1);
    }
  });

  it("names the month on the badge", () => {
    const weeks = buildCalendar({ now: at("2026-08-27"), months: 3 });
    const firsts = real(weeks).filter((c) => c.isFirstOfMonth);
    expect(firsts.map((c) => `${c.monthLabel} ${c.iso}`)).toEqual([
      "sep 2026-09-01",
      "oct 2026-10-01",
    ]);
  });

  it("does NOT break the row at a month boundary", () => {
    // 2026-09-01 is a Tuesday, so its week must also hold 2026-08-30/31.
    const weeks = buildCalendar({ now: at("2026-08-27"), months: 2 });
    const row = weeks.find((w) => w.some((c) => c.iso === "2026-09-01"))!;
    expect(row.map((c) => c.iso)).toEqual([
      "2026-08-30",
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
    ]);
  });

  it("crosses the turn of the year", () => {
    const weeks = buildCalendar({ now: at("2026-12-28"), months: 2 });
    const isos = real(weeks).map((c) => c.iso);
    expect(isos).toContain("2026-12-31");
    expect(isos).toContain("2027-01-01");
    const jan1 = real(weeks).find((c) => c.iso === "2027-01-01")!;
    expect(jan1.monthLabel).toBe("jan");
  });

  it("includes leap day in a leap year", () => {
    const weeks = buildCalendar({ now: at("2028-02-01"), months: 1 });
    expect(real(weeks).map((c) => c.iso)).toContain("2028-02-29");
  });

  it("has no Feb 29 in a common year", () => {
    const weeks = buildCalendar({ now: at("2027-02-01"), months: 1 });
    const feb = real(weeks).filter((c) => c.iso.startsWith("2027-02-"));
    expect(feb.at(-1)!.iso).toBe("2027-02-28");
  });
});

describe("continuity", () => {
  it("runs consecutive days with no gap and no repeat", () => {
    // The classic setDate() trap: a DST shift can drop or duplicate a day.
    const weeks = buildCalendar({ now: at("2026-02-01"), months: 14 });
    const isos = real(weeks).map((c) => c.iso);
    expect(new Set(isos).size).toBe(isos.length);
    for (let i = 1; i < isos.length; i++) {
      const prev = fromISO(isos[i - 1]!);
      prev.setDate(prev.getDate() + 1);
      const expected = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}-${String(prev.getDate()).padStart(2, "0")}`;
      expect(isos[i]).toBe(expected);
    }
  });

  it("spans exactly the requested number of months", () => {
    const weeks = buildCalendar({ now: at("2026-08-27"), months: 3 });
    const isos = real(weeks).map((c) => c.iso);
    expect(isos.at(-1)).toBe("2026-10-31");
  });

  it("always offers at least one month", () => {
    const weeks = buildCalendar({ now: at("2026-08-27"), months: 0 });
    expect(real(weeks).at(-1)!.iso).toBe("2026-08-31");
  });

  it("terminates instead of running away", () => {
    const weeks = buildCalendar({ now: at("2026-08-27"), months: 24 });
    expect(weeks.length).toBeLessThan(120);
    expect(weeks.length).toBeGreaterThan(100);
  });
});

describe("labels and keyboard movement", () => {
  it("names a cell for a screen reader", () => {
    const weeks = buildCalendar({ now: at("2026-08-27"), months: 1 });
    const c = real(weeks).find((x) => x.iso === "2026-08-29")!;
    expect(cellLabel(c)).toBe("sat 29 aug 2026");
    expect(WEEKDAYS[fromISO(c.iso).getDay()]).toBe("sat");
  });

  it("gives a pad cell no name", () => {
    const weeks = buildCalendar({ now: at("2026-08-27"), months: 1 });
    expect(cellLabel(weeks[0]![0]!)).toBe("");
  });

  it("moves by day and by week", () => {
    const weeks = buildCalendar({ now: at("2026-08-27"), months: 3 });
    expect(shiftWithin(weeks, "2026-08-27", 1)).toBe("2026-08-28");
    expect(shiftWithin(weeks, "2026-08-27", 7)).toBe("2026-09-03");
    expect(shiftWithin(weeks, "2026-09-03", -7)).toBe("2026-08-27");
  });

  it("clamps at both ends instead of leaving the grid", () => {
    const weeks = buildCalendar({ now: at("2026-08-27"), months: 1 });
    // Nothing before today is selectable.
    expect(shiftWithin(weeks, "2026-08-27", -1)).toBe("2026-08-27");
    expect(shiftWithin(weeks, "2026-08-27", -30)).toBe("2026-08-27");
    // And nothing past the end of the offered range.
    expect(shiftWithin(weeks, "2026-08-31", 1)).toBe("2026-08-31");
  });

  it("starts from today when no date is held yet", () => {
    const weeks = buildCalendar({ now: at("2026-08-27"), months: 2 });
    expect(shiftWithin(weeks, "", 1)).toBe("2026-08-28");
  });
});
