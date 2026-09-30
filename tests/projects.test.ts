import { describe, it, expect, afterEach, vi } from "vitest";
import { createApp, h, nextTick, type App } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import { readFileSync } from "node:fs";
import { areaEmoji } from "../src/utils/areaEmoji";
import type { AreaRow, ProjectRow } from "../src/types/database";

/**
 * Projects have one page: each row is the project's key-result name, its
 * area's emoji in front, what it was called before in grey, and it opens the
 * project's board. The sidebar and the phone's areas page each link to it.
 */
vi.mock("../src/lib/supabase", () => {
  const chain = (): unknown => {
    const p: unknown = new Proxy(() => p, {
      get: (_t, key) =>
        key === "then"
          ? (resolve: (v: unknown) => void) =>
              resolve({ data: [], error: null })
          : () => p,
      apply: () => p,
    });
    return p;
  };
  return {
    supabase: {
      from: () => chain(),
      auth: {
        getSession: async () => ({ data: { session: null } }),
        onAuthStateChange: () => ({
          data: { subscription: { unsubscribe() {} } },
        }),
      },
      channel: () => ({ on: () => ({}), subscribe: () => ({}) }),
      removeChannel() {},
    },
  };
});

const area = (id: string, name: string, position: number) =>
  ({ id, user_id: "u", slug: id, name, position }) as unknown as AreaRow;
const project = (
  slug: string,
  name: string,
  area_id: string,
  position: number,
  notes: string | null,
) =>
  ({
    id: slug,
    user_id: "u",
    area_id,
    slug,
    name,
    notes,
    deadline: null,
    state: "active",
    cadence: null,
    cadence_target: null,
    position,
    obsidian_uri: null,
    created_at: "2026-09-30T00:00:00Z",
  }) as unknown as ProjectRow;

let app: App | null = null;
let host: HTMLElement | null = null;
afterEach(() => {
  app?.unmount();
  host?.remove();
  app = null;
  host = null;
});

describe("areaEmoji", () => {
  it("reads the emoji an area name starts with", () => {
    expect(areaEmoji("🩺 health")).toBe("🩺");
    expect(areaEmoji("💰earn")).toBe("💰");
    expect(areaEmoji("🗂️ admin")).toBe("🗂️");
    expect(areaEmoji("plain")).toBe("");
    expect(areaEmoji(null)).toBe("");
  });
});

describe("the projects page", () => {
  it("lists every project by area, with the emoji, and opens the board", async () => {
    const { default: Projects } = await import("../src/views/Projects.vue");
    const { useVaultStore } = await import("../src/stores/vault");
    const pinia = createPinia();
    setActivePinia(pinia);
    const vault = useVaultStore();
    vault.areas = [area("health", "🩺 health", 10), area("ship", "🚢 ship", 3)];
    vault.projects = [
      project("knee", "Knee 90% symmetry", "health", 0, "Knee health. OKR: x."),
      project("baby", "Baby HK Nov5", "ship", 2, "How to make a baby. OKR: y."),
      project("mind", "MrMind live Dec", "ship", 0, null),
    ];
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/:p(.*)*", component: { template: "<div />" } }],
    });
    host = document.createElement("div");
    document.body.appendChild(host);
    app = createApp({ render: () => h(Projects) });
    app.use(pinia).use(router).mount(host);
    await router.isReady();
    await nextTick();

    const rows = Array.from(
      host.querySelectorAll<HTMLAnchorElement>(".pj-row"),
    );
    // Area order (ship before health), then the project's own position.
    expect(rows.map((r) => r.querySelector(".pj-name")?.textContent)).toEqual([
      "MrMind live Dec",
      "Baby HK Nov5",
      "Knee 90% symmetry",
    ]);
    expect(rows.map((r) => r.querySelector(".pj-emoji")?.textContent)).toEqual([
      "🚢",
      "🚢",
      "🩺",
    ]);
    expect(rows[1]!.getAttribute("href")).toBe("/project/baby/kanban");
    expect(rows[1]!.querySelector(".pj-was")?.textContent).toBe(
      "How to make a baby",
    );
    expect(rows[1]!.getAttribute("title")).toBe("y.");
  });
});

describe("the way in", () => {
  const read = (p: string) => readFileSync(p, "utf8");
  it("is linked from the sidebar, the phone's areas page and the palette", () => {
    expect(read("src/router.ts")).toContain('path: "/projects"');
    expect(read("src/App.vue")).toContain('to="/projects"');
    expect(read("src/views/Areas.vue")).toContain('to="/projects"');
    expect(read("src/components/CommandPalette.vue")).toContain(
      'router.push("/projects")',
    );
  });

  it("offers a task only the projects of its own area", () => {
    const src = read("src/components/TodoEditor.vue");
    expect(src).toContain(".filter((p) => p.area_id === areaId.value)");
  });
});
