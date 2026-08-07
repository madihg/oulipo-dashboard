/**
 * Caret plumbing shared by the notes editor.
 *
 * Two jobs:
 *  1. caretIndexFromPoint - given a click on the rendered READ view, work out
 *     which character of the underlying plain text it landed on, so switching
 *     into the textarea can put the caret exactly there instead of dumping it
 *     at the end.
 *  2. caretRect - where a textarea's caret is on screen, for anchoring the
 *     selection toolbar. Textareas expose no selection geometry, so this
 *     measures a mirror div with the same type metrics.
 */

/**
 * Character offset within `root`'s text content at viewport point (x, y).
 * `<br>` counts as one character ("\n"), matching how the read view renders
 * newlines, so the index maps 1:1 onto the raw notes string.
 */
export function caretIndexFromPoint(
  root: HTMLElement,
  x: number,
  y: number,
): number | null {
  const pos = caretNodeAtPoint(x, y);
  if (!pos || !root.contains(pos.node)) return null;

  let index = 0;
  let found = false;
  const walk = (node: Node): boolean => {
    if (node === pos.node) {
      if (node.nodeType === Node.TEXT_NODE) {
        index += pos.offset;
      } else {
        // The hit test resolved to an ELEMENT, which happens whenever the
        // click lands on padding, in the gap between two inline boxes, or past
        // the end of a line. Here `offset` is a child INDEX, not a character
        // offset, so the answer is the text length of the children before it.
        // Bailing out instead (the old behaviour) dumped the caret at the end
        // of the note for exactly the clicks people make most: past the last
        // word on a line.
        const kids = Array.from(node.childNodes).slice(0, pos.offset);
        for (const kid of kids) index += textLength(kid);
      }
      found = true;
      return true;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      index += (node.textContent ?? "").length;
      return false;
    }
    if (node.nodeName === "BR") {
      // If the click resolved to the parent element with an offset, an offset
      // past this <br> means the caret is after the newline.
      index += 1;
      return false;
    }
    for (const child of Array.from(node.childNodes)) {
      if (walk(child)) return true;
    }
    return false;
  };
  walk(root);
  return found ? index : null;
}

/** Characters a subtree contributes to the plain text, `<br>` counting as 1. */
function textLength(node: Node): number {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? "").length;
  if (node.nodeName === "BR") return 1;
  let n = 0;
  for (const child of Array.from(node.childNodes)) n += textLength(child);
  return n;
}

function caretNodeAtPoint(
  x: number,
  y: number,
): { node: Node; offset: number } | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (
      x: number,
      y: number,
    ) => { offsetNode: Node; offset: number } | null;
  };
  // Firefox
  if (typeof doc.caretPositionFromPoint === "function") {
    const p = doc.caretPositionFromPoint(x, y);
    return p ? { node: p.offsetNode, offset: p.offset } : null;
  }
  // WebKit / Blink
  if (typeof document.caretRangeFromPoint === "function") {
    const r = document.caretRangeFromPoint(x, y);
    return r ? { node: r.startContainer, offset: r.startOffset } : null;
  }
  return null;
}

/** Style properties a mirror div must copy for its metrics to match. */
const MIRROR_PROPS = [
  "boxSizing",
  "width",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "fontVariationSettings",
  "letterSpacing",
  "lineHeight",
  "textTransform",
  "textIndent",
  "whiteSpace",
  "wordBreak",
  "overflowWrap",
  "tabSize",
] as const;

/**
 * Viewport rect of the caret at `index` inside a textarea. Measured with an
 * off-screen mirror because textareas expose no selection geometry.
 */
export function caretRect(
  el: HTMLTextAreaElement,
  index: number,
): { top: number; left: number; height: number } | null {
  if (typeof document === "undefined") return null;
  const cs = window.getComputedStyle(el);
  const mirror = document.createElement("div");
  for (const p of MIRROR_PROPS) {
    mirror.style[p] = cs[p];
  }
  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.top = "0";
  mirror.style.left = "-9999px";
  mirror.style.height = "auto";
  mirror.style.overflow = "hidden";
  // A textarea always wraps; make sure the mirror does too.
  if (cs.whiteSpace === "normal") mirror.style.whiteSpace = "pre-wrap";

  const before = document.createTextNode(el.value.slice(0, index));
  const marker = document.createElement("span");
  // A zero-width space gives the span a real box to measure.
  marker.textContent = "​";
  mirror.appendChild(before);
  mirror.appendChild(marker);
  document.body.appendChild(mirror);

  const mRect = marker.getBoundingClientRect();
  const mirrorRect = mirror.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  document.body.removeChild(mirror);

  return {
    // Mirror coords are relative to the mirror's own origin; re-base onto the
    // textarea and subtract its scroll.
    top: elRect.top + (mRect.top - mirrorRect.top) - el.scrollTop,
    left: elRect.left + (mRect.left - mirrorRect.left) - el.scrollLeft,
    height: mRect.height || parseFloat(cs.lineHeight) || 16,
  };
}
