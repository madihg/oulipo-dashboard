import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The shared controls of the master brand system (public.brand_system v0.4):
 * one disclosure chevron (.chev in main.css, a 7px hairline corner), one focus
 * ring (3px cobalt at 2px offset, never removed), and one row checkbox recipe
 * with a finger-sized hit area on coarse pointers. Source-level, so the rules
 * hold for every file, not only the ones a component test happens to mount.
 */
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(vue|css|ts)$/.test(name)) out.push(p);
  }
  return out;
}
const files = walk("src");
const vueFiles = files.filter((p) => p.endsWith(".vue"));
const read = (p: string) => readFileSync(p, "utf8");
const mainCss = read("src/styles/main.css");

/** The <template> of a single-file component, comments removed. */
function templateOf(src: string): string {
  const start = src.indexOf("<template");
  const end = src.lastIndexOf("</template>");
  if (start < 0 || end < 0) return "";
  return src.slice(start, end).replace(/<!--[\s\S]*?-->/g, "");
}
/** A file with its CSS, HTML and line comments blanked out. */
function withoutComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/(^|[^:"'])\/\/.*$/gm, "$1");
}
/** The class tokens of an opening tag's static class attribute. */
function classTokens(tag: string): string[] {
  const m = tag.match(/(?:^|\s)class="([^"]*)"/);
  return m ? m[1]!.split(/\s+/).filter(Boolean) : [];
}
/** Every opening tag in a template, with its offset. */
function openingTags(template: string): Array<{ tag: string; at: number }> {
  const out: Array<{ tag: string; at: number }> = [];
  const re = /<([a-zA-Z][\w-]*)(?:"[^"]*"|'[^']*'|[^'">])*>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template))) out.push({ tag: m[0], at: m.index });
  return out;
}

describe("the disclosure chevron", () => {
  it("is defined in main.css as the shared recipe", () => {
    const chev = mainCss.match(/\n\.chev\s*\{[^}]*\}/)?.[0] ?? "";
    expect(chev).toContain("width: 7px");
    expect(chev).toContain("height: 7px");
    expect(chev).toContain("border-right: 1.5px solid currentColor");
    expect(chev).toContain("border-bottom: 1.5px solid currentColor");
    expect(chev).toContain("transform: rotate(-45deg)");
    expect(chev).toContain(
      "transition: transform var(--dur-fast) var(--ease-out)",
    );
    expect(chev).toContain("color: var(--ink-50)");
    const open = mainCss.match(/\.chev-open\s*\{[^}]*\}/)?.[0] ?? "";
    expect(open).toContain("transform: rotate(45deg)");
  });

  it("sits inside every disclosure button", () => {
    // A disclosure (aria-expanded without aria-haspopup) shows the chevron; a
    // popover or menu trigger (aria-haspopup) is a different control and keeps
    // its own affordance.
    const missing: string[] = [];
    for (const p of vueFiles) {
      const template = templateOf(read(p));
      for (const { tag, at } of openingTags(template)) {
        if (!/\s:aria-expanded=/.test(tag)) continue;
        if (/\saria-haspopup=/.test(tag)) continue;
        const name = tag.match(/^<([\w-]+)/)?.[1] ?? "";
        const close = template.indexOf(`</${name}>`, at);
        const block = template.slice(at, close < 0 ? undefined : close);
        const hasChev = /class="[^"]*\bchev\b/.test(block);
        const isButton = name === "button" && /\stype="button"/.test(tag);
        const glyph = /[›‹▸▾▴▹]|&#9656;|&#9662;/.test(block);
        if (!hasChev || !isButton || glyph)
          missing.push(`${p}: ${tag.slice(0, 60)}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("is hidden from assistive tech wherever it appears", () => {
    const exposed: string[] = [];
    for (const p of vueFiles) {
      for (const { tag } of openingTags(templateOf(read(p)))) {
        if (!classTokens(tag).includes("chev")) continue;
        if (!/\saria-hidden="true"/.test(tag)) exposed.push(`${p}: ${tag}`);
      }
    }
    expect(exposed).toEqual([]);
  });

  it("left no bespoke chevron class behind", () => {
    const hits = files.filter((p) =>
      /\b[\w-]+-chev\b/.test(withoutComments(read(p))),
    );
    expect(hits).toEqual([]);
  });
});

describe("focus", () => {
  it("draws the master ring: 3px cobalt at 2px offset, on everything", () => {
    expect(mainCss).toMatch(
      /\*:focus-visible\s*\{\s*outline:\s*3px solid var\(--cobalt\);\s*outline-offset:\s*2px;\s*\}/,
    );
  });

  it("keeps the ring inside a row instead of removing it", () => {
    expect(mainCss).toMatch(
      /\.d-row:focus-visible[^{]*\{\s*outline-offset:\s*-3px;\s*\}/,
    );
  });

  it("never removes the ring anywhere in src", () => {
    const hits: string[] = [];
    for (const p of files) {
      withoutComments(read(p))
        .split("\n")
        .forEach((line, i) => {
          if (/outline\s*:\s*(none|0)\s*[;}]/.test(line))
            hits.push(`${p}:${i + 1}`);
        });
    }
    expect(hits).toEqual([]);
  });
});

describe("the row checkbox", () => {
  const src = read("src/components/dense/DenseRow.vue");
  const boxes = openingTags(templateOf(src))
    .map((t) => t.tag)
    .filter((tag) => classTokens(tag).includes("d-checkbox"));

  it("is a native checkbox or declares its role", () => {
    expect(boxes.length).toBeGreaterThan(0);
    for (const tag of boxes) {
      const native = /^<input\b/.test(tag) && /\stype="checkbox"/.test(tag);
      const declared =
        /\srole="checkbox"/.test(tag) && /\s:aria-checked=/.test(tag);
      expect(native || declared, tag).toBe(true);
    }
  });

  it("shares one recipe between complete and select", () => {
    expect(boxes.length).toBe(2);
    expect(src).not.toMatch(/\.d-checkbox-select\s*\{/);
    expect(src).toMatch(
      /\.d-checkbox\s*\{[^}]*border:\s*1\.5px solid var\(--metal\)/,
    );
  });

  it("draws the mark as a hairline, not a glyph or a scaled shape", () => {
    expect(src).toMatch(
      /\.d-checkbox::after\s*\{[^}]*border-right:\s*1\.5px solid/,
    );
    expect(src).not.toMatch(/\.d-checkbox[^{]*\{[^}]*content:\s*"[^"]+"/);
    expect(src).not.toMatch(/\.d-checkbox[^{]*\{[^}]*scale\(/);
  });

  it("gives coarse pointers a 44px hit area without touching layout", () => {
    expect(src).toContain("@media (pointer: coarse)");
    expect(src).toMatch(
      /\.d-checkbox::before\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*-15px;/,
    );
    expect(src).toMatch(/\.d-checkbox\s*\{[^}]*position:\s*relative/);
  });
});

/** The rest of owner B's surfaces, guarded line by line like the checkbox. */
const OWNED = [
  "src/App.vue",
  "src/components/ContextPanel.vue",
  "src/components/PriorityBoard.vue",
  "src/components/TodoEditor.vue",
  "src/components/dense/DenseRow.vue",
];
/** The CSS of a file: a stylesheet whole, a component from its <style>. */
function styleOf(src: string): string {
  const i = src.indexOf("<style");
  return i < 0 ? src : src.slice(i);
}

describe("one recipe per control", () => {
  it("rings the sidebar drop target in metal, keeping cobalt for the active link", () => {
    const css = withoutComments(styleOf(read("src/App.vue")));
    const drop = css.match(/\.d-nav-link-drop\s*\{[^}]*\}/)?.[0] ?? "";
    expect(drop).toContain("box-shadow: inset 0 0 0 1px var(--metal)");
    expect(drop).not.toMatch(/var\(--acc-carnation\)|var\(--cobalt\)/);
    expect(drop).toContain("background: var(--cobalt-tint)");
  });

  it("types the caption once, in .cap, and wears it on the collapse toggles", () => {
    const cap = mainCss.match(/\n\.cap\s*\{[^}]*\}/)?.[0] ?? "";
    expect(cap).toContain("font-family: var(--font-mono)");
    expect(cap).toContain("font-size: var(--fs-caption)");
    expect(cap).toContain("text-transform: uppercase");
    expect(cap).toContain("letter-spacing: 0.06em");
    const cases: Array<[string, string, string[]]> = [
      ["src/components/TodoEditor.vue", "ed-notes-toggle", ["cap"]],
      ["src/components/PriorityBoard.vue", "pb-toggle", ["cap", "cap-ink"]],
    ];
    for (const [p, cls, wanted] of cases) {
      const toggles = openingTags(templateOf(read(p)))
        .map((t) => classTokens(t.tag))
        .filter((tokens) => tokens.includes(cls));
      expect(toggles.length, p).toBe(1);
      for (const w of wanted) expect(toggles[0], `${p} ${w}`).toContain(w);
    }
  });

  it("re-types the mono caption in no scoped block", () => {
    const hits: string[] = [];
    for (const p of OWNED) {
      const rules =
        withoutComments(styleOf(read(p))).match(/[^{}]+\{[^}]*\}/g) ?? [];
      for (const rule of rules) {
        if (
          /font-family:\s*var\(--font-mono\)/.test(rule) &&
          /text-transform:\s*uppercase/.test(rule)
        )
          hits.push(`${p}: ${rule.trim().split("{")[0]?.trim()}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("lets the word carry an add control, never a text plus", () => {
    const hits: string[] = [];
    for (const p of OWNED) {
      for (const node of templateOf(read(p)).match(/>[^<]+</g) ?? []) {
        // "+ add" is a glyph doing icon duty; "+{{ n }}" is a count.
        if (/^>\s*\+\s*[a-z]/i.test(node)) hits.push(`${p}: ${node.trim()}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("draws paper from the token, never as literal white", () => {
    const hits = ["src/styles/main.css", ...OWNED].filter((p) =>
      /#[0-9a-fA-F]{3,8}\b/.test(withoutComments(styleOf(read(p)))),
    );
    expect(hits).toEqual([]);
    expect(mainCss).toMatch(
      /\.chip\[aria-pressed="true"\]\s*\{\s*color:\s*var\(--paper\)/,
    );
    expect(read("src/components/dense/DenseRow.vue")).toMatch(
      /\.d-checkbox::after\s*\{[^}]*border-right:\s*1\.5px solid var\(--paper\)/,
    );
  });

  it("moves only through --dur-* and --ease-out", () => {
    const hits: string[] = [];
    for (const p of ["src/styles/main.css", ...OWNED]) {
      const css = withoutComments(styleOf(read(p)));
      const bad = css.match(
        /transition:[^;]*(\bease(?![-\w])|\blinear\b|\b\d+m?s\b)/g,
      );
      if (bad) hits.push(`${p}: ${bad.join(" | ")}`);
      if (/transform:\s*scale\(/.test(css)) hits.push(`${p}: scale()`);
    }
    expect(hits).toEqual([]);
  });
});
