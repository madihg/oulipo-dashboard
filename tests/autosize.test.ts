import { describe, it, expect, afterEach } from "vitest";
import { scrollPins } from "../src/utils/autosize";

/**
 * autosize collapses the textarea for one layout pass to measure it, which
 * makes whatever container holds it clamp its own scrollTop. The fix is to pin
 * every such container and restore it afterwards.
 *
 * The review caught that only `document.scrollingElement` was pinned. The task
 * editor lives inside a scrollable modal panel, so the real scroller was the
 * panel and the jump the file exists to prevent survived untouched there.
 */

/** What autosize falls back to. jsdom implements no `scrollingElement`. */
const docScroller = () => document.scrollingElement ?? document.documentElement;

function nest(overflow: Array<string | null>): HTMLTextAreaElement {
  let parent: HTMLElement = document.body;
  for (const oy of overflow) {
    const d = document.createElement("div");
    if (oy) d.style.overflowY = oy;
    parent.appendChild(d);
    parent = d;
  }
  const ta = document.createElement("textarea");
  parent.appendChild(ta);
  return ta;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("scrollPins", () => {
  it("finds a scrollable ancestor and still includes the document", () => {
    const ta = nest(["auto"]);
    const pins = scrollPins(ta);
    expect(pins[0]).toBe(ta.parentElement);
    expect(pins.at(-1)).toBe(docScroller());
  });

  it("treats overflow-y: scroll the same as auto", () => {
    const ta = nest(["scroll"]);
    expect(scrollPins(ta)[0]).toBe(ta.parentElement);
  });

  it("ignores non-scrolling wrappers between the field and the panel", () => {
    // The shape the editor actually has: modal panel (auto) > body > slot > ta
    const ta = nest(["auto", null, null]);
    const panel = document.body.firstElementChild;
    const pins = scrollPins(ta);
    expect(pins).toContain(panel);
    expect(pins.at(-1)).toBe(docScroller());
  });

  it("collects every scroller, innermost first", () => {
    const ta = nest(["auto", null, "auto"]);
    const outer = document.body.firstElementChild!;
    const inner = ta.parentElement!;
    const pins = scrollPins(ta);
    expect(pins.indexOf(inner)).toBeLessThan(pins.indexOf(outer));
    expect(pins.at(-1)).toBe(docScroller());
  });

  it("falls back to the document alone when nothing else scrolls", () => {
    const ta = nest([null, null]);
    expect(scrollPins(ta)).toEqual([docScroller()]);
  });

  it("never lists the same element twice", () => {
    const ta = nest(["auto", "scroll"]);
    const pins = scrollPins(ta);
    expect(new Set(pins).size).toBe(pins.length);
  });
});
