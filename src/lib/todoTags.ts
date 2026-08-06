import type { TodoRow } from "../types/database";

/**
 * Todos are fetched with their tag names embedded via the todo_tags join and
 * flattened to a plain `tags: string[]` per row before they enter the store -
 * the join rows never leave this module. Every vault todo loader selects
 * TODO_SELECT; tag assignment writes go through vault.setTodoTags.
 */
export const TODO_SELECT = "*, todo_tags(tag:tags(name))";

export type JoinedTodoRow = TodoRow & {
  todo_tags?: { tag: { name: string } | null }[] | null;
};

export function withTags(rows: JoinedTodoRow[]): TodoRow[] {
  return rows.map((row) => {
    const { todo_tags, ...rest } = row;
    return {
      ...rest,
      tags: (todo_tags ?? [])
        .map((tt) => tt.tag?.name ?? "")
        .filter(Boolean)
        .sort(),
    };
  });
}
