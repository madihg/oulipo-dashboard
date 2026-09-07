import { describe, it, expect, beforeEach } from "vitest";
import {
  stage,
  settle,
  fail,
  failed,
  pending,
  replay,
  clearAll,
  subscribe,
} from "../src/lib/pendingWrites";

/**
 * The write-ahead log behind "notes not saving on mobile". A todo patch is
 * staged synchronously before the request leaves, and only cleared once the
 * server confirms THAT value - so a killed page, a failed write, or a
 * zero-row write (expired session) can all be replayed instead of vanishing.
 */

// jsdom gives us a real localStorage; make sure each test starts clean.
beforeEach(() => clearAll());

describe("pendingWrites", () => {
  it("stages a patch synchronously and reports it", () => {
    stage("t1", { notes: "hello" });
    expect(pending()).toEqual([{ id: "t1", patch: { notes: "hello" } }]);
  });

  it("merges repeated stages for the same todo", () => {
    stage("t1", { notes: "a" });
    stage("t1", { deadline: "2026-01-01" });
    stage("t1", { notes: "b" });
    expect(pending()).toEqual([
      { id: "t1", patch: { notes: "b", deadline: "2026-01-01" } },
    ]);
  });

  it("settle clears a confirmed value", () => {
    stage("t1", { notes: "done" });
    settle("t1", { notes: "done" });
    expect(pending()).toEqual([]);
  });

  it("settle KEEPS a newer edit made while the write was in flight", () => {
    stage("t1", { notes: "first" });
    // user types again before the "first" request comes back
    stage("t1", { notes: "second" });
    settle("t1", { notes: "first" }); // the older request confirms
    // "second" must survive - this is the data-loss case
    expect(pending()).toEqual([{ id: "t1", patch: { notes: "second" } }]);
  });

  it("settle only clears the confirmed keys, not the whole entry", () => {
    stage("t1", { notes: "n", title: "t" });
    settle("t1", { notes: "n" });
    expect(pending()).toEqual([{ id: "t1", patch: { title: "t" } }]);
  });

  it("survives a page reload (it is in localStorage, not memory)", () => {
    stage("t1", { notes: "survives" });
    // a fresh module read is what a reload does; pending() re-reads storage
    expect(pending()).toEqual([{ id: "t1", patch: { notes: "survives" } }]);
  });

  it("replay re-sends queued writes and clears the ones that land", async () => {
    stage("t1", { notes: "one" });
    stage("t2", { notes: "two" });
    const sent: Array<[string, unknown]> = [];
    const n = await replay(async (id, patch) => {
      sent.push([id, patch]);
      return id === "t1"; // t2's write fails again
    });
    expect(n).toBe(1);
    expect(sent).toHaveLength(2);
    // the failed one stays queued for the next attempt
    expect(pending()).toEqual([{ id: "t2", patch: { notes: "two" } }]);
  });

  it("a failed replay leaves the entry intact", async () => {
    stage("t1", { notes: "keep me" });
    await replay(async () => false);
    expect(pending()).toEqual([{ id: "t1", patch: { notes: "keep me" } }]);
  });
});

describe("pendingWrites subscribe", () => {
  it("hears stage, settle and clearAll", () => {
    const seen: number[] = [];
    const off = subscribe(() => seen.push(pending().length));
    stage("t1", { notes: "a" });
    stage("t2", { notes: "b" });
    settle("t1", { notes: "a" });
    clearAll();
    off();
    expect(seen).toEqual([1, 2, 1, 0]);
  });

  it("stops after unsubscribe", () => {
    let calls = 0;
    const off = subscribe(() => calls++);
    stage("t1", { notes: "a" });
    off();
    stage("t1", { notes: "b" });
    settle("t1", { notes: "b" });
    clearAll();
    expect(calls).toBe(1);
  });

  it("stays quiet when settle finds nothing to settle", () => {
    let calls = 0;
    const off = subscribe(() => calls++);
    settle("nope", { notes: "x" });
    off();
    expect(calls).toBe(0);
  });

  it("hears a replay that lands, through settle", async () => {
    stage("t1", { notes: "a" });
    let calls = 0;
    const off = subscribe(() => calls++);
    await replay(async () => true);
    off();
    expect(calls).toBe(1);
    expect(pending()).toEqual([]);
  });

  it("a throwing listener neither blocks the write nor its neighbours", () => {
    let heard = 0;
    const offBad = subscribe(() => {
      throw new Error("boom");
    });
    const offGood = subscribe(() => heard++);
    stage("t1", { notes: "still lands" });
    offBad();
    offGood();
    expect(heard).toBe(1);
    expect(pending()).toEqual([{ id: "t1", patch: { notes: "still lands" } }]);
  });
});

describe("pendingWrites fail", () => {
  it("fail marks, stage clears the mark, settle drops it, pending() keeps its shape", () => {
    stage("t1", { notes: "a" });
    expect(failed()).toEqual([]);

    fail("t1");
    expect(failed()).toEqual(["t1"]);
    // the mark never leaks into what callers replay
    expect(pending()).toEqual([{ id: "t1", patch: { notes: "a" } }]);

    // a new edit is a new attempt
    stage("t1", { notes: "b" });
    expect(failed()).toEqual([]);
    expect(pending()).toEqual([{ id: "t1", patch: { notes: "b" } }]);

    fail("t1");
    settle("t1", { notes: "b" });
    expect(failed()).toEqual([]);
    expect(pending()).toEqual([]);
  });

  it("stays quiet when fail finds nothing staged", () => {
    let calls = 0;
    const off = subscribe(() => calls++);
    fail("nope");
    off();
    expect(calls).toBe(0);
    expect(failed()).toEqual([]);
  });

  it("notifies listeners so the bar can change its word", () => {
    stage("t1", { notes: "a" });
    const seen: string[][] = [];
    const off = subscribe(() => seen.push(failed()));
    fail("t1");
    off();
    expect(seen).toEqual([["t1"]]);
  });

  it("a refused replay marks the entry failed and keeps it queued", async () => {
    stage("t1", { notes: "one" });
    stage("t2", { notes: "two" });
    await replay(async (id) => id === "t1");
    expect(failed()).toEqual(["t2"]);
    expect(pending()).toEqual([{ id: "t2", patch: { notes: "two" } }]);
  });

  it("writes the mark to storage, not just memory", () => {
    stage("t1", { notes: "a" });
    fail("t1");
    const raw = JSON.parse(
      localStorage.getItem("hmart:pending-todo-writes") ?? "{}",
    ) as Record<string, { failedAt?: number }>;
    expect(typeof raw.t1?.failedAt).toBe("number");
  });
});
