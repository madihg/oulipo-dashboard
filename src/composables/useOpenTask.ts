import type { Router } from "vue-router";
import { supabase } from "../lib/supabase";
import { TODO_SELECT, withTags, type JoinedTodoRow } from "../lib/todoTags";
import { useTodoModalStore } from "../stores/todoModal";
import type { ToastAction } from "../stores/toast";

/** One row, with its tags flattened, or null if it is gone. */
export async function fetchTodoRow(id: string) {
  const { data } = await supabase
    .from("todos")
    .select(TODO_SELECT)
    .eq("id", id)
    .maybeSingle();
  return data ? (withTags([data as JoinedTodoRow])[0] ?? null) : null;
}

/**
 * The action on a toast whose task has no page to go to (it just came back
 * from the trash): open it in its editor over whatever is on screen. Read
 * the route-free way at run time, so it works wherever the user has moved.
 */
export function openTaskHereAction(id: string): ToastAction {
  return {
    label: "open",
    run: async () => {
      const row = await fetchTodoRow(id);
      if (row) useTodoModalStore().open(row);
    },
  };
}

/**
 * The action on a "moved to ..." toast: go to where the task landed, then open
 * it. A drop onto an area or a list is a routing gesture, and the thing you
 * want next is usually to finish filing it (add a project, a date, a note) -
 * which used to mean finding it again by hand in the list it just left for.
 */
export function openTaskAction(
  router: Router,
  id: string,
  to: string,
): ToastAction {
  return {
    label: "open",
    run: async () => {
      if (router.currentRoute.value.path !== to) await router.push(to);
      const row = await fetchTodoRow(id);
      if (row) useTodoModalStore().open(row);
    },
  };
}
