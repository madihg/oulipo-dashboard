import { describe, it, expect } from "vitest";
import { parseDebrief, extractArtifacts } from "../src/utils/debrief";
import type { DebriefBlock, DebriefItem } from "../src/utils/debrief";
import type { ArtifactLink } from "../src/types/artifacts";

/** tsconfig sets noUncheckedIndexedAccess, so narrow through helpers. */
function listAt(blocks: DebriefBlock[], i: number): DebriefItem[] {
  const b = blocks[i];
  if (!b || b.t !== "list") throw new Error(`expected a list block at ${i}`);
  return b.items;
}
function only(arts: ArtifactLink[]): ArtifactLink {
  const a = arts[0];
  if (!a) throw new Error("expected at least one artifact");
  return a;
}
function itemAt(items: DebriefItem[], i: number): DebriefItem {
  const it = items[i];
  if (!it) throw new Error(`expected an item at ${i}`);
  return it;
}

describe("extractArtifacts", () => {
  it("lifts a doc link out of the prose and types it", () => {
    const r = extractArtifacts(
      "3:00pm yi - [Yi proposal](https://docs.google.com/document/d/abc/edit)",
    );
    expect(r.text).toBe("3:00pm yi");
    expect(r.artifacts).toEqual([
      {
        url: "https://docs.google.com/document/d/abc/edit",
        title: "Yi proposal",
        kind: "doc",
      },
    ]);
  });

  it("keeps several links in the order they appear", () => {
    const r = extractArtifacts(
      "saf sync [List](https://docs.google.com/spreadsheets/d/s1) [Brief](https://docs.google.com/document/d/d1)",
    );
    expect(r.artifacts.map((a) => a.title)).toEqual(["List", "Brief"]);
    expect(r.artifacts.map((a) => a.kind)).toEqual(["sheet", "doc"]);
    expect(r.text).toBe("saf sync");
  });

  it("infers folder and generic link kinds", () => {
    expect(
      only(
        extractArtifacts("[F](https://drive.google.com/drive/folders/x)")
          .artifacts,
      ).kind,
    ).toBe("folder");
    expect(
      only(extractArtifacts("[L](https://example.com/x)").artifacts).kind,
    ).toBe("link");
  });

  it("leaves a line with no links completely untouched", () => {
    const line = "11:00 stan pt, and a bare url https://example.com/a";
    expect(extractArtifacts(line)).toEqual({ text: line, artifacts: [] });
  });

  it("does not treat a non-https markdown link as a chip", () => {
    const line = "[x](http://insecure.example/a)";
    const r = extractArtifacts(line);
    expect(r.artifacts).toEqual([]);
    expect(r.text).toBe(line);
  });

  it("falls back to the host when the title is empty", () => {
    const r = extractArtifacts("[ ](https://docs.google.com/document/d/abc)");
    expect(only(r.artifacts).title).toBe("docs.google.com/document/d/abc");
  });
});

describe("parseDebrief", () => {
  it("parses heads, bullets, gaps and paragraphs", () => {
    const blocks = parseDebrief(
      "## today\n- one\n- two\n\nplain line\n## next\n- three",
    );
    expect(blocks.map((b) => b.t)).toEqual([
      "head",
      "list",
      "gap",
      "line",
      "head",
      "list",
    ]);
    expect(listAt(blocks, 1).map((i) => i.text)).toEqual(["one", "two"]);
  });

  it("attaches chips to the bullet they were written on", () => {
    const blocks = parseDebrief(
      [
        "## coming up",
        "- mon 1pm, yi [Proposal](https://docs.google.com/document/d/yi)",
        "- tue 4pm, saf",
      ].join("\n"),
    );
    const items = listAt(blocks, 1);
    expect(itemAt(items, 0).artifacts).toHaveLength(1);
    expect(itemAt(items, 0).text).toBe("mon 1pm, yi");
    expect(itemAt(items, 1).artifacts).toHaveLength(0);
  });

  it("closes the list when a head follows bullets", () => {
    expect(parseDebrief("- a\n## h\n- b").map((b) => b.t)).toEqual([
      "list",
      "head",
      "list",
    ]);
  });

  it("survives an empty body", () => {
    expect(parseDebrief("")).toEqual([{ t: "gap" }]);
  });

  it("keeps a bullet that is only a chip, with empty text", () => {
    const items = listAt(
      parseDebrief("- [Doc](https://docs.google.com/document/d/1)"),
      0,
    );
    expect(itemAt(items, 0).text).toBe("");
    expect(itemAt(items, 0).artifacts).toHaveLength(1);
  });
});
