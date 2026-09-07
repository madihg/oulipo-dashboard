import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * An empty list is a door, not a wall (brand: hosted register). Every
 * `.d-empty` block in a view is one lowercase line plus one real next action:
 * a chip that clears the filter, focuses the input, or routes somewhere.
 * Loading states are the exception; they carry no action.
 *
 * Source-level, like undoSafety.test.ts: the templates are the contract.
 */
const DIR = "src/views";
const views = readdirSync(DIR)
  .filter((n) => n.endsWith(".vue"))
  .map((n) => join(DIR, n));
const read = (p: string) => readFileSync(p, "utf8");
const templateOf = (src: string) =>
  src.slice(src.indexOf("<template"), src.lastIndexOf("</template>"));

/** Every `<div … class="… d-empty …">…</div>` block, nesting-aware. */
function emptyBlocks(template: string): string[] {
  const out: string[] = [];
  const open = /<div\b[^>]*\bclass="[^"]*\bd-empty\b[^"]*"[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = open.exec(template))) {
    const tag = /<\/?div\b/g;
    tag.lastIndex = m.index + m[0].length;
    let depth = 1;
    let end = tag.lastIndex;
    let t: RegExpExecArray | null;
    while (depth > 0 && (t = tag.exec(template))) {
      depth += t[0].startsWith("</") ? -1 : 1;
      end = t.index + t[0].length;
    }
    out.push(template.slice(m.index, end));
  }
  return out;
}

/** What a person reads: tags, comments and expressions stripped. */
const textOf = (markup: string) =>
  markup
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\{\{[\s\S]*?\}\}/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

describe("empty states", () => {
  const cases = views.flatMap((p) =>
    emptyBlocks(templateOf(read(p))).map((block) => ({ p, block })),
  );

  it("finds the empty states it guards", () => {
    // Today, Inbox, Area, Project, StateList, NoArea, the two reservoirs and
    // the two kanbans between them declare well over a dozen.
    expect(cases.length).toBeGreaterThanOrEqual(12);
  });

  for (const { p, block } of cases) {
    const text = textOf(block);
    if (text.startsWith("loading")) continue;

    it(`${p}: "${text}" offers a next action`, () => {
      // StateList picks one of two controls with v-if / v-else, so the source
      // may hold more than one; what it may never hold is none.
      const controls = block.match(/<(button|router-link)\b[^>]*>/g) ?? [];
      expect(controls.length).toBeGreaterThan(0);
      for (const c of controls) {
        expect(c, "the action is a chip").toMatch(/\bclass="[^"]*\bchip\b/);
        if (c.startsWith("<button")) {
          expect(c, "buttons never submit").toContain('type="button"');
        }
      }
    });

    it(`${p}: "${text}" speaks in the hosted register`, () => {
      expect(text).toBe(text.toLowerCase());
      expect(text).not.toContain("!");
      expect(text).not.toContain("—");
    });
  }
});

describe("view hygiene", () => {
  it("types no em dash in any template", () => {
    const hits = views.filter((p) => templateOf(read(p)).includes("—"));
    expect(hits).toEqual([]);
  });

  it("sets every font-size from the ramp", () => {
    const hits = views.filter((p) =>
      /font-size:\s*[0-9.]+(rem|px|em)/.test(read(p)),
    );
    expect(hits).toEqual([]);
  });

  it("never shouts", () => {
    const hits = views.filter((p) => textOf(templateOf(read(p))).includes("!"));
    expect(hits).toEqual([]);
  });

  it("stands in for no icon with a text glyph", () => {
    const glyphs = /[›▸▾→↗]/;
    const hits = views.filter((p) => glyphs.test(templateOf(read(p))));
    expect(hits).toEqual([]);
  });
});
