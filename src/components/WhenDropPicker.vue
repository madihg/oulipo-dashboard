<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from "vue";
import WhenPanel from "./WhenPanel.vue";
import type { TodoState } from "../types/database";
import type { WhenPatch } from "../utils/when";

/**
 * The date picker that appears where you DROP a task, not where a trigger sits.
 *
 * Dragging a task onto a list that needs a date (Upcoming) cannot be resolved
 * by the drop alone - "upcoming" is not a date. Things answers this by raising
 * the picker at the drop, so the gesture finishes in one motion instead of
 * bouncing you into the editor. There is no anchor element to measure here, so
 * this positions itself at the pointer and clamps into the viewport, rather
 * than going through Popover (which measures its own parentElement).
 */
const props = defineProps<{
  open: boolean;
  x: number;
  y: number;
  state: TodoState;
  startDate: string | null;
  evening: boolean;
}>();
const emit = defineEmits<{ pick: [patch: WhenPatch]; close: [] }>();

const panel = ref<HTMLElement | null>(null);
const pos = reactive({ top: 0, left: 0, ready: false });
const MARGIN = 8;

function place() {
  const el = panel.value;
  if (!el) return;
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  pos.left = Math.max(
    MARGIN,
    Math.min(props.x, window.innerWidth - w - MARGIN),
  );
  pos.top = Math.max(
    MARGIN,
    Math.min(props.y, window.innerHeight - h - MARGIN),
  );
  pos.ready = true;
}

function onDocPointer(e: PointerEvent) {
  if (!props.open) return;
  if (panel.value?.contains(e.target as Node)) return;
  emit("close");
}
function onKey(e: KeyboardEvent) {
  if (props.open && e.key === "Escape") {
    e.stopPropagation();
    emit("close");
  }
}
function onReflow() {
  if (props.open) place();
}

onMounted(() => {
  window.addEventListener("pointerdown", onDocPointer, true);
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("resize", onReflow);
});
onBeforeUnmount(() => {
  window.removeEventListener("pointerdown", onDocPointer, true);
  window.removeEventListener("keydown", onKey, true);
  window.removeEventListener("resize", onReflow);
});

watch(
  () => props.open,
  (v) => {
    pos.ready = false;
    if (!v) return;
    // Timer, not rAF: rAF never fires while the document is hidden.
    setTimeout(() => {
      place();
      panel.value
        ?.querySelector<HTMLElement>('button, [tabindex="0"]')
        ?.focus({ preventScroll: true });
    }, 0);
  },
);

const style = computed(() => ({
  top: `${pos.top}px`,
  left: `${pos.left}px`,
  visibility: pos.ready ? ("visible" as const) : ("hidden" as const),
}));
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      ref="panel"
      class="wdp"
      :style="style"
      role="dialog"
      aria-label="schedule the dropped task"
    >
      <WhenPanel
        :state="state"
        :start-date="startDate"
        :evening="evening"
        @pick="emit('pick', $event)"
        @close="emit('close')"
      />
    </div>
  </Teleport>
</template>

<style scoped>
.wdp {
  position: fixed;
  z-index: 62;
  width: 318px;
  max-width: calc(100vw - 16px);
  background: var(--paper);
  border: 1px solid var(--ink);
  border-radius: 2px;
  padding: 8px;
}
</style>
