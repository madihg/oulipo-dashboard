import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

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

  it("lets no page stack a view toggle or its actions above the toolbar", () => {
    const dir = "src/views";
    const offenders: string[] = [];
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".vue")) continue;
      const tpl = templateOf(read(`${dir}/${name}`));
      const at = tpl.indexOf("<DenseToolbar");
      if (at < 0) continue;
      const above = tpl.slice(0, at);
      if (above.includes("<ViewToggle") || above.includes("<EntityActions"))
        offenders.push(name);
      // The title belongs to the toolbar, not to a header block above it.
      if (/title=""/.test(tpl.slice(at, at + 200)))
        offenders.push(`${name} (empty title)`);
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the phone-only view toggle off the laptop", () => {
    // A scoped display rule outranks a plain class, so both sides are forced.
    const css = read("src/styles/main.css");
    expect(css).toMatch(/\.d-only-phone \{\s*display: none !important;/);
    expect(css).toMatch(/\.d-only-phone \{\s*display: inline-flex !important;/);
  });

  for (const page of [
    "src/views/Area.vue",
    "src/views/Project.vue",
    "src/views/AreaKanban.vue",
    "src/views/ProjectKanban.vue",
  ]) {
    it(`${page} puts its title in the toolbar and the rare controls behind more`, () => {
      const t = templateOf(read(page));
      expect(t).not.toMatch(/d-(area|proj)-header/);
      expect(t).toMatch(/<DenseToolbar\s+:title=/);
      const more = t.slice(t.indexOf('class="d-page-more"'));
      expect(more).toContain("<EntityActions");
      if (!page.includes("Kanban")) expect(more).toContain("<ContextPanel");
      // Nothing rare sits above the toolbar any more.
      const above = t.slice(0, t.indexOf("<DenseToolbar"));
      expect(above).not.toContain("<EntityActions");
      expect(above).not.toContain("<ContextPanel");
      expect(t).toContain(':aria-expanded="showMore"');
    });
  }
});
