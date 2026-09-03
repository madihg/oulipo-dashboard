import { describe, it, expect } from "vitest";
import {
  CONTEXTS,
  CONTEXT_NAMES,
  contextDef,
  contextRank,
  isContext,
  primaryContext,
  sortTagsByContext,
} from "../src/utils/contexts";
import { applyControls, groupTodos } from "../src/stores/listControls";
import type { TodoRow } from "../src/types/database";

/**
 * Contexts are the closed set of "what do I need in front of me" tags, and the
 * thing the list can be grouped and sorted by. The freeform tag registry is
 * deliberately not involved: grouping by an open vocabulary of topics gives
 * you a search, not a working view.
 */

const t = (over: Partial<TodoRow> & { tags?: string[] }): TodoRow =>
  ({
    id: over.id ?? Math.random().toString(36).slice(2),
    user_id: "u",
    area_id: null,
    project_id: null,
    heading_id: null,
    title: over.title ?? "x",
    notes: null,
    state: "anytime",
    priority: null,
    start_date: null,
    deadline: null,
    evening: false,
    completed_at: null,
    position: over.position ?? 0,
    obsidian_uri: null,
    drafts: null,
    metadata: null,
    created_at: "2026-09-01T00:00:00Z",
    ...over,
  }) as TodoRow;

describe("the context set", () => {
  it("is exactly the seven agreed names, in working-day order", () => {
    expect(CONTEXT_NAMES).toEqual([
      "web",
      "email",
      "text",
      "buy",
      "offline",
      "notes",
      "think-plan",
    ]);
  });

  it("knows a context from a topic tag", () => {
    expect(isContext("web")).toBe(true);
    expect(isContext("think-plan")).toBe(true);
    expect(isContext("reservoir")).toBe(false);
    expect(isContext("residency")).toBe(false);
  });

  it("carries an AA-safe colour drawn from the house accents for each", () => {
    for (const c of CONTEXTS) {
      expect(contextDef(c.name)?.color).toBeTruthy();
    }
    expect(contextDef("nope")).toBeNull();
  });
});

describe("primaryContext", () => {
  it("returns null with no tags at all", () => {
    expect(primaryContext(undefined)).toBeNull();
    expect(primaryContext([])).toBeNull();
    expect(primaryContext(["reservoir", "claude-delivered"])).toBeNull();
  });

  it("picks the EARLIEST context in canonical order when a row has several", () => {
    // Buying online is both "buy" and "web"; it files under web, which comes
    // first, so the row appears exactly once.
    expect(primaryContext(["buy", "web"])).toBe("web");
    expect(primaryContext(["web", "buy"])).toBe("web");
    expect(primaryContext(["think-plan", "notes"])).toBe("notes");
  });

  it("ignores non-context tags mixed in", () => {
    expect(primaryContext(["reservoir", "email", "residency"])).toBe("email");
  });

  it("ranks rows for sorting, with no-context last", () => {
    expect(contextRank(["web"])).toBeLessThan(contextRank(["email"]));
    expect(contextRank(["think-plan"])).toBeLessThan(contextRank(undefined));
    expect(contextRank(["reservoir"])).toBe(Infinity);
  });
});

describe("sortTagsByContext", () => {
  it("puts contexts first in canonical order, then the rest alphabetically", () => {
    expect(
      sortTagsByContext(["residency", "web", "claude-delivered", "buy"]),
    ).toEqual(["web", "buy", "claude-delivered", "residency"]);
  });

  it("does not mutate its input", () => {
    const input = ["notes", "web"];
    sortTagsByContext(input);
    expect(input).toEqual(["notes", "web"]);
  });
});

describe("grouping by context", () => {
  const rows = [
    t({ id: "a", title: "reply to rose", tags: ["email"] }),
    t({ id: "b", title: "file the appeal", tags: ["web"] }),
    t({ id: "c", title: "books curriculum", tags: ["notes"] }),
    t({ id: "d", title: "buy the kit", tags: ["buy", "web"] }),
    t({ id: "e", title: "no context", tags: ["reservoir"] }),
    t({ id: "f", title: "no tags at all" }),
  ];

  it("buckets rows under their primary context, in canonical order", () => {
    const g = groupTodos(rows, "context");
    expect(g.map((b) => b.key)).toEqual(["web", "email", "notes", "none"]);
  });

  it("files a buy+web row under web, once", () => {
    const g = groupTodos(rows, "context");
    const web = g.find((b) => b.key === "web")!;
    expect(web.items.map((r) => r.id)).toEqual(["b", "d"]);
    const everywhere = g.flatMap((b) => b.items.map((r) => r.id));
    expect(everywhere.filter((id) => id === "d")).toHaveLength(1);
  });

  it("drops empty buckets rather than listing every context", () => {
    const g = groupTodos(rows, "context");
    expect(g.some((b) => b.key === "text")).toBe(false);
    expect(g.some((b) => b.key === "think-plan")).toBe(false);
  });

  it("labels the leftover bucket and puts it last", () => {
    const g = groupTodos(rows, "context");
    const last = g.at(-1)!;
    expect(last.key).toBe("none");
    expect(last.label).toBe("no context");
    expect(last.items.map((r) => r.id)).toEqual(["e", "f"]);
  });

  it("returns nothing for an empty list", () => {
    expect(groupTodos([], "context")).toEqual([]);
  });
});

describe("sorting by context", () => {
  const ctrl = {
    filter: { tags: [], priority: [], state: [] },
    sort: "context" as const,
    group: "none" as const,
  };

  it("orders by canonical context, then manual position within a run", () => {
    const rows = applyControls(
      [
        t({ id: "n", title: "notes", tags: ["notes"], position: 0 }),
        t({ id: "w2", title: "web 2", tags: ["web"], position: 2 }),
        t({ id: "x", title: "untagged", position: 0 }),
        t({ id: "w1", title: "web 1", tags: ["web"], position: 1 }),
        t({ id: "e", title: "email", tags: ["email"], position: 0 }),
      ],
      ctrl,
    );
    expect(rows.map((r) => r.id)).toEqual(["w1", "w2", "e", "n", "x"]);
  });

  it("leaves untagged rows at the bottom in their own manual order", () => {
    const rows = applyControls(
      [
        t({ id: "x2", position: 5 }),
        t({ id: "x1", position: 1 }),
        t({ id: "w", tags: ["web"], position: 9 }),
      ],
      ctrl,
    );
    expect(rows.map((r) => r.id)).toEqual(["w", "x1", "x2"]);
  });
});
