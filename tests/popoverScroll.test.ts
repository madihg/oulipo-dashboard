import { describe, it, expect, afterEach, vi } from "vitest";
import { createApp, h, nextTick, ref, type App } from "vue";
import Popover from "../src/components/Popover.vue";

/**
 * The popover re-places itself on window scroll so it follows its anchor when
 * the page moves underneath. That listener is CAPTURE phase on window, so it
 * also receives scroll events from the popover's own content - and re-placing
 * uncaps max-height, which makes the browser clamp the inner scrollTop to 0.
 *
 * Net effect before the guard: a scrolling child (the when picker's calendar)
 * could not be scrolled at all. jsdom has no layout, so the proof here is that
 * place() does not RUN, measured by whether it re-measures the anchor.
 */

let app: App | null = null;

async function mountPopover() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const open = ref(false);
  app = createApp({
    setup: () => () =>
      h("div", { class: "anchor" }, [
        h(Popover, { open: open.value }, () => [
          h("div", { class: "inner", id: "inner" }, "content"),
        ]),
      ]),
  });
  app.mount(host);
  // Open AFTER mount, as every call site does: placement hangs off the
  // open watcher, which a popover mounted already-open would never fire.
  open.value = true;
  await nextTick();
  // The placement is deferred by a timer.
  await new Promise((r) => setTimeout(r, 5));
  return {
    pop: document.querySelector<HTMLElement>(".d-pop")!,
    inner: document.querySelector<HTMLElement>("#inner")!,
  };
}

/** place() measures its anchor; counting that is how we detect it running. */
function watchPlace() {
  const spy = vi.spyOn(Element.prototype, "getBoundingClientRect");
  const at = spy.mock.calls.length;
  return {
    calledSince: () => spy.mock.calls.length - at,
    restore: () => spy.mockRestore(),
  };
}

afterEach(() => {
  app?.unmount();
  app = null;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("Popover scroll handling", () => {
  it("ignores scrolls coming from its OWN content", async () => {
    const { inner } = await mountPopover();
    const w = watchPlace();
    inner.dispatchEvent(new Event("scroll", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 5));
    expect(w.calledSince()).toBe(0);
    w.restore();
  });

  it("still re-places for scrolls of the page behind it", async () => {
    await mountPopover();
    const outside = document.createElement("div");
    document.body.appendChild(outside);
    const w = watchPlace();
    outside.dispatchEvent(new Event("scroll", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 5));
    expect(w.calledSince()).toBeGreaterThan(0);
    w.restore();
  });

  it("still re-places on a window resize", async () => {
    await mountPopover();
    const w = watchPlace();
    window.dispatchEvent(new Event("resize"));
    await new Promise((r) => setTimeout(r, 5));
    expect(w.calledSince()).toBeGreaterThan(0);
    w.restore();
  });

  it("carries the inner scroll position across a re-place", async () => {
    const { pop } = await mountPopover();
    // Uncapping max-height to measure lets the content fit, which clamps
    // scrollTop to 0; re-capping does not put it back.
    Object.defineProperty(pop, "scrollTop", {
      configurable: true,
      get() {
        return this._t ?? 0;
      },
      set(v: number) {
        this._t = v;
      },
    });
    pop.scrollTop = 420;
    window.dispatchEvent(new Event("resize"));
    await new Promise((r) => setTimeout(r, 5));
    expect(pop.scrollTop).toBe(420);
  });

  it("places without requestAnimationFrame, which is dead while hidden", async () => {
    // rAF is suspended whenever the document is hidden (a background tab, an
    // embedded preview), and the popover would stay permanently invisible.
    const raf = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation(() => 0 as unknown as number);
    const { pop } = await mountPopover();
    expect(pop.style.visibility).not.toBe("hidden");
    raf.mockRestore();
  });
});

describe("Popover dismissal", () => {
  it("places itself when it is MOUNTED already open", async () => {
    // The when picker swaps surfaces at the phone breakpoint, so rotating a
    // phone with the picker open creates a fresh Popover with open already
    // true. A non-immediate watcher never fires for that, and the popover
    // would sit at visibility:hidden forever.
    const host = document.createElement("div");
    document.body.appendChild(host);
    app = createApp({
      setup: () => () =>
        h("div", { class: "anchor" }, [
          h(Popover, { open: true }, () => [h("div", "content")]),
        ]),
    });
    app.mount(host);
    await nextTick();
    await new Promise((r) => setTimeout(r, 5));
    const pop = document.querySelector<HTMLElement>(".d-pop")!;
    expect(pop).toBeTruthy();
    expect(pop.style.visibility).toBe("visible");
  });

  it("ignores a mousedown on its own anchor, so the trigger can close it", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const open = ref(true);
    let closes = 0;
    app = createApp({
      setup: () => () =>
        h("div", { class: "anchor" }, [
          h("button", { class: "trigger" }, "open"),
          h(Popover, { open: open.value, onClose: () => (closes += 1) }, () => [
            h("div", "content"),
          ]),
        ]),
    });
    app.mount(host);
    await nextTick();
    await new Promise((r) => setTimeout(r, 5));

    // Outside-close runs on mousedown; every trigger toggles on click. Closing
    // here would let the click immediately reopen it, so the trigger could
    // never dismiss its own surface.
    document
      .querySelector<HTMLElement>(".trigger")!
      .dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(closes).toBe(0);

    // A mousedown anywhere else still closes it.
    const outside = document.createElement("div");
    document.body.appendChild(outside);
    outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(closes).toBe(1);
  });
});
