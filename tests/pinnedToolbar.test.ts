import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The list's controls stay pinned while it scrolls, and a page header is the
 * toolbar's one line. The area page used to stack four above it: an eyebrow,
 * the title, rename/delete and the rules bar.
 */
const read = (p: string) => readFileSync(p, "utf8");
const templateOf = (s: string) =>
  s.slice(s.indexOf("<template>"), s.lastIndexOf("</template>"));

describe("the pinned toolbar", () => {
  it("sticks to the top over paper and offers a slot", () => {
    const src = read("src/components/dense/DenseToolbar.vue");
    const rule = src.slice(src.indexOf("\n.d-toolbar {"));
    const body = rule.slice(0, rule.indexOf("}"));
    expect(body).toContain("position: sticky");
    expect(body).toContain("top: 0");
    expect(body).toContain("background: var(--paper)");
    expect(templateOf(src)).toContain('<slot name="extra" />');
  });

  for (const page of ["src/views/Area.vue", "src/views/Project.vue"]) {
    it(`${page} puts its title in the toolbar and the rare controls behind more`, () => {
      const t = templateOf(read(page));
      expect(t).not.toMatch(/d-(area|proj)-header/);
      expect(t).toMatch(/<DenseToolbar\s+:title=/);
      const more = t.slice(t.indexOf('class="d-page-more"'));
      expect(more).toContain("<EntityActions");
      expect(more).toContain("<ContextPanel");
      // Nothing rare sits above the toolbar any more.
      const above = t.slice(0, t.indexOf("<DenseToolbar"));
      expect(above).not.toContain("<EntityActions");
      expect(above).not.toContain("<ContextPanel");
      expect(t).toContain(':aria-expanded="showMore"');
    });
  }
});
