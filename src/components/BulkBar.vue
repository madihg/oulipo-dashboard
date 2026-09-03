<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watchEffect } from "vue";
import { storeToRefs } from "pinia";
import { useSelectionStore } from "../stores/selection";
import { useVaultStore } from "../stores/vault";
import { useToastStore } from "../stores/toast";
import WhenPicker from "./WhenPicker.vue";
import Popover from "./Popover.vue";
import type { TodoRow } from "../types/database";
import type { WhenPatch } from "../utils/when";

/**
 * Bulk action bar. Appears (fixed, bottom-center) while any rows are
 * multi-selected (cmd/ctrl-click or shift-click in DenseRow). Every action
 * applies to the whole selection in one round trip via vault.bulkUpdate /
 * bulkComplete / bulkDelete. Escape clears the selection.
 */
const selection = useSelectionStore();
const vault = useVaultStore();
const toast = useToastStore();
const { areas } = storeToRefs(vault);

const areaOpen = ref(false);

const idList = computed(() => Array.from(selection.ids));
const noun = computed(() => (selection.count === 1 ? "task" : "tasks"));

const PRIORITIES: Array<{ value: TodoRow["priority"]; label: string }> = [
  { value: "P0", label: "p0" },
  { value: "P1", label: "p1" },
  { value: "P2", label: "p2" },
  { value: "ongoing", label: "~" },
  { value: null, label: "none" },
];

/** Report the write, not the intention: a failed bulk save used to toast the
 *  same success line while the rows showed the new value optimistically. */
function report(ok: boolean, done: string, n: number) {
  toast.show(ok ? done : `could not save - ${n} ${noun.value} unchanged`);
}
async function applyWhen(p: WhenPatch) {
  const n = selection.count;
  const ok = await vault.bulkUpdate(idList.value, p as never);
  report(ok, `rescheduled ${n} ${noun.value}`, n);
}
async function applyPriority(p: TodoRow["priority"]) {
  const n = selection.count;
  const ok = await vault.bulkUpdate(idList.value, { priority: p });
  report(
    ok,
    `set ${n} ${noun.value} to ${p ? p.toLowerCase() : "no priority"}`,
    n,
  );
}
async function applyArea(areaId: string | null) {
  areaOpen.value = false;
  const n = selection.count;
  const name = areaId
    ? (areas.value.find((a) => a.id === areaId)?.name ?? "area")
    : "no area";
  const ok = await vault.bulkUpdate(idList.value, {
    area_id: areaId,
    project_id: null,
  });
  report(ok, `moved ${n} ${noun.value} to ${name.toLowerCase()}`, n);
}
async function completeAll() {
  const ids = idList.value;
  // Snapshot where each row came from BEFORE completing, so undo can put every
  // one back in its own list rather than dumping them all in anytime.
  const before = new Map<string, TodoRow["state"]>();
  for (const id of ids) {
    const row = vault.findTodo(id);
    if (row) before.set(id, row.state);
  }
  const label = `${ids.length} ${ids.length === 1 ? "task" : "tasks"}`;
  selection.clear();
  await vault.bulkComplete(ids);
  // "complete" and "area" sit two buttons apart; a mis-tap sent twelve rows to
  // the logbook and the only way back was unchecking each one.
  toast.show(`completed ${label}`, {
    label: "undo",
    run: async () => {
      const byState = new Map<TodoRow["state"], string[]>();
      for (const [id, st] of before) {
        const arr = byState.get(st) ?? [];
        arr.push(id);
        byState.set(st, arr);
      }
      for (const [st, group] of byState) {
        await vault.bulkUpdate(group, { state: st, completed_at: null });
      }
    },
  });
}
async function deleteAll() {
  const ids = idList.value;
  selection.clear();
  // bulkDelete shows its own undo toast.
  await vault.bulkDelete(ids);
}

function onKeydown(e: KeyboardEvent) {
  if (e.key !== "Escape" || !selection.active) return;
  // An open overlay owns this Escape: another handler already consumed it, or
  // a Popover is on screen (it closes itself and never calls preventDefault).
  // First Escape closes the menu; the next one clears the selection.
  if (e.defaultPrevented) return;
  if (document.querySelector(".d-pop, [role='dialog']")) return;
  selection.clear();
}
onMounted(() => window.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown);
  document.documentElement.classList.remove("bulkbar-open");
});

// The fixed bar covers the last rows; pad the content pane while it is open
// (rule lives in main.css next to the tab-bar compensation).
watchEffect(() =>
  document.documentElement.classList.toggle("bulkbar-open", selection.active),
);
</script>

<template>
  <div
    v-if="selection.active || selection.selectMode"
    class="bulkbar"
    role="toolbar"
    aria-label="bulk actions"
  >
    <span class="bb-count">{{
      selection.count ? `${selection.count} selected` : "tap rows to select"
    }}</span>
    <div class="bb-actions" :class="{ 'bb-actions-off': !selection.count }">
      <WhenPicker
        variant="editor"
        state="anytime"
        :start-date="null"
        :evening="false"
        @change="applyWhen"
      />
      <div class="bb-group" role="group" aria-label="set priority">
        <button
          v-for="p in PRIORITIES"
          :key="p.label"
          type="button"
          class="bb-btn"
          :title="p.value ? `priority ${p.value}` : 'clear priority'"
          @click="applyPriority(p.value)"
        >
          {{ p.label }}
        </button>
      </div>
      <div class="bb-anchor" @click.stop>
        <button
          type="button"
          class="bb-btn"
          :aria-expanded="areaOpen"
          aria-haspopup="true"
          @click="areaOpen = !areaOpen"
        >
          area
        </button>
        <Popover :open="areaOpen" anchor="left" @close="areaOpen = false">
          <button
            v-for="a in areas"
            :key="a.id"
            type="button"
            class="bb-opt"
            @click="applyArea(a.id)"
          >
            {{ a.name.toLowerCase() }}
          </button>
          <div class="bb-sep" aria-hidden="true"></div>
          <button type="button" class="bb-opt" @click="applyArea(null)">
            no area
          </button>
        </Popover>
      </div>
      <button type="button" class="bb-btn" @click="completeAll">
        complete
      </button>
      <button type="button" class="bb-btn bb-danger" @click="deleteAll">
        delete
      </button>
    </div>
    <button
      type="button"
      class="bb-x"
      aria-label="clear selection (esc)"
      title="clear selection (esc)"
      @click="selection.clear()"
    >
      ×
    </button>
  </div>
</template>

<style scoped>
/* Inert, not hidden: the bar has to appear the moment select mode is on so it
   can say what the mode is for, but it must not offer to act on nothing. */
.bb-actions {
  display: contents;
}
.bb-actions-off {
  opacity: 0.35;
  pointer-events: none;
}

.bulkbar {
  position: fixed;
  bottom: 12px;
  /* Inset-auto centering, NOT transform: a transformed ancestor would become
     the containing block for the Popovers' position:fixed and fling them
     off-screen. */
  left: 0;
  right: 0;
  margin-inline: auto;
  width: fit-content;
  z-index: 45;
  display: flex;
  align-items: center;
  gap: 8px;
  background: #ffffff;
  border: 1px solid var(--sl-300);
  border-radius: 0;
  padding: 6px 10px;
  max-width: calc(100vw - 16px);
  overflow-x: auto;
}
@media (max-width: 767px) {
  .bulkbar {
    /* Clear the fixed mobile tab bar. */
    bottom: calc(70px + env(safe-area-inset-bottom, 0px));
  }
}
.bb-count {
  font-family:
    "Diatype Mono Variable", "JetBrains Mono", ui-monospace, monospace;
  font-variation-settings: "MONO" 1;
  font-size: 0.6875rem;
  color: var(--sl-500);
  white-space: nowrap;
}
.bb-group {
  display: inline-flex;
  gap: 2px;
}
.bb-btn {
  font-family:
    "Diatype Mono Variable", "JetBrains Mono", ui-monospace, monospace;
  font-variation-settings: "MONO" 1;
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--sl-700);
  background: transparent;
  border: 1px solid var(--sl-200);
  border-radius: 2px;
  padding: 3px 7px;
  cursor: pointer;
  white-space: nowrap;
  transition:
    background 150ms ease,
    color 150ms ease;
}
.bb-btn:hover {
  background: var(--sl-100);
  color: var(--sl-900);
}
.bb-danger:hover {
  color: var(--acc-versus-text);
  background: rgba(229, 57, 28, 0.08);
  border-color: rgba(229, 57, 28, 0.3);
}
.bb-anchor {
  position: relative;
  display: inline-flex;
}
.bb-opt {
  display: block;
  width: 100%;
  text-align: left;
  font-family:
    "Diatype Mono Variable", "JetBrains Mono", ui-monospace, monospace;
  font-variation-settings: "MONO" 1;
  font-size: 0.6875rem;
  text-transform: lowercase;
  color: var(--sl-800);
  background: transparent;
  border: 0;
  border-radius: 2px;
  padding: 6px 10px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 120ms ease;
}
.bb-opt:hover {
  background: rgba(0, 0, 0, 0.04);
}
.bb-sep {
  border-top: 1px solid var(--sl-200);
  margin: 4px 0;
}
.bb-x {
  color: var(--sl-400);
  background: transparent;
  border: 0;
  font-size: 0.75rem;
  cursor: pointer;
  padding: 2px 4px;
}
.bb-x:hover {
  color: var(--sl-900);
}
@media (pointer: coarse) {
  .bb-btn,
  .bb-x {
    min-height: var(--touch-target);
    min-width: var(--touch-target);
  }
  .bb-opt {
    min-height: var(--touch-target);
  }
}
/* Nine 44px buttons are ~600px wide once pointer:coarse pads them, so on a
   375px phone area / complete / delete / clear started off-screen inside an
   unmarked horizontal scroller. Let the bar wrap instead. */
@media (max-width: 767px) {
  .bulkbar {
    width: calc(100vw - 16px);
    flex-wrap: wrap;
    overflow: visible;
    row-gap: 6px;
  }
  .bb-count {
    flex-basis: 100%;
  }
}
</style>
