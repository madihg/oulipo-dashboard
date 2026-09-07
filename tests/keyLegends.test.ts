import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { createApp, nextTick, type App } from "vue";
import ShortcutsHelp from "../src/components/ShortcutsHelp.vue";
import { IS_APPLE, MOD } from "../src/lib/platform";

/**
 * One spelling for the modifier key. The palette opens on metaKey or ctrlKey
 * (CommandPalette.vue), so a "⌘k" legend was wrong for everyone not on a Mac,
 * while the format bar already named the same chord "cmd" / "ctrl". Every
 * legend now takes the word from src/lib/platform.ts.
 */
const LEGENDS = [
  "src/components/CommandPalette.vue",
  "src/components/ShortcutsHelp.vue",
  "src/App.vue",
];
const read = (p: string) => readFileSync(p, "utf8");
const templateOf = (src: string) =>
  src.slice(src.indexOf("<template"), src.lastIndexOf("</template>"));

describe("key legends", () => {
  it("names the modifier in the platform's own word", () => {
    expect(MOD).toBe(IS_APPLE ? "cmd" : "ctrl");
  });

  it("takes that word from the shared module, never a glyph", () => {
    for (const p of LEGENDS) {
      const src = read(p);
      expect(src, p).not.toContain("⌘");
      expect(src, p).toMatch(/import \{[^}]*\bMOD\b[^}]*\} from "\.\.?\/lib\/platform";/);
    }
    // The palette's footer and the help rows both interpolate it.
    expect(templateOf(read(LEGENDS[0]!))).toContain("/ or {{ MOD }} k");
    expect(read(LEGENDS[1]!)).toContain('[`${MOD} k`, "command palette"]');
    expect(read(LEGENDS[1]!)).toContain(
      '[`${MOD} click`, "add to the selection"]',
    );
  });

  describe("rendered help", () => {
    let app: App | null = null;
    let host: HTMLElement | null = null;
    afterEach(() => {
      app?.unmount();
      host?.remove();
      app = null;
      host = null;
    });

    it("shows the word beside the key", async () => {
      host = document.createElement("div");
      document.body.appendChild(host);
      app = createApp(ShortcutsHelp);
      const vm = app.mount(host) as unknown as { show: () => void };
      vm.show();
      await nextTick();
      const keys = Array.from(document.body.querySelectorAll("kbd.sh-key")).map(
        (k) => k.textContent?.trim(),
      );
      expect(keys).toContain(`${MOD} k`);
      expect(keys).toContain(`${MOD} click`);
      expect(document.body.textContent).not.toContain("⌘");
    });
  });
});
