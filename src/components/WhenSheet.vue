<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";

/**
 * Bottom sheet surface for the "when" picker on a phone.
 *
 * An anchored popover next to a 36px row is unusable at 375px: the calendar
 * needs the full width to give seven columns a 44px target. Teleported to body
 * so no ancestor's overflow or transform can clip it.
 */
const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

const panel = ref<HTMLElement | null>(null);
// Where focus came from, so closing the sheet puts it back rather than
// dropping the user at the top of the document.
let restoreFocus: HTMLElement | null = null;
// The page behind an aria-modal dialog must not scroll. Measured leaking
// ~180-200px in both Chromium and WebKit before this: the sheet's own
// overscroll-behavior does nothing because the sheet is not a scroll
// container, so only the calendar inside it was ever contained.
let prevBodyOverflow: string | null = null;
function lockPage(on: boolean) {
  if (typeof document === "undefined") return;
  if (on) {
    if (prevBodyOverflow === null)
      prevBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  } else if (prevBodyOverflow !== null) {
    document.body.style.overflow = prevBodyOverflow;
    prevBodyOverflow = null;
  }
}

function onKey(e: KeyboardEvent) {
  if (!props.open) return;
  if (e.key === "Escape") {
    e.stopPropagation();
    emit("close");
    return;
  }
  if (e.key !== "Tab") return;
  // Modal: keep Tab inside the sheet. The popover surface deliberately does
  // NOT trap - tabbing out of it closes it - but a sheet covers the page.
  const stops = panel.value?.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [tabindex="0"]',
  );
  if (!stops || stops.length === 0) return;
  const first = stops[0]!;
  const last = stops[stops.length - 1]!;
  const active = document.activeElement;
  if (e.shiftKey && active === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}

watch(
  () => props.open,
  (v) => {
    if (!v) {
      lockPage(false);
      restoreFocus?.focus({ preventScroll: true });
      restoreFocus = null;
      return;
    }
    restoreFocus = document.activeElement as HTMLElement | null;
    lockPage(true);
    // Timer, not rAF: rAF never fires while the document is hidden.
    setTimeout(() => {
      panel.value
        ?.querySelector<HTMLElement>('button, [tabindex="0"]')
        ?.focus({ preventScroll: true });
    }, 0);
  },
  // The sheet can be mounted already-open when the surface swaps at the
  // breakpoint; without immediate it would never take focus.
  { immediate: true },
);

// Capture, so Escape reaches the sheet before the editor modal's own handler.
window.addEventListener("keydown", onKey, true);
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKey, true);
  // Never leave the page unscrollable because the sheet was torn down rather
  // than closed.
  lockPage(false);
});
</script>

<template>
  <Teleport to="body">
    <!-- Scrim and sheet are SIBLINGS, not nested. touch-action intersects down
         the ancestor chain, so a scrim wrapping the sheet with touch-action:
         none would also stop the calendar inside it from scrolling. -->
    <template v-if="open">
      <div class="wp-scrim" @click="emit('close')"></div>
      <div
        ref="panel"
        class="wp-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="when"
      >
        <slot />
      </div>
    </template>
  </Teleport>
</template>

<style scoped>
.wp-scrim {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgba(0, 0, 0, 0.3);
  /* Swallow the drag rather than passing it to the list underneath.
     touch-action stops the gesture without cancelling touchstart, which would
     also suppress the synthesized click and make the scrim untappable. */
  touch-action: none;
}
.wp-sheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 61;
  width: 100%;
  display: flex;
  flex-direction: column;
  /* dvh, not vh: the mobile URL bar changes vh mid-gesture. */
  max-height: min(85dvh, 640px);
  background: var(--paper);
  border-top: 1px solid var(--ink);
  border-radius: 0;
  padding-left: env(safe-area-inset-left, 0px);
  padding-right: env(safe-area-inset-right, 0px);
  overscroll-behavior: contain;
}
@media (prefers-reduced-motion: reduce) {
  .wp-sheet {
    transition: none;
  }
}
</style>
