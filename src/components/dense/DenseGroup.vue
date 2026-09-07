<script setup lang="ts">
defineProps<{
  label: string;
  count: number;
  accent?:
    "carnation" | "hard" | "reverse" | "reinforcement" | "ongoing" | "neutral";
  /** Optional dot color override (raw hex) - wins over accent */
  dotColor?: string;
  /** Hide the "+" button for groups nothing can be added to directly. */
  hideAdd?: boolean;
}>();
defineEmits<{ add: [] }>();
// The group's own key travels with the add, so a column's "+" can create into
// that column instead of into whatever the default happens to be.
</script>

<template>
  <section class="d-col">
    <header class="d-col-head">
      <!-- The shared dot (main.css) is the only place the group's colour lives. -->
      <span
        class="dot"
        :class="dotColor ? '' : `d-col-dot-${accent ?? 'neutral'}`"
        :style="dotColor ? { '--dot': dotColor } : {}"
        aria-hidden="true"
      ></span>
      <span class="d-col-label">{{ label }}</span>
      <span class="cap d-col-count">{{ count }}</span>
      <button
        v-if="!hideAdd"
        type="button"
        class="d-col-plus"
        aria-label="add to group"
        @click="$emit('add')"
      >
        <svg viewBox="0 0 12 12" aria-hidden="true">
          <path d="M6 2v8M2 6h8" />
        </svg>
      </button>
    </header>
    <div class="d-col-body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.d-col {
  border: 1px solid var(--d-card-border);
  border-radius: 0;
  /* visible (not hidden) so a row's WhenPicker popover can escape the column;
     rows truncate their own content and the flush last-row border is handled by
     the :deep rule below, so nothing here needs clipping. */
  overflow: visible;
  background: var(--d-card-ground);
  display: flex;
  flex-direction: column;
  min-height: 120px;
}
/* Phone: an empty group collapses to its header instead of reserving 120px -
   stacked board cards were spending whole screens on empty buckets. (Kanban's
   inner column keeps its own min-height as a drag target.) */
@media (max-width: 600px) {
  .d-col {
    min-height: 0;
  }
}
.d-col-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 6px 10px;
  border-bottom: 1px solid var(--d-card-border);
  background: var(--paper);
}
.d-col-dot-carnation {
  --dot: var(--acc-carnation);
}
.d-col-dot-hard {
  --dot: var(--acc-hard);
}
.d-col-dot-reverse {
  --dot: var(--acc-reverse);
}
.d-col-dot-reinforcement {
  --dot: var(--acc-reinforcement);
}
.d-col-dot-ongoing {
  --dot: var(--acc-ongoing);
}
.d-col-dot-neutral {
  --dot: var(--metal);
}
.d-col-label {
  font-size: var(--fs-small);
  font-weight: 600;
  text-transform: lowercase;
  color: var(--ink);
}
.d-col-count {
  background: var(--ground-2);
  padding: 1px 6px;
  border-radius: 2px;
}
.d-col-plus {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border-radius: 2px;
  border: 1px dashed var(--metal);
  background: transparent;
  color: var(--ink-50);
  cursor: pointer;
  transition:
    color var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out);
}
.d-col-plus svg {
  width: 12px;
  height: 12px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
}
.d-col-plus:hover {
  color: var(--ink);
  border-color: var(--ink);
}
@media (pointer: coarse) {
  .d-col-plus {
    width: 32px;
    height: 32px;
  }
}
.d-col-body {
  flex: 1;
}
/* last row sits flush against the card's own border - no doubled hairline */
.d-col-body :deep(.d-row:last-child) {
  border-bottom: 0;
}
</style>
