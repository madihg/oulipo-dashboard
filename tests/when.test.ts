import { describe, it, expect } from "vitest";
import {
  isoDate,
  tomorrowISO,
  thisSaturdayISO,
  nextMondayISO,
  whenPatch,
  effectiveWhen,
} from "../src/utils/when";

describe("when date helpers", () => {
  it("isoDate is local (not UTC) - late-evening date does not roll forward", () => {
    // 2026-01-15 23:30 local. toISOString() would give the 16th in +tz; isoDate must stay 15th.
    const d = new Date(2026, 0, 15, 23, 30, 0);
    expect(isoDate(d)).toBe("2026-01-15");
  });

  it("tomorrowISO crosses a month boundary", () => {
    const jan31 = new Date(2026, 0, 31, 9, 0, 0);
    expect(tomorrowISO(jan31)).toBe("2026-02-01");
  });

  it("tomorrowISO crosses a year boundary", () => {
    const dec31 = new Date(2026, 11, 31, 9, 0, 0);
    expect(tomorrowISO(dec31)).toBe("2027-01-01");
  });

  it("thisSaturdayISO returns the coming Saturday", () => {
    // 2026-01-15 is a Thursday -> coming Saturday is 2026-01-17
    const thu = new Date(2026, 0, 15, 9, 0, 0);
    expect(thu.getDay()).toBe(4);
    expect(thisSaturdayISO(thu)).toBe("2026-01-17");
  });

  it("thisSaturdayISO jumps to NEXT Saturday when run on a Saturday", () => {
    const sat = new Date(2026, 0, 17, 9, 0, 0);
    expect(sat.getDay()).toBe(6);
    expect(thisSaturdayISO(sat)).toBe("2026-01-24");
  });

  it("nextMondayISO returns the coming Monday", () => {
    // 2026-01-15 is a Thursday -> next Monday is 2026-01-19
    const thu = new Date(2026, 0, 15, 9, 0, 0);
    expect(nextMondayISO(thu)).toBe("2026-01-19");
  });

  it("nextMondayISO jumps a full week when run on a Monday", () => {
    const mon = new Date(2026, 0, 19, 9, 0, 0);
    expect(mon.getDay()).toBe(1);
    expect(nextMondayISO(mon)).toBe("2026-01-26");
  });
});

describe("whenPatch mapping", () => {
  const now = new Date(2026, 0, 15, 9, 0, 0); // Thursday

  it("today -> state today, no date, evening false", () => {
    expect(whenPatch("today", { now })).toEqual({
      state: "today",
      start_date: null,
      evening: false,
    });
  });

  it("this evening -> state today + evening true (invariant)", () => {
    expect(whenPatch("evening", { now })).toEqual({
      state: "today",
      start_date: null,
      evening: true,
    });
  });

  it("tomorrow -> anytime + tomorrow date", () => {
    expect(whenPatch("tomorrow", { now })).toEqual({
      state: "anytime",
      start_date: "2026-01-16",
      evening: false,
    });
  });

  it("this weekend -> anytime + coming Saturday", () => {
    expect(whenPatch("weekend", { now })).toEqual({
      state: "anytime",
      start_date: "2026-01-17",
      evening: false,
    });
  });

  it("next week -> anytime + coming Monday", () => {
    expect(whenPatch("next_week", { now })).toEqual({
      state: "anytime",
      start_date: "2026-01-19",
      evening: false,
    });
  });

  it("someday -> someday bucket", () => {
    expect(whenPatch("someday", { now })).toEqual({
      state: "someday",
      start_date: null,
      evening: false,
    });
  });

  it("date -> anytime + the picked date", () => {
    expect(whenPatch("date", { now, date: "2026-03-09" })).toEqual({
      state: "anytime",
      start_date: "2026-03-09",
      evening: false,
    });
  });

  it("clear -> anytime, no date, evening false", () => {
    expect(whenPatch("clear", { now })).toEqual({
      state: "anytime",
      start_date: null,
      evening: false,
    });
  });

  it("evening is never set without state today", () => {
    for (const key of [
      "today",
      "tomorrow",
      "weekend",
      "someday",
      "clear",
    ] as const) {
      const p = whenPatch(key, { now });
      if (p.evening) expect(p.state).toBe("today");
    }
  });
});

describe("effectiveWhen inference", () => {
  const now = new Date(2026, 0, 15, 9, 0, 0); // Thursday

  it("reads state=today as today", () => {
    expect(
      effectiveWhen({ state: "today", start_date: null, evening: false }, now)
        .key,
    ).toBe("today");
  });

  it("reads evening flag", () => {
    expect(
      effectiveWhen({ state: "today", start_date: null, evening: true }, now)
        .key,
    ).toBe("evening");
  });

  it("infers today from a legacy anytime row dated today", () => {
    const eff = effectiveWhen(
      { state: "anytime", start_date: "2026-01-15", evening: false },
      now,
    );
    expect(eff.key).toBe("today");
  });

  it("infers tomorrow / weekend from start_date", () => {
    expect(
      effectiveWhen(
        { state: "anytime", start_date: "2026-01-16", evening: false },
        now,
      ).key,
    ).toBe("tomorrow");
    expect(
      effectiveWhen(
        { state: "anytime", start_date: "2026-01-17", evening: false },
        now,
      ).key,
    ).toBe("weekend");
  });

  it("infers next_week from the coming Monday's start_date", () => {
    expect(
      effectiveWhen(
        { state: "anytime", start_date: "2026-01-19", evening: false },
        now,
      ).key,
    ).toBe("next_week");
  });

  it("shows a date label for an arbitrary future date", () => {
    const eff = effectiveWhen(
      { state: "anytime", start_date: "2026-03-09", evening: false },
      now,
    );
    expect(eff.key).toBe("date");
    expect(eff.label).toBe("mar 9");
  });

  it("is null when nothing scheduling is set", () => {
    expect(
      effectiveWhen({ state: "anytime", start_date: null, evening: false }, now)
        .key,
    ).toBeNull();
  });

  it("reads someday", () => {
    expect(
      effectiveWhen({ state: "someday", start_date: null, evening: false }, now)
        .key,
    ).toBe("someday");
  });
});
