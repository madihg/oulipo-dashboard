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
  // Uncapping lets the content fit, which makes the browser clamp scrollTop to
  // 0; re-capping does not put it back. Anything scrolling INSIDE the popover
  // would be yanked to the top on every re-place, so carry it across.
  const keepTop = el.scrollTop;
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
  if (keepTop && el.scrollTop !== keepTop) el.scrollTop = keepTop;
}

let ro: ResizeObserver | null = null;

function onDocClick(e: MouseEvent) {
  if (!props.open) return;
  const el = root.value;
  if (!el) return;
  if (el.contains(e.target as Node)) return;
  // Ignore the anchor as well. This fires on MOUSEDOWN while every trigger
  // toggles on CLICK, so without it clicking an open menu's own trigger closed
  // it on mousedown and reopened it on click - the trigger could never dismiss
  // its own surface. The popover is always a direct child of the anchor, so
  // the trigger is inside parentElement.
  if (el.parentElement?.contains(e.target as Node)) return;
  emit("close");
}
function onKey(e: KeyboardEvent) {
  if (e.key === "Escape" && props.open) emit("close");
}
function onReflow(e?: Event) {
  if (!props.open) return;
  // The scroll listener is capture-phase on window, so it also receives scrolls
  // from the popover's OWN content. Re-placing on those forces a sync layout
  // and resets scrollTop, which makes an inner scroll area (the when picker's
  // calendar) impossible to scroll. Only re-place for scrolls of the page
  // BEHIND the popover, which is what the listener is actually for.
  if (e?.type === "scroll" && root.value?.contains(e.target as Node)) return;
  place();
}

onMounted(() => {
  window.addEventListener("mousedown", onDocClick, true);
  window.addEventListener("keydown", onKey);
  window.addEventListener("resize", onReflow);
  window.addEventListener("scroll", onReflow, { capture: true, passive: true });
});
onBeforeUnmount(() => {
  window.removeEventListener("mousedown", onDocClick, true);
  window.removeEventListener("keydown", onKey);
  window.removeEventListener("resize", onReflow);
  window.removeEventListener("scroll", onReflow, { capture: true });
  ro?.disconnect();
});

watch(
  () => props.open,
  (v) => {
    if (v) {
      pos.ready = false;
      // setTimeout, not requestAnimationFrame: rAF is suspended whenever the
      // document is hidden (a background tab, an embedded preview), and the
      // popover would then never be placed and stay permanently invisible.
      // Same reason the selection format bar defers with a timer.
      setTimeout(() => {
        place();
        root.value
          ?.querySelector<HTMLElement>("input,button,[tabindex='0']")
          // preventScroll: focusing scrolls every scrollable ancestor to bring
          // the target into view, which includes the popover's own content.
          ?.focus({ preventScroll: true });
        // Re-place if the popover's own content grows/shrinks after opening
        // (e.g. WhenPicker's date expander). Observing the element is safe:
        // place() only re-fires when the NATURAL size actually changes.
        if (root.value && typeof ResizeObserver !== "undefined") {
          ro?.disconnect();
          ro = new ResizeObserver(() => onReflow());
          ro.observe(root.value);
        }
      }, 0);
    } else {
      pos.ready = false;
      ro?.disconnect();
      ro = null;
    }
  },
  // immediate: a popover can be MOUNTED already-open - the when picker swaps
  // surfaces at the phone breakpoint, so crossing it with the picker open
  // creates a fresh Popover with open already true. A non-immediate watcher
  // never fires for that, and the popover would sit at visibility:hidden
  // forever.
  { immediate: true },
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
