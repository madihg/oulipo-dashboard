import { describe, expect, it } from "vitest";
import {
  claudeMetaOf,
  pendingClaudeMetaOf,
  resolveSuggestedArea,
  type ClaudeMeta,
} from "../src/types/claude";
import type { AreaRow, TodoRow } from "../src/types/database";

function area(slug: string, name: string): AreaRow {
  return {
    id: `id-${slug}`,
    user_id: "u",
    slug,
    name,
    position: 0,
    color: null,
    icon: null,
    created_at: "2026-08-01T00:00:00Z",
  };
}

// The real areas carry emoji in their display name but a clean slug.
const AREAS = [
  area("health", "🩺 health"),
  area("apply", "📮 apply"),
  area("earn", "💲earn"),
  area("structure", "🔭 structure"),
];

function meta(over: Partial<ClaudeMeta> = {}): ClaudeMeta {
  return { suggested: true, kind: "task", source: "gmail", ...over };
}

describe("resolveSuggestedArea", () => {
  it("matches on slug", () => {
    expect(
      resolveSuggestedArea(meta({ suggested_area: "health" }), AREAS)?.id,
    ).toBe("id-health");
  });

  it("matches the emoji display name, ignoring emoji and spacing", () => {
    expect(
      resolveSuggestedArea(meta({ suggested_area: "🩺 health" }), AREAS)?.id,
    ).toBe("id-health");
    expect(
      resolveSuggestedArea(meta({ suggested_area: "💲earn" }), AREAS)?.id,
    ).toBe("id-earn");
  });

  it("is case and whitespace insensitive", () => {
    expect(
      resolveSuggestedArea(meta({ suggested_area: "  APPLY " }), AREAS)?.id,
    ).toBe("id-apply");
  });

  it("returns null when the suggestion is missing or unknown", () => {
    expect(resolveSuggestedArea(meta(), AREAS)).toBeNull();
    expect(
      resolveSuggestedArea(meta({ suggested_area: "" }), AREAS),
    ).toBeNull();
    expect(
      resolveSuggestedArea(meta({ suggested_area: "nonsense" }), AREAS),
    ).toBeNull();
  });

  it("returns null rather than guessing when there are no areas loaded", () => {
    expect(
      resolveSuggestedArea(meta({ suggested_area: "health" }), []),
    ).toBeNull();
  });
});

describe("claudeMetaOf", () => {
  const base = { id: "t1", title: "x" } as unknown as TodoRow;

  it("reads a suggested row", () => {
    const t = {
      ...base,
      metadata: { claude: meta({ suggested_area: "apply" }) },
    } as TodoRow;
    expect(claudeMetaOf(t)?.suggested_area).toBe("apply");
  });

  it("ignores rows without the claude namespace", () => {
    expect(claudeMetaOf({ ...base, metadata: {} } as TodoRow)).toBeNull();
    expect(claudeMetaOf({ ...base, metadata: null } as TodoRow)).toBeNull();
    expect(
      claudeMetaOf({ ...base, metadata: { reservoir: { x: 1 } } } as TodoRow),
    ).toBeNull();
  });
});

describe("pendingClaudeMetaOf - the from-claude section filter", () => {
  const base = { id: "t1", title: "x" } as unknown as TodoRow;
  function withStatus(status?: ClaudeMeta["status"]): TodoRow {
    return {
      ...base,
      metadata: { claude: meta(status ? { status } : {}) },
    } as TodoRow;
  }

  it("renders proposed, done, and status-less rows", () => {
    expect(pendingClaudeMetaOf(withStatus())).not.toBeNull();
    expect(pendingClaudeMetaOf(withStatus("proposed"))).not.toBeNull();
    expect(pendingClaudeMetaOf(withStatus("done"))).not.toBeNull();
  });

  it("hides kept AND approved rows - approve files immediately (2026-08-18)", () => {
    expect(pendingClaudeMetaOf(withStatus("kept"))).toBeNull();
    expect(pendingClaudeMetaOf(withStatus("approved"))).toBeNull();
  });

  it("hides dismissed and merged tombstones", () => {
    expect(pendingClaudeMetaOf(withStatus("dismissed"))).toBeNull();
    expect(pendingClaudeMetaOf(withStatus("merged"))).toBeNull();
  });

  it("still ignores non-claude rows", () => {
    expect(
      pendingClaudeMetaOf({ ...base, metadata: {} } as TodoRow),
    ).toBeNull();
  });
});
