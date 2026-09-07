import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { createApp, h, nextTick, type App } from "vue";
import FilterPopover from "../src/components/FilterPopover.vue";
import SortPopover from "../src/components/SortPopover.vue";

/**
 * The popover and picker layer against the master brand system. These are the
 * rules that were being re-typed, one surface at a time, until they drifted:
 * one caption recipe, one focus ring, one disclosure chevron, motion only
 * through the tokens, cobalt as a single note, and hosted words in place of
 * glyphs.
 */
const FILES = [
  "src/components/FilterPopover.vue",
  "src/components/SortPopover.vue",
  "src/components/GroupPopover.vue",
  "src/components/Popover.vue",
  "src/components/WhenPanel.vue",
  "src/components/WhenSheet.vue",
  "src/components/WhenDropPicker.vue",
  "src/components/WhenPicker.vue",
  "src/components/RepeatPicker.vue",
  "src/components/ContextPicker.vue",
  "src/components/CommandPalette.vue",
  "src/components/ShortcutsHelp.vue",
  "src/components/DebriefPanel.vue",
  "src/components/TodoEditor.vue",
  "src/components/PriorityBoard.vue",
];
const read = (p: string) => readFileSync(p, "utf8");
const styleOf = (src: string) => {
  const i = src.indexOf("<style");
  return i < 0 ? "" : src.slice(i);
};
const templateOf = (src: string) =>
  src.slice(src.indexOf("<template"), src.lastIndexOf("</template>"));

describe("focus is always visible", () => {
  it("never switches the outline off", () => {
    const hits = FILES.filter((p) => /outline:\s*(none|0)\b/.test(read(p)));
    expect(hits).toEqual([]);
  });
});

describe("one caption recipe", () => {
  it("re-types the mono caption nowhere in a scoped style", () => {
    // The recipe is mono + uppercase + caption size + tracking. Any scoped
    // rule carrying all four is a copy of .cap and belongs in the template.
    const hits: string[] = [];
    for (const p of FILES) {
      const rules = styleOf(read(p)).match(/[^{}]+\{[^}]*\}/g) ?? [];
      for (const rule of rules) {
        const retyped =
          rule.includes("var(--font-mono)") &&
          rule.includes("text-transform: uppercase") &&
          /font-size:\s*var\(--fs-(caption|label)\)/.test(rule) &&
          rule.includes("letter-spacing");
        if (retyped) hits.push(`${p}: ${rule.trim().split("{")[0]?.trim()}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("tracks captions at .06em, eyebrows at .08em, nothing else", () => {
    const hits: string[] = [];
    for (const p of FILES) {
      const m = styleOf(read(p)).match(/letter-spacing:\s*([0-9.]+)em/g) ?? [];
      for (const x of m) {
        const v = x.match(/([0-9.]+)em/)![1];
        if (v !== "0.06" && v !== "0.08" && v !== "0.02")
          hits.push(`${p}: ${x}`);
      }
    }
    expect(hits).toEqual([]);
  });
});

describe("one disclosure chevron", () => {
  it("draws no chevron as a text glyph", () => {
    const hits = FILES.filter((p) => /[›▸▾▴◂‹]/.test(templateOf(read(p))));
    expect(hits).toEqual([]);
  });

  it("uses the shared .chev on every disclosure, tied to aria-expanded", () => {
    // WhenPicker's trigger is a popover (aria-haspopup) like the toolbar and
    // bulk-bar triggers, and those carry no chevron: see controls.test.ts.
    for (const p of ["src/components/DebriefPanel.vue"]) {
      const t = templateOf(read(p));
      expect(t, p).toContain(`class="chev"`);
      expect(t, p).toContain(`:class="{ 'chev-open': open }"`);
      expect(t, p).toContain(`:aria-expanded="open"`);
    }
    // No bespoke chevron class survives beside the shared one.
    const bespoke = FILES.filter((p) => /\.[a-z-]+-chev\b/.test(read(p)));
    expect(bespoke).toEqual([]);
  });
});

describe("tokens, not literals", () => {
  it("paints no raw rgba() grey", () => {
    const hits = FILES.filter((p) => /rgba\(/.test(styleOf(read(p))));
    expect(hits).toEqual([]);
  });

  it("moves only through --dur-* and --ease-out", () => {
    const hits: string[] = [];
    for (const p of FILES) {
      const css = styleOf(read(p));
      // A named easing or a literal duration right after a transition part.
      const named = css.match(/\s(ease|ease-in|ease-in-out|linear)\s*[,;]/g);
      const literal = css.match(/\b\d+m?s\b/g);
      if (named) hits.push(`${p}: ${named.join(", ")}`);
      if (literal) hits.push(`${p}: ${literal.join(", ")}`);
    }
    expect(hits).toEqual([]);
  });

  it("never jumps scale on hover", () => {
    const hits = FILES.filter((p) => /scale\(/.test(styleOf(read(p))));
    expect(hits).toEqual([]);
  });

  it("frames every floating surface in metal, never ink or cobalt", () => {
    for (const [p, cls] of [
      ["src/components/Popover.vue", ".d-pop"],
      ["src/components/WhenDropPicker.vue", ".wdp"],
      ["src/components/CommandPalette.vue", ".pal "],
      ["src/components/ShortcutsHelp.vue", ".sh-panel"],
    ]) {
      const css = styleOf(read(p!));
      const rule = css.slice(css.indexOf(cls!));
      const block = rule.slice(0, rule.indexOf("}"));
      expect(block, p).toContain("border: 1px solid var(--metal)");
    }
  });
});

describe("cobalt is one note per surface", () => {
  const cobaltUses = (css: string) =>
    (css.match(/var\(--(cobalt|acc-carnation)(-text|-hover)?\)/g) ?? []).length;

  it("spends the when panel's note on the lit quick row alone", () => {
    const css = styleOf(read("src/components/WhenPanel.vue"));
    // The rail is the note; the picked square inverts to ink, the tick is a
    // shape on the row's own ink, and no filled cobalt square survives.
    expect(css).toContain("box-shadow: inset 2px 0 0 0 var(--cobalt)");
    expect(css).not.toMatch(/background:\s*var\(--(cobalt|acc-carnation)\)/);
    expect(css).not.toMatch(/stroke:\s*var\(--(cobalt|acc-carnation)\)/);
    expect(cobaltUses(css)).toBe(1);
  });

  it("spends the palette's note on the caret alone", () => {
    const css = styleOf(read("src/components/CommandPalette.vue"));
    expect(css).toContain("caret-color: var(--cobalt)");
    expect(css).not.toContain("border-left-color: var(--cobalt)");
    // The other uses are the focused field's own mark (underline + tint halo).
    expect(css).not.toMatch(/background:\s*var\(--cobalt\)/);
  });

  it("keeps the list popovers monochrome", () => {
    for (const p of [
      "src/components/SortPopover.vue",
      "src/components/GroupPopover.vue",
      "src/components/FilterPopover.vue",
    ]) {
      expect(cobaltUses(styleOf(read(p))), p).toBe(0);
    }
  });
});

describe("hosted voice", () => {
  it("shouts nowhere and pauses with a spaced hyphen", () => {
    const hits: string[] = [];
    for (const p of FILES) {
      const src = read(p);
      const strings = src.match(/(["'`])(?:(?!\1)[^\\\n])*\1/g) ?? [];
      for (const s of strings) {
        if (s.includes("—") || /[a-z]!["'`]/.test(s)) hits.push(`${p}: ${s}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("stands the icon glyphs in for no icon", () => {
    // ⇧ ↑ ↓ ↩ are key legends, not icons; the arrow-and-tilde stand-ins are.
    // The modifier is a word (MOD in src/lib/platform.ts), never ⌘.
    const hits = FILES.filter((p) => /[→←✓✕×]/.test(templateOf(read(p))));
    expect(hits).toEqual([]);
  });
});

describe("mounted", () => {
  let app: App | null = null;
  afterEach(() => {
    app?.unmount();
    app = null;
    document.body.innerHTML = "";
  });
  async function mount(component: unknown, props: Record<string, unknown>) {
    const host = document.createElement("div");
    document.body.appendChild(host);
    app = createApp({ setup: () => () => h(component as never, props) });
    app.mount(host);
    await nextTick();
  }

  it("names every priority chip with a word, not a glyph", async () => {
    await mount(FilterPopover, {
      value: { tags: [], priority: [], state: [] },
      availableTags: [],
    });
    const chips = Array.from(document.querySelectorAll(".chip")).map((b) =>
      b.textContent?.trim(),
    );
    expect(chips).toContain("none");
    expect(chips).toContain("ongoing");
    expect(chips).not.toContain("-");
    expect(chips).not.toContain("~");
  });

  it("clears through a quiet chip of the one family", async () => {
    await mount(FilterPopover, {
      value: { tags: [], priority: [], state: [] },
      availableTags: [],
    });
    const clear = Array.from(
      document.querySelectorAll<HTMLButtonElement>("button"),
    ).find((b) => b.textContent?.trim() === "clear");
    expect(clear?.classList.contains("chip")).toBe(true);
    expect(clear?.classList.contains("chip-quiet")).toBe(true);
  });

  it("marks the sort choice for assistive tech, not colour alone", async () => {
    await mount(SortPopover, { value: "deadline" });
    const on = document.querySelectorAll('[role="radio"][aria-checked="true"]');
    expect(on).toHaveLength(1);
    expect(on[0]?.textContent?.trim()).toBe("deadline");
    expect(on[0]?.querySelector(".d-radio-dot.on")).not.toBeNull();
  });
});
