<script setup lang="ts">
import type { GroupMode } from "../stores/listControls";

defineProps<{
  value: GroupMode;
  hideProject?: boolean;
  showToday?: boolean;
  showArea?: boolean;
}>();
const emit = defineEmits<{ change: [value: GroupMode] }>();

const OPTIONS: Array<{ value: GroupMode; label: string }> = [
  { value: "today", label: "p0 + scheduled" },
  { value: "priority", label: "priority" },
  { value: "area", label: "area" },
  { value: "state", label: "state" },
  { value: "project", label: "project" },
  { value: "none", label: "no grouping" },
];
</script>

<template>
  <ul class="d-radio-list" role="radiogroup">
    <li v-for="opt in OPTIONS" :key="opt.value">
      <button
        v-if="
          !(opt.value === 'project' && hideProject) &&
          !(opt.value === 'today' && !showToday) &&
          !(opt.value === 'area' && !showArea)
        "
        type="button"
        role="radio"
        :aria-checked="value === opt.value"
        :class="['d-radio-row', value === opt.value && 'd-radio-row-on']"
        @click="emit('change', opt.value)"
      >
        <span class="d-radio-dot" :class="value === opt.value && 'on'"></span>
        <span>{{ opt.label }}</span>
      </button>
    </li>
  </ul>
</template>

<style scoped>
.d-radio-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 180px;
  list-style: none;
}
.d-radio-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  font-family:
    "Diatype Mono Variable", "JetBrains Mono", ui-monospace, monospace;
  font-variation-settings: "MONO" 1;
  font-size: 0.75rem;
  text-transform: lowercase;
  color: rgba(0, 0, 0, 0.85);
  background: transparent;
  border: 0;
  padding: 6px 8px;
  border-radius: 2px;
  cursor: pointer;
  text-align: left;
}
.d-radio-row:hover {
  background: rgba(0, 0, 0, 0.04);
}
.d-radio-row-on {
  font-weight: 600;
}
.d-radio-dot {
  width: 10px;
  height: 10px;
  border: 1px solid rgba(0, 0, 0, 0.5);
  border-radius: 999px;
  display: inline-block;
  flex-shrink: 0;
}
.d-radio-dot.on {
  background: #000000;
  border-color: #000000;
}
</style>
