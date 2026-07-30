<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import Sortable from "sortablejs";
import { storeToRefs } from "pinia";
import { useVaultStore } from "../stores/vault";
import DenseRow from "./dense/DenseRow.vue";
import {
  bucketHorizon,
  horizonDropPatch,
  type HorizonKey,
} from "../utils/horizon";
import type { TodoRow } from "../types/database";

/**
 * Horizon view on Today: drag lanes - today / this week / next week / week
 * after / ongoing. Dropping a card into a lane reschedules it (see
 * horizonDropPatch). today renders vault.todayTodos; the future lanes come
 * from a detached loadHorizon fetch reloaded on vault.rev (StateList pattern).
 */
const vault = useVaultStore();
const { todayTodos } = storeToRefs(vault);
const horizonRows = ref<TodoRow[]>([]);

const buckets = computed(() => bucketHorizon(horizonRows.value));
const sections = computed(
  (): Array<{ key: HorizonKey; label: string; items: TodoRow[] }> => [
    {
      key: "today",
      label: "today",
      items: todayTodos.value.filter(
        (t) => t.state !== "completed" && t.state !== "cancelled",
      ),
    },
    { key: "this_week", label: "this week", items: buckets.value.thisWeek },
    { key: "next_week", label: "next week", items: buckets.value.nextWeek },
    { key: "week_after", label: "week after", items: buckets.value.weekAfter },
    { key: "ongoing", label: "ongoing", items: buckets.value.ongoing },
  ],
);

async function load() {
  // Refresh the today lane's backing list too: a drop into "today" patches a
  // row that lives only in the detached horizon fetch, which the vault's
  // reconcile can't see - without this reload the card would vanish.
  const [rows] = await Promise.all([vault.loadHorizon(), vault.loadToday()]);
  horizonRows.value = rows;
}
let revTimer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => vault.rev,
  () => {
    clearTimeout(revTimer);
    revTimer = setTimeout(() => void load(), 200);
  },
);

const bodyEls = new Map<HorizonKey, HTMLElement>();
const sortables: Sortable[] = [];
function setBodyRef(key: HorizonKey, el: unknown) {
  if (el instanceof HTMLElement) bodyEls.set(key, el);
}

function attachSortables() {
  for (const [, el] of bodyEls) {
    sortables.push(
      Sortable.create(el, {
        group: "today-horizon",
        handle: ".d-row",
        animation: 120,
        delay: 180,
        delayOnTouchOnly: true,
        setData: (dt: DataTransfer, dragEl: HTMLElement) => {
          // Same MIME as every other surface so the sidebar targets work too.
          if (dragEl.dataset.id)
            dt.setData("application/x-hmart-todo", dragEl.dataset.id);
        },
        onEnd: (evt) => {
          const destKey = (evt.to as HTMLElement).dataset.when as
            HorizonKey | undefined;
          const fromKey = (evt.from as HTMLElement).dataset.when;
          const id = (evt.item as HTMLElement).dataset.id;
          if (!destKey || !id || destKey === fromKey) return;
          const patch = horizonDropPatch(destKey);
          // Optimistic move: the dragged row may live only in the detached
          // horizonRows fetch, invisible to the vault's reconcile. Move the
          // merged copy between the lanes' backing arrays ourselves so the
          // card renders in its new lane immediately (and exactly once).
          const row =
            horizonRows.value.find((t) => t.id === id) ??
            todayTodos.value.find((t) => t.id === id);
          if (row) {
            const next = { ...row, ...patch } as TodoRow;
            if (destKey === "today") {
              horizonRows.value = horizonRows.value.filter((t) => t.id !== id);
              if (!todayTodos.value.some((t) => t.id === id))
                todayTodos.value.unshift(next);
            } else {
              horizonRows.value = [
                next,
                ...horizonRows.value.filter((t) => t.id !== id),
              ];
            }
          }
          void vault.updateTodo(id, patch as never);
        },
      }),
    );
  }
}

onMounted(() => {
  void load();
  attachSortables();
});
onBeforeUnmount(() => {
  sortables.forEach((s) => s.destroy());
  sortables.length = 0;
});

const HINT: Record<HorizonKey, string> = {
  today: "drop here to do it today",
  this_week: "drop here for later this week",
  next_week: "drop here for next week",
  week_after: "drop here for the week after",
  ongoing: "drop here to make it ongoing",
};
</script>

<template>
  <div class="hz-grid">
    <section v-for="s in sections" :key="s.key" class="hz-col">
      <header class="hz-head">
        <span class="hz-label" :class="`hz-label-${s.key}`">{{ s.label }}</span>
        <span class="hz-count">{{ s.items.length }}</span>
      </header>
      <div
        class="hz-body"
        :data-when="s.key"
        :ref="(el) => setBodyRef(s.key, el)"
      >
        <div v-for="t in s.items" :key="t.id" :data-id="t.id">
          <DenseRow :todo="t" :show-project="true" :show-area="true" />
        </div>
        <p v-if="!s.items.length" class="hz-drop-hint">{{ HINT[s.key] }}</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.hz-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 0.75rem;
  align-items: start;
}
.hz-col {
  border: 1px solid var(--sl-200);
  border-radius: 0;
  /* Popovers (when-chip) must escape the column. */
  overflow: visible;
  background: #ffffff;
}
.hz-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--sl-200);
}
.hz-label {
  font-family:
    "Diatype Mono Variable", "JetBrains Mono", ui-monospace, monospace;
  font-variation-settings: "MONO" 1;
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--sl-900);
}
.hz-label-today {
  color: var(--acc-carnation-text);
}
.hz-label-ongoing {
  color: var(--acc-ongoing-text);
}
.hz-count {
  font-size: 0.625rem;
  color: var(--sl-500);
  background: var(--sl-100);
  padding: 1px 6px;
  border-radius: 2px;
}
.hz-body {
  min-height: 48px;
  padding: 2px 0;
}
.hz-body :deep(.d-row:last-child) {
  border-bottom: 0;
}
.hz-drop-hint {
  padding: 14px 10px;
  font-family:
    "Diatype Mono Variable", "JetBrains Mono", ui-monospace, monospace;
  font-variation-settings: "MONO" 1;
  font-size: 0.625rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--sl-300);
}
</style>
