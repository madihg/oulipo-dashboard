import { describe, it, expect } from "vitest";
import {
  applyControls,
  groupTodos,
  type ControlState,
} from "../src/stores/listControls";
import type { TodoRow } from "../src/types/database";

let seq = 0;
function t(over: Partial<TodoRow>): TodoRow {
  return {
    id: `id-${seq++}`,
    title: "task",
    priority: null,
    deadline: null,
    start_date: null,
    created_at: "2026-01-01T00:00:00Z",
    state: "anytime",
    position: 0,
    area_id: null,
    project_id: null,
    metadata: null,
    evening: false,
    completed_at: null,
    ...(over as object),
  } as unknown as TodoRow;
}

const baseCtrl: ControlState = {
  filter: { tags: [], priority: [], state: [] },
  sort: "priority",
  group: "today",
};

describe('groupTodos "today" mode', () => {
  it("splits into exactly p0 + scheduled, in that order, no overdue bucket", () => {
    const todos = [
      t({ priority: "P0", title: "a" }),
      t({ priority: "P1", deadline: "2020-01-01", title: "past-due" }),
      t({ priority: null, state: "today", title: "dropped-in" }),
      t({ priority: "P0", title: "b" }),
    ];
    const groups = groupTodos(todos, "today");
    expect(groups.map((g) => g.key)).toEqual(["P0", "scheduled"]);
    expect(groups[0]!.items.map((x) => x.title)).toEqual(["a", "b"]);
    // the past-due P1 lands in scheduled, NOT a separate overdue group
    expect(groups[1]!.items.map((x) => x.title).sort()).toEqual([
      "dropped-in",
      "past-due",
    ]);
  });

  it("keeps an empty p0 section present (stable two-section layout)", () => {
    const groups = groupTodos([t({ priority: "P1" })], "today");
    expect(groups.map((g) => g.key)).toEqual(["P0", "scheduled"]);
    expect(groups[0]!.items).toHaveLength(0);
    expect(groups[1]!.items).toHaveLength(1);
  });
});

describe('groupTodos "area" mode', () => {
  it("buckets by area_id with labels, sorted by label, unfiled last-ish", () => {
    const groups = groupTodos(
      [
        t({ area_id: "a1", title: "x" }),
        t({ area_id: "a2", title: "y" }),
        t({ area_id: null, title: "z" }),
        t({ area_id: "a1", title: "x2" }),
      ],
      "area",
      {},
      {
        a1: { name: "make", slug: "make" },
        a2: { name: "earn", slug: "earn" },
      },
    );
    // labels sorted alphabetically: earn, make, no area
    expect(groups.map((g) => g.label)).toEqual(["earn", "make", "no area"]);
    const make = groups.find((g) => g.label === "make")!;
    expect(make.items.map((i) => i.title).sort()).toEqual(["x", "x2"]);
  });
});

describe("groupTodos priority mode still works", () => {
  it("buckets P0/P1/P2/ongoing/none in order", () => {
    const groups = groupTodos(
      [
        t({ priority: "P0" }),
        t({ priority: "P2" }),
        t({ priority: "ongoing" }),
        t({ priority: null }),
      ],
      "priority",
    );
    expect(groups.map((g) => g.key)).toEqual([
      "P0",
      "P1",
      "P2",
      "ongoing",
      "none",
    ]);
    expect(groups.find((g) => g.key === "ongoing")!.items).toHaveLength(1);
    expect(groups.find((g) => g.key === "none")!.items).toHaveLength(1);
  });
});

describe("ongoing priority ranks after P2, before none", () => {
  it("priority sort orders P0 < P1 < P2 < ongoing < none", () => {
    const rows = applyControls(
      [
        t({ priority: null, title: "none" }),
        t({ priority: "ongoing", title: "ongoing" }),
        t({ priority: "P2", title: "p2" }),
        t({ priority: "P0", title: "p0" }),
      ],
      { ...baseCtrl, sort: "priority" },
    );
    expect(rows.map((r) => r.title)).toEqual(["p0", "p2", "ongoing", "none"]);
  });
});

describe("applyControls filter + sort", () => {
  it("filters by priority", () => {
    const rows = applyControls(
      [t({ priority: "P0" }), t({ priority: "P1" }), t({ priority: null })],
      { ...baseCtrl, filter: { tags: [], priority: ["P0"], state: [] } },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.priority).toBe("P0");
  });

  it("filters the no-priority bucket via 'none'", () => {
    const rows = applyControls([t({ priority: "P0" }), t({ priority: null })], {
      ...baseCtrl,
      filter: { tags: [], priority: ["none"], state: [] },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.priority).toBeNull();
  });

  // REGRESSION GUARD: "priority" is the default sort, and drag-and-drop writes
  // `position`. If this tie-break is ever anything but position (it was
  // title.localeCompare for a while), every drop in Today/Inbox/Area/Project
  // silently snaps back. Alphabetical has its own explicit mode below.
  it("sorts by priority, then by MANUAL POSITION within a section", () => {
    // titles deliberately disagree with position order, so an alphabetical
    // tie-break would produce the opposite result.
    const rows = applyControls(
      [
        t({ priority: "P2", position: 0, title: "p2" }),
        t({ priority: "P0", position: 0, title: "zebra" }),
        t({ priority: "P0", position: 1, title: "apple" }),
      ],
      { ...baseCtrl, sort: "priority" },
    );
    expect(rows.map((r) => r.title)).toEqual(["zebra", "apple", "p2"]);
  });

  it("a dragged row keeps the position it was dropped at", () => {
    // What reorderTodos writes after a drop: renumbered 0..n in drop order.
    const dropped = [
      t({ priority: "P0", position: 0, title: "third-alphabetically-c" }),
      t({ priority: "P0", position: 1, title: "aaa-first-alphabetically" }),
      t({ priority: "P0", position: 2, title: "bbb" }),
    ];
    const rows = applyControls(dropped, { ...baseCtrl, sort: "priority" });
    expect(rows.map((r) => r.position)).toEqual([0, 1, 2]);
  });

  it("sorts alphabetically in alpha mode, ignoring priority", () => {
    const rows = applyControls(
      [
        t({ priority: "P0", title: "zebra" }),
        t({ priority: "P2", title: "apple" }),
        t({ priority: "P1", title: "mango" }),
      ],
      { ...baseCtrl, sort: "alpha" },
    );
    expect(rows.map((r) => r.title)).toEqual(["apple", "mango", "zebra"]);
  });

  it("sorts by deadline ascending", () => {
    const rows = applyControls(
      [
        t({ deadline: "2026-03-01", title: "mar" }),
        t({ deadline: null, title: "none" }),
        t({ deadline: "2026-01-01", title: "jan" }),
      ],
      { ...baseCtrl, sort: "deadline" },
    );
    // dated ascending first, undated (Infinity) last
    expect(rows.map((r) => r.title)).toEqual(["jan", "mar", "none"]);
  });
});
