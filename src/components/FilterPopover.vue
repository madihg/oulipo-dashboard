<script setup lang="ts">
import { reactive, watch } from "vue";
import type { Effort, Priority, TodoState } from "../types/database";
import { EFFORTS } from "../utils/effort";
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
  effort: [...(props.value.effort ?? [])],
});

watch(
  () => props.value,
  (v) => {
    draft.tags = [...v.tags];
    draft.priority = [...v.priority];
    draft.state = [...v.state];
    draft.effort = [...(v.effort ?? [])];
  },
);

const PRIORITIES: Array<Priority | "none"> = [
  "P0",
  "P1",
  "P2",
  "ongoing",
  "none",
];
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
  apply();
}
// "unsized" is a size to filter by too: it is how a backlog gets sized.
const EFFORT_OPTS: Array<{
  value: Effort | "none";
  label: string;
  hint: string;
}> = [
  ...EFFORTS.map((e) => ({ value: e.name, label: e.label, hint: e.hint })),
  { value: "none", label: "unsized", hint: "no size yet" },
];
function toggleEffort(e: Effort | "none") {
  const i = draft.effort.indexOf(e);
  if (i >= 0) draft.effort.splice(i, 1);
  else draft.effort.push(e);
  apply();
}
function toggleState(s: TodoState) {
  const i = draft.state.indexOf(s);
  if (i >= 0) draft.state.splice(i, 1);
  else draft.state.push(s);
  apply();
}
function toggleTag(t: string) {
  const i = draft.tags.indexOf(t);
  if (i >= 0) draft.tags.splice(i, 1);
  else draft.tags.push(t);
  apply();
}

function apply() {
  emit("apply", {
    tags: [...draft.tags],
    priority: [...draft.priority],
    state: [...draft.state],
    effort: [...draft.effort],
  });
}
function clear() {
  draft.tags = [];
  draft.priority = [];
  draft.state = [];
  draft.effort = [];
  emit("clear");
}
</script>

<template>
  <div class="d-filter-pop">
    <div class="d-filter-section">
      <p class="cap">priority</p>
      <div class="d-filter-chips">
        <button
          v-for="p in PRIORITIES"
          :key="p"
          type="button"
          :class="['chip', draft.priority.includes(p) && 'chip-on']"
          @click="togglePriority(p)"
        >
          {{ p.toLowerCase() }}
        </button>
      </div>
    </div>
    <!-- Second, right under priority: "what fits the time or the energy I
         have" is the question this filter exists for. -->
    <div class="d-filter-section">
      <p class="cap">effort</p>
      <div class="d-filter-chips">
        <button
          v-for="e in EFFORT_OPTS"
          :key="e.value"
          type="button"
          :title="e.hint"
          :aria-pressed="draft.effort.includes(e.value)"
          :class="['chip', draft.effort.includes(e.value) && 'chip-on']"
          @click="toggleEffort(e.value)"
        >
          {{ e.label }}
        </button>
      </div>
    </div>
    <div class="d-filter-section">
      <p class="cap">state</p>
      <div class="d-filter-chips">
        <button
          v-for="s in STATES"
          :key="s"
          type="button"
          :class="['chip', draft.state.includes(s) && 'chip-on']"
          @click="toggleState(s)"
        >
          {{ s }}
        </button>
      </div>
    </div>
    <div v-if="availableTags.length" class="d-filter-section">
      <p class="cap">tags</p>
      <div class="d-filter-chips">
        <button
          v-for="t in availableTags"
          :key="t"
          type="button"
          :class="['chip', draft.tags.includes(t) && 'chip-on']"
          @click="toggleTag(t)"
        >
          {{ t }}
        </button>
      </div>
    </div>
    <div class="d-filter-actions">
      <button type="button" class="chip chip-quiet" @click="clear">
        clear
      </button>
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
.d-filter-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.d-filter-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 6px;
  border-top: 1px solid var(--hair);
}
</style>
