import { describe, it, expect, afterEach } from "vitest";
import { caretIndexFromPoint } from "../src/utils/caret";

/**
 * Mapping a click on the rendered read view back to a character offset in the
 * raw notes text. The read view substitutes `<br>` for `\n` and wraps URLs in
 * anchors, so the index has to survive both.
 *
 * The interesting case is the one the review caught: browsers resolve a hit
 * test to an ELEMENT (with a child index, not a character offset) whenever the
 * click lands on padding, between two inline boxes, or past the end of a line.
 * That used to return null, which dumped the caret at the end of the note.
 */

type Hit = { node: Node; offset: number };

/** Stand in for the browser's hit test, which jsdom does not implement. */
function stubHit(hit: Hit | null) {
  const fake = () =>
    hit ? { startContainer: hit.node, startOffset: hit.offset } : null;
  (document as unknown as Record<string, unknown>).caretRangeFromPoint = fake;
}

/** Read view for "hello link\nworld" - text, anchor, <br>, text. */
function buildPreview(): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = 'hello <a href="#">link</a><br>world';
  document.body.appendChild(root);
  return root;
}

afterEach(() => {
  document.body.innerHTML = "";
  Reflect.deleteProperty(document, "caretRangeFromPoint");
  Reflect.deleteProperty(document, "caretPositionFromPoint");
});

describe("caretIndexFromPoint", () => {
  it("maps a hit inside a text node to its character offset", () => {
    const root = buildPreview();
    stubHit({ node: root.firstChild!, offset: 3 });
    expect(caretIndexFromPoint(root, 0, 0)).toBe(3);
  });

  it("counts a <br> as one character, matching the raw newline", () => {
    const root = buildPreview();
    // The trailing "world" text node, 2 chars in.
    stubHit({ node: root.lastChild!, offset: 2 });
    // "hello " (6) + "link" (4) + <br> (1) + 2
    expect(caretIndexFromPoint(root, 0, 0)).toBe(13);
  });

  it("resolves an ELEMENT hit by summing the children before the offset", () => {
    const root = buildPreview();
    // Offset 2 = after the "hello " text node and after the anchor.
    stubHit({ node: root, offset: 2 });
    expect(caretIndexFromPoint(root, 0, 0)).toBe(10);
  });

  it("counts a <br> inside an element hit", () => {
    const root = buildPreview();
    // Offset 3 = past the <br> too.
    stubHit({ node: root, offset: 3 });
    expect(caretIndexFromPoint(root, 0, 0)).toBe(11);
  });

  it("an element hit at offset 0 is the start of the note", () => {
    const root = buildPreview();
    stubHit({ node: root, offset: 0 });
    expect(caretIndexFromPoint(root, 0, 0)).toBe(0);
  });

  it("returns null when the hit lands outside the preview", () => {
    const root = buildPreview();
    const other = document.createElement("div");
    other.textContent = "elsewhere";
    document.body.appendChild(other);
    stubHit({ node: other.firstChild!, offset: 1 });
    expect(caretIndexFromPoint(root, 0, 0)).toBeNull();
  });

  it("returns null when the browser cannot resolve a caret at all", () => {
    const root = buildPreview();
    stubHit(null);
    expect(caretIndexFromPoint(root, 0, 0)).toBeNull();
  });
});
