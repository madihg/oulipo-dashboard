import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { createApp, h, nextTick, type App } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { EFFORTS, effortDef, effortRank } from "../src/utils/effort";
import {
  applyControls,
  groupTodos,
  useListControlsStore,
  type ControlState,
  type FilterState,
} from "../src/stores/listControls";
import FilterPopover from "../src/components/FilterPopover.vue";
import type { Effort, TodoRow } from "../src/types/database";

/**
 * Effort is the cut for "I have twenty minutes" and "I have no energy": show
 * me what fits. One size per task (S, M, L, XL), a column like priority. It
 * has to filter, sort smallest first, group, and survive filter state that
 * was saved before the key existed.
 */

const t = (id: string, effort: Effort | null, over: Partial<TodoRow> = {}) =>
  ({
    id,
    user_id: "u",
    area_id: null,
    project_id: null,
    heading_id: null,
    title: id,
    notes: null,
    state: "anytime",
    priority: null,
    effort,
    start_date: null,
    deadline: null,
    evening: false,
    completed_at: null,
    position: 0,
    obsidian_uri: null,
    drafts: null,
    metadata: null,
    created_at: "2026-09-01T00:00:00Z",
    ...over,
  }) as TodoRow;

const ctrl = (over: Partial<ControlState> = {}): ControlState => ({
  filter: { tags: [], priority: [], state: [], effort: [] },
  sort: "manual",
  group: "none",
  ...over,
});
const ids = (rows: TodoRow[]) => rows.map((r) => r.id);

describe("the sizes", () => {
  it("are four, smallest first, each with a meaning", () => {
    expect(EFFORTS.map((e) => e.name)).toEqual(["S", "M", "L", "XL"]);
    for (const e of EFFORTS) expect(e.hint).toBeTruthy();
    expect(effortDef("M")?.hint).toContain("hour");
    expect(effortDef(null)).toBeNull();
    expect(effortDef("XXL")).toBeNull();
  });

  it("rank an unsized task after every sized one", () => {
    expect(effortRank("S")).toBeLessThan(effortRank("M"));
    expect(effortRank("L")).toBeLessThan(effortRank("XL"));
    expect(effortRank("XL")).toBeLessThan(effortRank(null));
    expect(effortRank(undefined)).toBe(Infinity);
  });
});

describe("filtering by effort", () => {
  const rows = [t("a", "S"), t("b", "M"), t("c", "XL"), t("d", null)];

  it("keeps only the sizes asked for", () => {
    const f: FilterState = { tags: [], priority: [], state: [], effort: ["S"] };
    expect(ids(applyControls(rows, ctrl({ filter: f })))).toEqual(["a"]);
    f.effort = ["S", "M"];
    expect(ids(applyControls(rows, ctrl({ filter: f })))).toEqual(["a", "b"]);
  });

  it("can ask for the unsized ones, which is how a backlog gets sized", () => {
    const f: FilterState = {
      tags: [],
      priority: [],
      state: [],
      effort: ["none"],
    };
    expect(ids(applyControls(rows, ctrl({ filter: f })))).toEqual(["d"]);
  });

  it("combines with priority: small AND p0", () => {
    const mixed = [
      t("p0s", "S", { priority: "P0" }),
      t("p0l", "L", { priority: "P0" }),
      t("p2s", "S", { priority: "P2" }),
    ];
    const f: FilterState = {
      tags: [],
      priority: ["P0"],
      state: [],
      effort: ["S"],
    };
    expect(ids(applyControls(mixed, ctrl({ filter: f })))).toEqual(["p0s"]);
  });

  it("survives filter state saved before the key existed", () => {
    const old = {
      filter: { tags: [], priority: [], state: [] },
      sort: "manual",
      group: "none",
    } as unknown as ControlState;
    expect(ids(applyControls(rows, old))).toEqual(["a", "b", "c", "d"]);
  });
});

describe("sorting and grouping by effort", () => {
  it("sorts smallest first, unsized last, manual order inside a size", () => {
    const rows = [
      t("xl", "XL"),
      t("none", null),
      t("s2", "S", { position: 2 }),
      t("m", "M"),
      t("s1", "S", { position: 1 }),
    ];
    expect(ids(applyControls(rows, ctrl({ sort: "effort" })))).toEqual([
      "s1",
      "s2",
      "m",
      "xl",
      "none",
    ]);
  });

  it("groups in size order, drops empty sizes, names the leftover", () => {
    const g = groupTodos([t("a", "XL"), t("b", "S"), t("c", null)], "effort");
    expect(g.map((b) => b.key)).toEqual(["S", "XL", "none"]);
    expect(g.map((b) => b.label)).toEqual(["s", "xl", "unsized"]);
    expect(groupTodos([], "effort")).toEqual([]);
  });
});

describe("saved list controls", () => {
  beforeEach(() => localStorage.clear());

  it("gain an empty effort filter when they predate it", () => {
    localStorage.setItem(
      "hmart.listControls.v1",
      JSON.stringify({
        "/today": {
          filter: { tags: [], priority: ["P0"], state: [] },
          sort: "manual",
          group: "none",
        },
      }),
    );
    setActivePinia(createPinia());
    const store = useListControlsStore();
    expect(store.get("/today").filter.effort).toEqual([]);
    expect(store.isFilterActive("/today")).toBe(true);
    store.setFilter("/today", {
      tags: [],
      priority: [],
      state: [],
      effort: ["S"],
    });
    expect(store.isFilterActive("/today")).toBe(true);
  });
});

describe("the filter popover", () => {
  let app: App | null = null;
  let host: HTMLElement | null = null;
  afterEach(() => {
    app?.unmount();
    host?.remove();
    app = null;
    host = null;
  });

  it("offers the four sizes and unsized, and applies on a tap", async () => {
    const applied: FilterState[] = [];
    host = document.createElement("div");
    document.body.appendChild(host);
    app = createApp({
      render: () =>
        h(FilterPopover, {
          value: { tags: [], priority: [], state: [], effort: [] },
          availableTags: [],
          onApply: (v: FilterState) => applied.push(v),
        }),
    });
    app.mount(host);
    const section = Array.from(host.querySelectorAll(".d-filter-section")).find(
      (s) => s.querySelector(".cap")?.textContent?.trim() === "effort",
    )!;
    expect(section).toBeTruthy();
    const chips = Array.from(section.querySelectorAll<HTMLElement>(".chip"));
    expect(chips.map((c) => c.textContent?.trim())).toEqual([
      "s",
      "m",
      "l",
      "xl",
      "unsized",
    ]);
    // Second section, right under priority.
    const order = Array.from(
      host.querySelectorAll(".d-filter-section .cap"),
    ).map((c) => c.textContent?.trim());
    expect(order.slice(0, 2)).toEqual(["priority", "effort"]);
    chips[0]!.click();
    await nextTick();
    expect(applied.at(-1)?.effort).toEqual(["S"]);
    expect(chips[0]!.getAttribute("aria-pressed")).toBe("true");
  });
});
