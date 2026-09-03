import { describe, it, expect } from "vitest";
import { CONTEXTS, contextDef } from "../src/utils/contexts";

/**
 * Two design rules this codebase kept breaking, pinned so they stay fixed.
 *
 * 1. Colour in a row means priority. Nothing else.
 *    Contexts used to carry one house accent each, and every one was already
 *    spoken for: web was the P0 cobalt, email the overdue vermilion, text the
 *    P1 gold, buy the P2 violet, offline the ongoing teal, notes the done
 *    green. An emailed task read as overdue; an ongoing note read as finished.
 *
 * 2. An action that removes work from view offers undo.
 *    Deleting a task always did. Completing one, completing twelve, and
 *    dropping a capture did not, and the capture case was a hard delete of
 *    the only copy.
 */

/** The accents that mean urgency or status; a context may claim none of them. */
const RESERVED = [
  "#1430c0", // acc-carnation-text, P0 / active
  "#8a6310", // acc-hard-text, P1
  "#5a3bb0", // acc-reverse-text, P2
  "#0f766e", // acc-ongoing-text, ongoing
  "#176e46", // acc-reinforcement-text, done
  "#c0301a", // acc-versus-text, overdue / delete
];

describe("colour discipline", () => {
  it("gives contexts no colour at all", () => {
    for (const c of CONTEXTS) {
      expect(c, c.name).not.toHaveProperty("color");
    }
  });

  it("leaves the urgency accents to priority", () => {
    const serialized = JSON.stringify(CONTEXTS).toLowerCase();
    for (const hex of RESERVED) {
      expect(serialized, `${hex} is a priority/status accent`).not.toContain(
        hex,
      );
    }
  });

  it("still identifies every context by name and hint", () => {
    // The label is the whole signal now, so it has to carry its own meaning.
    for (const c of CONTEXTS) {
      expect(contextDef(c.name)?.hint, c.name).toBeTruthy();
    }
  });
});

describe("undo coverage", () => {
  /** Source of the component that owns each destructive action. Vitest runs
   *  from the repo root, so a plain relative path is the whole story. */
  const read = async (p: string) => {
    const { readFileSync } = await import("node:fs");
    return readFileSync(p, "utf8");
  };

  it("offers undo when a row is completed", async () => {
    const src = await read("src/components/dense/DenseRow.vue");
    const toggle = src.slice(src.indexOf("async function toggle()"));
    expect(toggle).toContain('label: "undo"');
    // And says nothing extra when UN-completing, which removes nothing.
    expect(toggle).toContain("if (wasCompleted) return;");
  });

  it("offers undo when a selection is completed", async () => {
    const src = await read("src/components/BulkBar.vue");
    const fn = src.slice(src.indexOf("async function completeAll()"));
    expect(fn).toContain('label: "undo"');
    // Each row goes back to the list it came from, not all to anytime.
    expect(fn).toContain("before.set(id, row.state)");
  });

  it("offers undo when a capture is dropped", async () => {
    const src = await read("src/views/Inbox.vue");
    const fn = src.slice(src.indexOf("async function dropCapture("));
    expect(fn).toContain("const snapshot = { ...c }");
    expect(fn).toContain('label: "undo"');
  });

  it("never reports a bulk save that did not land", async () => {
    const src = await read("src/components/BulkBar.vue");
    expect(src).toContain("could not save");
    // Every bulk write is checked, not fired and forgotten.
    const calls = src.match(/await vault\.bulkUpdate\(/g) ?? [];
    const checked = src.match(/const ok = await vault\.bulkUpdate\(/g) ?? [];
    // completeAll's undo path calls bulkUpdate without a toast, so allow one.
    expect(calls.length - checked.length).toBeLessThanOrEqual(1);
  });

  it("has a vault that reports whether a bulk write succeeded", async () => {
    const src = await read("src/stores/vault.ts");
    expect(src).toContain(
      "): Promise<boolean> {\n    if (!ids.length) return true;",
    );
  });
});
