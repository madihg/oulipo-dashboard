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
import { useSelectionStore } from "../../stores/selection";

/**
 * Dense row - THE task row (the only one; the old TaskRow was removed as dead
 * code). One dense line: HTML5 drag-to-sidebar, click-to-expand into
 * TodoEditor, checkbox toggle, delete-on-hover, deterministic project color,
 * when chip. The optional area chip sits between the priority marker and the
 * title. On phones the chips compress to dots so the line stays single.
 */

const props = defineProps<{
  todo: TodoRow;
  showProject?: boolean;
  // Show the task's area beside the title (Today / Anytime aggregate views).
  showArea?: boolean;
}>();

const vault = useVaultStore();
const selection = useSelectionStore();
const { projects, areas, tags: tagRegistry } = storeToRefs(vault);
const expanded = ref(false);

// Tag chips: show up to two, then a "+n" spill. Registry color wins; a tag
// with no color gets the same deterministic slug color the projects use.
const MAX_TAG_CHIPS = 2;
const rowTags = computed(() => props.todo.tags ?? []);
const visibleTags = computed(() => rowTags.value.slice(0, MAX_TAG_CHIPS));
const overflowTagCount = computed(() =>
  Math.max(0, rowTags.value.length - MAX_TAG_CHIPS),
);
function tagStyle(name: string) {
  const reg = tagRegistry.value.find((t) => t.name === name);
  return { color: reg?.color || projectColorText(name) };
}

const isSelected = computed(() => selection.has(props.todo.id));

// cmd/ctrl-click toggles selection, shift-click extends the range; in select
// mode (the toolbar toggle, the touch entry point) a plain tap selects too.
// Otherwise a plain click keeps its existing meaning (expand the editor).
function onRowClick(e: MouseEvent) {
  if (e.metaKey || e.ctrlKey) {
    selection.toggle(props.todo.id);
    return;
  }
  if (e.shiftKey) {
    selection.selectRange(props.todo.id);
    return;
  }
  if (selection.selectMode) {
    selection.toggle(props.todo.id);
    return;
  }
  expanded.value = !expanded.value;
}
// Shift-click would otherwise smear a text selection across rows.
function onRowMousedown(e: MouseEvent) {
  if (e.shiftKey) e.preventDefault();
}

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
    case "ongoing":
      return "d-pri-ongoing";
    default:
      return "d-pri-none";
  }
});
// "ongoing" shows as ~ (its glyph); the others show p0/p1/p2.
const priorityLabel = computed(() =>
  props.todo.priority === "ongoing"
    ? "~"
    : (props.todo.priority?.toLowerCase() ?? ""),
);

async function toggle() {
  await vault.toggleComplete(props.todo);
}
async function commitWhen(p: WhenPatch) {
  // Quick "when" from the row - drop a task into today (or schedule it) without
  // opening the editor. reconcileListsMembership runs inside updateTodo.
  await vault.updateTodo(props.todo.id, p as never);
}
async function remove() {
  // A deleted row must not linger in the multi-select count.
  selection.drop(props.todo.id);
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
      class="d-row"
      :class="{ 'd-row-done': isCompleted, 'd-row-selected': isSelected }"
      draggable="true"
      @dragstart="onDragStart"
      @mousedown="onRowMousedown"
      @click="onRowClick"
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
        >{{ priorityLabel }}</span
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
        v-for="tag in visibleTags"
        :key="tag"
        class="d-tag-chip"
        :style="tagStyle(tag)"
        :title="`tags: ${rowTags.join(', ')}`"
      >
        {{ tag }}
      </span>
      <span
        v-if="overflowTagCount"
        class="d-tag-chip d-tag-chip-more"
        :title="`tags: ${rowTags.join(', ')}`"
      >
        +{{ overflowTagCount }}
      </span>
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
.d-row-selected,
.d-row-selected:hover {
  background: var(--cobalt-tint);
  box-shadow: inset 2px 0 0 0 var(--acc-carnation);
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
.d-pri-ongoing {
  color: var(--acc-ongoing-text);
  background: rgba(15, 118, 110, 0.13);
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
.d-tag-chip {
  font-family:
    "Diatype Mono Variable", "JetBrains Mono", ui-monospace, monospace;
  font-variation-settings: "MONO" 1;
  font-size: 0.625rem;
  letter-spacing: 0.04em;
  padding: 1px 5px;
  border-radius: 3px;
  background: var(--ink-08);
  white-space: nowrap;
  max-width: 14ch;
  overflow: hidden;
  text-overflow: ellipsis;
}
.d-tag-chip-more {
  color: var(--sl-500);
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
   is just a faint calendar affordance, revealed on row hover. (On phones the
   chip is hidden entirely - scheduling lives in the editor, one tap away.) */
.d-row-when-empty {
  opacity: 0;
  transition: opacity 150ms ease;
}
.d-row:hover .d-row-when-empty,
.d-row:focus-within .d-row-when-empty {
  opacity: 1;
}
/* Touch decides only what hover cannot: reveal the hover-hidden controls.
   Layout stays in the width query below (a pointer:coarse layout can never be
   seen in a dev browser - repo convention, see Inbox/ClaudeInboxSection). */
@media (pointer: coarse) {
  .d-row-del,
  .d-row-when-empty {
    opacity: 1;
  }
}
/* Phone: KEEP the single dense line (per Halim - compact, one line per task).
   One line can't hold every full-width chip, so the metadata compresses
   instead of wrapping: area and project chips collapse to their color dots,
   the when-chip steps aside (scheduling lives in the editor a tap away), the
   priority pill and deadline stay - they're small and they're the signal.
   The title keeps the rest of the line. No markup changes, so drag / select /
   expand still work; laptop is untouched. */
@media (max-width: 600px) {
  .d-row {
    column-gap: 6px;
    padding: 6px 10px;
    min-height: 36px;
  }
  /* Compact visuals, finger-sized targets: an invisible ::after pad extends
     the hitbox without growing the 36px row (same trick as main.css .check). */
  .d-checkbox,
  .d-row-del {
    position: relative;
  }
  .d-checkbox::after,
  .d-row-del::after {
    content: "";
    position: absolute;
    inset: -10px;
  }
  .d-checkbox {
    width: 16px;
    height: 16px;
  }
  /* Chips shrink to their dots: font-size 0 leaves only the fixed-size
     .d-proj-dot child visible. Full names are in the editor on tap. */
  .d-area-chip,
  .d-proj {
    font-size: 0;
    gap: 0;
    letter-spacing: 0;
  }
  .d-row-when {
    display: none;
  }
  /* Tag chips have no dot to collapse to - hide them on phones; the full tag
     list lives in the row title tooltip and the editor. */
  .d-tag-chip {
    display: none;
  }
}
</style>
