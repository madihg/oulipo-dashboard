import { describe, it, expect, vi, beforeEach } from "vitest";
import { createApp, h, nextTick, reactive } from "vue";
import { createPinia } from "pinia";
import { clearAll, pending } from "../src/lib/pendingWrites";

/**
 * Regression tests for "editing todo notes on mobile isn't saving".
 *
 * The notes field used to persist ONLY on a textarea blur. These pin the
 * behaviours that replaced it, including the id-swap corruption that the first
 * version of the fix introduced (flushing the outgoing todo's text against the
 * INCOMING todo's id, which overwrote a different task's notes).
 */

const writes: Array<{ id: string; patch: Record<string, unknown> }> = [];
let writeOk = true;

vi.mock("../src/stores/vault", async () => {
  const { defineStore } = await import("pinia");
  const { ref } = await import("vue");
  const useVaultStore = defineStore("vault", () => {
    const areas = ref<unknown[]>([]);
    const projects = ref<unknown[]>([]);
    async function updateTodo(id: string, patch: Record<string, unknown>) {
      const { stage, settle } = await import("../src/lib/pendingWrites");
      stage(id, patch);
      writes.push({ id, patch });
      if (writeOk) settle(id, patch);
      return writeOk;
    }
    return { areas, projects, updateTodo };
  });
  return { useVaultStore };
});
// Children that would hit the network on mount.
vi.mock("../src/components/ChecklistEditor.vue", () => ({
  default: { render: () => null },
}));
vi.mock("../src/components/RepeatPicker.vue", () => ({
  default: { render: () => null },
}));
vi.mock("../src/components/WhenPicker.vue", () => ({
  default: { render: () => null },
}));

function todo(over: Record<string, unknown> = {}) {
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
    ...over,
  });
}

async function mountEditor(row: ReturnType<typeof todo>) {
  const TodoEditor = (await import("../src/components/TodoEditor.vue")).default;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const holder = reactive({ current: row });
  const app = createApp({
    setup: () => () => h(TodoEditor as never, { todo: holder.current }),
  });
  app.use(createPinia());
  app.mount(host);
  await nextTick();
  return { app, host, holder };
}

/** Let the serialized write chain (promises, not just render ticks) settle. */
async function settled() {
  await nextTick();
  await new Promise((r) => setTimeout(r, 0));
  await nextTick();
}

beforeEach(() => {
  writes.length = 0;
  writeOk = true;
  clearAll();
});

describe("notes persistence", () => {
  it("writes on unmount, so collapsing a row never drops typed text", async () => {
    const row = todo({ notes: "" });
    const { app, host } = await mountEditor(row);

    const ta = host.querySelector("textarea") as HTMLTextAreaElement;
    ta.value = "typed but never blurred";
    ta.dispatchEvent(new Event("input"));
    await nextTick();

    app.unmount();
    await settled();

    expect(writes).toContainEqual({
      id: "A",
      patch: { notes: "typed but never blurred" },
    });
  });

  it("CRITICAL: swapping to another todo writes the text to the OUTGOING id", async () => {
    const a = todo({ id: "A", notes: "" });
    const { host, holder } = await mountEditor(a);

    const ta = host.querySelector("textarea") as HTMLTextAreaElement;
    ta.value = "notes that belong to A";
    ta.dispatchEvent(new Event("input"));
    await nextTick();

    // The modal reuses one TodoEditor instance: open a different todo in it.
    holder.current = todo({ id: "B", notes: "B's own notes" });
    await settled();

    // A's text must go to A. It must NEVER be written onto B.
    const toB = writes.filter((w) => w.id === "B");
    expect(toB).toEqual([]);
    expect(writes).toContainEqual({
      id: "A",
      patch: { notes: "notes that belong to A" },
    });
  });

  it("a failed write stays queued in the write-ahead log for replay", async () => {
    writeOk = false;
    const row = todo({ notes: "" });
    const { app, host } = await mountEditor(row);

    const ta = host.querySelector("textarea") as HTMLTextAreaElement;
    ta.value = "offline text";
    ta.dispatchEvent(new Event("input"));
    await nextTick();
    app.unmount();
    await settled();

    expect(pending()).toEqual([{ id: "A", patch: { notes: "offline text" } }]);
  });

  it("does not write when nothing changed", async () => {
    const row = todo({ notes: "already here" });
    const { app } = await mountEditor(row);
    app.unmount();
    await settled();
    expect(writes).toEqual([]);
  });
});

describe("a stale realtime echo", () => {
  it("cannot overwrite text typed since the last save", async () => {
    // The phone case: type, the debounced save goes out, type more, dismiss the
    // keyboard (blur -> notesEditing false, flush in flight), and the realtime
    // echo of the FIRST save lands in that gap. The store Object.assigns the
    // echoed row into props.todo, so props.todo.notes briefly holds the older
    // text. The editor must not copy it in.
    writes.length = 0;
    const row = todo({ notes: "" });
    const { host } = await mountEditor(row);

    let ta = host.querySelector("textarea")!;
    ta.focus();
    ta.value = "first";
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    ta.blur();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    expect(writes.at(-1)?.patch.notes).toBe("first");

    // Back into the field via the read view, add more, dismiss again.
    host.querySelector<HTMLElement>(".ed-notes-preview")?.click();
    await nextTick();
    ta = host.querySelector("textarea")!;
    ta.focus();
    ta.value = "first and more";
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    ta.blur();
    await nextTick();

    // The echo of the first save arrives now, older than what was typed.
    row.notes = "first";
    await nextTick();

    const shown =
      host.querySelector("textarea")?.value ??
      host.querySelector(".ed-notes-preview")?.textContent ??
      "";
    expect(shown).toContain("first and more");
    await new Promise((r) => setTimeout(r, 0));
    expect(writes.at(-1)?.patch.notes).toBe("first and more");
  });

  it("still adopts a genuine outside edit when the editor is idle and clean", async () => {
    writes.length = 0;
    const row = todo({ notes: "as loaded" });
    const { host } = await mountEditor(row);
    // Nothing typed, nothing pending: another session's edit should show.
    row.notes = "as loaded, then enriched elsewhere";
    await nextTick();
    const shown = host.querySelector(".ed-notes-preview")?.textContent ?? "";
    expect(shown).toContain("enriched elsewhere");
    expect(writes).toHaveLength(0);
  });
});
