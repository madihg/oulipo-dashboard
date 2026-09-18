import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { readFileSync, existsSync } from "node:fs";
import { belongsInInbox, belongsInToday, whenPatch } from "../src/utils/when";
import type { TodoRow } from "../src/types/database";

/**
 * A task stays in the Inbox until it is moved to an area. A date does not
 * file it. It used to: every "when" writes a state, the Inbox was keyed on
 * state = inbox, and a dated unfiled task fell through to a "no area" list
 * that existed only to catch it. That list is gone.
 */

type Change = {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: TodoRow;
  old: TodoRow;
};
const rt = { todos: null as ((p: Change) => void) | null };
function chain(): unknown {
  let single = false;
  const p: unknown = new Proxy(() => p, {
    get: (_t, key) => {
      if (key === "then") {
        return (resolve: (v: unknown) => void) =>
          resolve({ data: single ? null : [], error: null });
      }
      if (key === "single" || key === "maybeSingle") single = true;
      return () => p;
    },
    apply: () => p,
  });
  return p;
}
vi.mock("../src/lib/supabase", () => ({
  supabase: {
    from: () => chain(),
    auth: {
      getSession: async () => ({ data: { session: { user: { id: "u" } } } }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe() {} } },
      }),
    },
    channel: () => {
      const c = {
        on(_e: string, f: { table: string }, cb: (p: Change) => void) {
          if (f.table === "todos") rt.todos = cb;
          return c;
        },
        subscribe() {
          return c;
        },
      };
      return c;
    },
    removeChannel() {},
  },
}));

const row = (over: Partial<TodoRow> = {}): TodoRow =>
  ({
    id: "t1",
    user_id: "u",
    area_id: null,
    project_id: null,
    heading_id: null,
    title: "Pitch computer theater",
    notes: null,
    state: "inbox",
    priority: null,
    start_date: null,
    deadline: null,
    evening: false,
    completed_at: null,
    position: 0,
    obsidian_uri: null,
    drafts: null,
    metadata: null,
    created_at: "2026-09-18T00:00:00Z",
    ...over,
  }) as unknown as TodoRow;

describe("the rule", () => {
  it("keeps an unfiled task in the inbox whatever its when", () => {
    expect(belongsInInbox(row())).toBe(true);
    for (const key of ["today", "tomorrow", "someday", "clear"] as const) {
      expect(belongsInInbox(row(whenPatch(key))), key).toBe(true);
    }
    const dated = row(whenPatch("date", { date: "2026-09-22" }));
    expect(dated.state).toBe("anytime"); // a date writes a state...
    expect(belongsInInbox(dated)).toBe(true); // ...and that files nothing
  });

  it("lets only an area or a project take it out", () => {
    expect(belongsInInbox(row({ area_id: "health" }))).toBe(false);
    expect(belongsInInbox(row({ project_id: "p" }))).toBe(false);
  });

  it("drops finished work", () => {
    for (const state of ["completed", "cancelled", "logbook"] as const) {
      expect(belongsInInbox(row({ state }))).toBe(false);
    }
  });

  it("still shows a due inbox task in today: a date is a promise, not a filing", () => {
    const due = row(whenPatch("today"));
    expect(belongsInInbox(due)).toBe(true);
    expect(belongsInToday(due)).toBe(true);
  });
});

describe("in the store", () => {
  beforeEach(() => {
    rt.todos = null;
  });
  async function store() {
    const { useVaultStore } = await import("../src/stores/vault");
    setActivePinia(createPinia());
    const vault = useVaultStore();
    await vault.subscribeRealtime();
    return vault;
  }
  const inbox = (v: { inboxTodos: TodoRow[] }) => v.inboxTodos.map((t) => t.id);

  it("a dated inbox task stays, filing removes it, unfiling returns it", async () => {
    const vault = await store();
    const r = row();
    rt.todos!({ eventType: "INSERT", new: r, old: r });
    expect(inbox(vault)).toEqual(["t1"]);

    const dated = row(whenPatch("date", { date: "2026-09-22" }));
    rt.todos!({ eventType: "UPDATE", new: dated, old: r });
    expect(inbox(vault)).toEqual(["t1"]);

    const filed = row({ ...dated, area_id: "health" });
    rt.todos!({ eventType: "UPDATE", new: filed, old: dated });
    expect(inbox(vault)).toEqual([]);

    rt.todos!({ eventType: "UPDATE", new: dated, old: filed });
    expect(inbox(vault)).toEqual(["t1"]);
  });

  it("an unfiled task due today is in both lists", async () => {
    const vault = await store();
    const due = row({ id: "t2", ...whenPatch("today") });
    rt.todos!({ eventType: "INSERT", new: due, old: due });
    expect(inbox(vault)).toEqual(["t2"]);
    expect(vault.todayTodos.map((t) => t.id)).toEqual(["t2"]);
  });
});

describe("no area is gone", () => {
  it("has no view, no loader and no link, and the old address lands in the inbox", () => {
    expect(existsSync("src/views/NoArea.vue")).toBe(false);
    expect(readFileSync("src/stores/vault.ts", "utf8")).not.toContain(
      "loadNoArea",
    );
    expect(readFileSync("src/router.ts", "utf8")).toContain(
      '{ path: "/no-area", redirect: "/inbox" }',
    );
    for (const p of [
      "src/App.vue",
      "src/views/Areas.vue",
      "src/components/MobileTabBar.vue",
    ]) {
      expect(readFileSync(p, "utf8"), p).not.toContain("/no-area");
    }
  });

  it("queries the inbox by filing, not by state", () => {
    const src = readFileSync("src/stores/vault.ts", "utf8");
    const fn = src.slice(src.indexOf("async function loadInbox()"));
    const body = fn.slice(0, fn.indexOf("inboxTodos.value ="));
    expect(body).not.toContain('.eq("state", "inbox")');
    expect(body).toContain('.is("area_id", null)');
    expect(body).toContain('.is("project_id", null)');
    expect(body).toContain("(completed,cancelled,logbook)");
  });
});
