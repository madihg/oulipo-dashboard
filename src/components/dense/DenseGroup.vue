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
</script>

<template>
  <section class="d-col">
    <header class="d-col-head">
      <span
        class="d-col-dot"
        :style="dotColor ? { background: dotColor } : {}"
        :class="
          dotColor
            ? ''
            : accent === 'carnation'
              ? 'd-col-dot-acc'
              : accent === 'hard'
                ? 'd-col-dot-hard'
                : accent === 'reverse'
                  ? 'd-col-dot-reverse'
                  : accent === 'reinforcement'
                    ? 'd-col-dot-rein'
                    : accent === 'ongoing'
                      ? 'd-col-dot-ongoing'
                      : 'd-col-dot-neutral'
        "
      ></span>
      <span class="d-col-label">{{ label }}</span>
      <span class="d-col-count">{{ count }}</span>
      <button
        v-if="!hideAdd"
        class="d-col-plus"
        aria-label="add to group"
        @click="$emit('add')"
      >
        +
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
.d-col-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 6px 10px;
  border-bottom: 1px solid var(--d-card-border);
  background: #ffffff;
}
.d-col-dot {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  flex-shrink: 0;
}
.d-col-dot-acc {
  background: var(--acc-carnation);
}
.d-col-dot-hard {
  background: var(--acc-hard);
}
.d-col-dot-reverse {
  background: var(--acc-reverse);
}
.d-col-dot-rein {
  background: var(--acc-reinforcement);
}
.d-col-dot-ongoing {
  background: var(--acc-ongoing);
}
.d-col-dot-neutral {
  background: var(--sl-300);
}
.d-col-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: lowercase;
  color: var(--sl-900);
}
.d-col-count {
  font-size: 0.625rem;
  color: var(--sl-500);
  background: var(--sl-100);
  padding: 1px 6px;
  border-radius: 2px;
}
.d-col-plus {
  margin-left: auto;
  font-size: 0.875rem;
  color: var(--sl-500);
  cursor: pointer;
  width: 18px;
  height: 18px;
  border-radius: 2px;
  border: 1px dashed var(--sl-300);
  line-height: 1;
  background: transparent;
}
.d-col-plus:hover {
  color: var(--sl-900);
  border-color: var(--sl-900);
}
.d-col-body {
  flex: 1;
}
/* last row sits flush against the card's own border - no doubled hairline */
.d-col-body :deep(.d-row:last-child) {
  border-bottom: 0;
}
</style>
