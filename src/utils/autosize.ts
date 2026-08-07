/**
 * Size a textarea to its content without the scroll jump.
 *
 * The common idiom - `height = "auto"` then `height = scrollHeight` - collapses
 * the element for one layout pass. On a long note inside a scrolled page that
 * yanks the viewport up and back on every keystroke, which reads as the text
 * "jumping" while you type. Two guards fix it:
 *   - pin the scrollTop of every container that could move across the
 *     measurement
 *   - only write the height when it actually changed (no layout thrash, and no
 *     interruption of a smooth-scroll already in flight)
 */
export function autosize(el: HTMLTextAreaElement, minPx = 0): void {
  // Pin the nearest scrollable ancestor as well as the document. The editor is
  // usually inside a scrollable modal panel, and it is THAT element the
  // browser clamps when the box collapses - pinning only the document left the
  // original jump fully intact in a modal, which is where the editor spends
  // most of its life.
  const pinned = scrollPins(el).map((node) => ({
    node,
    scrollTop: node.scrollTop,
  }));
  const prev = el.style.height;

  el.style.height = "0px";
  const measured = el.scrollHeight;
  el.style.height = prev;

  const next = `${Math.max(measured, minPx)}px`;
  if (prev !== next) el.style.height = next;
  for (const { node, scrollTop } of pinned) {
    if (node.scrollTop !== scrollTop) node.scrollTop = scrollTop;
  }
}

/** Every scroll container between `el` and the document, outermost last. */
export function scrollPins(el: HTMLElement): Element[] {
  const doc = document.scrollingElement ?? document.documentElement;
  const out: Element[] = [];
  for (let n = el.parentElement; n && n !== doc; n = n.parentElement) {
    const oy = window.getComputedStyle(n).overflowY;
    if (oy === "auto" || oy === "scroll") out.push(n);
  }
  out.push(doc);
  return out;
}
