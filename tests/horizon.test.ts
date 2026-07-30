import { describe, it, expect } from "vitest";
import {
  bucketHorizon,
  horizonDropPatch,
  weekAfterMondayISO,
} from "../src/utils/horizon";
import type { TodoRow } from "../src/types/database";

// 2026-01-15 is a Thursday. next Monday = 2026-01-19, week after = 2026-01-26.
const now = new Date(2026, 0, 15, 9, 0, 0);

const row = (p: Partial<TodoRow>): TodoRow =>
  ({
    id: Math.random().toString(36).slice(2),
    state: "anytime",
    start_date: null,
    deadline: null,
    priority: null,
    ...p,
  }) as TodoRow;

describe("weekAfterMondayISO", () => {
  it("is seven days after next Monday", () => {
    expect(weekAfterMondayISO(now)).toBe("2026-01-26");
  });
});

describe("bucketHorizon", () => {
  it("buckets tomorrow-through-Sunday into this week", () => {
    const tomorrow = row({ start_date: "2026-01-16" });
    const sunday = row({ start_date: "2026-01-18" });
    const b = bucketHorizon([tomorrow, sunday], now);
    expect(b.thisWeek.map((t) => t.id)).toEqual([tomorrow.id, sunday.id]);
    expect(b.nextWeek).toHaveLength(0);
  });

  it("buckets next week vs week after by start_date", () => {
    const nextWeek = row({ start_date: "2026-01-19" });
    const nextWeekEnd = row({ start_date: "2026-01-25" });
    const weekAfter = row({ start_date: "2026-01-26" });
    const weekAfterEnd = row({ start_date: "2026-02-01" });
    const beyond = row({ start_date: "2026-02-02" });
    const b = bucketHorizon(
      [nextWeek, nextWeekEnd, weekAfter, weekAfterEnd, beyond],
      now,
    );
    expect(b.nextWeek.map((t) => t.id)).toEqual([nextWeek.id, nextWeekEnd.id]);
    expect(b.weekAfter.map((t) => t.id)).toEqual([
      weekAfter.id,
      weekAfterEnd.id,
    ]);
  });

  it("routes ongoing priority to the ongoing lane, not a week", () => {
    const t = row({ priority: "ongoing", start_date: "2026-01-19" });
    const b = bucketHorizon([t], now);
    expect(b.ongoing).toHaveLength(1);
    expect(b.nextWeek).toHaveLength(0);
  });

  it("never duplicates a today item into a future bucket", () => {
    const dueToday = row({ deadline: "2026-01-15", start_date: "2026-01-19" });
    const stateToday = row({ state: "today", priority: "ongoing" });
    const b = bucketHorizon([dueToday, stateToday], now);
    expect(b.nextWeek).toHaveLength(0);
    expect(b.ongoing).toHaveLength(0);
  });

  it("skips completed / cancelled / dateless rows", () => {
    const b = bucketHorizon(
      [
        row({ state: "completed", start_date: "2026-01-19" }),
        row({ state: "cancelled", priority: "ongoing" }),
        row({}),
      ],
      now,
    );
    expect(b.nextWeek).toHaveLength(0);
    expect(b.weekAfter).toHaveLength(0);
    expect(b.ongoing).toHaveLength(0);
  });
});

describe("horizonDropPatch", () => {
  it("today lane writes the today when-patch", () => {
    expect(horizonDropPatch("today", now)).toEqual({
      state: "today",
      start_date: null,
      evening: false,
    });
  });
  it("week lanes schedule the right day", () => {
    expect(horizonDropPatch("this_week", now).start_date).toBe("2026-01-16");
    expect(horizonDropPatch("next_week", now).start_date).toBe("2026-01-19");
    expect(horizonDropPatch("week_after", now).start_date).toBe("2026-01-26");
  });
  it("ongoing lane sets the priority and clears the schedule", () => {
    expect(horizonDropPatch("ongoing", now)).toEqual({
      state: "anytime",
      start_date: null,
      evening: false,
      priority: "ongoing",
    });
  });
});
