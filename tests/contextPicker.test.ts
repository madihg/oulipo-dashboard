import { describe, it, expect, afterEach } from "vitest";
import { createApp, h, nextTick, ref, type App } from "vue";
import ContextPicker from "../src/components/ContextPicker.vue";

/**
 * The picker edits only the context members of a task's tag list and emits the
 * FULL next list, because the store replaces the whole set. Freeform tags the
 * routine stamps must ride through untouched.
 */
let app: App | null = null;
async function mount(initial: string[]) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const tags = ref(initial);
  const emitted: string[][] = [];
  app = createApp({
    setup: () => () =>
      h(ContextPicker, {
        tags: tags.value,
        onChange: (next: string[]) => {
          emitted.push(next);
          tags.value = next;
        },
      }),
  });
  app.mount(host);
  await nextTick();
  const btn = (name: string) =>
    Array.from(document.querySelectorAll<HTMLButtonElement>(".cp-btn")).find(
      (b) => b.textContent?.trim() === name,
    )!;
  return { emitted, btn };
}
afterEach(() => {
  app?.unmount();
  app = null;
  document.body.innerHTML = "";
});

describe("ContextPicker", () => {
  it("shows the seven contexts in canonical order", async () => {
    await mount([]);
    const names = Array.from(document.querySelectorAll(".cp-btn")).map((b) =>
      b.textContent?.trim(),
    );
    expect(names).toEqual(["web", "email", "text", "buy", "offline", "notes", "think-plan"]);
  });

  it("adds a context, emitting the full list", async () => {
    const { emitted, btn } = await mount([]);
    btn("email").click();
    expect(emitted.at(-1)).toEqual(["email"]);
  });

  it("removes a context that is already on", async () => {
    const { emitted, btn } = await mount(["email"]);
    expect(btn("email").getAttribute("aria-pressed")).toBe("true");
    btn("email").click();
    expect(emitted.at(-1)).toEqual([]);
  });

  it("allows more than one, in canonical order regardless of tap order", async () => {
    const { emitted, btn } = await mount([]);
    btn("buy").click();
    await nextTick();
    btn("web").click();
    expect(emitted.at(-1)).toEqual(["web", "buy"]);
  });

  it("never touches freeform tags", async () => {
    const { emitted, btn } = await mount(["reservoir", "claude-delivered"]);
    btn("offline").click();
    expect(emitted.at(-1)).toEqual(["offline", "reservoir", "claude-delivered"]);
    await nextTick();
    btn("offline").click();
    expect(emitted.at(-1)).toEqual(["reservoir", "claude-delivered"]);
  });

  it("marks the on state for assistive tech, not colour alone", async () => {
    const { btn } = await mount(["notes"]);
    expect(btn("notes").getAttribute("aria-pressed")).toBe("true");
    expect(btn("web").getAttribute("aria-pressed")).toBe("false");
  });
});
