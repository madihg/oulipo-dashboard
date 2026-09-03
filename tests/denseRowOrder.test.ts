import { describe, it, expect, afterEach, vi } from "vitest";
import { createApp, h, nextTick, type App } from "vue";
import { createPinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import type { TodoRow } from "../src/types/database";

/**
 * A row reads as its working mode: priority, area, CONTEXT, then the title -
 * "p0 earn email Rula ...". The context chip used to trail the title with the
 * other tags, where it read as an afterthought. On a phone every freeform tag
 * chip hides, but the context chip must stay: it carries the d-tag-ctx hook
 * that the phone CSS exempts from display:none.
 */

vi.mock("../src/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null }) }),
      }),
    }),
    auth: {
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe() {} } },
      }),
    },
    channel: () => ({
      on() {
        return this;
      },
      subscribe() {
        return this;
      },
    }),
    removeChannel() {},
  },
}));

let app: App | null = null;

const todo = (over: Partial<TodoRow> & { tags?: string[] }): TodoRow =>
  ({
    id: over.id ?? "t1",
    user_id: "u",
    area_id: null,
    project_id: null,
    heading_id: null,
    title: "x",
    notes: null,
    state: "anytime",
    priority: null,
    start_date: null,
    deadline: null,
    evening: false,
    completed_at: null,
    position: 0,
    obsidian_uri: null,
    drafts: null,
    metadata: null,
    created_at: "2026-09-01T00:00:00Z",
    ...over,
  }) as TodoRow;

async function mountRow(t: TodoRow) {
  const { default: DenseRow } =
    await import("../src/components/dense/DenseRow.vue");
  const { useVaultStore } = await import("../src/stores/vault");
  const host = document.createElement("div");
  document.body.appendChild(host);
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/:pathMatch(.*)*", component: { render: () => null } }],
  });
  app = createApp({
    setup: () => () => h(DenseRow, { todo: t, showArea: true }),
  });
  app.use(pinia).use(router);
  const vault = useVaultStore(pinia);
  vault.areas = [
    {
      id: "a-earn",
      user_id: "u",
      slug: "earn",
      name: "💰 earn",
      position: 0,
      color: null,
      icon: null,
      created_at: "",
    },
  ] as never;
  app.mount(host);
  await nextTick();
  return document.querySelector<HTMLElement>(".d-row")!;
}

/** The row's meaningful children, in DOM order, as short labels. */
function order(row: HTMLElement): string[] {
  return Array.from(row.children)
    .map((el) => {
      const c = el.className;
      if (c.includes("d-pri")) return "pri";
      if (c.includes("d-area-chip")) return "area";
      if (c.includes("d-tag-ctx")) return "ctx:" + el.textContent!.trim();
      if (c.includes("d-tag-chip")) return "tag:" + el.textContent!.trim();
      if (c.includes("d-title")) return "title";
      return null;
    })
    .filter((x): x is string => !!x);
}

afterEach(() => {
  app?.unmount();
  app = null;
  document.body.innerHTML = "";
});

describe("dense row reading order", () => {
  it("puts priority, area and the context chip BEFORE the title", async () => {
    const row = await mountRow(
      todo({ priority: "P0", area_id: "a-earn", tags: ["email", "residency"] }),
    );
    expect(order(row)).toEqual([
      "pri",
      "area",
      "ctx:email",
      "tag:residency",
      "title",
    ]);
  });

  it("marks only context tags with the phone-visible hook", async () => {
    const row = await mountRow(todo({ tags: ["buy", "web", "residency"] }));
    const ctx = Array.from(row.querySelectorAll(".d-tag-ctx")).map((e) =>
      e.textContent!.trim(),
    );
    const free = Array.from(
      row.querySelectorAll(".d-tag-chip:not(.d-tag-ctx)"),
    ).map((e) => e.textContent!.trim());
    // Two chips are shown at most; contexts sort first, so web and buy win.
    expect(ctx).toEqual(["web", "buy"]);
    expect(free).toEqual(["+1"]);
  });

  it("orders contexts canonically ahead of freeform tags", async () => {
    const row = await mountRow(todo({ tags: ["residency", "notes"] }));
    expect(order(row)).toEqual(["ctx:notes", "tag:residency", "title"]);
  });

  it("renders no chip at all for an untagged row", async () => {
    const row = await mountRow(todo({}));
    expect(order(row)).toEqual(["title"]);
  });
});
