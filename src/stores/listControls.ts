import { defineStore } from "pinia";
import { reactive, watch } from "vue";
import type { Priority, TodoRow, TodoState } from "../types/database";

export type SortMode = "priority" | "deadline" | "created" | "manual" | "alpha";
export type GroupMode =
  "priority" | "project" | "state" | "none" | "today" | "area";
export type ViewMode = "list" | "kanban" | "boxes";

export interface FilterState {
  tags: string[];
  priority: Array<Priority | "none">;
  state: TodoState[];
}

export interface ControlState {
  filter: FilterState;
  sort: SortMode;
  group: GroupMode;
  /** Optional view mode (e.g. "boxes"|"list" on Area pages). */
  viewMode?: ViewMode;
}

const STORAGE_KEY = "hmart.listControls.v1";

const DEFAULT: ControlState = {
  filter: { tags: [], priority: [], state: [] },
  sort: "priority",
  group: "priority",
};

function load(): Record<string, ControlState> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, ControlState>;
  } catch {
    return {};
  }
}

function save(state: Record<string, ControlState>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage may throw under quota; failing silently is acceptable
  }
}

export const useListControlsStore = defineStore("listControls", () => {
  const byRoute = reactive<Record<string, ControlState>>(load());

  watch(
    () => byRoute,
    (v) => save(v),
    { deep: true },
  );

  function get(routeKey: string): ControlState {
    if (!byRoute[routeKey]) {
      byRoute[routeKey] = JSON.parse(JSON.stringify(DEFAULT));
    }
    return byRoute[routeKey]!;
  }

  function setFilter(routeKey: string, filter: FilterState) {
    get(routeKey).filter = filter;
  }
  function setSort(routeKey: string, sort: SortMode) {
    get(routeKey).sort = sort;
  }
  function setGroup(routeKey: string, group: GroupMode) {
    get(routeKey).group = group;
  }
  function setViewMode(routeKey: string, mode: ViewMode) {
    get(routeKey).viewMode = mode;
  }
  function reset(routeKey: string) {
    byRoute[routeKey] = JSON.parse(JSON.stringify(DEFAULT));
  }

  function isFilterActive(routeKey: string): boolean {
    const f = get(routeKey).filter;
    return f.tags.length > 0 || f.priority.length > 0 || f.state.length > 0;
  }

  return {
    byRoute,
    get,
    setFilter,
    setSort,
    setGroup,
    setViewMode,
    reset,
    isFilterActive,
  };
});

const PRIORITY_RANK: Record<Priority | "none", number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  ongoing: 3,
  none: 4,
};

export function applyControls(
  todos: TodoRow[],
  controls: ControlState,
): TodoRow[] {
  let rows = todos;

  if (controls.filter.tags.length) {
    const wanted = new Set(controls.filter.tags);
    rows = rows.filter((t) => {
      const tags = (t as TodoRow & { tags?: string[] }).tags;
      return Array.isArray(tags) && tags.some((tag) => wanted.has(tag));
    });
  }
  if (controls.filter.priority.length) {
    const wanted = new Set(controls.filter.priority);
    rows = rows.filter((t) =>
      wanted.has((t.priority ?? "none") as Priority | "none"),
    );
  }
  if (controls.filter.state.length) {
    const wanted = new Set(controls.filter.state);
    rows = rows.filter((t) => wanted.has(t.state));
  }

  const sorted = [...rows];
  switch (controls.sort) {
    case "priority":
      sorted.sort((a, b) => {
        const ap = PRIORITY_RANK[(a.priority ?? "none") as Priority | "none"];
        const bp = PRIORITY_RANK[(b.priority ?? "none") as Priority | "none"];
        if (ap !== bp) return ap - bp;
        // Manual order within a priority section. This MUST stay position-based:
        // it is the order drag-and-drop writes, and "priority" is the default
        // sort, so tie-breaking on anything else (it was title.localeCompare for
        // a while) makes every drop silently snap back. Alphabetical is its own
        // explicit mode ("a to z").
        return (a.position ?? 0) - (b.position ?? 0);
      });
      break;
    case "alpha":
      sorted.sort((a, b) => a.title.localeCompare(b.title));
      break;
    case "deadline":
      sorted.sort((a, b) => {
        const ad = a.deadline ? new Date(a.deadline).getTime() : Infinity;
        const bd = b.deadline ? new Date(b.deadline).getTime() : Infinity;
        return ad - bd;
      });
      break;
    case "created":
      sorted.sort((a, b) => {
        const ac = new Date(a.created_at).getTime();
        const bc = new Date(b.created_at).getTime();
        return bc - ac;
      });
      break;
    case "manual":
      sorted.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      break;
  }

  return sorted;
}

export function groupTodos(
  todos: TodoRow[],
  mode: GroupMode,
  projectsById: Record<string, { name: string; slug: string }> = {},
  areasById: Record<string, { name: string; slug: string }> = {},
): Array<{ key: string; label: string; items: TodoRow[] }> {
  if (mode === "none") {
    return [{ key: "all", label: "all", items: todos }];
  }
  if (mode === "area") {
    const buckets = new Map<string, TodoRow[]>();
    for (const t of todos) {
      const k = t.area_id ?? "none";
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k)!.push(t);
    }
    return Array.from(buckets.entries())
      .map(([k, items]) => ({
        key: k,
        label: k === "none" ? "no area" : (areasById[k]?.name ?? k),
        items,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }
  if (mode === "today") {
    // Today's two-section split: P0 on top, everything else (already filtered to
    // today-or-earlier / state=today by loadToday) under "scheduled". No
    // separate "overdue" bucket - past-due items just sit in scheduled.
    const p0: TodoRow[] = [];
    const scheduled: TodoRow[] = [];
    for (const t of todos) (t.priority === "P0" ? p0 : scheduled).push(t);
    return [
      { key: "P0", label: "p0", items: p0 },
      { key: "scheduled", label: "scheduled", items: scheduled },
    ];
  }
  if (mode === "priority") {
    const buckets: Record<string, TodoRow[]> = {
      P0: [],
      P1: [],
      P2: [],
      ongoing: [],
      none: [],
    };
    for (const t of todos) buckets[(t.priority ?? "none") as string]!.push(t);
    return [
      { key: "P0", label: "p0", items: buckets.P0! },
      { key: "P1", label: "p1", items: buckets.P1! },
      { key: "P2", label: "p2", items: buckets.P2! },
      { key: "ongoing", label: "~ ongoing", items: buckets.ongoing! },
      { key: "none", label: "no priority", items: buckets.none! },
    ];
  }
  if (mode === "state") {
    const buckets = new Map<string, TodoRow[]>();
    for (const t of todos) {
      const k = t.state;
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k)!.push(t);
    }
    return Array.from(buckets.entries()).map(([k, items]) => ({
      key: k,
      label: k,
      items,
    }));
  }
  // project
  const buckets = new Map<string, TodoRow[]>();
  for (const t of todos) {
    const k = t.project_id ?? "none";
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(t);
  }
  return Array.from(buckets.entries()).map(([k, items]) => ({
    key: k,
    label: k === "none" ? "no project" : (projectsById[k]?.name ?? k),
    items,
  }));
}

export function uniqueTagsFrom(todos: TodoRow[]): string[] {
  const set = new Set<string>();
  for (const t of todos) {
    const tags = (t as TodoRow & { tags?: string[] }).tags;
    if (Array.isArray(tags)) for (const tag of tags) set.add(tag);
  }
  return Array.from(set).sort();
}
