import { describe, expect, it } from "vitest";
import { TODO_SELECT, withTags, type JoinedTodoRow } from "../src/lib/todoTags";
import { uniqueTagsFrom, applyControls } from "../src/stores/listControls";
import type { TodoRow } from "../src/types/database";

function baseRow(over: Partial<JoinedTodoRow>): JoinedTodoRow {
  return {
    id: "t1",
    user_id: "u1",
    area_id: null,
    project_id: null,
    heading_id: null,
    title: "a task",
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
    created_at: "2026-08-06T00:00:00Z",
    ...over,
  } as JoinedTodoRow;
}

describe("withTags", () => {
  it("flattens join rows to a sorted name array and strips todo_tags", () => {
    const rows = withTags([
      baseRow({
        todo_tags: [{ tag: { name: "suggested" } }, { tag: { name: "offer" } }],
      }),
    ]);
    expect(rows[0]!.tags).toEqual(["offer", "suggested"]);
    expect("todo_tags" in rows[0]!).toBe(false);
  });

  it("yields an empty array for rows with no join rows", () => {
    expect(withTags([baseRow({})])[0]!.tags).toEqual([]);
    expect(withTags([baseRow({ todo_tags: null })])[0]!.tags).toEqual([]);
  });

  it("drops null tag references (deleted tag racing a fetch)", () => {
    const rows = withTags([
      baseRow({ todo_tags: [{ tag: null }, { tag: { name: "decision" } }] }),
    ]);
    expect(rows[0]!.tags).toEqual(["decision"]);
  });

  it("select string embeds the join the mapper expects", () => {
    expect(TODO_SELECT).toContain("todo_tags(tag:tags(name))");
  });
});

describe("hydrated tags feed the existing list controls", () => {
  const rows: TodoRow[] = withTags([
    baseRow({ id: "a", todo_tags: [{ tag: { name: "offer" } }] }),
    baseRow({ id: "b", todo_tags: [{ tag: { name: "claude-delivered" } }] }),
    baseRow({ id: "c" }),
  ]);

  it("uniqueTagsFrom sees hydrated names", () => {
    expect(uniqueTagsFrom(rows)).toEqual(["claude-delivered", "offer"]);
  });

  it("applyControls filters by hydrated tag", () => {
    const out = applyControls(rows, {
      filter: { tags: ["offer"], priority: [], state: [] },
      sort: "priority",
      group: "none",
    } as never);
    expect(out.map((t) => t.id)).toEqual(["a"]);
  });
});
