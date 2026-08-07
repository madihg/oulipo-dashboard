/**
 * Markdown formatting applied to a plain-text selection.
 *
 * Notes are stored as plain text (markdown-ish) and rendered read-only, so
 * "formatting" means wrapping the selection in markers. Every operation is a
 * TOGGLE: applying bold to already-bold text removes it, so the selection
 * toolbar behaves like every other editor's.
 *
 * Pure functions over {text, start, end} - no DOM - so the behaviour is
 * testable and the composable stays thin.
 */

export type InlineMark = "bold" | "italic" | "code" | "strike";
export type BlockMark = "h2" | "bullet" | "quote";
export type FormatKind = InlineMark | BlockMark | "link";

export interface Selection {
  text: string;
  start: number;
  end: number;
}

const WRAP: Record<InlineMark, string> = {
  bold: "**",
  italic: "*",
  code: "`",
  strike: "~~",
};

const PREFIX: Record<BlockMark, string> = {
  h2: "## ",
  bullet: "- ",
  quote: "> ",
};

/** Is the selection already wrapped in this mark (inside or outside)? */
export function hasInlineMark(sel: Selection, mark: InlineMark): boolean {
  const w = WRAP[mark];
  const inner = sel.text.slice(sel.start, sel.end);
  // Markers inside the selection: **like this**
  if (
    inner.length >= w.length * 2 &&
    inner.startsWith(w) &&
    inner.endsWith(w)
  ) {
    // Guard: "*" must not match the inner of "**bold**" as italic.
    if (mark === "italic" && inner.startsWith("**") && inner.endsWith("**")) {
      return false;
    }
    // Two separate marked runs ("**a** and **b**") also start and end with the
    // marker, but they are not ONE marked run - stripping the outermost pair
    // would leave the inner markers stranded as literal text.
    if (inner.slice(w.length, inner.length - w.length).includes(w)) {
      return false;
    }
    return true;
  }
  // Markers just outside the selection: **like** this
  const before = sel.text.slice(Math.max(0, sel.start - w.length), sel.start);
  const after = sel.text.slice(sel.end, sel.end + w.length);
  if (before === w && after === w) {
    if (mark === "italic") {
      const before2 = sel.text.slice(Math.max(0, sel.start - 2), sel.start);
      const after2 = sel.text.slice(sel.end, sel.end + 2);
      if (before2 === "**" && after2 === "**") return false;
    }
    // Same trap from the outside: the enclosing pair is only ours if the
    // selection itself carries no loose marker of the same kind.
    if (inner.includes(w)) return false;
    return true;
  }
  return false;
}

/** Apply or remove an inline mark. Returns the new text and selection. */
export function toggleInline(sel: Selection, mark: InlineMark): Selection {
  const w = WRAP[mark];
  const { text, start, end } = sel;
  const inner = text.slice(start, end);

  if (hasInlineMark(sel, mark)) {
    // Strip - inside first, then outside.
    if (inner.startsWith(w) && inner.endsWith(w)) {
      const stripped = inner.slice(w.length, inner.length - w.length);
      return {
        text: text.slice(0, start) + stripped + text.slice(end),
        start,
        end: start + stripped.length,
      };
    }
    return {
      text:
        text.slice(0, start - w.length) + inner + text.slice(end + w.length),
      start: start - w.length,
      end: end - w.length,
    };
  }

  // Nothing selected: drop the markers in and put the caret between them.
  if (start === end) {
    return {
      text: text.slice(0, start) + w + w + text.slice(start),
      start: start + w.length,
      end: start + w.length,
    };
  }
  return {
    text: text.slice(0, start) + w + inner + w + text.slice(end),
    start: start + w.length,
    end: end + w.length,
  };
}

/** Line range [lineStart, lineEnd) containing the selection. */
function lineBounds(text: string, start: number, end: number) {
  const from = text.lastIndexOf("\n", start - 1) + 1;
  // A selection dragged through a newline stops AT the next line's first
  // character without having touched that line. Prefixing it there surprises
  // everyone, so pull the end back off the boundary.
  const stop = end > start && text[end - 1] === "\n" ? end - 1 : end;
  const nl = text.indexOf("\n", stop);
  const to = nl === -1 ? text.length : nl;
  return { from, to };
}

/** Apply or remove a line prefix across every line the selection touches. */
export function toggleBlock(sel: Selection, mark: BlockMark): Selection {
  const p = PREFIX[mark];
  const { text, start, end } = sel;
  const { from, to } = lineBounds(text, start, end);
  const lines = text.slice(from, to).split("\n");

  // Blank lines never carry a prefix, so they must not get a vote on the
  // direction: letting one empty line flip "remove" into "add" is what made a
  // second press produce "- - already bulleted".
  const filled = lines.filter((l) => l.trim() !== "");
  const allMarked = filled.length > 0 && filled.every((l) => l.startsWith(p));

  let headDelta = 0;
  let totalDelta = 0;
  const next = lines
    .map((line, i) => {
      let out = line;
      if (allMarked) {
        if (line.startsWith(p)) out = line.slice(p.length);
      } else if (line.trim() !== "" && !line.startsWith(p)) {
        out = p + line;
      }
      const d = out.length - line.length;
      if (i === 0) headDelta = d;
      totalDelta += d;
      return out;
    })
    .join("\n");

  return {
    text: text.slice(0, from) + next + text.slice(to),
    // Keep the selection over the same TEXT: the first line's own change moves
    // the start, the sum of every line's change moves the end. Deltas are
    // measured per line rather than assumed, because lines that were already
    // marked (or blank) are left alone.
    start: Math.max(from, start + headDelta),
    end: Math.max(from, end + totalDelta),
  };
}

/** Wrap the selection as a markdown link, caret parked in the url slot. */
export function applyLink(sel: Selection, url = ""): Selection {
  const { text, start, end } = sel;
  const label = text.slice(start, end) || "link";
  const out = `[${label}](${url})`;
  return {
    text: text.slice(0, start) + out + text.slice(end),
    // Select the (empty) url so typing replaces it.
    start: start + label.length + 3,
    end: start + label.length + 3 + url.length,
  };
}

export function applyFormat(
  sel: Selection,
  kind: FormatKind,
  url?: string,
): Selection {
  if (kind === "link") return applyLink(sel, url);
  if (kind === "h2" || kind === "bullet" || kind === "quote") {
    return toggleBlock(sel, kind);
  }
  return toggleInline(sel, kind);
}
