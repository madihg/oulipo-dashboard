import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { createApp, h, nextTick, type App } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import type { TodoRow } from "../src/types/database";

/**
 * An open task is one framed window, the site's unit. The row is its title
 * bar and keeps every cell in place; the title becomes a field where it
 * stands, the body opens beneath, the facts sit in a four-row ledger, and the
 * close control lives in the bar. It used to empty the row, hand the title
 * to a heading below it, and park close under the floating button.
 */

/** A supabase double: every call chains; an await resolves to an empty list,
 *  or to no row once .single()/.maybeSingle() has been asked for. */
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
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe() {} } },
      }),
      getSession: async () => ({ data: { session: null } }),
    },
    channel: () => ({
      on() {
        return this;
      },
      subscribe() {
        return this;
      },
    }),
    removeChannel() {},
  },
}));

let app: App | null = null;
let host: HTMLElement | null = null;

const todo = (over: Partial<TodoRow> = {}): TodoRow =>
  ({
    id: "t1",
    user_id: "u",
    area_id: null,
    project_id: null,
    heading_id: null,
    title: "Plan: post-reading Wednesday",
    notes: null,
    state: "today",
    priority: "P0",
    start_date: null,
    deadline: null,
    evening: false,
    completed_at: null,
    position: 0,
    obsidian_uri: null,
    drafts: null,
    metadata: null,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    tags: ["email"],
    ...over,
  }) as unknown as TodoRow;

async function mountRow(t: TodoRow) {
  const { default: DenseRow } =
    await import("../src/components/dense/DenseRow.vue");
  const { useVaultStore } = await import("../src/stores/vault");
  const pinia = createPinia();
  setActivePinia(pinia);
  const vault = useVaultStore();
  const updateTodo = vi
    .spyOn(vault, "updateTodo")
    .mockResolvedValue(true as never);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/:p(.*)*", component: { template: "<div />" } }],
  });
  host = document.createElement("div");
  document.body.appendChild(host);
  app = createApp({ render: () => h(DenseRow, { todo: t, showArea: true }) });
  app.use(pinia).use(router).mount(host);
  await nextTick();
  return { updateTodo };
}

beforeEach(() => {
  if (!window.matchMedia) {
    window.matchMedia = ((q: string) => ({
      matches: false,
      media: q,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      onchange: null,
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
});
afterEach(() => {
  app?.unmount();
  app = null;
  host?.remove();
  host = null;
  vi.restoreAllMocks();
});

const q = <T extends Element>(sel: string) => host!.querySelector<T>(sel);
const open = async () => {
  q<HTMLElement>(".d-row")!.click();
  await nextTick();
  await nextTick();
};

describe("the open task", () => {
  it("keeps the title where it was, as a field, and hides nothing", async () => {
    await mountRow(todo());
    expect(q(".d-panel")).toBeNull();
    await open();
    expect(q(".d-panel")).not.toBeNull();
    const field = q<HTMLInputElement>(".d-row .d-title-input");
    expect(field).not.toBeNull();
    expect(field!.value).toBe("Plan: post-reading Wednesday");
    // The row's own cells stay: priority mark and context chip.
    expect(q(".d-row .d-pri")).not.toBeNull();
    expect(q(".d-row .d-tag-ctx")).not.toBeNull();
    // The editor renders no second title (its title field is a direct child
    // of the editor root; the checklist's "add subitem" field is not it).
    expect(q(".ed-panel-body > input.input-bare")).toBeNull();
    expect(host!.querySelectorAll(".d-title-input").length).toBe(1);
  });

  it("lays the facts out as a four-row ledger", async () => {
    await mountRow(todo());
    await open();
    const labels = Array.from(
      host!.querySelectorAll(".ed-ledger-row > .ed-ledger-label"),
    ).map((el) => el.textContent?.trim());
    expect(labels).toEqual(["when", "priority", "context", "filed"]);
  });

  it("saves a retitled task on blur and ignores an empty one", async () => {
    const { updateTodo } = await mountRow(todo());
    await open();
    const field = q<HTMLInputElement>(".d-title-input")!;
    field.value = "  Plan: Thursday  ";
    field.dispatchEvent(new Event("input"));
    field.dispatchEvent(new Event("blur"));
    await nextTick();
    expect(updateTodo).toHaveBeenCalledWith("t1", { title: "Plan: Thursday" });
    updateTodo.mockClear();
    field.value = "   ";
    field.dispatchEvent(new Event("input"));
    field.dispatchEvent(new Event("blur"));
    await nextTick();
    expect(updateTodo).not.toHaveBeenCalled();
    expect(field.value).toBe("Plan: post-reading Wednesday");
  });

  it("closes from the title bar, and on Escape", async () => {
    await mountRow(todo());
    await open();
    expect(q(".d-row .d-row-close")).not.toBeNull();
    q<HTMLElement>(".d-row .d-row-close")!.click();
    await nextTick();
    expect(q(".d-panel")).toBeNull();
    await open();
    q<HTMLInputElement>(".d-title-input")!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await nextTick();
    expect(q(".d-panel")).toBeNull();
  });
});

describe("the editor outside a row", () => {
  it("still carries its own title field and no bottom close", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/components/TodoEditor.vue", "utf8");
    expect(src).toContain('v-if="!inline"');
    const template = src.slice(src.indexOf("<template>"));
    expect(template).not.toMatch(/emit\('close'\)/);
  });
});
