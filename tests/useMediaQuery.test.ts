import { describe, it, expect, afterEach, vi } from "vitest";
import { createApp, h, nextTick, type App } from "vue";
import { useIsPhone, useMediaQuery } from "../src/composables/useMediaQuery";

/**
 * The picker swaps surfaces at the phone breakpoint - an anchored popover above
 * it, a bottom sheet below. A one-shot `.matches` read at setup is the tempting
 * version and it is wrong: rotating a phone leaves the wrong surface mounted.
 */

let app: App | null = null;
type Listener = (e: MediaQueryListEvent) => void;

function fakeMatchMedia(initial: boolean) {
  const listeners = new Set<Listener>();
  let matches = initial;
  const removed: Listener[] = [];
  const mql = {
    get matches() {
      return matches;
    },
    media: "",
    addEventListener: (_: string, fn: Listener) => listeners.add(fn),
    removeEventListener: (_: string, fn: Listener) => {
      removed.push(fn);
      listeners.delete(fn);
    },
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => mql),
  );
  return {
    emit(next: boolean) {
      matches = next;
      for (const fn of listeners) fn({ matches: next } as MediaQueryListEvent);
    },
    listenerCount: () => listeners.size,
    removedCount: () => removed.length,
  };
}

function mountWith(fn: () => { value: boolean }) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  let out!: { value: boolean };
  app = createApp({
    setup() {
      out = fn();
      return () => h("div", String(out.value));
    },
  });
  app.mount(host);
  return {
    host,
    get value() {
      return out.value;
    },
  };
}

afterEach(() => {
  app?.unmount();
  app = null;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("useMediaQuery", () => {
  it("reads the initial match", () => {
    fakeMatchMedia(true);
    const m = mountWith(() => useMediaQuery("(max-width: 767px)"));
    expect(m.value).toBe(true);
  });

  it("UPDATES when the query starts matching", async () => {
    const mm = fakeMatchMedia(false);
    const m = mountWith(() => useMediaQuery("(max-width: 767px)"));
    expect(m.value).toBe(false);
    mm.emit(true);
    await nextTick();
    // A one-shot .matches read would still say false here, and the component
    // would keep rendering the desktop surface on a rotated phone.
    expect(m.value).toBe(true);
  });

  it("updates back the other way", async () => {
    const mm = fakeMatchMedia(true);
    const m = mountWith(() => useIsPhone());
    mm.emit(false);
    await nextTick();
    expect(m.value).toBe(false);
  });

  it("unsubscribes on unmount", () => {
    const mm = fakeMatchMedia(false);
    mountWith(() => useMediaQuery("(max-width: 767px)"));
    expect(mm.listenerCount()).toBe(1);
    app?.unmount();
    app = null;
    expect(mm.listenerCount()).toBe(0);
    expect(mm.removedCount()).toBe(1);
  });

  it("asks for the app-shell phone line, not a coarse pointer", () => {
    fakeMatchMedia(false);
    mountWith(() => useIsPhone());
    // pointer:coarse can never be seen in a dev browser, so it must not decide
    // which surface mounts.
    const q = vi.mocked(matchMedia).mock.calls[0]![0] as string;
    expect(q).toContain("max-width: 767px");
    expect(q).not.toContain("coarse");
  });

  it("treats a SHORT viewport as a phone too", () => {
    fakeMatchMedia(false);
    mountWith(() => useIsPhone());
    // A landscape iPhone is ~850px wide and ~390px tall: wide enough to pass a
    // width-only test, far too short for an anchored popover with a calendar.
    const q = vi.mocked(matchMedia).mock.calls[0]![0] as string;
    expect(q).toContain("max-height");
  });
});
