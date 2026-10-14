import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { createApp, h, nextTick, type App } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import { readFileSync } from "node:fs";
import type { TodoRow, TrashEntry } from "../src/types/database";
import {
  byLabel,
  captionOf,
  childrenSummary,
  clip,
  dayLabel,
  groupByDay,
  isSelfBack,
  kindLabel,
  kindNoun,
  normalizeEntry,
  relativeTime,
  restoreMessage,
} from "../src/utils/trash";

/**
 * The trash: every delete lands in hmart.trash with what it cascaded to, and
 * one page restores it. The page is a client of four RPCs; these tests hold
 * the page to the contract (what it asks for, what it shows, what restore
 * sends), its way in from every surface, and the delete undo that now goes
 * through the trash before it falls back to re-inserting a snapshot.
 */

type Rpc = (fn: string, args?: Record<string, unknown>) => unknown;
type Result = { data: unknown; error: { code?: string; message: string } | null };
const db = vi.hoisted(() => ({
  rpc: null as unknown as Rpc,
  calls: [] as Array<{ fn: string; args?: Record<string, unknown> }>,
  inserts: [] as Array<{ table: string; payload: unknown }>,
  /** Every write request, in order: "delete todos", "update todos"... */
  writes: [] as string[],
  /** What an insert answers; the default echoes the payload back. */
  insertResult: null as null | ((payload: unknown) => Result),
  /** What a DELETE ... RETURNING answers (bulk delete's undo snapshot). */
  deleteReturns: [] as unknown[],
  single: null as unknown,
}));

vi.mock("../src/lib/supabase", () => {
  const chain = (table: string): unknown => {
    let single = false;
    let inserted: { payload: unknown } | null = null;
    let deleting = false;
    const p: unknown = new Proxy(() => p, {
      get: (_t, key) => {
        if (key === "then") {
          return (resolve: (v: unknown) => void) => {
            if (inserted && db.insertResult)
              return resolve(db.insertResult(inserted.payload));
            if (inserted) {
              const rows = Array.isArray(inserted.payload)
                ? inserted.payload
                : [inserted.payload];
              return resolve({ data: single ? rows[0] : rows, error: null });
            }
            if (deleting) return resolve({ data: db.deleteReturns, error: null });
            resolve({ data: single ? db.single : [], error: null });
          };
        }
        if (key === "single" || key === "maybeSingle") single = true;
        if (key === "insert") {
          return (payload: unknown) => {
            db.inserts.push({ table, payload });
            inserted = { payload };
            return p;
          };
        }
        if (key === "delete" || key === "update") db.writes.push(`${key} ${table}`);
        if (key === "delete") deleting = true;
        return () => p;
      },
      apply: () => p,
    });
    return p;
  };
  return {
    supabase: {
      from: (table: string) => chain(table),
      rpc: async (fn: string, args?: Record<string, unknown>) => {
        db.calls.push({ fn, args });
        return db.rpc(fn, args);
      },
      auth: {
        getSession: async () => ({ data: { session: null } }),
        onAuthStateChange: () => ({
          data: { subscription: { unsubscribe() {} } },
        }),
      },
      channel: () => ({ on: () => ({}), subscribe: () => ({}) }),
      removeChannel() {},
    },
  };
});

const NOW = new Date("2026-10-14T12:00:00");
const hoursAgo = (h: number) =>
  new Date(Date.now() - h * 3600_000).toISOString();

const entry = (over: Partial<TrashEntry> = {}): TrashEntry => ({
  id: "e1",
  source_table: "todos",
  row_id: "t1",
  title: "call the plumber",
  detail: null,
  context: "admin",
  deleted_at: hoursAgo(2),
  deleted_by: "app",
  tx_id: "100",
  child_count: 0,
  children: {},
  hits: null,
  batch_count: 1,
  ...over,
});

const ok = (data: unknown) => ({ data, error: null });

function flush(ms = 0) {
  return new Promise((r) => setTimeout(r, ms));
}

let app: App | null = null;
let host: HTMLElement | null = null;
beforeEach(() => {
  db.calls = [];
  db.inserts = [];
  db.writes = [];
  db.insertResult = null;
  db.deleteReturns = [];
  db.single = null;
});
afterEach(() => {
  app?.unmount();
  host?.remove();
  app = null;
  host = null;
  document.body.innerHTML = "";
});

const restoredT1 = {
  restored: [{ table: "todos", id: "t1", title: "call the plumber" }],
  skipped: [],
};

async function mountTrash(
  rows: TrashEntry[],
  kinds = [] as unknown[],
  restore: (args?: Record<string, unknown>) => unknown = () => ok(restoredT1),
) {
  db.rpc = (fn, args) => {
    if (fn === "trash_search") return ok(rows);
    if (fn === "trash_kinds") return ok(kinds);
    if (fn === "trash_restore") return restore(args);
    return ok(null);
  };
  const { default: Trash } = await import("../src/views/Trash.vue");
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/:p(.*)*", component: { template: "<div />" } }],
  });
  await router.push("/trash");
  host = document.createElement("div");
  document.body.appendChild(host);
  app = createApp({ render: () => h(Trash) });
  app.use(pinia).use(router).mount(host);
  await router.isReady();
  await flush();
  await nextTick();
  return { pinia, router };
}

async function lastToast() {
  const { useToastStore } = await import("../src/stores/toast");
  return useToastStore().toasts.at(-1);
}

describe("the trash page", () => {
  it("lists what was deleted, by day, with kind, children and hits", async () => {
    await mountTrash(
      [
        entry({
          detail: "ask about the boiler too",
          child_count: 14,
          children: { todo_tags: 2, checklist_items: 12 },
        }),
        entry({
          id: "e2",
          source_table: "learn_items",
          row_id: "l1",
          title: "the society of the spectacle",
          context: null,
          deleted_by: "claude",
          hits: ["chapter one notes"],
        }),
      ],
      [
        { source_table: "todos", n: 1 },
        { source_table: "learn_items", n: 1 },
      ],
    );
    const rows = Array.from(host!.querySelectorAll(".t-row"));
    expect(rows.map((r) => r.querySelector(".t-name")?.textContent)).toEqual([
      "call the plumber",
      "the society of the spectacle",
    ]);
    const cap0 = rows[0]!.querySelector(".t-cap")!.textContent!;
    expect(cap0).toMatch(/^task · admin · \dh ago · by app$/);
    expect(rows[0]!.querySelector(".t-detail")?.textContent).toBe(
      "ask about the boiler too",
    );
    expect(rows[0]!.querySelector(".t-children")?.textContent?.trim()).toBe(
      "with 12 checklist items, 2 tag links",
    );
    const cap1 = rows[1]!.querySelector(".t-cap")!.textContent!;
    expect(cap1).toMatch(/^reading · .* · by claude$/);
    expect(rows[1]!.querySelector(".t-hits")?.textContent?.trim()).toBe(
      "matched in: chapter one notes",
    );
    // A day header in the caption recipe.
    expect(host!.querySelector(".t-day-label")?.classList.contains("cap")).toBe(
      true,
    );
    // Filter chips: all + one per kind, with counts; "all" is pressed.
    const chips = Array.from(
      host!.querySelectorAll<HTMLButtonElement>(".t-kinds .chip"),
    );
    expect(chips.map((c) => c.textContent?.trim())).toEqual([
      "all 2",
      "readings 1",
      "tasks 1",
    ]);
    expect(chips[0]!.getAttribute("aria-pressed")).toBe("true");
    // The header counts the trash.
    expect(host!.querySelector(".t-meta")?.textContent).toContain(
      "2 · deleted things land here and stay until you restore them",
    );
  });

  it("restores the entry by its trash id and takes it off the list", async () => {
    await mountTrash([entry(), entry({ id: "e2", row_id: "t2", tx_id: "101" })]);
    const chip = host!.querySelector<HTMLButtonElement>(".t-restore")!;
    expect(chip.getAttribute("type")).toBe("button");
    expect(chip.textContent?.trim()).toBe("restore");
    db.calls = [];
    chip.click();
    await flush();
    await nextTick();
    const call = db.calls.find((c) => c.fn === "trash_restore");
    expect(call?.args).toEqual({ p_id: "e1", p_batch: false });
    expect(host!.querySelectorAll(".t-row")).toHaveLength(1);
    // The kinds are recounted.
    expect(db.calls.some((c) => c.fn === "trash_kinds")).toBe(true);
    const t = (await lastToast())!;
    expect(t.message).toBe('restored "call the plumber"');
    // A task offers to open itself.
    expect(t.action?.label).toBe("open");
  });

  it("opens the restored task where you are, without leaving the page", async () => {
    const { router } = await mountTrash([entry()]);
    host!.querySelector<HTMLButtonElement>(".t-restore")!.click();
    await flush();
    db.single = { id: "t1", title: "call the plumber", todo_tags: [] };
    await router.push("/today");
    const t = (await lastToast())!;
    await t.action!.run();
    expect(router.currentRoute.value.path).toBe("/today");
    const { useTodoModalStore } = await import("../src/stores/todoModal");
    expect(useTodoModalStore().todo?.id).toBe("t1");
  });

  it("counts success by the entry's own row, not by anything coming back", async () => {
    // Its checklist came back; the task itself did not.
    await mountTrash([entry({ child_count: 1, children: { checklist_items: 1 } })], [], () =>
      ok({
        restored: [{ table: "checklist_items", id: "c1", title: "buy washer" }],
        skipped: [
          { table: "todos", title: "call the plumber", reason: "its area is gone" },
        ],
      }),
    );
    host!.querySelector<HTMLButtonElement>(".t-restore")!.click();
    await flush();
    await nextTick();
    // Still listed, no "open", and the reason named.
    expect(host!.querySelectorAll(".t-row")).toHaveLength(1);
    const t = (await lastToast())!;
    expect(t.message).toBe('could not restore "call the plumber": its area is gone');
    expect(t.action).toBeUndefined();
  });

  it("says try again, not the raw error, when the restore call fails", async () => {
    await mountTrash([entry({ title: "x".repeat(60) })], [], () => ({
      data: null,
      error: { message: "TypeError: Failed to fetch 4f9a-uuid" },
    }));
    const chip = host!.querySelector<HTMLButtonElement>(".t-restore")!;
    chip.click();
    await flush();
    await nextTick();
    const t = (await lastToast())!;
    expect(t.message).toBe(`could not restore "${"x".repeat(39)}…". try again`);
    expect(t.message).not.toContain("Failed to fetch");
    // The chip is usable again.
    expect(chip.disabled).toBe(false);
    expect(chip.getAttribute("aria-label")).toBe(`restore ${"x".repeat(60)}`);
  });

  it("frees the chip even when the restore throws", async () => {
    await mountTrash([entry()], [], () => {
      throw new Error("network down");
    });
    const chip = host!.querySelector<HTMLButtonElement>(".t-restore")!;
    chip.click();
    await flush();
    await nextTick();
    expect(chip.disabled).toBe(false);
    expect((await lastToast())!.message).toBe(
      'could not restore "call the plumber". try again',
    );
  });

  it("offers restore all when one deletion took several entries", async () => {
    const batch = { batch_count: 3, tx_id: "7" };
    await mountTrash(
      [
        entry(batch),
        entry({ ...batch, id: "e2", row_id: "t2", title: "fix the sink" }),
        entry({ ...batch, id: "e3", row_id: "t3", title: "pay the bill" }),
        entry({ id: "e4", row_id: "t4", tx_id: "8", title: "other" }),
      ],
      [],
      () =>
        ok({
          restored: [
            { table: "todos", id: "t1", title: "call the plumber" },
            { table: "todos", id: "t2", title: "fix the sink" },
          ],
          skipped: [{ table: "todos", title: "pay the bill", reason: "its area is gone" }],
        }),
    );
    const all = host!.querySelector<HTMLButtonElement>(".t-restore-all")!;
    expect(all.textContent?.trim()).toBe("restore all 3");
    expect(all.classList.contains("chip-quiet")).toBe(true);
    expect(all.getAttribute("aria-label")).toBe(
      "restore all 3 deleted with call the plumber",
    );
    all.click();
    await flush();
    await nextTick();
    const call = db.calls.find((c) => c.fn === "trash_restore");
    expect(call?.args).toEqual({ p_id: "e1", p_batch: true });
    // "and n more" counts what actually came back, not the batch size.
    expect((await lastToast())!.message).toBe(
      'restored "call the plumber" and 1 more, skipped "pay the bill" (its area is gone)',
    );
  });

  it("filters by kind through trash_search", async () => {
    await mountTrash([entry()], [{ source_table: "todos", n: 1 }]);
    db.calls = [];
    const tasks = Array.from(
      host!.querySelectorAll<HTMLButtonElement>(".t-kinds .chip"),
    ).find((c) => c.textContent?.trim().startsWith("tasks"))!;
    tasks.click();
    await flush();
    await nextTick();
    const call = db.calls.find((c) => c.fn === "trash_search");
    expect(call?.args).toMatchObject({ p_kind: "todos", p_offset: 0 });
    expect(tasks.getAttribute("aria-pressed")).toBe("true");
  });

  it("says the trash is empty and offers a way back", async () => {
    await mountTrash([]);
    const empty = host!.querySelector(".d-empty")!;
    expect(empty.textContent).toContain("nothing in the trash");
    const chip = empty.querySelector(".chip")!;
    expect(chip.getAttribute("href")).toBe("/today");
  });

  it("searches after a pause and offers to clear a search that found nothing", async () => {
    await mountTrash([]);
    db.calls = [];
    const input = host!.querySelector<HTMLInputElement>(".t-search")!;
    input.value = "boiler";
    input.dispatchEvent(new Event("input"));
    await flush(220);
    await nextTick();
    const call = db.calls.find((c) => c.fn === "trash_search");
    expect(call?.args).toMatchObject({ p_q: "boiler", p_kind: null });
    const empty = host!.querySelector(".d-empty")!;
    expect(empty.textContent).toContain('nothing deleted matches "boiler"');
    const clear = empty.querySelector<HTMLButtonElement>("button.chip")!;
    expect(clear.textContent?.trim()).toBe("clear search");
    expect(clear.getAttribute("type")).toBe("button");
  });

  it("names the kind too when a filtered search finds nothing", async () => {
    await mountTrash([], [{ source_table: "todos", n: 4 }]);
    Array.from(host!.querySelectorAll<HTMLButtonElement>(".t-kinds .chip"))
      .find((c) => c.textContent?.trim().startsWith("tasks"))!
      .click();
    const input = host!.querySelector<HTMLInputElement>(".t-search")!;
    input.value = "boiler";
    input.dispatchEvent(new Event("input"));
    await flush(220);
    await nextTick();
    const empty = host!.querySelector(".d-empty")!;
    expect(empty.textContent?.replace(/\s+/g, " ")).toContain(
      'nothing deleted matches "boiler" among tasks.',
    );
    const chips = Array.from(empty.querySelectorAll("button.chip")).map((c) =>
      c.textContent?.trim(),
    );
    expect(chips).toEqual(["clear search", "show all"]);
  });

  it("shows a load more chip when the page came back full", async () => {
    const page = Array.from({ length: 60 }, (_, i) =>
      entry({ id: `e${i}`, row_id: `t${i}`, tx_id: String(i) }),
    );
    await mountTrash(page);
    const more = Array.from(
      host!.querySelectorAll<HTMLButtonElement>(".t-more .chip"),
    );
    expect(more.map((m) => m.textContent?.trim())).toEqual(["load more"]);
    db.calls = [];
    more[0]!.click();
    await flush();
    // The window widens from the top, so rows restored or deleted elsewhere
    // never shift a page boundary past an entry.
    expect(db.calls.find((c) => c.fn === "trash_search")?.args).toMatchObject(
      { p_offset: 0, p_limit: 120 },
    );
  });

  it("keeps the list when a refresh fails, and says so quietly", async () => {
    let fail = false;
    const page = Array.from({ length: 60 }, (_, i) =>
      entry({ id: `e${i}`, row_id: `t${i}`, tx_id: String(i) }),
    );
    await mountTrash(page);
    const search = db.rpc;
    db.rpc = (fn, args) =>
      fail && fn === "trash_search"
        ? { data: null, error: { message: "offline" } }
        : search(fn, args);
    fail = true;
    host!.querySelector<HTMLButtonElement>(".t-more .chip")!.click();
    await flush();
    await nextTick();
    expect(host!.querySelectorAll(".t-row")).toHaveLength(60);
    expect(host!.querySelector(".t-load-error")?.textContent?.trim()).toBe(
      "could not refresh the trash.",
    );
    // Not the full error state while there is a list to show.
    expect(host!.querySelector(".d-empty")).toBeNull();
    // A background reload (another tab deleted something) fails the same way.
    const { useVaultStore } = await import("../src/stores/vault");
    useVaultStore().bumpRev();
    await flush(350);
    await nextTick();
    expect(host!.querySelectorAll(".t-row")).toHaveLength(60);
  });

  it("shows the error state only when there is nothing to keep", async () => {
    await mountTrash([]);
    db.rpc = (fn) =>
      fn === "trash_search"
        ? { data: null, error: { message: "offline" } }
        : ok([]);
    const { useVaultStore } = await import("../src/stores/vault");
    useVaultStore().bumpRev();
    await flush(350);
    await nextTick();
    const empty = host!.querySelector(".d-empty")!;
    expect(empty.textContent).toContain("could not read the trash");
    expect(empty.querySelector("button.chip")?.textContent?.trim()).toBe(
      "try again",
    );
  });
});

describe("delete undo goes through the trash", () => {
  const todo = (over: Partial<TodoRow> = {}): TodoRow =>
    ({
      id: "t1",
      user_id: "u",
      area_id: null,
      project_id: null,
      heading_id: null,
      title: "call the plumber",
      notes: null,
      state: "anytime",
      priority: null,
      start_date: null,
      deadline: null,
      evening: false,
      completed_at: null,
      position: 0,
      obsidian_uri: null,
      drafts: null,
      metadata: null,
      created_at: "2026-10-01T00:00:00Z",
      tags: ["home"],
      ...over,
    }) as TodoRow;

  async function deleteAndUndo(rpc: Rpc) {
    db.rpc = rpc;
    setActivePinia(createPinia());
    const { useVaultStore } = await import("../src/stores/vault");
    const { useToastStore } = await import("../src/stores/toast");
    const vault = useVaultStore();
    await vault.deleteTodoWithUndo(todo());
    const toast = useToastStore();
    const t = toast.toasts.at(-1)!;
    expect(t.action?.label).toBe("undo");
    await t.action!.run();
  }

  it("restores the task with its children from the trash", async () => {
    await deleteAndUndo(() =>
      ok({
        restored: [{ table: "todos", id: "t1", title: "call the plumber" }],
        skipped: [],
      }),
    );
    expect(db.calls[0]).toEqual({
      fn: "trash_restore_row",
      args: { p_table: "todos", p_row_id: "t1" },
    });
    expect(db.inserts.filter((i) => i.table === "todos")).toEqual([]);
  });

  it("falls back to the snapshot, without the hydrated tags, when the trash has nothing", async () => {
    db.single = { ...todo(), tags: undefined };
    await deleteAndUndo(() => ok({ restored: [], skipped: [] }));
    const inserts = db.inserts.filter((i) => i.table === "todos");
    expect(inserts).toHaveLength(1);
    const sent = inserts[0]!.payload;
    const payload = (Array.isArray(sent) ? sent[0] : sent) as Record<
      string,
      unknown
    >;
    expect(payload.id).toBe("t1");
    expect(payload).not.toHaveProperty("tags");
  });

  it("falls back when the rpc errors", async () => {
    db.single = { ...todo(), tags: undefined };
    await deleteAndUndo(() => ({ data: null, error: { message: "nope" } }));
    expect(db.inserts.filter((i) => i.table === "todos")).toHaveLength(1);
  });

  it("falls back when only something else came back, not the task", async () => {
    await deleteAndUndo(() =>
      ok({
        restored: [{ table: "checklist_items", id: "c1", title: "washer" }],
        skipped: [{ table: "todos", title: "call the plumber", reason: "x" }],
      }),
    );
    expect(db.inserts.filter((i) => i.table === "todos")).toHaveLength(1);
  });

  it("treats an already-there task (23505) as undone, with no failure toast", async () => {
    db.insertResult = () => ({
      data: null,
      error: { code: "23505", message: "duplicate key" },
    });
    await deleteAndUndo(() => ({ data: null, error: { message: "lost" } }));
    const { useToastStore } = await import("../src/stores/toast");
    const messages = useToastStore().toasts.map((t) => t.message);
    expect(messages.some((m) => m.startsWith("could not undo"))).toBe(false);
  });

  it("says so when the fallback really fails", async () => {
    db.insertResult = () => ({
      data: null,
      error: { code: "42501", message: "denied" },
    });
    await deleteAndUndo(() => ok({ restored: [], skipped: [] }));
    expect((await lastToast())!.message).toBe(
      "could not undo. the task is in the trash",
    );
  });

  it("undoes once, however many times the toast is tapped", async () => {
    db.rpc = () => ok({ restored: [], skipped: [] });
    setActivePinia(createPinia());
    const { useVaultStore } = await import("../src/stores/vault");
    const { useToastStore } = await import("../src/stores/toast");
    await useVaultStore().deleteTodoWithUndo(todo());
    const t = useToastStore().toasts.at(-1)!;
    await Promise.all([t.action!.run(), t.action!.run()]);
    expect(db.calls.filter((c) => c.fn === "trash_restore_row")).toHaveLength(1);
    expect(db.inserts.filter((i) => i.table === "todos")).toHaveLength(1);
  });
});

describe("bulk delete undo", () => {
  const rows = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `t${i}`,
      user_id: "u",
      title: `task ${i}`,
      state: "anytime",
    }));

  async function bulkDeleteAndUndo(n: number, rpc: Rpc) {
    db.deleteReturns = rows(n);
    db.rpc = rpc;
    setActivePinia(createPinia());
    const { useVaultStore } = await import("../src/stores/vault");
    const { useToastStore } = await import("../src/stores/toast");
    await useVaultStore().bulkDelete(rows(n).map((r) => r.id));
    const t = useToastStore().toasts.at(-1)!;
    expect(t.action?.label).toBe("undo");
    await t.action!.run();
  }

  it("asks the trash a few tasks at a time", async () => {
    let inFlight = 0;
    let peak = 0;
    await bulkDeleteAndUndo(20, async (_fn, args) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await flush();
      inFlight--;
      return ok({
        restored: [{ table: "todos", id: args!.p_row_id, title: "" }],
        skipped: [],
      });
    });
    expect(db.calls.filter((c) => c.fn === "trash_restore_row")).toHaveLength(20);
    expect(peak).toBeLessThanOrEqual(8);
    expect(db.inserts.filter((i) => i.table === "todos")).toEqual([]);
  });

  it("says how many tasks it could not bring back", async () => {
    db.insertResult = () => ({
      data: null,
      error: { code: "42501", message: "denied" },
    });
    await bulkDeleteAndUndo(3, () => ok({ restored: [], skipped: [] }));
    expect((await lastToast())!.message).toBe(
      "could not undo 3 tasks. they are in the trash",
    );
  });
});

describe("one DELETE, so the trash keeps the children", () => {
  it("deletes a tag in one request and strips it from loaded tasks", async () => {
    setActivePinia(createPinia());
    const { useVaultStore } = await import("../src/stores/vault");
    const vault = useVaultStore();
    vault.tags = [{ id: "g1", user_id: "u", name: "home", color: null }];
    vault.todayTodos = [{ id: "t1", tags: ["home", "work"] } as TodoRow];
    await vault.deleteTag("g1");
    expect(db.writes).toEqual(["delete tags"]);
    expect(vault.tags).toEqual([]);
    expect(vault.todayTodos[0]!.tags).toEqual(["work"]);
  });

  it("deletes a project in one request and its tasks leave the lists", async () => {
    setActivePinia(createPinia());
    const { useVaultStore } = await import("../src/stores/vault");
    const vault = useVaultStore();
    vault.projects = [{ id: "p1", area_id: "a1" } as never];
    vault.todayTodos = [
      { id: "t1", project_id: "p1" } as TodoRow,
      { id: "t2", project_id: null } as TodoRow,
    ];
    await vault.deleteProject("p1", { todosMode: "cascade" });
    expect(db.writes).toEqual(["delete projects"]);
    expect(vault.projects).toEqual([]);
    expect(vault.todayTodos.map((t) => t.id)).toEqual(["t2"]);
  });

  it("still moves the tasks out first when they are kept", async () => {
    setActivePinia(createPinia());
    const { useVaultStore } = await import("../src/stores/vault");
    const vault = useVaultStore();
    vault.projects = [{ id: "p1", area_id: "a1" } as never];
    vault.todayTodos = [{ id: "t1", project_id: "p1" } as TodoRow];
    await vault.deleteProject("p1", { todosMode: "orphan" });
    expect(db.writes).toEqual(["update todos", "delete projects"]);
    expect(vault.todayTodos[0]!.project_id).toBeNull();
  });
});

describe("the way in", () => {
  const read = (p: string) => readFileSync(p, "utf8");
  it("is linked from the sidebar, the phone's areas page and the palette", () => {
    const router = read("src/router.ts");
    expect(router).toContain('path: "/trash"');
    expect(router).toContain('import("./views/Trash.vue")');
    // Before the catch-all, or the catch-all would answer it.
    expect(router.indexOf('path: "/trash"')).toBeLessThan(
      router.indexOf('path: "/:pathMatch(.*)*"'),
    );
    const app = read("src/App.vue");
    expect(app).toContain('{ path: "/trash", label: "trash" }');
    // A task dropped on it does nothing: deleting is never a drag.
    const drops = app.slice(
      app.indexOf("const navDropWhen"),
      app.indexOf("const dragOverNav"),
    );
    expect(drops).not.toContain("/trash");
    expect(read("src/views/Areas.vue")).toContain(
      '{ to: "/trash", label: "trash" }',
    );
    expect(read("src/components/CommandPalette.vue")).toContain(
      'router.push("/trash")',
    );
    expect(read("src/components/MobileTabBar.vue")).toContain("isOn('/trash')");
  });

  it("spends no vermilion: nothing on the page destroys anything", () => {
    const src = read("src/views/Trash.vue");
    expect(src).not.toMatch(/chip-danger|acc-versus|vermilion/);
  });
});

describe("trash helpers", () => {
  it("names kinds in the app's words", () => {
    expect(kindLabel("todos")).toBe("task");
    expect(kindLabel("network_contacts")).toBe("person");
    expect(kindLabel("learn_items")).toBe("reading");
    expect(kindLabel("odd_new_table")).toBe("odd new table");
    expect(kindNoun("network_contacts", 2)).toBe("people");
    expect(kindNoun("apply_opportunities", 3)).toBe("opportunities");
    expect(kindNoun("todo_tags", 1)).toBe("tag link");
  });

  it("says when, relative and then by date", () => {
    const at = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
    expect(relativeTime(at(20_000), NOW)).toBe("just now");
    expect(relativeTime(at(5 * 60_000), NOW)).toBe("5m ago");
    expect(relativeTime(at(2 * 3600_000), NOW)).toBe("2h ago");
    expect(relativeTime(at(3 * 86400_000), NOW)).toBe("3d ago");
    expect(relativeTime(new Date("2026-10-02T09:00:00").toISOString(), NOW)).toBe(
      "oct 2",
    );
    expect(relativeTime(new Date("2025-03-02T09:00:00").toISOString(), NOW)).toBe(
      "mar 2 2025",
    );
  });

  it("heads each day as today, yesterday or the date", () => {
    expect(dayLabel(new Date("2026-10-14T01:00:00").toISOString(), NOW)).toBe(
      "today",
    );
    expect(dayLabel(new Date("2026-10-13T23:00:00").toISOString(), NOW)).toBe(
      "yesterday",
    );
    expect(dayLabel(new Date("2026-10-10T08:00:00").toISOString(), NOW)).toBe(
      "oct 10",
    );
    const days = groupByDay(
      [
        entry({ id: "a", deleted_at: new Date("2026-10-14T09:00:00").toISOString() }),
        entry({ id: "b", deleted_at: new Date("2026-10-14T08:00:00").toISOString() }),
        entry({ id: "c", deleted_at: new Date("2026-10-10T08:00:00").toISOString() }),
      ],
      NOW,
    );
    expect(days.map((d) => [d.label, d.entries.map((e) => e.id)])).toEqual([
      ["today", ["a", "b"]],
      ["oct 10", ["c"]],
    ]);
  });

  it("sums up what comes back with an entry", () => {
    expect(childrenSummary({ checklist_items: 12, todo_tags: 2 })).toBe(
      "with 12 checklist items, 2 tag links",
    );
    expect(childrenSummary({ todos: 1 })).toBe("with 1 task");
    expect(childrenSummary({}, 0)).toBe("");
    expect(childrenSummary(null, 3)).toBe("with 3 linked rows");
  });

  it("marks a backup's date as a bound, not a moment", () => {
    expect(byLabel("backup")).toBe("from backup");
    expect(byLabel("routine")).toBe("by routine");
    const e = entry({
      deleted_by: "backup",
      context: null,
      deleted_at: new Date("2026-09-01T10:00:00").toISOString(),
    });
    expect(captionOf(e, NOW)).toBe("task · deleted after sep 1 · from backup");
  });

  it("writes the receipt, naming what was skipped", () => {
    const e = { source_table: "todos", title: "plan" };
    const one = { table: "todos", id: "t1", title: "plan" };
    expect(restoreMessage(e, { restored: [one], skipped: [] }, true)).toBe(
      'restored "plan"',
    );
    expect(
      restoreMessage(
        e,
        {
          restored: [one],
          skipped: [{ table: "todo_tags", title: "home", reason: "tag is gone" }],
        },
        true,
      ),
    ).toBe('restored "plan", skipped "home" (tag is gone)');
    expect(
      restoreMessage(
        e,
        {
          restored: [{ table: "checklist_items", id: "c1", title: "x" }],
          skipped: [{ table: "todos", title: "plan", reason: "its area is gone" }],
        },
        false,
      ),
    ).toBe('could not restore "plan": its area is gone');
    expect(restoreMessage(e, { restored: [one], skipped: [] }, true, 2)).toBe(
      'restored "plan" and 2 more',
    );
    expect(restoreMessage(e, { restored: [], skipped: [] }, false, 1)).toBe(
      'could not restore "plan". 1 other came back',
    );
  });

  it("knows the entry's own row from what came back with it", () => {
    const e = { source_table: "todos", row_id: "t1" };
    const r = (table: string, id: string) => ({
      restored: [{ table, id, title: "" }],
      skipped: [],
    });
    expect(isSelfBack(e, r("todos", "t1"))).toBe(true);
    expect(isSelfBack(e, r("todos", "t2"))).toBe(false);
    expect(isSelfBack(e, r("checklist_items", "t1"))).toBe(false);
    expect(clip("abcdef", 4)).toBe("abc…");
    expect(clip("abc", 4)).toBe("abc");
  });

  it("makes an rpc row safe to render", () => {
    const e = normalizeEntry({
      id: "x",
      source_table: "todos",
      title: "",
      child_count: "4" as unknown as number,
      children: null as unknown as Record<string, number>,
      hits: [],
      batch_count: 0,
    });
    expect(e.title).toBe("untitled");
    expect(e.child_count).toBe(4);
    expect(e.children).toEqual({});
    expect(e.hits).toBeNull();
    expect(e.batch_count).toBe(1);
  });
});
