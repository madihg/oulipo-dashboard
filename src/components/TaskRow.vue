<script setup lang="ts">
import { computed, ref } from "vue";
import type { TodoRow } from "../types/database";
import { useVaultStore } from "../stores/vault";
import TodoEditor from "./TodoEditor.vue";

const props = defineProps<{
  todo: TodoRow;
  showProject?: boolean;
}>();

const vault = useVaultStore();
const expanded = ref(false);

const projectName = computed(() => {
  if (!props.showProject || !props.todo.project_id) return null;
  return (
    vault.projects.find((p) => p.id === props.todo.project_id)?.name ?? null
  );
});

const isCompleted = computed(() => props.todo.state === "completed");

const priorityClass = computed(() => {
  switch (props.todo.priority) {
    case "P0":
      return "text-acc-carnation-text";
    case "P1":
      return "text-acc-hard-text";
    case "P2":
      return "text-acc-reverse-text";
    default:
      return "text-text-tertiary";
  }
});

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
  if (days < 0) return "text-acc-carnation-text"; // overdue
  if (days < 7) return "text-acc-versus-text";
  return "text-text-tertiary";
});

async function toggle() {
  await vault.toggleComplete(props.todo);
}
async function remove() {
  await vault.deleteTodoWithUndo(props.todo);
}

// HTML5 drag: lets the user drop this row onto a project/area in the sidebar.
// AreasNav listens for the matching MIME type and calls vault.updateTodo.
function onDragStart(e: DragEvent) {
  if (!e.dataTransfer) return;
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("application/x-hmart-todo", props.todo.id);
  // Plaintext fallback so debugging / paste-to-text works
  e.dataTransfer.setData("text/plain", props.todo.title);
}
</script>

<script lang="ts">
// Module-scoped MIME type so TaskRow + AreasNav agree without prop drilling.
export const TODO_DRAG_MIME = "application/x-hmart-todo";
</script>
<template>
  <div>
    <div
      class="row group cursor-pointer"
      draggable="true"
      @dragstart="onDragStart"
      @click="expanded = !expanded"
    >
      <input
        type="checkbox"
        class="check"
        :checked="isCompleted"
        :aria-label="isCompleted ? 'mark not done' : 'mark done'"
        @click.stop
        @change="toggle"
      />
      <div class="flex-1 min-w-0">
        <p
          class="text-base leading-snug"
          :class="{
            'line-through text-text-tertiary': isCompleted,
            'text-text-primary': !isCompleted,
          }"
        >
          {{ todo.title }}
        </p>
        <p
          v-if="projectName || deadlineLabel"
          class="mt-s-1 font-mono uppercase tracking-tracked text-meta flex gap-s-3"
        >
          <span v-if="projectName" class="text-text-tertiary">
            {{ projectName }}
          </span>
          <span v-if="deadlineLabel" :class="deadlineClass">
            {{ deadlineLabel }}
          </span>
        </p>
      </div>
      <span v-if="todo.priority" :class="['pill', priorityClass]">
        {{ todo.priority }}
      </span>
      <div class="row-actions">
        <button
          class="icon-btn"
          :aria-label="`delete ${todo.title}`"
          title="delete"
          @click.stop="remove"
        >
          <svg
            width="14"
            height="14"
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
    </div>
    <TodoEditor v-if="expanded" :todo="todo" @close="expanded = false" />
  </div>
</template>
