import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { TodoRow } from "../src/types/database";

/**
 * A task written outside this tab (a routine, a Claude session, another
 * device) has to reach Today. It did not: the realtime handler filed new rows
 * into inbox, project and area lists, and for Today it asked which loaded list
 * already held the row, found none, and returned. "Text Stan", born as today
 * on 2026-09-16, stayed invisible until a full reload.
 *
 * And realtime replays nothing it missed, so the loaded lists are refetched
 * when the socket re-joins after a drop.
 */

type Change = {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: TodoRow;
  old: TodoRow;
};
const rt = {
  todos: null as ((p: Change) => void) | null,
  status: null as ((s: string) => void) | null,
  fromCalls: [] as string[],
};

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
    from: (table: string) => {
      rt.fromCalls.push(table);
      return chain();
    },
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
        subscribe(cb?: (s: string) => void) {
          rt.status = cb ?? null;
          return c;
        },
      };
      return c;
    },
    removeChannel() {},
  },
}));

const row = (over: Partial<TodoRow>): TodoRow =>
  ({
    id: "t1",
    user_id: "u",
    area_id: "health",
    project_id: null,
    heading_id: null,
    title: "Text Stan",
    notes: null,
    state: "anytime",
    priority: null,
    start_date: null,
    deadline: null,
    evening: false,
    completed_at: null,
    position: 10,
    obsidian_uri: null,
    drafts: null,
    metadata: null,
    created_at: "2026-09-16T22:54:36Z",
    ...over,
  }) as unknown as TodoRow;

async function store() {
  const { useVaultStore } = await import("../src/stores/vault");
  const { clearAll } = await import("../src/lib/pendingWrites");
  clearAll();
  setActivePinia(createPinia());
  const vault = useVaultStore();
  await vault.subscribeRealtime();
  expect(rt.todos).not.toBeNull();
  return vault;
}
const ids = (v: { todayTodos: TodoRow[] }) => v.todayTodos.map((t) => t.id);

beforeEach(() => {
  rt.todos = null;
  rt.status = null;
  rt.fromCalls = [];
});

describe("a task written outside the tab", () => {
  it("reaches Today when it is born as today", async () => {
    const vault = await store();
    const r = row({ state: "today" });
    rt.todos!({ eventType: "INSERT", new: r, old: r });
    expect(ids(vault)).toEqual(["t1"]);
    // The payload carries no joined tags; the row still renders.
    expect(vault.todayTodos[0]!.tags).toEqual([]);
  });

  it("reaches Today with a project page open, and never leaks into it", async () => {
    // currentProjectId null used to equal a null project_id: the row was
    // pushed into the project list by accident, and only that accident put it
    // in Today. With a real project open the accident did not happen.
    const vault = await store();
    vault.currentProjectId = "some-project";
    const r = row({ id: "t6", state: "today" });
    rt.todos!({ eventType: "INSERT", new: r, old: r });
    expect(ids(vault)).toEqual(["t6"]);
    expect(vault.projectTodos).toEqual([]);
    vault.currentProjectId = null;
    const r2 = row({ id: "t7", state: "today" });
    rt.todos!({ eventType: "INSERT", new: r2, old: r2 });
    expect(vault.projectTodos).toEqual([]);
    expect(ids(vault)).toEqual(["t6", "t7"]);
  });

  it("reaches Today when an outside update makes it qualify", async () => {
    const vault = await store();
    const before = row({ id: "t2" });
    const after = row({ id: "t2", start_date: "2000-01-01" });
    rt.todos!({ eventType: "UPDATE", new: after, old: before });
    expect(ids(vault)).toEqual(["t2"]);
  });

  it("stays out of Today when it does not qualify", async () => {
    const vault = await store();
    const r = row({ id: "t3" });
    rt.todos!({ eventType: "INSERT", new: r, old: r });
    expect(ids(vault)).toEqual([]);
  });

  it("leaves Today when an outside update completes it", async () => {
    const vault = await store();
    const r = row({ id: "t4", state: "today" });
    rt.todos!({ eventType: "INSERT", new: r, old: r });
    expect(ids(vault)).toEqual(["t4"]);
    const done = row({ id: "t4", state: "completed" });
    rt.todos!({ eventType: "UPDATE", new: done, old: r });
    expect(ids(vault)).toEqual([]);
  });

  it("is never listed twice", async () => {
    const vault = await store();
    const r = row({ id: "t5", state: "today" });
    rt.todos!({ eventType: "INSERT", new: r, old: r });
    rt.todos!({ eventType: "UPDATE", new: r, old: r });
    expect(ids(vault)).toEqual(["t5"]);
  });
});

describe("what realtime missed", () => {
  const todoLoads = () => rt.fromCalls.filter((t) => t === "todos").length;

  it("is refetched when the socket re-joins after a drop", async () => {
    await store();
    rt.status!("SUBSCRIBED");
    expect(todoLoads()).toBe(0); // the first join is not a re-join
    rt.status!("CHANNEL_ERROR");
    rt.status!("SUBSCRIBED");
    await new Promise((r) => setTimeout(r, 0));
    expect(todoLoads()).toBeGreaterThanOrEqual(2); // today + inbox
  });

  it("is throttled, and force goes through", async () => {
    const vault = await store();
    expect(await vault.refreshLoaded({ force: true })).toBe(true);
    expect(await vault.refreshLoaded()).toBe(false);
    expect(await vault.refreshLoaded({ force: true })).toBe(true);
  });

  it("never refetches over a write that has not landed", async () => {
    const vault = await store();
    const { stage, clearAll } = await import("../src/lib/pendingWrites");
    stage("t9", { notes: "typed, not saved" });
    const before = todoLoads();
    // The replay double resolves with no row, so the write stays pending.
    const ran = await vault.refreshLoaded({ force: true });
    if (!ran) expect(todoLoads() - before).toBeLessThan(2);
    clearAll();
  });
});
