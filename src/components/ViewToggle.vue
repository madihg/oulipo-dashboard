<script setup lang="ts">
import { useRouter } from "vue-router";

/**
 * Two-state segmented control. Two modes:
 *
 * 1. Project list/kanban (legacy): pass `slug` + `current="list"|"kanban"`.
 *    Clicking switches the route to /project/:slug or /project/:slug/kanban.
 *
 * 2. Generic: pass `options` (array of {value,label}) + `modelValue`.
 *    Emits `update:modelValue` on click. Caller handles persistence.
 */

const props = defineProps<{
  /** Project-mode: project slug for routing. */
  slug?: string;
  /** Project-mode: which side is active. */
  current?: "list" | "kanban";
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
  const target =
    view === "kanban"
      ? `/project/${props.slug}/kanban`
      : `/project/${props.slug}`;
  void router.push(target);
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
        :class="['d-view-seg', activeProject('list') && 'd-view-seg-active']"
        type="button"
        @click="goProject('list')"
      >
        list
      </button>
      <button
        role="tab"
        :aria-selected="activeProject('kanban')"
        :class="['d-view-seg', activeProject('kanban') && 'd-view-seg-active']"
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
        :class="['d-view-seg', modelValue === opt.value && 'd-view-seg-active']"
        type="button"
        @click="goGeneric(opt.value)"
      >
        {{ opt.label }}
      </button>
    </template>
  </div>
</template>

<style scoped>
.d-view-toggle {
  display: inline-flex;
  align-items: stretch;
  border: 1px solid #000000;
  border-radius: 2px;
  margin-left: auto;
  overflow: hidden;
}
.d-view-seg {
  font-family:
    "JetBrains Mono", "Diatype Mono Variable", ui-monospace, monospace;
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(0, 0, 0, 0.85);
  background: #ffffff;
  border: 0;
  padding: 4px 10px;
  cursor: pointer;
  transition: background 150ms ease;
  min-width: 60px;
  text-align: center;
}
.d-view-seg + .d-view-seg {
  border-left: 1px solid #000000;
}
.d-view-seg:hover:not(.d-view-seg-active) {
  background: rgba(0, 0, 0, 0.04);
}
.d-view-seg-active {
  background: #000000;
  color: #ffffff;
  cursor: default;
}
</style>
