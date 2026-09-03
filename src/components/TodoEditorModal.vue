<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
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
  if (e.key !== "Escape" || !todo.value) return;
  // An Escape meant for a popover open INSIDE the editor (the when picker, the
  // area menu) must not close the whole editor. Ordering cannot decide this:
  // this listener is registered at App mount, before any popover's, so
  // defaultPrevented is always false here, and stopPropagation between two
  // window listeners on the same node does nothing. Probing the DOM is the
  // order-independent test, and it is what BulkBar already does.
  if (document.querySelector(".d-pop, .wp-sheet, [data-when-surface]")) return;
  e.preventDefault();
  e.stopPropagation();
  close();
}
window.addEventListener("keydown", onKeydown);

// The panel's height is driven by the VISUAL viewport, not vh. On iOS the
// on-screen keyboard changes neither vh nor innerHeight, so max-h-[85vh] left
// the bottom 40-45% of the panel under the keyboard with the nested scrollers
// rubber-banding into the page behind. A runtime measure, not a pointer:coarse
// layout switch, per DESIGN.md.
const vvh = ref<number | null>(null);
function measureVv() {
  const vv = window.visualViewport;
  vvh.value = vv ? Math.round(vv.height) : null;
}
const panelStyle = computed(() => ({
  maxHeight: vvh.value ? `${Math.round(vvh.value * 0.85)}px` : "85vh",
}));
onMounted(() => {
  measureVv();
  window.visualViewport?.addEventListener("resize", measureVv);
  window.visualViewport?.addEventListener("scroll", measureVv);
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown);
  window.visualViewport?.removeEventListener("resize", measureVv);
  window.visualViewport?.removeEventListener("scroll", measureVv);
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="todo"
      class="fixed inset-0 z-50 flex items-start justify-center px-s-4 pt-[max(env(safe-area-inset-top),1rem)] overflow-y-auto overscroll-contain"
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
        class="relative w-full max-w-xl bg-bg border border-border-light p-s-5 mb-s-8 overflow-y-auto overscroll-contain"
        :style="panelStyle"
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
