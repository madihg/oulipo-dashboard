import { describe, it, expect, afterEach } from "vitest";
import { createApp, h, nextTick, ref, type App } from "vue";
import WhenSheet from "../src/components/WhenSheet.vue";

/**
 * The bottom sheet is an aria-modal dialog, so the page behind it must not
 * scroll and focus must come back where it started. Both were measured
 * leaking: ~180-200px of list scrolled behind the open sheet in Chromium and
 * WebKit alike, because the sheet is not itself a scroll container and its
 * overscroll-behavior therefore did nothing.
 */

let app: App | null = null;

function mountSheet(initial = false) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const open = ref(initial);
  app = createApp({
    setup: () => () =>
      h(
        WhenSheet,
        { open: open.value, onClose: () => (open.value = false) },
        () => [
          h("button", { class: "a" }, "a"),
          h("button", { class: "b" }, "b"),
        ],
      ),
  });
  app.mount(host);
  return open;
}

afterEach(() => {
  app?.unmount();
  app = null;
  document.body.style.overflow = "";
  document.body.innerHTML = "";
});

describe("WhenSheet", () => {
  it("locks the page while open and gives it back on close", async () => {
    document.body.style.overflow = "auto";
    const open = mountSheet();
    open.value = true;
    await nextTick();
    expect(document.body.style.overflow).toBe("hidden");
    open.value = false;
    await nextTick();
    expect(document.body.style.overflow).toBe("auto");
  });

  it("gives the page back even if it is torn down rather than closed", async () => {
    document.body.style.overflow = "auto";
    const open = mountSheet();
    open.value = true;
    await nextTick();
    expect(document.body.style.overflow).toBe("hidden");
    app?.unmount();
    app = null;
    expect(document.body.style.overflow).toBe("auto");
  });

  it("locks immediately when mounted already open", async () => {
    mountSheet(true);
    await nextTick();
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("returns focus where it came from", async () => {
    const before = document.createElement("button");
    document.body.appendChild(before);
    before.focus();
    const open = mountSheet();
    open.value = true;
    await nextTick();
    await new Promise((r) => setTimeout(r, 5));
    open.value = false;
    await nextTick();
    expect(document.activeElement).toBe(before);
  });

  it("keeps the scrim and the sheet as SIBLINGS", async () => {
    // touch-action intersects down the ancestor chain: a scrim wrapping the
    // sheet would stop the calendar inside it from scrolling.
    const open = mountSheet();
    open.value = true;
    await nextTick();
    const scrim = document.querySelector(".wp-scrim")!;
    const sheet = document.querySelector(".wp-sheet")!;
    expect(scrim.contains(sheet)).toBe(false);
    expect(sheet.getAttribute("aria-modal")).toBe("true");
  });

  it("closes on Escape and stops it reaching the editor behind", async () => {
    const open = mountSheet();
    open.value = true;
    await nextTick();
    let leaked = false;
    const spy = () => (leaked = true);
    window.addEventListener("keydown", spy);
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    );
    window.removeEventListener("keydown", spy);
    await nextTick();
    expect(open.value).toBe(false);
    expect(leaked).toBe(false);
  });
});
