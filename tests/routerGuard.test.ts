import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * A tap on a tab must never wait on the network. The guard used to await
 * getSession() on every navigation; that call queues behind a token refresh,
 * so after the phone woke the tab bar looked alive and did nothing.
 */
describe("the router guard", () => {
  const src = readFileSync("src/router.ts", "utf8");
  const guard = src.slice(src.indexOf("router.beforeEach"));

  it("answers from the known session before asking anything", () => {
    const known = guard.indexOf("if (knownSession()) return true;");
    const asks = guard.indexOf("getSession()");
    expect(known).toBeGreaterThan(-1);
    expect(asks).toBeGreaterThan(known);
  });

  it("never waits longer than its cap, and lets a slow answer through", () => {
    expect(src).toMatch(/const GUARD_WAIT_MS = \d+;/);
    expect(guard).toContain("Promise.race([asked, waited])");
    expect(guard).toContain('if (answer === "out")');
  });
});
