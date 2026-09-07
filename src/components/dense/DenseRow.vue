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
import { isContext, sortTagsByContext } from "../../utils/contexts";
import { effectiveWhen, type WhenPatch } from "../../utils/when";
import { useSelectionStore } from "../../stores/selection";
import { useIsPhone } from "../../composables/useMediaQuery";

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
// draggable="true" on a phone arms iOS's native long-press drag and hands the
// touch to the OS, which killed Sortable's reorder outside a 180-500ms hold
// window. There is nothing for HTML5 drag to land on there anyway - the nav
// drop targets need dataTransfer, which touch does not have.
const isPhone = useIsPhone();
const { projects, areas, tags: tagRegistry } = storeToRefs(vault);
const expanded = ref(false);

// Tag chips: show up to two, then a "+n" spill. Registry color wins; a tag
// with no color gets the same deterministic slug color the projects use.
const MAX_TAG_CHIPS = 2;
const rowTags = computed(() => sortTagsByContext(props.todo.tags ?? []));
const visibleTags = computed(() => rowTags.value.slice(0, MAX_TAG_CHIPS));
const overflowTagCount = computed(() =>
  Math.max(0, rowTags.value.length - MAX_TAG_CHIPS),
);
function tagStyle(name: string) {
  // Contexts take no inline colour: .d-tag-ctx paints them neutral in CSS.
  // A freeform tag may still carry a registry colour the user chose.
  if (isContext(name)) return undefined;
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

// Area chip: the area's leading emoji is its mark. Area names are
// user-authored ("🩺 health", "💲earn"), so the emoji is the user's own label,
// which beats an anonymous colour dot on a phone where the name doesn't fit.
const AREA_EMOJI_RE = /^\s*(\p{Extended_Pictographic}️?)\s*/u;
const areaEmoji = computed(
  () => area.value?.name.match(AREA_EMOJI_RE)?.[1] ?? null,
);
const areaLabel = computed(() =>
  area.value
    ? area.value.name.replace(AREA_EMOJI_RE, "").toLowerCase().trim() ||
      area.value.slug
    : "",
);

/**
 * The area chip is neutral. It used to wash itself in one of 35 project hues
 * at 13% alpha, which put a second accent system next to the priority pill:
 * a single 36px row could show four unrelated colours plus cobalt. The user's
 * own emoji already identifies the area, which is why it is there. The hue
 * survives only on the dot, for the areas that have no emoji.
 */
const areaChipStyle = computed(() => ({}) as Record<string, string>);

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
  const wasCompleted = props.todo.state === "completed";
  const snapshot = props.todo;
  await vault.toggleComplete(props.todo);
  // Completing removes the row from today, inbox, project and area at once.
  // Deleting has said so with an undo since the start; completing said nothing,
  // and the checkbox is the easiest control on the row to hit by accident.
  if (wasCompleted) return;
  const { useToastStore } = await import("../../stores/toast");
  useToastStore().show(`completed "${truncate(snapshot.title, 40)}"`, {
    label: "undo",
    run: () => vault.toggleComplete({ ...snapshot, state: "completed" }),
  });
}
function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
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
  // Carry the current schedule too, so a drop that has to ASK for a date (onto
  // Upcoming) can open its calendar already showing what the task holds now.
  // dataTransfer is the only channel: the drop handler lives in App.vue, and
  // no store exposes one flat list of every loaded todo to look it up in.
  e.dataTransfer.setData(
    "application/x-hmart-when",
    JSON.stringify({
      state: props.todo.state,
      start_date: props.todo.start_date,
      evening: !!props.todo.evening,
    }),
  );
}
</script>

<template>
  <div>
    <div
      class="d-row"
      :class="{
        'd-row-done': isCompleted,
        'd-row-selected': isSelected,
        'd-row-open': expanded,
      }"
      :draggable="!isPhone"
      @dragstart="onDragStart"
      @mousedown="onRowMousedown"
      @click="onRowClick"
    >
      <!-- Hover-revealed grip: the only thing on a row that says it can be
           dragged onto a list, an area or a project. The areas sidebar already
           teaches the gesture the same way. Not on phones, where the row is
           not draggable at all. -->
      <span
        v-if="!isPhone"
        class="d-row-grip"
        aria-hidden="true"
        title="drag to a list, area or project"
      >
        <svg viewBox="0 0 10 16">
          <circle cx="3" cy="4" r="1" />
          <circle cx="7" cy="4" r="1" />
          <circle cx="3" cy="8" r="1" />
          <circle cx="7" cy="8" r="1" />
          <circle cx="3" cy="12" r="1" />
          <circle cx="7" cy="12" r="1" />
        </svg>
      </span>
      <!-- In select mode the checkbox selects instead of completing. It used
           to stay a complete box, so the only phone path to a bulk move looked
           identical to the normal list and the first tap completed a task. -->
      <input
        v-if="selection.selectMode"
        type="checkbox"
        class="d-checkbox d-checkbox-select"
        :checked="isSelected"
        :aria-label="isSelected ? 'deselect' : 'select'"
        @click.stop
        @change="selection.toggle(todo.id)"
      />
      <input
        v-else
        type="checkbox"
        class="d-checkbox"
        :checked="isCompleted"
        :aria-label="isCompleted ? 'mark not done' : 'mark done'"
        @click.stop
        @change="toggle"
      />
      <!-- Priority is a mark, not a fill: a level-coloured dot and a mono
           label (brand: tribe colour lives in a dot, an underline or an
           eyebrow, never a field). P0 used to be a solid cobalt pill on every
           P0 row, which spent the one cobalt note per surface many times over. -->
      <span
        v-if="todo.priority"
        :class="['d-pri', priorityClass]"
        :aria-label="`priority ${todo.priority}`"
        ><i class="dot" aria-hidden="true"></i>{{ priorityLabel }}</span
      >
      <span
        v-if="showArea && area"
        class="d-area-chip"
        :style="areaChipStyle"
        :title="`area: ${area.name}`"
      >
        <span v-if="areaEmoji" class="d-area-emoji">{{ areaEmoji }}</span>
        <span
          v-else
          class="d-proj-dot"
          :style="{ background: projectColor(area.slug) }"
        ></span>
        <span class="d-area-chip-name">{{ areaLabel }}</span>
      </span>
      <!-- Context first, then the rest: the chip sits BEFORE the title so a
           row reads as its working mode - "p0 earn email <title>". -->
      <span
        v-for="tag in visibleTags"
        :key="tag"
        class="d-tag-chip"
        :class="{ 'd-tag-ctx': isContext(tag) }"
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
      <p class="d-title">{{ todo.title }}</p>
      <span v-if="showProject && project" class="d-proj">
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
  /* A long-press must reach Sortable, not the platform: no text selection and
     no iOS callout on the row itself. */
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
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
  font-size: var(--fs-row);
  background: transparent;
  transition: background var(--dur-fast) ease;
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
  color: var(--ink-40);
}
.d-checkbox {
  width: 14px;
  height: 14px;
  border: 1.5px solid var(--metal);
  border-radius: 3px;
  appearance: none;
  cursor: pointer;
  background: transparent;
  transition:
    background var(--dur-fast) ease,
    border-color var(--dur-fast) ease;
}
.d-checkbox:checked {
  background: var(--ink);
  border-color: var(--ink);
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='white' stroke-width='2'><path d='M3 8.5l3 3 7-7'/></svg>");
  background-position: center;
  background-repeat: no-repeat;
  background-size: 11px;
}
.d-pri {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: var(--font-mono);
  font-variation-settings: "MONO" 1;
  font-size: var(--fs-caption);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ink-70);
  flex-shrink: 0;
}
.d-pri-p0 {
  --dot: var(--acc-carnation);
  color: var(--ink-85);
}
.d-pri-p1 {
  --dot: var(--acc-hard);
}
.d-pri-p2 {
  --dot: var(--acc-reverse);
}
.d-pri-ongoing {
  --dot: var(--acc-ongoing);
}
.d-pri-none {
  display: none;
}
.d-title {
  font-weight: 500;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.d-proj {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--fs-label);
  font-weight: 500;
  white-space: nowrap;
  color: var(--ink-60);
}
/* Same idiom as .d-pri: a small tinted pill. Tint + text color come inline
   from the area's own palette color (areaChipStyle). */
.d-area-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-family: var(--font-mono);
  font-variation-settings: "MONO" 1;
  font-size: var(--fs-caption);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 1px 5px;
  border-radius: 3px;
  white-space: nowrap;
  flex-shrink: 0;
  background: var(--ink-08);
  color: var(--ink-70);
}
.d-area-emoji {
  /* Emoji render from the system emoji font; keep them optically in scale
     with the 10px mono label. */
  font-size: var(--fs-label);
  line-height: 1;
}
.d-proj-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
/* Neutral by default: the label identifies the tag, colour is priority's job. */
.d-tag-ctx {
  color: var(--ink-70);
}
/* Square, and cobalt when on: selection is the app's one "active" accent, and
   the square says "this is a selection" against the round complete box. */
/* An expanded row showed its title and every fact twice: once here and again
   in the editor mounted directly below. The editor is the representation while
   it is open, so the row keeps only what the editor has no copy of - the
   complete box and the delete button. */
.d-row-open .d-title,
.d-row-open .d-pri,
.d-row-open .d-area-chip,
.d-row-open .d-tag-chip,
.d-row-open .d-proj,
.d-row-open .d-row-when,
.d-row-open .d-when {
  display: none;
}
.d-row-open {
  min-height: 0;
  padding-bottom: 0;
}
.d-row-grip {
  width: 10px;
  height: 16px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  opacity: 0;
  cursor: grab;
  transition: opacity var(--dur-fast) ease;
}
.d-row:hover .d-row-grip {
  opacity: 1;
}
.d-row-grip svg {
  width: 10px;
  height: 16px;
  fill: var(--ink-40);
}
.d-checkbox-select {
  border-radius: 2px;
  accent-color: var(--acc-carnation);
}
.d-tag-chip {
  font-family: var(--font-mono);
  font-variation-settings: "MONO" 1;
  font-size: var(--fs-caption);
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
  color: var(--ink-50);
}
.d-when {
  font-family: var(--font-mono);
  font-variation-settings: "MONO" 1;
  font-size: var(--fs-label);
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
  color: var(--ink-50);
}
.d-row-del {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--ink-40);
  background: transparent;
  border: 0;
  border-radius: 3px;
  cursor: pointer;
  opacity: 0;
  transition:
    opacity var(--dur-fast) ease,
    color var(--dur-fast) ease,
    background var(--dur-fast) ease;
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
  transition: opacity var(--dur-fast) ease;
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
  /* The area pill drops its name and keeps the emoji - the user's own label
     for the area, legible at a glance where the full name doesn't fit. (Areas
     without a leading emoji fall back to their color dot.) */
  .d-area-chip {
    gap: 0;
    padding: 1px 4px;
  }
  .d-area-chip-name {
    display: none;
  }
  /* The project chip shrinks to its dot: font-size 0 leaves only the
     fixed-size .d-proj-dot child visible. Full name is in the editor on tap. */
  .d-proj {
    font-size: 0;
    gap: 0;
    letter-spacing: 0;
  }
  .d-row-when {
    display: none;
  }
  /* Freeform tags have no dot to collapse to - hide them on phones; the full
     list lives in the editor. The CONTEXT chip stays: it is the row's working
     mode ("email", "web"), one short mono word, and with the area collapsed to
     its emoji there is room for it on the 36px line. */
  .d-tag-chip:not(.d-tag-ctx) {
    display: none;
  }
  .d-tag-ctx {
    padding: 1px 4px;
    /* 11ch fits "think-plan"; 9ch truncated it on every phone. */
    max-width: 11ch;
  }
  /* One context on the phone line: a second (buy+web) costs title width. */
  .d-tag-ctx ~ .d-tag-ctx {
    display: none;
  }
}
</style>
