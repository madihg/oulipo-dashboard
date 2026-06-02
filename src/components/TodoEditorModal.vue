<script setup lang="ts">
import { onBeforeUnmount } from "vue";
import { storeToRefs } from "pinia";
import { useTodoModalStore } from "../stores/todoModal";
import TodoEditor from "./TodoEditor.vue";

/**
 * Floating editor for an arbitrary task - opened from search/command-palette so
 * selecting a result actually opens that task in its editor (top-aligned sheet,
 * same surface as new-task capture). Every field autosaves; Esc / click-out /
 * "done" closes.
 */
const store = useTodoModalStore();
const { todo } = storeToRefs(store);

function close() {
  store.close();
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape" && todo.value) {
    e.preventDefault();
    e.stopPropagation();
    close();
  }
}
window.addEventListener("keydown", onKeydown);
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));
</script>

<template>
  <Teleport to="body">
    <div
      v-if="todo"
      class="fixed inset-0 z-50 flex items-start justify-center px-s-4 pt-[max(env(safe-area-inset-top),1rem)] overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="task"
      @click.self="close"
    >
      <div
        class="absolute inset-0 bg-text-primary/30"
        aria-hidden="true"
        @click="close"
      ></div>

      <div
        class="relative w-full max-w-xl bg-bg border border-border-light shadow-xl p-s-5 mb-s-8 max-h-[85vh] overflow-y-auto"
      >
        <div class="flex items-center justify-between mb-s-3">
          <p
            class="font-mono uppercase tracking-tracked text-meta text-text-tertiary"
          >
            task · saved automatically
          </p>
          <button
            class="font-mono text-meta uppercase tracking-tracked text-text-tertiary interactive"
            @click="close"
          >
            done
          </button>
        </div>
        <TodoEditor :todo="todo" @close="close" />
      </div>
    </div>
  </Teleport>
</template>
