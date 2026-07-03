import { describe, it, expect } from "vitest";
import { viewShareItems } from "../src/utils/shareView";
import type { ShareItemRow } from "../src/types/database";

let seq = 0;
function s(over: Partial<ShareItemRow>): ShareItemRow {
  return {
    id: `s-${seq++}`,
    user_id: "u",
    source_piece_id: null,
    arc_slug: null,
    touchpoint: null,
    title: "share",
    hook: null,
    kind: "work_share",
    format: "post",
    platform_targets: [],
    status: "backlog",
    priority: null,
    target_slot_at: null,
    shipped_at: null,
    draft_caption: null,
    draft_hashtags: [],
    draft_substack_title: null,
    draft_substack_subtitle: null,
    draft_substack_body: null,
    draft_slides: null,
    draft_images: null,
    drive_folder_url: null,
    external_url: null,
    last_surfaced_at: null,
    surfaced_count: 0,
    notes: null,
    created_at: "2026-01-01T00:00:00Z",
    ...(over as object),
  } as unknown as ShareItemRow;
}

describe("viewShareItems - filter", () => {
  it("hides the requested statuses (shipped/dropped/slot_skipped)", () => {
    const rows = [
      s({ title: "a", status: "backlog" }),
      s({ title: "b", status: "shipped" }),
      s({ title: "c", status: "dropped" }),
      s({ title: "d", status: "slot_skipped" }),
      s({ title: "e", status: "drafted" }),
    ];
    const out = viewShareItems(rows, {
      sort: "slot",
      hidden: new Set(["shipped", "dropped", "slot_skipped"]),
    });
    expect(out.map((r) => r.title)).toEqual(["a", "e"]);
  });
});

describe("viewShareItems - sort by slot", () => {
  it("soonest slot first, unslotted last", () => {
    const rows = [
      s({ title: "unslotted", target_slot_at: null }),
      s({ title: "may", target_slot_at: "2026-05-08" }),
      s({ title: "mar", target_slot_at: "2026-03-12" }),
    ];
    const out = viewShareItems(rows, { sort: "slot", hidden: new Set() });
    expect(out.map((r) => r.title)).toEqual(["mar", "may", "unslotted"]);
  });

  it("ties on slot break by priority", () => {
    const rows = [
      s({ title: "p2", target_slot_at: "2026-05-08", priority: "P2" }),
      s({ title: "p0", target_slot_at: "2026-05-08", priority: "P0" }),
    ];
    const out = viewShareItems(rows, { sort: "slot", hidden: new Set() });
    expect(out.map((r) => r.title)).toEqual(["p0", "p2"]);
  });
});

describe("viewShareItems - sort by priority", () => {
  it("P0 -> P1 -> P2 -> none, then slot", () => {
    const rows = [
      s({ title: "none", priority: null, target_slot_at: "2026-01-01" }),
      s({ title: "p1", priority: "P1", target_slot_at: "2026-06-01" }),
      s({ title: "p0", priority: "P0", target_slot_at: "2026-09-01" }),
    ];
    const out = viewShareItems(rows, { sort: "priority", hidden: new Set() });
    expect(out.map((r) => r.title)).toEqual(["p0", "p1", "none"]);
  });

  it("does not mutate the input array", () => {
    const rows = [
      s({ title: "b", priority: "P2" }),
      s({ title: "a", priority: "P0" }),
    ];
    const snapshot = rows.map((r) => r.title);
    viewShareItems(rows, { sort: "priority", hidden: new Set() });
    expect(rows.map((r) => r.title)).toEqual(snapshot);
  });
});
