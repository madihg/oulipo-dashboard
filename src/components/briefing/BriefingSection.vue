<script setup lang="ts">
import { ref } from "vue";

const props = defineProps<{
  title: string;
  count: number;
  defaultOpen?: boolean;
  subtitle?: string | null;
}>();

const open = ref(props.defaultOpen ?? false);

function toggle() {
  open.value = !open.value;
}
</script>

<template>
  <section :class="['d-brief-section', open && 'is-open']">
    <button
      type="button"
      class="d-brief-summary"
      :aria-expanded="open"
      @click="toggle"
    >
      <span class="d-brief-caret" :class="open && 'is-open'" aria-hidden="true"
        >&rsaquo;</span
      >
      <span class="d-brief-title">{{ title }}</span>
      <span v-if="subtitle" class="d-brief-subtitle">{{ subtitle }}</span>
      <span class="d-brief-count">{{ count }}</span>
    </button>
    <div v-if="open" class="d-brief-body">
      <slot v-if="count > 0" />
      <p v-else class="d-brief-empty">nothing here today.</p>
    </div>
  </section>
</template>

<style scoped>
.d-brief-section {
  border-top: 1px solid rgba(0, 0, 0, 0.12);
}
.d-brief-section:last-child {
  border-bottom: 1px solid rgba(0, 0, 0, 0.12);
}
.d-brief-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  background: transparent;
  border: 0;
  padding: 8px 0;
  cursor: pointer;
  text-align: left;
  font-family:
    "JetBrains Mono", "Diatype Mono Variable", ui-monospace, monospace;
  font-size: 0.75rem;
  text-transform: lowercase;
  color: rgba(0, 0, 0, 0.85);
}
.d-brief-summary:hover {
  background: rgba(0, 0, 0, 0.04);
}
.d-brief-caret {
  font-size: 0.875rem;
  color: rgba(0, 0, 0, 0.5);
  width: 12px;
  transition: transform 200ms ease;
  display: inline-block;
}
.d-brief-caret.is-open {
  transform: rotate(90deg);
}
.d-brief-title {
  font-weight: 600;
}
.d-brief-subtitle {
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(0, 0, 0, 0.5);
}
.d-brief-count {
  margin-left: auto;
  font-size: 0.625rem;
  color: rgba(0, 0, 0, 0.5);
  background: rgba(0, 0, 0, 0.04);
  padding: 1px 6px;
  border-radius: 2px;
}
.d-brief-body {
  padding: 4px 0 12px 20px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.d-brief-empty {
  font-size: 0.75rem;
  color: rgba(0, 0, 0, 0.5);
  padding: 6px 0;
}
</style>
