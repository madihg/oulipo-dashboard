<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import Sortable from "sortablejs";
import { useVaultStore } from "../stores/vault";
import DenseGroup from "./dense/DenseGroup.vue";
import DenseRow from "./dense/DenseRow.vue";
import type { Priority, TodoRow } from "../types/database";

/**
 * Reusable priority-column kanban. Drag a task between columns to reprioritize;
 * drag within a column to reorder. Persists via vault.reorderTodos.
 *
 * Desktop: auto-fit grid of columns. Mobile (<768px): horizontal scroll-snap
 * strip, one column at a time (swipe across). Touch drag is press-hold so a
 * normal swipe still scrolls.
 *
 * `group` must be unique per mounted board so two boards never cross-drop.
 */
const props = defineProps<{ todos: TodoRow[]; group?: string }>();
const emit = defineEmits<{ add: []; reordered: [] }>();

const vault = useVaultStore();

type Col = {
  id: string;
  label: string;
  priority: Priority | null;
  accent: "carnation" | "hard" | "reverse" | "neutral";
};
const cols: Col[] = [
  { id: "P0", label: "p0", priority: "P0", accent: "carnation" },
  { id: "P1", label: "p1", priority: "P1", accent: "hard" },
  { id: "P2", label: "p2", priority: "P2", accent: "reverse" },
  { id: "none", label: "no priority", priority: null, accent: "neutral" },
];

const grouped = computed<Record<string, TodoRow[]>>(() => {
  const out: Record<string, TodoRow[]> = { P0: [], P1: [], P2: [], none: [] };
  for (const t of props.todos) out[t.priority ?? "none"]!.push(t);
  return out;
});

const colRefs = ref<Record<string, HTMLElement | null>>({});
const sortables: Sortable[] = [];
const groupName = computed(() => props.group ?? "kanban");

function initSortables() {
  while (sortables.length) sortables.pop()?.destroy();
  for (const col of cols) {
    const el = colRefs.value[col.id];
    if (!el) continue;
    sortables.push(
      Sortable.create(el, {
        group: groupName.value,
        animation: 150,
        handle: ".d-row",
        ghostClass: "opacity-30",
        chosenClass: "d-sortable-chosen",
        dragClass: "d-sortable-drag",
        // Touch: press-hold to drag so a normal swipe scrolls the column strip.
        delay: 180,
        delayOnTouchOnly: true,
        touchStartThreshold: 8,
        // Carry the todo id on the native drag so a drop onto a sidebar area /
        // project (AreasNav) can reassign it. Sortable owns the drag here, so
        // DenseRow's own dragstart never fires - set the MIME ourselves.
        setData: (dt, dragEl) => {
          const id = (dragEl as HTMLElement).dataset.id;
          if (id) dt.setData("application/x-hmart-todo", id);
        },
        onEnd: async (evt) => {
          const fromColId = evt.from.parentElement?.dataset.col ?? null;
          const toColId = evt.to.parentElement?.dataset.col ?? null;
          const todoId = evt.item.dataset.id;
          if (!todoId || !toColId) return;
          const targetCol = cols.find((c) => c.id === toColId);
          if (!targetCol) return;
          const destEl = colRefs.value[toColId];
          if (!destEl) return;
          const orderedIds = Array.from(destEl.children)
            .map((n) => (n as HTMLElement).dataset.id)
            .filter((x): x is string => !!x);
          const updates: Array<{
            id: string;
            position: number;
            priority?: TodoRow["priority"];
          }> = orderedIds.map((id, i) => ({
            id,
            position: i,
            priority: targetCol.priority,
          }));
          if (fromColId && fromColId !== toColId) {
            const sourceEl = colRefs.value[fromColId];
            if (sourceEl) {
              const sourceIds = Array.from(sourceEl.children)
                .map((n) => (n as HTMLElement).dataset.id)
                .filter((x): x is string => !!x);
              updates.push(...sourceIds.map((id, i) => ({ id, position: i })));
            }
          }
          await vault.reorderTodos(updates);
          emit("reordered");
          if (evt.item instanceof HTMLElement) {
            (evt.item.querySelector(":focus") as HTMLElement | null)?.blur();
            evt.item.blur();
          }
          (document.activeElement as HTMLElement | null)?.blur();
        },
      }),
    );
  }
}

// Re-init when the board first gets data or the set changes shape.
watch(
  () => props.todos.length,
  () => void nextTick(initSortables),
  { immediate: true },
);

onBeforeUnmount(() => {
  while (sortables.length) sortables.pop()?.destroy();
});
</script>

<template>
  <div class="d-kanban-grid">
    <div
      v-for="col in cols"
      :key="col.id"
      :data-col="col.id"
      class="d-kanban-col-wrap"
    >
      <DenseGroup
        :label="col.label"
        :count="grouped[col.id]?.length ?? 0"
        :accent="col.accent"
        @add="emit('add')"
      >
        <div
          :ref="(el) => (colRefs[col.id] = el as HTMLElement | null)"
          class="d-kanban-col"
        >
          <div v-for="t in grouped[col.id]" :key="t.id" :data-id="t.id">
            <DenseRow :todo="t" />
          </div>
          <p v-if="!(grouped[col.id] ?? []).length" class="d-kanban-empty">
            drop tasks here
          </p>
        </div>
      </DenseGroup>
    </div>
  </div>
</template>

<style scoped>
.d-kanban-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 0.75rem;
}
.d-kanban-col-wrap {
  display: flex;
  flex-direction: column;
}
.d-kanban-col {
  min-height: 120px;
  display: flex;
  flex-direction: column;
}
.d-kanban-empty {
  padding: 16px 12px;
  font-family:
    "JetBrains Mono", "Diatype Mono Variable", ui-monospace, monospace;
  font-size: 0.625rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--sl-300);
  text-align: center;
}
/* Mobile: horizontal scroll-snap strip, one priority column per swipe. */
@media (max-width: 767px) {
  .d-kanban-grid {
    display: flex;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    -webkit-overflow-scrolling: touch;
    gap: 0.5rem;
    /* let columns bleed to the screen edge for the swipe affordance */
    margin: 0 -16px;
    padding: 0 16px;
  }
  .d-kanban-col-wrap {
    flex: 0 0 85vw;
    scroll-snap-align: start;
  }
}
</style>
