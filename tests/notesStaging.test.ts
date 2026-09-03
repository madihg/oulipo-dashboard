import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createApp, h, nextTick, reactive, type App } from "vue";
import { createPinia } from "pinia";
import { clearAll, pending } from "../src/lib/pendingWrites";

/**
 * Text typed AFTER a save that is still in flight must reach the write-ahead
 * log immediately, not once that earlier save resolves.
 *
 * flushNotes serialises sends through one chain. The stage() that protects a
 * value used to live inside vault.updateTodo, i.e. inside the chained callback
 * - so on a slow link, save A goes out, you keep typing, swipe home, pagehide
 * fires, flushNotes joins the chain... and cannot run until A resolves. iOS
 * freezes the page, later evicts the PWA, and everything typed after A was
 * never staged. The fix stages synchronously at the top of flushNotes.
 *
 * The vault mock here deliberately NEVER resolves and NEVER stages, so the
 * only way a value can appear in pending() is the editor staging it itself.
 */

const sent: Array<{ id: string; notes: unknown }> = [];
// Unmounted between tests: an editor left mounted keeps its pagehide listener
// and would flush ITS text into the next test's log.
let app: App | null = null;

vi.mock("../src/stores/vault", async () => {
  const { defineStore } = await import("pinia");
  const { ref } = await import("vue");
  const useVaultStore = defineStore("vault", () => {
    const areas = ref<unknown[]>([]);
    const projects = ref<unknown[]>([]);
    function updateTodo(id: string, patch: Record<string, unknown>) {
      sent.push({ id, notes: patch.notes });
      // A request that hangs forever: the slow-link case.
      return new Promise<boolean>(() => {});
    }
    return { areas, projects, updateTodo };
  });
  return { useVaultStore };
});
vi.mock("../src/components/ChecklistEditor.vue", () => ({
  default: { render: () => null },
}));
vi.mock("../src/components/RepeatPicker.vue", () => ({
  default: { render: () => null },
}));
vi.mock("../src/components/WhenPicker.vue", () => ({
  default: { render: () => null },
}));

function todo() {
  return reactive({
    id: "A",
    user_id: "u",
    title: "task",
    notes: "",
    state: "inbox",
    priority: null,
    position: 0,
    area_id: null,
    project_id: null,
    start_date: null,
    deadline: null,
    evening: false,
    completed_at: null,
    metadata: null,
    created_at: "2026-01-01T00:00:00Z",
  });
}

async function mountEditor() {
  const TodoEditor = (await import("../src/components/TodoEditor.vue")).default;
  const host = document.createElement("div");
  document.body.appendChild(host);
  app = createApp({
    setup: () => () => h(TodoEditor as never, { todo: todo() }),
  });
  app.use(createPinia());
  app.mount(host);
  await nextTick();
  return { host };
}

function type(text: string) {
  const ta = document.querySelector<HTMLTextAreaElement>(".ed-notes-input")!;
  ta.value = text;
  ta.dispatchEvent(new Event("input", { bubbles: true }));
}
function hidePage() {
  window.dispatchEvent(new Event("pagehide"));
}
const staged = (id: string) => pending().find((p) => p.id === id)?.patch.notes;

beforeEach(() => {
  sent.length = 0;
  clearAll();
  document.body.innerHTML = "";
});
afterEach(() => {
  app?.unmount();
  app = null;
});

describe("notes reach the write-ahead log while a save is in flight", () => {
  it("stages the newest text even though the earlier request never resolves", async () => {
    await mountEditor();
    type("one");
    hidePage(); // save A goes out and hangs
    await nextTick();
    expect(sent.map((s) => s.notes)).toEqual(["one"]);

    type("one two");
    hidePage(); // pagehide while A is still in flight
    // No await past a microtask: this is the moment iOS freezes the page.
    await nextTick();

    // The second send is correctly queued behind A...
    expect(sent.map((s) => s.notes)).toEqual(["one"]);
    // ...but its text is already in the log, which is what survives eviction.
    expect(staged("A")).toBe("one two");
  });

  it("stages on the debounce path too, not only on pagehide", async () => {
    await mountEditor();
    type("one");
    hidePage();
    await nextTick();
    type("one two three");
    // The 800ms autosave, not a page hide.
    await new Promise((r) => setTimeout(r, 850));
    expect(staged("A")).toBe("one two three");
  });

  it("does not stage a value that is already the saved baseline", async () => {
    await mountEditor();
    hidePage(); // nothing typed: notes === lastSavedNotes === ""
    await nextTick();
    expect(pending()).toEqual([]);
    expect(sent).toEqual([]);
  });
});
