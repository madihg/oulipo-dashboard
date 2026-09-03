<script setup lang="ts">
import { computed } from "vue";
import { CONTEXTS, isContext, type ContextName } from "../utils/contexts";

/**
 * The seven contexts as a segmented control, the same idiom as the priority
 * buttons beside it. One tap toggles a context on or off. A task may carry
 * more than one (buying online is both "buy" and "web"), so this is a set,
 * not a radio. Freeform tags the routine stamps (reservoir, claude-delivered)
 * pass through untouched: the picker only ever edits the context members of
 * the tag list.
 *
 * Emits the task's FULL next tag list, because vault.setTodoTags replaces the
 * whole set.
 */
const props = defineProps<{ tags: string[] }>();
const emit = defineEmits<{ change: [tags: string[]] }>();

const active = computed(
  () => new Set(props.tags.filter((t) => isContext(t)) as ContextName[]),
);

function toggle(name: ContextName) {
  const rest = props.tags.filter((t) => !isContext(t));
  const next = new Set(active.value);
  if (next.has(name)) next.delete(name);
  else next.add(name);
  // Canonical order for the contexts, then whatever else the task carried.
  const ordered = CONTEXTS.map((c) => c.name).filter((n) => next.has(n));
  emit("change", [...ordered, ...rest]);
}
</script>

<template>
  <div class="cp" role="group" aria-label="context">
    <button
      v-for="c in CONTEXTS"
      :key="c.name"
      type="button"
      class="cp-btn"
      :class="{ 'cp-on': active.has(c.name) }"
      :aria-pressed="active.has(c.name)"
      :title="c.hint"
      @click="toggle(c.name)"
    >
      {{ c.name }}
    </button>
  </div>
</template>

<style scoped>
.cp {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
}
.cp-btn {
  font-family:
    "Diatype Mono Variable", "JetBrains Mono", ui-monospace, monospace;
  font-variation-settings: "MONO" 1;
  font-size: 0.625rem;
  letter-spacing: 0.04em;
  text-transform: lowercase;
  color: var(--sl-700);
  background: transparent;
  border: 1px solid var(--sl-200);
  border-radius: 2px;
  padding: 3px 7px;
  cursor: pointer;
  transition:
    background 120ms ease,
    color 120ms ease,
    border-color 120ms ease;
}
.cp-btn:hover {
  background: var(--sl-100);
  color: var(--sl-900);
}
/* On: cobalt, the app's single "active" accent (nav, selected row, focus).
   Contexts carry no colour of their own - see utils/contexts.ts. */
.cp-on,
.cp-on:hover {
  color: var(--acc-carnation-text);
  background: var(--cobalt-tint);
  border-color: var(--acc-carnation);
  font-weight: 600;
}
@media (pointer: coarse) {
  .cp-btn {
    min-height: 32px;
    padding: 6px 10px;
    font-size: 0.6875rem;
  }
}
</style>
