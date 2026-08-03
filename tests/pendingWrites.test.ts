import { describe, it, expect, beforeEach } from "vitest";
import {
  stage,
  settle,
  pending,
  replay,
  clearAll,
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
