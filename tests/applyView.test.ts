import { describe, it, expect } from "vitest";
import { viewApplyOpportunities } from "../src/utils/applyView";
import type { ApplyOpportunityRow } from "../src/types/database";

let seq = 0;
function o(over: Partial<ApplyOpportunityRow>): ApplyOpportunityRow {
  return {
    id: `o-${seq++}`,
    user_id: "u",
    kind: "grant",
    name: "opp",
    organization: null,
    deadline: null,
    rolling: false,
    url: null,
    fit_note: null,
    status: "watchlist",
    priority: null,
    materials_status: null,
    last_surfaced_at: null,
    surfaced_count: 0,
    notes: null,
    created_at: "2026-01-01T00:00:00Z",
    ...(over as object),
  } as unknown as ApplyOpportunityRow;
}

describe("viewApplyOpportunities - filter", () => {
  it("hides the requested statuses (e.g. skipped)", () => {
    const rows = [
      o({ name: "a", status: "watchlist" }),
      o({ name: "b", status: "skipped" }),
      o({ name: "c", status: "doing" }),
    ];
    const out = viewApplyOpportunities(rows, {
      sort: "deadline",
      hidden: new Set(["skipped"]),
    });
    expect(out.map((r) => r.name)).toEqual(["a", "c"]);
  });

  it("hides multiple statuses", () => {
    const rows = [
      o({ name: "a", status: "watchlist" }),
      o({ name: "b", status: "skipped" }),
      o({ name: "c", status: "rejected" }),
    ];
    const out = viewApplyOpportunities(rows, {
      sort: "deadline",
      hidden: new Set(["skipped", "rejected"]),
    });
    expect(out.map((r) => r.name)).toEqual(["a"]);
  });
});

describe("viewApplyOpportunities - sort by deadline", () => {
  it("soonest deadline first, undated last", () => {
    const rows = [
      o({ name: "undated", deadline: null }),
      o({ name: "mar", deadline: "2026-03-01" }),
      o({ name: "jan", deadline: "2026-01-15" }),
    ];
    const out = viewApplyOpportunities(rows, {
      sort: "deadline",
      hidden: new Set(),
    });
    expect(out.map((r) => r.name)).toEqual(["jan", "mar", "undated"]);
  });

  it("ties on deadline break by priority", () => {
    const rows = [
      o({ name: "p2", deadline: "2026-02-01", priority: "P2" }),
      o({ name: "p0", deadline: "2026-02-01", priority: "P0" }),
    ];
    const out = viewApplyOpportunities(rows, {
      sort: "deadline",
      hidden: new Set(),
    });
    expect(out.map((r) => r.name)).toEqual(["p0", "p2"]);
  });
});

describe("viewApplyOpportunities - sort by priority", () => {
  it("P0 -> P1 -> P2 -> none, then deadline", () => {
    const rows = [
      o({ name: "none", priority: null, deadline: "2026-01-01" }),
      o({ name: "p1", priority: "P1", deadline: "2026-05-01" }),
      o({ name: "p0", priority: "P0", deadline: "2026-09-01" }),
      o({ name: "p2", priority: "P2", deadline: "2026-02-01" }),
    ];
    const out = viewApplyOpportunities(rows, {
      sort: "priority",
      hidden: new Set(),
    });
    expect(out.map((r) => r.name)).toEqual(["p0", "p1", "p2", "none"]);
  });

  it("does not mutate the input array", () => {
    const rows = [
      o({ name: "b", priority: "P2" }),
      o({ name: "a", priority: "P0" }),
    ];
    const snapshot = rows.map((r) => r.name);
    viewApplyOpportunities(rows, { sort: "priority", hidden: new Set() });
    expect(rows.map((r) => r.name)).toEqual(snapshot);
  });
});
