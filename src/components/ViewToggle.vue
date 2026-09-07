<script setup lang="ts">
import { useRouter } from "vue-router";

/**
 * Two-state segmented control. Two modes:
 *
 * 1. Route list/kanban: pass `slug` + `current="list"|"kanban"` (+ optional
 *    `entity`, default "project"). Clicking switches the route between
 *    /:entity/:slug and /:entity/:slug/kanban (project + area both supported).
 *
 * 2. Generic: pass `options` (array of {value,label}) + `modelValue`.
 *    Emits `update:modelValue` on click. Caller handles persistence.
 */

const props = defineProps<{
  /** Route-mode: slug for routing. */
  slug?: string;
  /** Route-mode: which side is active. */
  current?: "list" | "kanban";
  /** Route-mode: route prefix. Defaults to "project". */
  entity?: "project" | "area";
  /** Generic-mode: array of options. */
  options?: Array<{ value: string; label: string }>;
  /** Generic-mode: currently-selected value. */
  modelValue?: string;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();
const router = useRouter();

const isProjectMode = !props.options;

function activeProject(view: "list" | "kanban") {
  return props.current === view;
}
function goProject(view: "list" | "kanban") {
  if (view === props.current) return;
  const base = `/${props.entity ?? "project"}/${props.slug}`;
  void router.push(view === "kanban" ? `${base}/kanban` : base);
}
function goGeneric(value: string) {
  if (value === props.modelValue) return;
  emit("update:modelValue", value);
}
</script>

<template>
  <div class="d-view-toggle" role="tablist" aria-label="view">
    <template v-if="isProjectMode">
      <button
        role="tab"
        :aria-selected="activeProject('list')"
        :class="[
          'chip',
          'd-view-seg',
          activeProject('list') && 'chip-on d-view-seg-active',
        ]"
        type="button"
        @click="goProject('list')"
      >
        list
      </button>
      <button
        role="tab"
        :aria-selected="activeProject('kanban')"
        :class="[
          'chip',
          'd-view-seg',
          activeProject('kanban') && 'chip-on d-view-seg-active',
        ]"
        type="button"
        @click="goProject('kanban')"
      >
        kanban
      </button>
    </template>
    <template v-else>
      <button
        v-for="opt in options"
        :key="opt.value"
        role="tab"
        :aria-selected="modelValue === opt.value"
        :class="[
          'chip',
          'd-view-seg',
          modelValue === opt.value && 'chip-on d-view-seg-active',
        ]"
        type="button"
        @click="goGeneric(opt.value)"
      >
        {{ opt.label }}
      </button>
    </template>
  </div>
</template>

<style scoped>
/* A segmented pair of chips (main.css) inside one metal frame; the active
   segment is the ink inversion (.chip-on), never a colour. */
.d-view-toggle {
  display: inline-flex;
  align-items: stretch;
  border: 1px solid var(--metal);
  border-radius: 2px;
  margin-left: auto;
  overflow: hidden;
}
.d-view-seg {
  min-width: 60px;
  justify-content: center;
  padding: 4px 10px;
  border: 0;
  border-radius: 0;
}
/* The frame clips outside the segments, so the ring is turned inward, the
   way rows keep theirs. */
.d-view-seg:focus-visible {
  outline-offset: -3px;
}
.d-view-seg + .d-view-seg {
  border-left: 1px solid var(--metal);
}
.d-view-seg:hover:not(.chip-on) {
  background: var(--ground-2);
}
.d-view-seg-active {
  cursor: default;
}
</style>
