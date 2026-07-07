<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";

const props = defineProps<{
  open: boolean;
  anchor?: "left" | "right";
}>();
const emit = defineEmits<{ close: [] }>();

const root = ref<HTMLElement | null>(null);

// Viewport-aware placement. The popover is fixed-positioned and measured against
// its wrapper (the trigger's .d-tool-wrap parent), then clamped to the viewport
// and flipped above when it would overflow the bottom. Keeps the group / filter
// menus from rendering off-screen near an edge.
const GAP = 6;
const MARGIN = 8;
const pos = reactive<{ top: number; left: number; ready: boolean }>({
  top: 0,
  left: 0,
  ready: false,
});

function place() {
  const el = root.value;
  const wrap = el?.parentElement;
  if (!el || !wrap) return;
  // Measure the NATURAL size (clear any prior cap first, else scroll/resize
  // would re-measure the already-clamped height and mis-flip / oscillate).
  el.style.maxHeight = "none";
  const pw = el.offsetWidth;
  const ph = el.offsetHeight;

  const a = wrap.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Horizontal: align to the requested edge, then clamp into the viewport.
  let left = props.anchor === "right" ? a.right - pw : a.left;
  left = Math.max(MARGIN, Math.min(left, vw - pw - MARGIN));

  // Vertical: below by default; flip above if it overflows the bottom and
  // there's more room above. Cap the height to whatever room remains.
  const below = a.bottom + GAP;
  const roomBelow = vh - below - MARGIN;
  const roomAbove = a.top - GAP - MARGIN;
  let top: number;
  let maxHeight: number | null = null;
  if (ph <= roomBelow || roomBelow >= roomAbove) {
    top = below;
    if (ph > roomBelow) maxHeight = roomBelow;
  } else {
    top = Math.max(MARGIN, a.top - GAP - ph);
    if (ph > roomAbove) maxHeight = roomAbove;
  }

  pos.top = top;
  pos.left = left;
  pos.ready = true;
  // Apply the cap imperatively (not via reactive :style) so measuring and
  // capping never fight the reactive binding.
  el.style.maxHeight = maxHeight ? `${maxHeight}px` : "none";
}

let ro: ResizeObserver | null = null;

function onDocClick(e: MouseEvent) {
  if (!props.open) return;
  const el = root.value;
  if (!el) return;
  if (el.contains(e.target as Node)) return;
  emit("close");
}
function onKey(e: KeyboardEvent) {
  if (e.key === "Escape" && props.open) emit("close");
}
function onReflow() {
  if (props.open) place();
}

onMounted(() => {
  window.addEventListener("mousedown", onDocClick, true);
  window.addEventListener("keydown", onKey);
  window.addEventListener("resize", onReflow);
  window.addEventListener("scroll", onReflow, true);
});
onBeforeUnmount(() => {
  window.removeEventListener("mousedown", onDocClick, true);
  window.removeEventListener("keydown", onKey);
  window.removeEventListener("resize", onReflow);
  window.removeEventListener("scroll", onReflow, true);
  ro?.disconnect();
});

watch(
  () => props.open,
  (v) => {
    if (v) {
      pos.ready = false;
      void requestAnimationFrame(() => {
        place();
        root.value
          ?.querySelector<HTMLElement>("input,button,[tabindex='0']")
          ?.focus();
        // Re-place if the popover's own content grows/shrinks after opening
        // (e.g. WhenPicker's date expander). Observing the element is safe:
        // place() only re-fires when the NATURAL size actually changes.
        if (root.value && typeof ResizeObserver !== "undefined") {
          ro?.disconnect();
          ro = new ResizeObserver(() => onReflow());
          ro.observe(root.value);
        }
      });
    } else {
      pos.ready = false;
      ro?.disconnect();
      ro = null;
    }
  },
);
</script>

<template>
  <div
    v-if="open"
    ref="root"
    class="d-pop"
    :style="{
      top: pos.top + 'px',
      left: pos.left + 'px',
      visibility: pos.ready ? 'visible' : 'hidden',
    }"
  >
    <slot />
  </div>
</template>

<style scoped>
.d-pop {
  position: fixed;
  z-index: 60;
  min-width: 200px;
  max-width: min(320px, calc(100vw - 16px));
  overflow-y: auto;
  background: #ffffff;
  border: 1px solid var(--ink);
  border-radius: 2px;
  padding: 8px;
  font-size: 0.8125rem;
}
</style>
