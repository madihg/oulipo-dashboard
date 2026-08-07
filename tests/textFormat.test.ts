import { describe, it, expect } from "vitest";
import {
  applyFormat,
  toggleInline,
  toggleBlock,
  applyLink,
  hasInlineMark,
} from "../src/utils/textFormat";

/**
 * The selection toolbar's behaviour. Notes are plain markdown text, so every
 * button is a toggle over {text, start, end} - applying twice must return the
 * original, and the selection must survive so the bar stays anchored.
 */

const sel = (text: string, start: number, end: number) => ({
  text,
  start,
  end,
});
/** Render a selection as text with the selected span in «guillemets». */
const show = (s: { text: string; start: number; end: number }) =>
  s.text.slice(0, s.start) +
  "«" +
  s.text.slice(s.start, s.end) +
  "»" +
  s.text.slice(s.end);

describe("inline marks", () => {
  it("wraps the selection and keeps it selected", () => {
    const out = toggleInline(sel("hello world", 6, 11), "bold");
    expect(out.text).toBe("hello **world**");
    expect(show(out)).toBe("hello **«world»**");
  });

  it("is a toggle - applying twice returns the original", () => {
    const once = toggleInline(sel("hello world", 6, 11), "bold");
    const twice = toggleInline(once, "bold");
    expect(twice.text).toBe("hello world");
    expect(show(twice)).toBe("hello «world»");
  });

  it("removes markers that sit OUTSIDE the selection", () => {
    // user selects just the word inside existing bold markers
    const out = toggleInline(sel("a **word** b", 4, 8), "bold");
    expect(out.text).toBe("a word b");
    expect(show(out)).toBe("a «word» b");
  });

  it("does not mistake bold for italic", () => {
    expect(hasInlineMark(sel("**word**", 0, 8), "italic")).toBe(false);
    expect(hasInlineMark(sel("**word**", 0, 8), "bold")).toBe(true);
  });

  it("with no selection, drops markers and parks the caret between them", () => {
    const out = toggleInline(sel("ab", 1, 1), "code");
    expect(out.text).toBe("a``b");
    expect(out.start).toBe(2);
    expect(out.end).toBe(2);
  });

  it("supports italic, code and strike", () => {
    expect(toggleInline(sel("x", 0, 1), "italic").text).toBe("*x*");
    expect(toggleInline(sel("x", 0, 1), "code").text).toBe("`x`");
    expect(toggleInline(sel("x", 0, 1), "strike").text).toBe("~~x~~");
  });
});

describe("block marks", () => {
  it("prefixes every line the selection touches", () => {
    const out = toggleBlock(sel("one\ntwo\nthree", 0, 7), "bullet");
    expect(out.text).toBe("- one\n- two\nthree");
  });

  it("is a toggle across all touched lines", () => {
    const once = toggleBlock(sel("one\ntwo", 0, 7), "bullet");
    const twice = toggleBlock(once, "bullet");
    expect(twice.text).toBe("one\ntwo");
  });

  it("prefixes the whole line even when the selection starts mid-line", () => {
    const out = toggleBlock(sel("hello there", 6, 11), "quote");
    expect(out.text).toBe("> hello there");
  });

  it("headings use ##", () => {
    expect(toggleBlock(sel("title", 0, 5), "h2").text).toBe("## title");
  });

  it("keeps the selection inside the changed lines", () => {
    const out = toggleBlock(sel("one\ntwo", 0, 7), "bullet");
    expect(out.start).toBeGreaterThanOrEqual(0);
    expect(out.end).toBeLessThanOrEqual(out.text.length);
  });
});

describe("links", () => {
  it("wraps the selection as a markdown link and selects the url slot", () => {
    const out = applyLink(sel("see docs", 4, 8));
    expect(out.text).toBe("see [docs]()");
    // caret sits inside the parens, ready for a paste
    expect(out.text.slice(out.start, out.start)).toBe("");
    expect(out.text[out.start - 1]).toBe("(");
  });

  it("uses a placeholder label when nothing is selected", () => {
    expect(applyLink(sel("", 0, 0)).text).toBe("[link]()");
  });
});

describe("applyFormat dispatch", () => {
  it("routes each kind to the right transform", () => {
    expect(applyFormat(sel("x", 0, 1), "bold").text).toBe("**x**");
    expect(applyFormat(sel("x", 0, 1), "bullet").text).toBe("- x");
    expect(applyFormat(sel("x", 0, 1), "link").text).toBe("[x]()");
  });

  it("never loses the surrounding text", () => {
    const base = "before SELECTED after";
    const s = base.indexOf("SELECTED");
    for (const kind of ["bold", "italic", "code", "strike", "h2"] as const) {
      const out = applyFormat(sel(base, s, s + 8), kind);
      expect(out.text).toContain("before");
      expect(out.text).toContain("after");
      expect(out.text).toContain("SELECTED");
    }
  });
});

/**
 * Regression guards for defects the adversarial review confirmed. Each one was
 * reproduced against the code before the fix landed.
 */
describe("toggle correctness (reviewed regressions)", () => {
  it("does not treat two separate marked runs as one", () => {
    // "**a** and **b**" starts and ends with "**", but stripping the outer
    // pair strands the inner markers as literal text.
    const s = sel("**a** and **b**", 0, 15);
    expect(hasInlineMark(s, "bold")).toBe(false);
    expect(toggleInline(s, "bold").text).toBe("****a** and **b****");
  });

  it("still recognises one genuine run", () => {
    expect(hasInlineMark(sel("**bold**", 0, 8), "bold")).toBe(true);
    expect(toggleInline(sel("**bold**", 0, 8), "bold").text).toBe("bold");
  });

  it("does not strip an enclosing pair when the selection has a loose marker", () => {
    // "*a* and *b*" with "a* and *b" selected: the outer asterisks are not a
    // wrap around this selection.
    expect(hasInlineMark(sel("*a* and *b*", 1, 10), "italic")).toBe(false);
  });

  it("a blank line does not flip a bullet removal into a double prefix", () => {
    const start = "- one\n\n- two";
    const off = toggleBlock(sel(start, 0, start.length), "bullet");
    expect(off.text).toBe("one\n\ntwo");
    // And the blank line never picks up a marker on the way back.
    const on = toggleBlock(off, "bullet");
    expect(on.text).toBe("- one\n\n- two");
  });

  it("never double-prefixes a line that is already marked", () => {
    // Mixed selection: one line bulleted, one not. Adding must only touch the
    // bare line.
    const out = toggleBlock(sel("- one\ntwo", 0, 9), "bullet");
    expect(out.text).toBe("- one\n- two");
  });

  it("a selection ending at a line start leaves that line alone", () => {
    // "one\ntwo": select "one\n" (end lands on 't'). Line two is untouched.
    const out = toggleBlock(sel("one\ntwo", 0, 4), "bullet");
    expect(out.text).toBe("- one\ntwo");
  });

  it("round-trips a mixed block back to itself", () => {
    const start = "- one\ntwo\n\n- three";
    const on = toggleBlock(sel(start, 0, start.length), "bullet");
    expect(on.text).toBe("- one\n- two\n\n- three");
    const off = toggleBlock(
      { text: on.text, start: 0, end: on.text.length },
      "bullet",
    );
    expect(off.text).toBe("one\ntwo\n\nthree");
  });
});
