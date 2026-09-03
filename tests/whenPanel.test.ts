import { describe, it, expect, afterEach, vi } from "vitest";
import { createApp, h, nextTick, ref, type App } from "vue";
import WhenPanel from "../src/components/WhenPanel.vue";
import { todayISO, type WhenPatch } from "../src/utils/when";
import type { TodoState } from "../src/types/database";

/**
 * The "when" panel's contract: which control is lit, what each one emits, and
 * the roving-focus bookkeeping the grid needs to stay keyboard-operable.
 *
 * The rule worth the most here is the today-cell short-circuit. Clicking
 * today's square and pressing the "today" row look identical the instant you
 * do them, and diverge the next morning.
 */

let mounted: App | null = null;

interface H {
  patches: WhenPatch[];
  closes: number;
  rows: () => HTMLElement[];
  row: (label: string) => HTMLElement;
  cells: () => HTMLElement[];
  cell: (iso: string) => HTMLElement | undefined;
  todayCell: () => HTMLElement;
  clear: () => HTMLElement;
  grid: () => HTMLElement;
  set: (
    p: Partial<{
      state: TodoState;
      startDate: string | null;
      evening: boolean;
    }>,
  ) => Promise<void>;
}

async function mount(
  init: {
    state?: TodoState;
    startDate?: string | null;
    evening?: boolean;
  } = {},
): Promise<H> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const state = ref<TodoState>(init.state ?? "anytime");
  const startDate = ref<string | null>(init.startDate ?? null);
  const evening = ref(init.evening ?? false);
  const patches: WhenPatch[] = [];
  let closes = 0;

  mounted = createApp({
    setup: () => () =>
      h(WhenPanel, {
        state: state.value,
        startDate: startDate.value,
        evening: evening.value,
        onPick: (p: WhenPatch) => patches.push(p),
        onClose: () => {
          closes += 1;
        },
      }),
  });
  mounted.mount(host);
  await nextTick();

  const q = <T extends HTMLElement>(s: string) =>
    Array.from(document.querySelectorAll<T>(s));
  return {
    patches,
    get closes() {
      return closes;
    },
    rows: () => q<HTMLElement>(".wp-row"),
    row: (label) => {
      const r = q<HTMLElement>(".wp-row").find(
        (b) => b.textContent?.trim() === label,
      );
      if (!r) throw new Error(`no row "${label}"`);
      return r;
    },
    cells: () => q<HTMLElement>(".wp-cell"),
    cell: (iso) =>
      q<HTMLElement>(".wp-cell").find((c) => c.dataset.iso === iso),
    todayCell: () => {
      const c = document.querySelector<HTMLElement>(".wp-cell-today");
      if (!c) throw new Error("no today cell");
      return c;
    },
    clear: () => document.querySelector<HTMLElement>(".wp-clear")!,
    grid: () => document.querySelector<HTMLElement>(".wp-grid")!,
    set: async (p) => {
      if (p.state !== undefined) state.value = p.state;
      if (p.startDate !== undefined) startDate.value = p.startDate;
      if (p.evening !== undefined) evening.value = p.evening;
      await nextTick();
    },
  } as H;
}

afterEach(() => {
  mounted?.unmount();
  mounted = null;
  document.body.innerHTML = "";
});

const plus = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

describe("what each control emits", () => {
  it("picking TODAY'S SQUARE means today, not a dated anytime task", async () => {
    const h1 = await mount();
    h1.todayCell().click();
    // {anytime, start_date: today} would look the same now and still satisfy
    // belongsInToday tomorrow, so the task would sit in Today forever wearing
    // yesterday's date as its chip.
    expect(h1.patches.at(-1)).toEqual({
      state: "today",
      start_date: null,
      evening: false,
    });
    expect(h1.patches.at(-1)!.start_date).not.toBe(todayISO());
  });

  it("picking a future square schedules it for that date", async () => {
    const h1 = await mount();
    const iso = plus(9);
    h1.cell(iso)!.click();
    expect(h1.patches.at(-1)).toEqual({
      state: "anytime",
      start_date: iso,
      evening: false,
    });
  });

  it("the today row and this evening row differ only by the evening flag", async () => {
    const h1 = await mount();
    h1.row("today").click();
    h1.row("this evening").click();
    expect(h1.patches).toEqual([
      { state: "today", start_date: null, evening: false },
      { state: "today", start_date: null, evening: true },
    ]);
  });

  it("someday and clear", async () => {
    const h1 = await mount();
    h1.row("someday").click();
    h1.clear().click();
    expect(h1.patches).toEqual([
      { state: "someday", start_date: null, evening: false },
      { state: "anytime", start_date: null, evening: false },
    ]);
  });

  it("closes after every pick, so one gesture finishes the job", async () => {
    const h1 = await mount();
    h1.row("today").click();
    h1.clear().click();
    h1.todayCell().click();
    expect(h1.closes).toBe(3);
  });

  it("a pad cell is inert", async () => {
    const h1 = await mount();
    const pads = h1.cells().filter((c) => c.classList.contains("wp-cell-pad"));
    for (const p of pads) p.click();
    expect(h1.patches).toHaveLength(0);
  });
});

describe("what is lit", () => {
  it("lights exactly one quick row and no cell for a row-shaped when", async () => {
    const h1 = await mount({ state: "today" });
    expect(document.querySelectorAll(".wp-row-on")).toHaveLength(1);
    expect(document.querySelector(".wp-row-on")!.textContent!.trim()).toBe(
      "today",
    );
    expect(document.querySelectorAll(".wp-cell-on")).toHaveLength(0);

    await h1.set({ evening: true });
    expect(document.querySelector(".wp-row-on")!.textContent!.trim()).toBe(
      "this evening",
    );

    await h1.set({ state: "someday", evening: false });
    expect(document.querySelector(".wp-row-on")!.textContent!.trim()).toBe(
      "someday",
    );
    expect(document.querySelectorAll(".wp-cell-on")).toHaveLength(0);
  });

  it("fills exactly one cell and no row for a dated when", async () => {
    const iso = plus(11);
    await mount({ state: "anytime", startDate: iso });
    expect(document.querySelectorAll(".wp-row-on")).toHaveLength(0);
    const on = document.querySelectorAll<HTMLElement>(".wp-cell-on");
    expect(on).toHaveLength(1);
    expect(on[0]!.dataset.iso).toBe(iso);
  });

  it("a legacy {anytime, start_date: today} row lights the ROW, not both", async () => {
    // effectiveWhen reads that as "today"; lighting the row and the cell would
    // claim two different whens are active at once.
    await mount({ state: "anytime", startDate: todayISO() });
    expect(document.querySelectorAll(".wp-row-on")).toHaveLength(1);
    expect(document.querySelectorAll(".wp-cell-on")).toHaveLength(0);
  });

  it("lights nothing at all when the task has no when", async () => {
    await mount({ state: "anytime", startDate: null });
    expect(document.querySelectorAll(".wp-row-on")).toHaveLength(0);
    expect(document.querySelectorAll(".wp-cell-on")).toHaveLength(0);
  });

  it("never lights a row and a cell at the same time", async () => {
    const h1 = await mount();
    const cases: Array<[TodoState, string | null, boolean]> = [
      ["today", null, false],
      ["today", null, true],
      ["someday", null, false],
      ["anytime", null, false],
      ["anytime", todayISO(), false],
      ["anytime", plus(1), false],
      ["anytime", plus(20), false],
    ];
    for (const [state, startDate, evening] of cases) {
      await h1.set({ state, startDate, evening });
      const rows = document.querySelectorAll(".wp-row-on").length;
      const cells = document.querySelectorAll(".wp-cell-on").length;
      expect(
        rows + cells,
        `${state}/${startDate}/${evening}`,
      ).toBeLessThanOrEqual(1);
    }
  });
});

describe("grid accessibility", () => {
  it("marks today once, and only today", async () => {
    await mount();
    expect(document.querySelectorAll('[aria-current="date"]')).toHaveLength(1);
    expect(document.querySelector('[aria-current="date"]')).toBe(
      document.querySelector(".wp-cell-today"),
    );
  });

  it("marks the selection with aria-selected and nothing else", async () => {
    const iso = plus(6);
    await mount({ state: "anytime", startDate: iso });
    const sel = document.querySelectorAll<HTMLElement>(
      '[aria-selected="true"]',
    );
    expect(sel).toHaveLength(1);
    expect(sel[0]!.dataset.iso).toBe(iso);
    // Never aria-selected="false" on the other forty-odd cells.
    expect(document.querySelectorAll('[aria-selected="false"]')).toHaveLength(
      0,
    );
  });

  it("keeps exactly one cell in the tab order", async () => {
    await mount();
    expect(document.querySelectorAll('.wp-cell[tabindex="0"]')).toHaveLength(1);
  });

  it("names every real cell and no pad cell", async () => {
    const h1 = await mount();
    for (const c of h1.cells()) {
      const named = !!c.getAttribute("aria-label");
      expect(named).toBe(!c.classList.contains("wp-cell-pad"));
    }
  });

  it("is a real grid, so rows and cells have roles without hand-authoring them", async () => {
    await mount();
    expect(document.querySelector('[role="grid"]')).toBeTruthy();
    expect(
      document.querySelectorAll('[role="gridcell"]').length,
    ).toBeGreaterThan(20);
    expect(document.querySelectorAll(".wp-grid thead th")).toHaveLength(7);
  });

  it("opens the tab stop on the selected date when there is one", async () => {
    const iso = plus(15);
    await mount({ state: "anytime", startDate: iso });
    const tabbable = document.querySelector<HTMLElement>(
      '.wp-cell[tabindex="0"]',
    );
    expect(tabbable!.dataset.iso).toBe(iso);
  });
});

describe("keyboard", () => {
  const key = (el: HTMLElement, k: string, shiftKey = false) => {
    const e = new KeyboardEvent("keydown", {
      key: k,
      bubbles: true,
      cancelable: true,
      shiftKey,
    });
    el.dispatchEvent(e);
    return e;
  };
  const caret = () =>
    document.querySelector<HTMLElement>('.wp-cell[tabindex="0"]')!.dataset.iso;

  it("moves by a day and by a week", async () => {
    const h1 = await mount({ state: "anytime", startDate: plus(10) });
    key(h1.grid(), "ArrowRight");
    await nextTick();
    expect(caret()).toBe(plus(11));
    key(h1.grid(), "ArrowDown");
    await nextTick();
    expect(caret()).toBe(plus(18));
    key(h1.grid(), "ArrowUp");
    await nextTick();
    expect(caret()).toBe(plus(11));
  });

  it("jumps four weeks on PageDown, staying in the same column", async () => {
    const h1 = await mount({ state: "anytime", startDate: plus(10) });
    key(h1.grid(), "PageDown");
    await nextTick();
    expect(caret()).toBe(plus(38));
  });

  it("cannot walk into the past", async () => {
    const h1 = await mount();
    for (let i = 0; i < 5; i++) {
      key(h1.grid(), "ArrowLeft");
      await nextTick();
    }
    expect(caret()).toBe(todayISO());
  });

  it("selects on Enter", async () => {
    const h1 = await mount({ state: "anytime", startDate: plus(10) });
    key(h1.grid(), "ArrowRight");
    await nextTick();
    key(h1.grid(), "Enter");
    expect(h1.patches.at(-1)).toEqual({
      state: "anytime",
      start_date: plus(11),
      evening: false,
    });
  });

  it("claims the keys it handles so the page does not also scroll", async () => {
    const h1 = await mount();
    for (const k of ["ArrowRight", "ArrowDown", "PageDown", "Home", "End"]) {
      expect(key(h1.grid(), k).defaultPrevented, k).toBe(true);
    }
  });

  it("leaves other keys alone", async () => {
    const h1 = await mount();
    expect(key(h1.grid(), "a").defaultPrevented).toBe(false);
    expect(key(h1.grid(), "Escape").defaultPrevented).toBe(false);
  });
});

describe("drag containment", () => {
  it("swallows dragstart so the task row underneath is not dragged", async () => {
    await mount();
    const panel = document.querySelector<HTMLElement>(".wp")!;
    const cell = document.querySelector<HTMLElement>(
      ".wp-cell:not(.wp-cell-pad)",
    )!;
    const e = new Event("dragstart", { bubbles: true, cancelable: true });
    cell.dispatchEvent(e);
    // The picker is a DOM descendant of a draggable="true" task row.
    expect(e.defaultPrevented).toBe(true);
    expect(panel.contains(cell)).toBe(true);
  });
});

describe("selections the grid does not offer", () => {
  const past = () => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const farFuture = () => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 3);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  it("keeps the grid keyboard-reachable when the date is in the PAST", async () => {
    // The calendar starts at today's week, so a past start_date has no square.
    // Parking the caret on it left every cell at tabindex="-1" and the whole
    // calendar unreachable from the keyboard.
    await mount({ state: "anytime", startDate: past() });
    expect(document.querySelectorAll('.wp-cell[tabindex="0"]')).toHaveLength(1);
  });

  it("keeps it reachable when the date is beyond the offered range", async () => {
    await mount({ state: "anytime", startDate: farFuture() });
    expect(document.querySelectorAll('.wp-cell[tabindex="0"]')).toHaveLength(1);
  });

  it("falls back to today rather than an absent square", async () => {
    await mount({ state: "anytime", startDate: past() });
    const tabbable = document.querySelector<HTMLElement>(
      '.wp-cell[tabindex="0"]',
    );
    expect(tabbable!.dataset.iso).toBe(todayISO());
    expect(tabbable!.classList.contains("wp-cell-today")).toBe(true);
  });

  it("still lights nothing, since the date genuinely is not on screen", async () => {
    await mount({ state: "anytime", startDate: past() });
    expect(document.querySelectorAll(".wp-cell-on")).toHaveLength(0);
  });

  it("arrow keys still work from the fallback caret", async () => {
    const h1 = await mount({ state: "anytime", startDate: past() });
    h1.grid().dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowRight",
        bubbles: true,
        cancelable: true,
      }),
    );
    await nextTick();
    const now = new Date();
    now.setDate(now.getDate() + 1);
    const tomorrow = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    expect(
      document.querySelector<HTMLElement>('.wp-cell[tabindex="0"]')!.dataset
        .iso,
    ).toBe(tomorrow);
  });
});

describe("the day turning underneath an open panel", () => {
  it("writes 'today' for whichever square it DREW as today", async () => {
    // The grid is built once per open. If it were compared against a freshly
    // read todayISO() at click time, a panel left open across midnight would
    // draw a star on one square and write a plain start_date for it - a date
    // that is in the past by then.
    const h1 = await mount();
    const star = h1.todayCell();
    expect(star.dataset.iso).toBe(todayISO());
    star.click();
    expect(h1.patches.at(-1)).toEqual({
      state: "today",
      start_date: null,
      evening: false,
    });
  });

  it("listens for the app coming back to the foreground", async () => {
    const add = vi.spyOn(document, "addEventListener");
    await mount();
    expect(add.mock.calls.some((c) => c[0] === "visibilitychange")).toBe(true);
    add.mockRestore();
  });

  it("stops listening when it closes", async () => {
    const remove = vi.spyOn(document, "removeEventListener");
    await mount();
    mounted?.unmount();
    mounted = null;
    expect(remove.mock.calls.some((c) => c[0] === "visibilitychange")).toBe(
      true,
    );
    remove.mockRestore();
  });
});
