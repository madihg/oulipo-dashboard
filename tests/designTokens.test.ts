import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The app follows the master brand system (public.brand_system v0.4):
 * one type ramp, no bespoke sizes; ink/hair/metal tokens, no legacy slate
 * scale; no em dash anywhere a person can read it.
 */
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(vue|css|ts)$/.test(name)) out.push(p);
  }
  return out;
}
const files = walk("src").filter((p) => !p.endsWith("styles/tokens.css"));
const read = (p: string) => readFileSync(p, "utf8");

describe("design tokens", () => {
  it("uses no legacy --sl-* token outside tokens.css", () => {
    const hits = files.filter((p) => /var\(--sl-\d+\)/.test(read(p)));
    expect(hits).toEqual([]);
  });

  it("sets every font-size from the ramp", () => {
    const hits: string[] = [];
    for (const p of files) {
      const m = read(p).match(/font-size:\s*[0-9.]+(rem|px|em)/g);
      if (m) hits.push(`${p}: ${m.join(", ")}`);
    }
    expect(hits).toEqual([]);
  });

  it("keeps the ramp monotonic", () => {
    const css = read("src/styles/tokens.css");
    const px = (name: string) => {
      const v = css.match(new RegExp(`--fs-${name}:\\s*([0-9.]+)(rem|px)`));
      if (!v) throw new Error(`--fs-${name} missing`);
      return v[2] === "px" ? Number(v[1]) : Number(v[1]) * 16;
    };
    const ramp = [
      "caption",
      "label",
      "small",
      "row",
      "body",
      "lede",
      "sub",
      "h",
    ].map(px);
    for (let i = 1; i < ramp.length; i++) {
      const prev = ramp[i - 1] ?? 0;
      const cur = ramp[i] ?? 0;
      expect(cur).toBeGreaterThan(prev);
    }
  });

  it("types no em dash in anything a person reads", () => {
    const hits = files
      .filter((p) => p.endsWith(".vue"))
      .filter((p) => {
        const src = read(p);
        const template = src.slice(
          src.indexOf("<template"),
          src.lastIndexOf("</template>"),
        );
        return template.includes("—");
      });
    expect(hits).toEqual([]);
  });
});

describe("voice in code", () => {
  it("types no em dash in any string a person could read", () => {
    // Templates are covered above; this is the script side: toasts, labels,
    // aria text, placeholders. A regex character class (data sanitising) is
    // not a string a person reads, so only quoted strings count.
    const quoted = /["'`][^"'`\n]*—[^"'`\n]*["'`]/;
    const hits = files.filter((p) => quoted.test(read(p)));
    expect(hits).toEqual([]);
  });
});
