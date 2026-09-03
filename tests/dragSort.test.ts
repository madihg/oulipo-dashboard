import { describe, it, expect, vi } from "vitest";
import { switchesToManual } from "../src/composables/useListDragReorder";

// The composable imports the vault store, which builds a Supabase client whose
// auth auto-refresh then runs against jsdom's storage. Stub it: this file tests
// a pure helper.
vi.mock("../src/lib/supabase", () => ({
  supabase: {
    from: () => ({}),
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
import type { SortMode } from "../src/stores/listControls";

/**
 * Dropping a row is a request for manual order, whatever sort was active.
 *
 * It used to switch only for the purely computed sorts (a to z, deadline,
 * newest), on the theory that "priority" and "context" tie-break on position
 * and so are already manual within a section. But a drop inside those leaves
 * the sort menu still saying priority, so the next reload re-sorts and the
 * order you just made looks lost. Halim: switch to manual the second a task
 * moves, and remember it. The remembering is in two places that already
 * exist: positions in the DB, and the sort mode per route in localStorage.
 */
describe("switchesToManual", () => {
  const ALL: SortMode[] = [
    "priority",
    "deadline",
    "created",
    "manual",
    "alpha",
    "context",
  ];

  it("switches for EVERY sort mode except manual itself", () => {
    for (const mode of ALL) {
      expect(switchesToManual(mode), mode).toBe(mode !== "manual");
    }
  });

  it("includes the section-based sorts that used to be exempt", () => {
    // These tie-break on position, but the menu still names them, so a drop
    // inside one must flip the menu too or the order is lost on reload.
    expect(switchesToManual("priority")).toBe(true);
    expect(switchesToManual("context")).toBe(true);
  });

  it("is a no-op once already manual, so a drop cannot spam the toast", () => {
    expect(switchesToManual("manual")).toBe(false);
  });
});
