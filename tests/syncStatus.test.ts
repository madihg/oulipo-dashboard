import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createApp, h, nextTick, type App } from "vue";
import DenseStatusBar from "../src/components/dense/DenseStatusBar.vue";
import { stage, settle, fail, clearAll } from "../src/lib/pendingWrites";

/**
 * The status bar speaks only when something needs saying. It reads one shared
 * sync state (useSyncStatus): a singleton with one realtime channel for the
 * whole app, not one per view. The right-hand span is a permanent live region,
 * so "nothing to say" is an empty region, never a missing one. The supabase
 * client is mocked so the channel is a recorder: `subscribe` keeps the
 * callback and the test drives it.
 */
const rt = vi.hoisted(() => {
  type Cb = (status: string) => void;
  type Chan = { subscribe(cb: Cb): Chan };
  const callbacks: Cb[] = [];
  const channel = vi.fn((): Chan => {
    const chan: Chan = {
      subscribe(cb) {
        callbacks.push(cb);
        return chan;
      },
    };
    return chan;
  });
  return { callbacks, channel };
});
vi.mock("../src/lib/supabase", () => ({
  supabase: { channel: rt.channel, removeChannel: async () => "ok" },
}));

let app: App | null = null;
async function mount(props: {
  rows?: number;
  groups?: number;
  extra?: string[];
}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  app = createApp({ setup: () => () => h(DenseStatusBar, props) });
  app.mount(host);
  await nextTick();
}
/** Drive the recorded realtime callback(s) with a channel status. */
async function socket(status: string) {
  for (const cb of rt.callbacks) cb(status);
  await nextTick();
}
const footer = () => document.querySelector(".d-status")?.textContent ?? "";
const left = () =>
  Array.from(document.querySelectorAll(".d-status-seg"))
    .map((s) => s.textContent ?? "")
    .join("");
const right = () => document.querySelector(".d-status-say");

beforeEach(() => clearAll());
afterEach(() => {
  app?.unmount();
  app = null;
  document.body.innerHTML = "";
  clearAll();
});

describe("DenseStatusBar", () => {
  it("renders the rows count", async () => {
    await mount({ rows: 12 });
    expect(left()).toBe("12 rows");
  });

  it("joins groups and extras with a middle dot, never a dash", async () => {
    await mount({ rows: 12, groups: 3, extra: ["area · sf"] });
    expect(left().replace(/\s+/g, " ")).toBe("12 rows · 3 groups · area · sf");
    expect(left()).not.toContain("-");
  });

  it("says saving while writes are staged, then nothing once they settle", async () => {
    await mount({ rows: 12 });
    await socket("SUBSCRIBED");
    expect(right()?.textContent?.trim()).toBe("");

    stage("t1", { notes: "a" });
    stage("t2", { notes: "b" });
    await nextTick();
    expect(right()?.textContent?.trim()).toBe("saving 2");
    expect(right()?.querySelector(".dot")).not.toBeNull();

    settle("t1", { notes: "a" });
    await nextTick();
    expect(right()?.textContent?.trim()).toBe("saving 1");

    settle("t2", { notes: "b" });
    await nextTick();
    // Silence is the good state: no word, no dot.
    expect(right()?.textContent?.trim()).toBe("");
    expect(document.querySelector(".d-status .dot")).toBeNull();
    expect(footer()).not.toContain("last sync");
  });

  it("says offline when the browser goes offline, and drops it when it returns", async () => {
    await mount({ rows: 12 });
    await socket("SUBSCRIBED");
    // The live region is there before it has anything to say: a screen reader
    // hears a change of words, not a node that appears already spoken.
    const region = right();
    expect(region?.getAttribute("role")).toBe("status");
    expect(region?.getAttribute("aria-atomic")).toBe("true");
    window.dispatchEvent(new Event("offline"));
    await nextTick();
    expect(right()).toBe(region);
    expect(right()?.textContent?.trim()).toBe("offline");
    expect(right()?.classList.contains("d-status-say-offline")).toBe(true);

    window.dispatchEvent(new Event("online"));
    await nextTick();
    expect(right()?.textContent?.trim()).toBe("");
  });

  it("says offline over saving: it is the reason nothing moves", async () => {
    await mount({ rows: 12 });
    await socket("SUBSCRIBED");
    stage("t1", { notes: "a" });
    window.dispatchEvent(new Event("offline"));
    await nextTick();
    expect(right()?.textContent?.trim()).toBe("offline");
    window.dispatchEvent(new Event("online"));
    await nextTick();
    expect(right()?.textContent?.trim()).toBe("saving 1");
  });

  it("says unsaved once a staged write is refused, saving again after a re-stage", async () => {
    await mount({ rows: 12 });
    await socket("SUBSCRIBED");
    stage("t1", { notes: "a" });
    await nextTick();
    expect(right()?.textContent?.trim()).toBe("saving 1");

    // The server said no: the write is not in flight, so "saving" would lie.
    fail("t1");
    await nextTick();
    expect(right()?.textContent?.trim()).toBe("1 unsaved");
    expect(right()?.classList.contains("d-status-say-unsaved")).toBe(true);
    expect(right()?.classList.contains("d-status-say-saving")).toBe(false);
    expect(right()?.querySelector(".dot")).not.toBeNull();

    // A new edit is a new attempt: the word goes back to saving.
    stage("t1", { notes: "b" });
    await nextTick();
    expect(right()?.textContent?.trim()).toBe("saving 1");
    expect(right()?.classList.contains("d-status-say-unsaved")).toBe(false);

    settle("t1", { notes: "b" });
    await nextTick();
    expect(right()?.textContent?.trim()).toBe("");
    expect(document.querySelector(".d-status .dot")).toBeNull();
  });

  it("says reconnecting when the socket drops while online", async () => {
    await mount({ rows: 12 });
    await socket("CHANNEL_ERROR");
    expect(right()?.textContent?.trim()).toBe("reconnecting");
    expect(right()?.classList.contains("d-status-say-reconnecting")).toBe(true);

    await socket("SUBSCRIBED");
    expect(right()?.textContent?.trim()).toBe("");
  });

  it("opens one realtime channel across every mount", async () => {
    await mount({ rows: 1 });
    app?.unmount();
    document.body.innerHTML = "";
    await mount({ rows: 2 });
    expect(rt.channel).toHaveBeenCalledTimes(1);
    expect(rt.callbacks).toHaveLength(1);
  });

  it("carries the caption recipe from main.css instead of its own copy", async () => {
    await mount({ rows: 12 });
    const el = document.querySelector("footer.d-status");
    expect(el?.classList.contains("cap")).toBe(true);
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/components/dense/DenseStatusBar.vue", "utf8");
    expect(src).not.toContain("font-family");
    expect(src).not.toContain("text-transform");
    expect(src).not.toContain("box-shadow");
    expect(src).not.toContain("--d-status-text");
    expect(src).not.toContain("last sync");
  });
});
