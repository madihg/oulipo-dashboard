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
      class="chip"
      :class="{ 'chip-on': active.has(c.name) }"
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
</style>
