<script setup lang="ts">
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import type { TodoRow } from "../../types/database";
import { useVaultStore } from "../../stores/vault";
import {
  projectColor,
  projectColorText,
} from "../../composables/useProjectColor";
import TodoEditor from "../TodoEditor.vue";
import WhenPicker from "../WhenPicker.vue";
import { effectiveWhen, type WhenPatch } from "../../utils/when";

/**
 * Dense row: same behavior as TaskRow (HTML5 drag-to-sidebar, click-to-expand
 * into TodoEditor, checkbox toggle, delete-on-hover, project chip with
 * deterministic color, when chip) but rendered as one dense grid line. The
 * optional area chip sits between the priority marker and the title.
 */

const props = defineProps<{
  todo: TodoRow;
  showProject?: boolean;
  // Show the task's area beside the title (Today / Anytime aggregate views).
  showArea?: boolean;
}>();

const vault = useVaultStore();
const { projects, areas } = storeToRefs(vault);
const expanded = ref(false);

const project = computed(() =>
  props.todo.project_id
    ? (projects.value.find((p) => p.id === props.todo.project_id) ?? null)
    : null,
);

const area = computed(() =>
  props.todo.area_id
    ? (areas.value.find((a) => a.id === props.todo.area_id) ?? null)
    : null,
);

const isCompleted = computed(() => props.todo.state === "completed");

const hasWhen = computed(
  () =>
    effectiveWhen({
      state: props.todo.state,
      start_date: props.todo.start_date,
      evening: !!props.todo.evening,
    }).key !== null,
);

const deadlineLabel = computed(() => {
  if (!props.todo.deadline) return null;
  const days = Math.ceil(
    (new Date(props.todo.deadline).getTime() - Date.now()) / 86_400_000,
  );
  if (days < 0) return `${Math.abs(days)}d ago`;
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 14) return `${days}d`;
  return new Date(props.todo.deadline).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
});

const deadlineClass = computed(() => {
  if (!props.todo.deadline) return "";
  const days = Math.ceil(
    (new Date(props.todo.deadline).getTime() - Date.now()) / 86_400_000,
  );
  if (days < 0) return "d-when-overdue";
  if (days < 7) return "d-when-warn";
  return "d-when-default";
});

const priorityClass = computed(() => {
  switch (props.todo.priority) {
    case "P0":
      return "d-pri-p0";
    case "P1":
      return "d-pri-p1";
    case "P2":
      return "d-pri-p2";
    default:
      return "d-pri-none";
  }
});

async function toggle() {
  await vault.toggleComplete(props.todo);
}
async function commitWhen(p: WhenPatch) {
  // Quick "when" from the row - drop a task into today (or schedule it) without
  // opening the editor. reconcileListsMembership runs inside updateTodo.
  await vault.updateTodo(props.todo.id, p as never);
}
async function remove() {
  await vault.deleteTodoWithUndo(props.todo);
}

function onDragStart(e: DragEvent) {
  if (!e.dataTransfer) return;
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("application/x-hmart-todo", props.todo.id);
  e.dataTransfer.setData("text/plain", props.todo.title);
}
</script>

<template>
  <div>
    <div
      class="d-row group"
      :class="{ 'd-row-done': isCompleted }"
      draggable="true"
      @dragstart="onDragStart"
      @click="expanded = !expanded"
    >
      <input
        type="checkbox"
        class="d-checkbox"
        :checked="isCompleted"
        :aria-label="isCompleted ? 'mark not done' : 'mark done'"
        @click.stop
        @change="toggle"
      />
      <span
        v-if="todo.priority"
        :class="['d-pri', priorityClass]"
        :aria-label="`priority ${todo.priority}`"
        >{{ todo.priority.toLowerCase() }}</span
      >
      <span
        v-if="showArea && area"
        class="d-area-chip"
        :title="`area: ${area.name}`"
      >
        <span
          class="d-proj-dot"
          :style="{ background: projectColor(area.slug) }"
        ></span>
        {{ area.name.toLowerCase() }}
      </span>
      <p class="d-title">{{ todo.title }}</p>
      <span
        v-if="showProject && project"
        class="d-proj"
        :style="{ color: projectColorText(project.slug) }"
      >
        <span
          class="d-proj-dot"
          :style="{ background: projectColor(project.slug) }"
        ></span>
        {{ project.name }}
      </span>
      <WhenPicker
        class="d-row-when"
        :class="{ 'd-row-when-empty': !hasWhen }"
        variant="chip"
        :state="todo.state"
        :start-date="todo.start_date"
        :evening="!!todo.evening"
        @change="commitWhen"
      />
      <span v-if="deadlineLabel" class="d-when" :class="deadlineClass">{{
        deadlineLabel
      }}</span>
      <button
        class="d-row-del"
        :aria-label="`delete ${todo.title}`"
        title="delete"
        @click.stop="remove"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          aria-hidden="true"
        >
          <path
            d="M3 4h10M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1M6 7v5M10 7v5M4 4l1 9a1 1 0 001 1h4a1 1 0 001-1l1-9"
          />
        </svg>
      </button>
    </div>
    <TodoEditor v-if="expanded" :todo="todo" @close="expanded = false" />
  </div>
</template>

<style scoped>
.d-row {
  /* Flex, not a fixed grid: the optional cells (priority / area / project /
     deadline) render conditionally, so a fixed N-column grid mis-slots the
     title and right-aligned cells whenever one is absent. Flex keeps the title
     greedy and every trailing chip hugged to the right regardless of which
     cells are present. */
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--d-row-border);
  font-size: 0.8125rem;
  background: transparent;
  transition: background 120ms ease;
  cursor: pointer;
  min-height: 32px;
}
.d-row > * {
  flex-shrink: 0;
}
.d-row > .d-title {
  flex: 1 1 0;
  min-width: 0;
}
.d-row:hover {
  background: var(--d-row-bg-hover);
}
.d-row-done .d-title {
  text-decoration: line-through;
  color: var(--sl-400);
}
.d-checkbox {
  width: 14px;
  height: 14px;
  border: 1.5px solid var(--sl-300);
  border-radius: 3px;
  appearance: none;
  cursor: pointer;
  background: transparent;
  transition:
    background 150ms ease,
    border-color 150ms ease;
}
.d-checkbox:checked {
  background: var(--sl-900);
  border-color: var(--sl-900);
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='white' stroke-width='2'><path d='M3 8.5l3 3 7-7'/></svg>");
  background-position: center;
  background-repeat: no-repeat;
  background-size: 11px;
}
.d-pri {
  font-family:
    "Diatype Mono Variable", "JetBrains Mono", ui-monospace, monospace;
  font-variation-settings: "MONO" 1;
  font-size: 0.625rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  padding: 1px 5px;
  border-radius: 3px;
  flex-shrink: 0;
}
.d-pri-p0 {
  color: #ffffff;
  background: var(--acc-carnation);
}
.d-pri-p1 {
  color: var(--acc-hard-text);
  background: rgba(232, 155, 27, 0.16);
}
.d-pri-p2 {
  color: var(--acc-reverse-text);
  background: rgba(110, 75, 208, 0.14);
}
.d-pri-none {
  display: none;
}
.d-title {
  font-weight: 500;
  color: var(--sl-900);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.d-proj {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.6875rem;
  font-weight: 500;
  white-space: nowrap;
}
.d-area-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family:
    "Diatype Mono Variable", "JetBrains Mono", ui-monospace, monospace;
  font-variation-settings: "MONO" 1;
  font-size: 0.625rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--sl-500);
  white-space: nowrap;
}
.d-proj-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.d-when {
  font-family:
    "Diatype Mono Variable", "JetBrains Mono", ui-monospace, monospace;
  font-variation-settings: "MONO" 1;
  font-size: 0.6875rem;
  white-space: nowrap;
}
.d-when-overdue {
  color: var(--acc-versus-text);
  font-weight: 600;
}
.d-when-warn {
  color: var(--acc-hard-text);
}
.d-when-default {
  color: var(--sl-500);
}
.d-row-del {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--sl-400);
  background: transparent;
  border: 0;
  border-radius: 3px;
  cursor: pointer;
  opacity: 0;
  transition:
    opacity 150ms ease,
    color 150ms ease,
    background 150ms ease;
}
.d-row:hover .d-row-del,
.d-row:focus-within .d-row-del {
  opacity: 1;
}
.d-row-del:hover {
  color: var(--acc-versus-text);
  background: rgba(229, 57, 28, 0.08);
}
/* The when-chip shows its label whenever something is scheduled. When empty it
   is just a faint calendar affordance, revealed on row hover (desktop) and
   always visible on touch so any task can be dropped into Today. */
.d-row-when-empty {
  opacity: 0;
  transition: opacity 150ms ease;
}
.d-row:hover .d-row-when-empty,
.d-row:focus-within .d-row-when-empty {
  opacity: 1;
}
@media (max-width: 600px) {
  .d-row-del {
    opacity: 1;
  }
  .d-row-when-empty {
    opacity: 1;
  }
}
</style>
