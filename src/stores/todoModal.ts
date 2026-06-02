import { defineStore } from "pinia";
import { ref } from "vue";
import type { TodoRow } from "../types/database";

/**
 * Global "open this task in its editor" channel. Used by search/command-palette
 * results (and anywhere else) to pop the full TodoEditor for an arbitrary todo,
 * regardless of which view is on screen.
 */
export const useTodoModalStore = defineStore("todoModal", () => {
  const todo = ref<TodoRow | null>(null);
  function open(t: TodoRow) {
    todo.value = t;
  }
  function close() {
    todo.value = null;
  }
  return { todo, open, close };
});
