import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { createApp, h, nextTick, type App } from "vue";
import { createPinia } from "pinia";
import DenseGroup from "../src/components/dense/DenseGroup.vue";
import ToastBar from "../src/components/ToastBar.vue";
import { useToastStore } from "../src/stores/toast";

/**
 * The chrome and list layer against the brand system (public.brand_system
 * v0.4): one caption recipe (.cap), one chip family, colour in a dot, one
 * cobalt note per surface, monoline icons, hosted words, undo where work
 * leaves the view. Source-level, like undoSafety.test.ts, so a regression is
 * named by file.
 */
const OWNED = [
  "src/components/dense/DenseToolbar.vue",
  "src/components/dense/DenseGroup.vue",
  "src/components/BulkBar.vue",
  "src/components/AreasNav.vue",
  "src/components/MobileTabBar.vue",
  "src/components/AddTaskInput.vue",
  "src/components/TodayHorizon.vue",
  "src/components/KanbanBoard.vue",
  "src/components/ArtifactChips.vue",
  "src/components/TodoEditorModal.vue",
  "src/components/SelectionFormatBar.vue",
  "src/components/ToastBar.vue",
  "src/components/ViewToggle.vue",
  "src/components/InstallPrompt.vue",
  "src/components/EntityActions.vue",
  "src/components/ClaudeInboxSection.vue",
];
/** Source with its comments removed, so a rule can be NAMED in a comment
 *  without tripping the assertion that enforces it. */
const read = (p: string) =>
  readFileSync(p, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const template = (src: string) =>
  src.slice(src.indexOf("<template"), src.lastIndexOf("</template>"));
const style = (src: string) => {
  const i = src.indexOf("<style");
  return i === -1 ? "" : src.slice(i);
};
/** Text a person reads in a template: text nodes and the strings inside
 *  title / placeholder / aria attributes. */
const readable = (src: string) => {
  // Interpolation source is code, not copy: a non-null "!" is no shout.
  const t = template(src).replace(/\{\{[\s\S]*?\}\}/g, "");
  const nodes = t.match(/>[^<]+</g) ?? [];
  const attrs =
    t.match(/(?:title|placeholder|aria-label|aria-description)="[^"]*"/g) ?? [];
  return [...nodes, ...attrs].join("\n");
};

describe("chrome hygiene: tokens", () => {
  it("never hides focus", () => {
    const hits = OWNED.filter((p) => /outline:\s*(none|0)\b/.test(read(p)));
    expect(hits).toEqual([]);
  });

  it("keeps the ring inside a framed segment, as rows do", () => {
    // .d-view-toggle clips its overflow, so a ring drawn 2px outside a
    // segment would vanish; the negative offset turns it inward instead.
    expect(style(read("src/components/ViewToggle.vue"))).toMatch(
      /\.d-view-seg:focus-visible\s*\{\s*outline-offset:\s*-3px;\s*\}/,
    );
  });

  it("paints greys and whites from tokens, never raw rgba() or hex", () => {
    const hits = OWNED.filter((p) =>
      /rgba\(|#[0-9a-fA-F]{3,6}\b/.test(style(read(p))),
    );
    expect(hits).toEqual([]);
  });

  it("moves only through --dur-* and --ease-out", () => {
    const hits: string[] = [];
    for (const p of OWNED) {
      const css = style(read(p));
      // A transition naming a bare easing keyword or a literal duration.
      const bad = css.match(
        /transition:[^;]*(\bease(?![-\w])|\blinear\b|\b\d+m?s\b)/g,
      );
      if (bad) hits.push(`${p}: ${bad.join(" | ")}`);
      if (/transform:\s*scale\(/.test(css)) hits.push(`${p}: scale()`);
    }
    expect(hits).toEqual([]);
  });

  it("types the caption once, in .cap, never re-typed in a scoped block", () => {
    const hits: string[] = [];
    for (const p of OWNED) {
      const rules = style(read(p)).split("}");
      for (const r of rules) {
        // The recipe's signature is mono + uppercase in one rule.
        if (
          /font-family:\s*var\(--font-mono\)/.test(r) &&
          /text-transform:\s*uppercase/.test(r)
        )
          hits.push(`${p}: ${r.trim().slice(0, 60)}`);
        if (/letter-spacing:\s*0\.0[46]em/.test(r))
          hits.push(`${p}: letter-spacing ${r.trim().slice(0, 40)}`);
      }
      // Nor as a Tailwind spelling of the same recipe.
      if (/tracking-tracked|text-meta/.test(template(read(p))))
        hits.push(`${p}: tailwind caption`);
    }
    expect(hits).toEqual([]);
  });
});

describe("chrome hygiene: voice and icons", () => {
  it("draws icons as monolines, never as text glyphs", () => {
    const glyphs = /[›▸▾❝•×→⌘‹]/;
    const hits = OWNED.filter((p) => glyphs.test(template(read(p))));
    expect(hits).toEqual([]);
    const strokes = OWNED.filter((p) =>
      /stroke-width[:=]\s*"?(1\.[0-46-9]|[02-9])\b/.test(read(p)),
    );
    expect(strokes).toEqual([]);
  });

  it("hosts its copy: no exclamation, no em dash, a word for a placeholder", () => {
    const hits = OWNED.filter((p) => /[!—]/.test(readable(read(p))));
    expect(hits).toEqual([]);
    const add = read("src/components/AddTaskInput.vue");
    expect(template(add)).toContain("lands in {{ destinationLabel }}");
    const fb = read("src/components/SelectionFormatBar.vue");
    expect(fb).toContain('const MOD = IS_APPLE ? "cmd" : "ctrl";');
    expect(fb).not.toMatch(/label: "[^A-Za-z]+"/);
  });

  it("opens its popovers with aria-expanded on the trigger", () => {
    const tb = template(read("src/components/dense/DenseToolbar.vue"));
    for (const open of ["filterOpen", "sortOpen", "groupOpen"]) {
      expect(tb).toContain(`:aria-expanded="${open}"`);
    }
    expect(template(read("src/components/BulkBar.vue"))).toContain(
      ':aria-expanded="areaOpen"',
    );
  });
});

describe("chrome hygiene: colour budget", () => {
  it("keeps AreasNav to one cobalt note, the active name, with metal drop rings", () => {
    const css = style(read("src/components/AreasNav.vue"));
    expect(css).not.toContain("var(--acc-carnation)");
    expect(css).not.toContain("var(--cobalt)");
    expect(css).toContain("box-shadow: inset 0 0 0 1px var(--metal)");
    expect(css.match(/var\(--acc-carnation-text\)/g)?.length).toBe(2);
  });

  it("keeps the MobileTabBar's cobalt to the active tab", () => {
    const css = style(read("src/components/MobileTabBar.vue"));
    expect(css.match(/carnation|cobalt/g)?.length).toBe(1);
    expect(css).toContain("min-height: 56px");
  });

  it("uses ink chips, not cobalt, for the toolbar and bulk bar", () => {
    for (const p of [
      "src/components/dense/DenseToolbar.vue",
      "src/components/BulkBar.vue",
    ]) {
      expect(read(p)).not.toMatch(/carnation|cobalt/);
    }
    const bulk = template(read("src/components/BulkBar.vue"));
    expect(bulk).toContain('class="chip chip-primary" @click="completeAll"');
    expect(bulk).toContain('class="chip chip-danger"');
    expect(bulk).not.toContain("bb-btn");
  });

  it("lets colour live in the shared dot, not a fill", () => {
    expect(style(read("src/components/ArtifactChips.vue"))).not.toMatch(
      /background:\s*var\(--cobalt-tint\)|acc-reinforcement|acc-hard/,
    );
    expect(template(read("src/components/TodayHorizon.vue"))).toContain(
      'class="dot"',
    );
    expect(template(read("src/components/AreasNav.vue"))).toContain(
      "'--dot': projectColor(p.slug)",
    );
  });
});

describe("chrome hygiene: undo and targets", () => {
  it("offers undo on every bulk write that can move rows out of view", () => {
    const src = read("src/components/BulkBar.vue");
    for (const fn of ["applyWhen", "applyPriority", "applyArea"]) {
      const body = src.slice(src.indexOf(`async function ${fn}(`));
      const end = body.indexOf("\n}\n");
      expect(body.slice(0, end), fn).toContain("undoOf(before)");
    }
    // The undo is checked like every other bulk write.
    const undo = src.slice(src.indexOf("function undoOf("));
    expect(undo).toContain(
      "const ok = await vault.bulkUpdate(g.ids, g.patch as never);",
    );
  });

  it("offers undo when a routine suggestion is dismissed", () => {
    const src = read("src/components/ClaudeInboxSection.vue");
    const fn = src.slice(src.indexOf("async function dismiss("));
    // The snapshot is taken before the tombstone write mutates the row.
    const snap = fn.indexOf("const prior");
    expect(snap).toBeGreaterThan(-1);
    expect(snap).toBeLessThan(fn.indexOf('state: "cancelled"'));
    expect(fn).toContain('label: "undo"');
    // The row left every list, so the undo puts it back on screen too.
    expect(fn).toContain("vault.inboxTodos.unshift(");
  });

  it("gives coarse pointers a 32px target on every small control", () => {
    const cases: Array<[string, string]> = [
      [
        "src/components/dense/DenseGroup.vue",
        ".d-col-plus {\n    width: 32px;\n    height: 32px;",
      ],
      ["src/components/AreasNav.vue", ".d-proj-row {\n    min-height: 32px;"],
      ["src/components/ToastBar.vue", ".tb-x {\n    min-height: 32px;"],
      ["src/components/BulkBar.vue", "min-height: var(--touch-target);"],
    ];
    for (const [p, snippet] of cases) {
      const css = style(read(p));
      const coarse = css.slice(css.indexOf("@media (pointer: coarse)"));
      expect(coarse, p).toContain(snippet);
    }
  });

  it("shows the hidden grip the moment the keyboard lands on it", () => {
    expect(style(read("src/components/AreasNav.vue"))).toContain(
      ".area-grip:focus-visible {\n  opacity: 1;",
    );
  });
});

/** Mounted: the group header and the toast, which render alone and prove
 *  the templates compile. */
let app: App | null = null;
afterEach(() => {
  app?.unmount();
  app = null;
  document.body.innerHTML = "";
});

describe("DenseGroup", () => {
  type GroupProps = {
    label: string;
    count: number;
    accent?:
      | "carnation"
      | "hard"
      | "reverse"
      | "reinforcement"
      | "ongoing"
      | "neutral";
    hideAdd?: boolean;
  };
  async function mount(props: GroupProps) {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const added: number[] = [];
    app = createApp({
      setup: () => () =>
        h(DenseGroup, { ...props, onAdd: () => added.push(1) }),
    });
    app.mount(host);
    await nextTick();
    return { added };
  }

  it("carries the accent in the shared dot", async () => {
    await mount({ label: "p1", count: 3, accent: "hard" });
    const dot = document.querySelector(".d-col-head .dot");
    expect(dot).not.toBeNull();
    expect(dot!.classList.contains("d-col-dot-hard")).toBe(true);
    expect(document.querySelector(".d-col-count")?.textContent).toBe("3");
  });

  it("draws the add control as a labelled monoline, not a text glyph", async () => {
    const { added } = await mount({ label: "p0", count: 0 });
    const btn = document.querySelector<HTMLButtonElement>(".d-col-plus")!;
    expect(btn.getAttribute("type")).toBe("button");
    expect(btn.getAttribute("aria-label")).toBe("add to group");
    expect(btn.querySelector("svg")).not.toBeNull();
    expect(btn.textContent?.trim()).toBe("");
    btn.click();
    expect(added).toHaveLength(1);
  });

  it("hides the add control when nothing can be added", async () => {
    await mount({ label: "done", count: 2, hideAdd: true });
    expect(document.querySelector(".d-col-plus")).toBeNull();
  });
});

describe("ToastBar", () => {
  it("reads as a receipt with a word for the action and a monoline dismiss", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const pinia = createPinia();
    app = createApp({ render: () => h(ToastBar) });
    app.use(pinia);
    app.mount(host);
    const store = useToastStore(pinia);
    let ran = 0;
    const id = store.show("moved to admin", {
      label: "undo",
      run: () => {
        ran += 1;
      },
    });
    await nextTick();
    const msg = document.querySelector<HTMLButtonElement>(".tb-msg")!;
    // The undo is announced: the container is a polite live region.
    const region = document.querySelector<HTMLElement>('[role="status"]')!;
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.contains(msg)).toBe(true);
    expect(msg.textContent).toContain("moved to admin");
    expect(msg.textContent).toContain("undo");
    expect(msg.textContent).not.toMatch(/[›—!]/);
    const x = document.querySelector<HTMLButtonElement>(".tb-x")!;
    expect(x.getAttribute("aria-label")).toBe("dismiss");
    expect(x.querySelector("svg")).not.toBeNull();
    expect(x.textContent?.trim()).toBe("");
    msg.click();
    await nextTick();
    await nextTick();
    expect(ran).toBe(1);
    expect(store.toasts.some((t) => t.id === id)).toBe(false);
  });
});
