<script setup lang="ts">
import { reactive, watch } from "vue";
import type { Priority, TodoState } from "../types/database";
import type { FilterState } from "../stores/listControls";

const props = defineProps<{
  value: FilterState;
  availableTags: string[];
}>();
const emit = defineEmits<{
  apply: [value: FilterState];
  clear: [];
}>();

const draft = reactive<FilterState>({
  tags: [...props.value.tags],
  priority: [...props.value.priority],
  state: [...props.value.state],
});

watch(
  () => props.value,
  (v) => {
    draft.tags = [...v.tags];
    draft.priority = [...v.priority];
    draft.state = [...v.state];
  },
);

const PRIORITIES: Array<Priority | "none"> = ["P0", "P1", "P2", "none"];
const STATES: TodoState[] = [
  "today",
  "anytime",
  "upcoming",
  "someday",
  "inbox",
];

function togglePriority(p: Priority | "none") {
  const i = draft.priority.indexOf(p);
  if (i >= 0) draft.priority.splice(i, 1);
  else draft.priority.push(p);
}
function toggleState(s: TodoState) {
  const i = draft.state.indexOf(s);
  if (i >= 0) draft.state.splice(i, 1);
  else draft.state.push(s);
}
function toggleTag(t: string) {
  const i = draft.tags.indexOf(t);
  if (i >= 0) draft.tags.splice(i, 1);
  else draft.tags.push(t);
}

function apply() {
  emit("apply", {
    tags: [...draft.tags],
    priority: [...draft.priority],
    state: [...draft.state],
  });
}
function clear() {
  draft.tags = [];
  draft.priority = [];
  draft.state = [];
  emit("clear");
}
</script>

<template>
  <div class="d-filter-pop">
    <div class="d-filter-section">
      <p class="d-filter-label">priority</p>
      <div class="d-filter-chips">
        <button
          v-for="p in PRIORITIES"
          :key="p"
          type="button"
          :class="['d-chip', draft.priority.includes(p) && 'd-chip-on']"
          @click="togglePriority(p)"
        >
          {{ p === "none" ? "-" : p.toLowerCase() }}
        </button>
      </div>
    </div>
    <div class="d-filter-section">
      <p class="d-filter-label">state</p>
      <div class="d-filter-chips">
        <button
          v-for="s in STATES"
          :key="s"
          type="button"
          :class="['d-chip', draft.state.includes(s) && 'd-chip-on']"
          @click="toggleState(s)"
        >
          {{ s }}
        </button>
      </div>
    </div>
    <div v-if="availableTags.length" class="d-filter-section">
      <p class="d-filter-label">tags</p>
      <div class="d-filter-chips">
        <button
          v-for="t in availableTags"
          :key="t"
          type="button"
          :class="['d-chip', draft.tags.includes(t) && 'd-chip-on']"
          @click="toggleTag(t)"
        >
          {{ t }}
        </button>
      </div>
    </div>
    <div class="d-filter-actions">
      <button type="button" class="d-btn-text" @click="clear">clear</button>
      <button type="button" class="d-btn-primary" @click="apply">apply</button>
    </div>
  </div>
</template>

<style scoped>
.d-filter-pop {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 240px;
}
.d-filter-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.d-filter-label {
  font-family:
    "JetBrains Mono", "Diatype Mono Variable", ui-monospace, monospace;
  font-size: 0.625rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(0, 0, 0, 0.5);
}
.d-filter-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.d-chip {
  font-family:
    "JetBrains Mono", "Diatype Mono Variable", ui-monospace, monospace;
  font-size: 0.6875rem;
  text-transform: lowercase;
  letter-spacing: 0.04em;
  color: rgba(0, 0, 0, 0.85);
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.12);
  padding: 3px 8px;
  border-radius: 2px;
  cursor: pointer;
  transition: background 150ms ease;
}
.d-chip:hover {
  background: rgba(0, 0, 0, 0.04);
}
.d-chip-on {
  background: #000000;
  color: #ffffff;
  border-color: #000000;
}
.d-filter-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 6px;
  border-top: 1px solid rgba(0, 0, 0, 0.12);
}
.d-btn-text {
  font-family:
    "JetBrains Mono", "Diatype Mono Variable", ui-monospace, monospace;
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(0, 0, 0, 0.6);
  background: transparent;
  border: 0;
  padding: 4px 8px;
  cursor: pointer;
}
.d-btn-text:hover {
  color: rgba(0, 0, 0, 0.85);
}
.d-btn-primary {
  font-family:
    "JetBrains Mono", "Diatype Mono Variable", ui-monospace, monospace;
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #ffffff;
  background: #000000;
  border: 1px solid #000000;
  padding: 4px 12px;
  border-radius: 2px;
  cursor: pointer;
}
</style>
