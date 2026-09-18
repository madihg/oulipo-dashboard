import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { createApp, h, nextTick, type App } from "vue";
import { createPinia, setActivePinia } from "pinia";
import type { TodoRow } from "../src/types/database";

/**
 * A task opened from search lands in a sheet, not in a row. The sheet could
 * edit every field and do neither of the two things a row's bar can: complete
 * the task, or delete it. It carries the row's own box beside the title now,
 * and delete beside close.
 */

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
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe() {} } },
      }),
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

const todo = (): TodoRow =>
  ({
    id: "t1",
    user_id: "u",
    area_id: null,
    project_id: null,
    heading_id: null,
    title: "Get Stan covered under Curative",
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
    created_at: "2026-09-01T00:00:00Z",
    tags: [],
  }) as unknown as TodoRow;

async function openSheet() {
  const { default: TodoEditorModal } =
    await import("../src/components/TodoEditorModal.vue");
  const { useVaultStore } = await import("../src/stores/vault");
  const { useTodoModalStore } = await import("../src/stores/todoModal");
  const pinia = createPinia();
  setActivePinia(pinia);
  const vault = useVaultStore();
  const modal = useTodoModalStore();
  const toggleComplete = vi
    .spyOn(vault, "toggleComplete")
    .mockResolvedValue(undefined);
  const deleteTodoWithUndo = vi
    .spyOn(vault, "deleteTodoWithUndo")
    .mockResolvedValue(undefined as never);
  host = document.createElement("div");
  document.body.appendChild(host);
  app = createApp({ render: () => h(TodoEditorModal) });
  app.use(pinia).mount(host);
  modal.open(todo());
  await nextTick();
  await nextTick();
  return { modal, toggleComplete, deleteTodoWithUndo };
}
const flush = async () => {
  for (let i = 0; i < 4; i++) await nextTick();
  await new Promise((r) => setTimeout(r, 0));
};

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
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("the task sheet", () => {
  it("carries the row's complete box beside the title", async () => {
    await openSheet();
    const bar = document.body.querySelector(".ed-titlebar");
    expect(bar).not.toBeNull();
    const box = bar!.querySelector<HTMLInputElement>("input.d-checkbox");
    expect(box).not.toBeNull();
    expect(box!.type).toBe("checkbox");
    expect(box!.getAttribute("aria-label")).toBe("mark done");
    expect(bar!.querySelector("input.input-bare")).not.toBeNull();
  });

  it("completes the task, then closes", async () => {
    const { modal, toggleComplete } = await openSheet();
    const box = document.body.querySelector<HTMLInputElement>(
      ".ed-titlebar input.d-checkbox",
    )!;
    box.checked = true;
    box.dispatchEvent(new Event("change"));
    await flush();
    expect(toggleComplete).toHaveBeenCalledTimes(1);
    expect(toggleComplete.mock.calls[0]![0].id).toBe("t1");
    // The undo toast is a lazy import, so the close lands a beat later.
    await vi.waitFor(() => expect(modal.todo).toBeNull());
  });

  it("deletes with undo from the bar, and says close, not done", async () => {
    const { modal, deleteTodoWithUndo } = await openSheet();
    const chips = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>(
        '[role="dialog"] .chip',
      ),
    );
    const labels = chips.map((c) => c.textContent?.trim());
    expect(labels).toContain("close");
    expect(labels).not.toContain("done");
    chips.find((c) => c.textContent?.trim() === "delete")!.click();
    await flush();
    expect(deleteTodoWithUndo).toHaveBeenCalledTimes(1);
    expect(modal.todo).toBeNull();
  });

  it("shares one checkbox recipe with the row", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync("src/styles/main.css", "utf8");
    const row = readFileSync("src/components/dense/DenseRow.vue", "utf8");
    expect(css).toMatch(/\n\.d-checkbox \{/);
    expect(row.slice(row.indexOf("<style"))).not.toMatch(/\n\.d-checkbox \{/);
  });
});
