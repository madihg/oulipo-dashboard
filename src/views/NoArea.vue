<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from "vue";
import { useVaultStore } from "../stores/vault";
import { supabase } from "../lib/supabase";
import DenseToolbar from "../components/dense/DenseToolbar.vue";
import DenseRow from "../components/dense/DenseRow.vue";
import DenseStatusBar from "../components/dense/DenseStatusBar.vue";
import AddTaskInput from "../components/AddTaskInput.vue";
import { useListDragReorder } from "../composables/useListDragReorder";
import {
  applyControls,
  groupTodos,
  uniqueTagsFrom,
  useListControlsStore,
} from "../stores/listControls";
import type { TodoRow } from "../types/database";

/**
 * The "no area" area: active tasks filed nowhere (no area, no project),
 * excluding the inbox which is its own unfiled surface. Same detached-fetch +
 * rev-reload pattern as StateList.
 */
const vault = useVaultStore();

const items = ref<TodoRow[]>([]);
const showAdd = ref(false);

const listControls = useListControlsStore();
const routeKey = ref("noarea");
if (!listControls.byRoute[routeKey.value]) {
  listControls.byRoute[routeKey.value] = {
    filter: { tags: [], priority: [], state: [] },
    sort: "manual",
    group: "none",
  };
}
const ctrl = computed(() => listControls.get(routeKey.value));
const availableTags = computed(() => uniqueTagsFrom(items.value));
const visibleItems = computed(() => applyControls(items.value, ctrl.value));
const groups = computed(() => groupTodos(visibleItems.value, ctrl.value.group));
const { setBodyRef } = useListDragReorder(groups, routeKey);

async function load() {
  await vault.loadAreasAndProjects();
  items.value = await vault.loadNoArea();
}

let revTimer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => vault.rev,
  () => {
    clearTimeout(revTimer);
    revTimer = setTimeout(() => void load(), 200);
  },
);

let authSub: { unsubscribe: () => void } | null = null;
onMounted(() => {
  void load();
  const { data } = supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") void load();
  });
  authSub = data.subscription;
});
onBeforeUnmount(() => authSub?.unsubscribe());

const DOT_BY_KEY: Record<string, string> = {
  P0: "var(--acc-carnation)",
  P1: "var(--acc-hard)",
  P2: "var(--acc-reverse)",
  ongoing: "var(--acc-ongoing)",
};
function dotFor(key: string): string {
  return DOT_BY_KEY[key] ?? "rgba(0,0,0,0.3)";
}
function headLabel(key: string, label: string): string {
  return key === "all" ? "no area" : label;
}
</script>

<template>
  <section class="list-column">
    <DenseToolbar
      title="no area"
      :meta="`${visibleItems.length} of ${items.length} open`"
      :route-key="routeKey"
      :available-tags="availableTags"
      hide-project-group
      @new="showAdd = !showAdd"
    />

    <AddTaskInput
      v-if="showAdd"
      class="mb-s-4"
      placeholder="new task - no area"
      state="anytime"
      hide-project-picker
    />

    <div v-if="items.length === 0" class="d-empty">
      nothing unfiled. every task has a home.
    </div>
    <div v-else-if="!visibleItems.length" class="d-empty">
      nothing matches the current filter.
    </div>

    <div v-else class="d-list">
      <section v-for="g in groups" :key="g.key" class="d-list-section">
        <header v-if="g.key !== 'all'" class="d-list-head">
          <span class="d-list-dot" :style="{ background: dotFor(g.key) }" />
          <span class="d-list-label">{{ headLabel(g.key, g.label) }}</span>
          <span class="d-list-count">{{ g.items.length }}</span>
        </header>
        <div
          class="d-list-body"
          :data-prio="g.key"
          :ref="(el) => setBodyRef(g.key, el)"
        >
          <div v-for="t in g.items" :key="t.id" :data-id="t.id">
            <DenseRow :todo="t" :show-project="false" />
          </div>
          <p v-if="!g.items.length" class="d-list-drop-hint">drop here</p>
        </div>
      </section>
    </div>

    <DenseStatusBar :rows="visibleItems.length" :groups="groups.length" />
  </section>
</template>

<style scoped>
.d-empty {
  font-size: 0.875rem;
  color: var(--sl-500);
  padding: 1rem 0;
}
.d-list {
  display: flex;
  flex-direction: column;
}
.d-list-section + .d-list-section {
  margin-top: 0.5rem;
}
.d-list-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 6px 0;
  border-top: 1px solid var(--sl-200);
}
.d-list-section:first-child .d-list-head {
  border-top: 0;
}
.d-list-body :deep(.d-row:last-child) {
  border-bottom: 0;
}
.d-list-dot {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  flex-shrink: 0;
}
.d-list-label {
  font-family:
    "Diatype Mono Variable", "JetBrains Mono", ui-monospace, monospace;
  font-variation-settings: "MONO" 1;
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--sl-900);
}
.d-list-count {
  font-size: 0.625rem;
  color: var(--sl-500);
  background: var(--sl-100);
  padding: 1px 6px;
  border-radius: 2px;
}
.d-list-drop-hint {
  padding: 10px 4px;
  font-family:
    "Diatype Mono Variable", "JetBrains Mono", ui-monospace, monospace;
  font-variation-settings: "MONO" 1;
  font-size: 0.625rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--sl-300);
}
</style>
