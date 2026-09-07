<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watchEffect } from "vue";
import { storeToRefs } from "pinia";
import { useSelectionStore } from "../stores/selection";
import { useVaultStore } from "../stores/vault";
import { useToastStore, type ToastAction } from "../stores/toast";
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
 *  same success line while the rows showed the new value optimistically.
 *  A landed write carries its undo: a reschedule or a move takes rows out of
 *  the list on screen, and the toast is the only way back. */
function report(ok: boolean, done: string, n: number, undo?: ToastAction) {
  if (ok) toast.show(done, undo);
  else toast.show(`could not save - ${n} ${noun.value} unchanged`);
}
/** What `keys` held on every selected row before a bulk write. */
function remember(ids: string[], keys: string[]) {
  const before = new Map<string, Record<string, unknown>>();
  for (const id of ids) {
    const row = vault.findTodo(id) as unknown as
      Record<string, unknown> | undefined;
    if (!row) continue;
    const fields: Record<string, unknown> = {};
    for (const k of keys) fields[k] = row[k] ?? null;
    before.set(id, fields);
  }
  return before;
}
/** One write per distinct prior value, so each row goes back to where it was
 *  rather than all of them to wherever the first one was. */
function undoOf(before: Map<string, Record<string, unknown>>): ToastAction {
  return {
    label: "undo",
    run: async () => {
      const groups = new Map<
        string,
        { patch: Record<string, unknown>; ids: string[] }
      >();
      for (const [id, patch] of before) {
        const key = JSON.stringify(patch);
        const g = groups.get(key) ?? { patch, ids: [] };
        g.ids.push(id);
        groups.set(key, g);
      }
      for (const g of groups.values()) {
        const ok = await vault.bulkUpdate(g.ids, g.patch as never);
        if (!ok) toast.show("could not undo - refresh to see what landed");
      }
    },
  };
}
async function applyWhen(p: WhenPatch) {
  const n = selection.count;
  const ids = idList.value;
  const before = remember(ids, Object.keys(p));
  const ok = await vault.bulkUpdate(ids, p as never);
  report(ok, `rescheduled ${n} ${noun.value}`, n, undoOf(before));
}
async function applyPriority(p: TodoRow["priority"]) {
  const n = selection.count;
  const ids = idList.value;
  const before = remember(ids, ["priority"]);
  const ok = await vault.bulkUpdate(ids, { priority: p });
  report(
    ok,
    `set ${n} ${noun.value} to ${p ? p.toLowerCase() : "no priority"}`,
    n,
    undoOf(before),
  );
}
async function applyArea(areaId: string | null) {
  areaOpen.value = false;
  const n = selection.count;
  const ids = idList.value;
  const name = areaId
    ? (areas.value.find((a) => a.id === areaId)?.name ?? "area")
    : "no area";
  const before = remember(ids, ["area_id", "project_id"]);
  const ok = await vault.bulkUpdate(ids, {
    area_id: areaId,
    project_id: null,
  });
  report(
    ok,
    `moved ${n} ${noun.value} to ${name.toLowerCase()}`,
    n,
    undoOf(before),
  );
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
    <span class="cap bb-count">{{
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
          class="chip"
          :title="p.value ? `priority ${p.value}` : 'clear priority'"
          @click="applyPriority(p.value)"
        >
          {{ p.label }}
        </button>
      </div>
      <div class="bb-anchor" @click.stop>
        <button
          type="button"
          class="chip"
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
      <button type="button" class="chip chip-primary" @click="completeAll">
        complete
      </button>
      <button type="button" class="chip chip-danger" @click="deleteAll">
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
      <svg viewBox="0 0 12 12" aria-hidden="true">
        <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
      </svg>
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
  background: var(--paper);
  border: 1px solid var(--metal);
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
  white-space: nowrap;
}
.bb-group {
  display: inline-flex;
  gap: 2px;
}
/* The actions are the shared chip family (main.css): outlined at rest,
   complete is the ink chip, delete the danger chip. */
.bb-anchor {
  position: relative;
  display: inline-flex;
}
.bb-opt {
  display: block;
  width: 100%;
  text-align: left;
  font-family: var(--font-mono);
  font-variation-settings: "MONO" 1;
  font-size: var(--fs-label);
  text-transform: lowercase;
  color: var(--ink-85);
  background: transparent;
  border: 0;
  border-radius: 2px;
  padding: 6px 10px;
  cursor: pointer;
  white-space: nowrap;
  transition: background var(--dur-fast) var(--ease-out);
}
.bb-opt:hover {
  background: var(--ground-2);
}
.bb-sep {
  border-top: 1px solid var(--hair);
  margin: 4px 0;
}
.bb-x {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  color: var(--ink-40);
  background: transparent;
  border: 0;
  cursor: pointer;
  transition: color var(--dur-fast) var(--ease-out);
}
.bb-x svg {
  width: 12px;
  height: 12px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
}
.bb-x:hover {
  color: var(--ink);
}
@media (pointer: coarse) {
  .bulkbar .chip,
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
