<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from "vue";
import { storeToRefs } from "pinia";
import { useVaultStore } from "../stores/vault";
import { supabase } from "../lib/supabase";
import DenseToolbar from "../components/dense/DenseToolbar.vue";
import DenseGroup from "../components/dense/DenseGroup.vue";
import DenseRow from "../components/dense/DenseRow.vue";
import DenseStatusBar from "../components/dense/DenseStatusBar.vue";
import AddTaskInput from "../components/AddTaskInput.vue";
import ViewToggle from "../components/ViewToggle.vue";
import { useListDragReorder } from "../composables/useListDragReorder";
import {
  applyControls,
  groupTodos,
  uniqueTagsFrom,
  useListControlsStore,
} from "../stores/listControls";

const vault = useVaultStore();
const { todayTodos, projects } = storeToRefs(vault);

const showAdd = ref(false);

const today = new Date().toLocaleDateString("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
});

// Filter / sort / group via the shared controls store (same machinery as
// Project / Area). Seed Today's default grouping to "today" (p0 + scheduled)
// the first time, without clobbering a saved choice.
const routeKey = "today";
const listControls = useListControlsStore();
if (!listControls.byRoute[routeKey]) {
  listControls.byRoute[routeKey] = {
    filter: { tags: [], priority: [], state: [] },
    sort: "priority",
    group: "today",
  };
}
const ctrl = computed(() => listControls.get(routeKey));
const availableTags = computed(() => uniqueTagsFrom(todayTodos.value));

const projectsById = computed(() =>
  Object.fromEntries(
    projects.value.map((p) => [p.id, { name: p.name, slug: p.slug }]),
  ),
);

const visibleTodos = computed(() =>
  applyControls(todayTodos.value, ctrl.value),
);
const groups = computed(() =>
  groupTodos(visibleTodos.value, ctrl.value.group, projectsById.value),
);

// List (stacked) is the default; board (columns) is the alternative.
const view = ref<"list" | "board">(
  (localStorage.getItem("today-view") as "list" | "board") ?? "list",
);
function setView(v: string) {
  view.value = v as "list" | "board";
  localStorage.setItem("today-view", v);
}

const { setBodyRef } = useListDragReorder(groups, ref(routeKey));

const ACCENT: Record<string, "carnation" | "hard" | "reverse" | "neutral"> = {
  P0: "carnation",
  P1: "hard",
  P2: "reverse",
};
function accentFor(key: string) {
  return ACCENT[key] ?? "neutral";
}
const DOT_BY_KEY: Record<string, string> = {
  P0: "var(--acc-carnation)",
  P1: "var(--acc-hard)",
  P2: "var(--acc-reverse)",
};
function dotFor(key: string): string {
  return DOT_BY_KEY[key] ?? "rgba(0,0,0,0.3)";
}

function loadAll() {
  void vault.loadAreasAndProjects();
  void vault.loadToday();
}

let authSub: { unsubscribe: () => void } | null = null;
onMounted(() => {
  vault.currentProjectId = null;
  vault.currentAreaId = null;
  loadAll();
  const { data } = supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") loadAll();
  });
  authSub = data.subscription;
});
onBeforeUnmount(() => authSub?.unsubscribe());
</script>

<template>
  <section class="list-column">
    <div class="d-today-toggle-row">
      <ViewToggle
        :options="[
          { value: 'list', label: 'list' },
          { value: 'board', label: 'board' },
        ]"
        :model-value="view"
        @update:model-value="setView"
      />
    </div>

    <DenseToolbar
      title="today"
      :meta="`${today.toLowerCase()} · ${visibleTodos.length}/${todayTodos.length} open`"
      :route-key="routeKey"
      :available-tags="availableTags"
      show-today-group
      @new="showAdd = !showAdd"
    />

    <AddTaskInput
      v-if="showAdd"
      class="mb-s-4"
      placeholder="capture for today - type and hit return"
      state="today"
    />

    <div v-if="todayTodos.length === 0" class="d-empty">
      nothing queued. take the morning.
    </div>
    <div v-else-if="visibleTodos.length === 0" class="d-empty">
      no tasks match the current filter.
    </div>

    <!-- List view: stacked sections -->
    <div v-else-if="view === 'list'" class="d-list">
      <section v-for="g in groups" :key="g.key" class="d-list-section">
        <header class="d-list-head">
          <span class="d-list-dot" :style="{ background: dotFor(g.key) }" />
          <span class="d-list-label">{{ g.label }}</span>
          <span class="d-list-count">{{ g.items.length }}</span>
        </header>
        <div
          class="d-list-body"
          :data-prio="g.key"
          :ref="(el) => setBodyRef(g.key, el)"
        >
          <div v-for="t in g.items" :key="t.id" :data-id="t.id">
            <DenseRow :todo="t" :show-project="true" :show-area="true" />
          </div>
          <p v-if="!g.items.length" class="d-list-drop-hint">drop here</p>
        </div>
      </section>
    </div>

    <!-- Board view: columns -->
    <div v-else class="d-grid">
      <DenseGroup
        v-for="g in groups"
        :key="g.key"
        :label="g.label"
        :accent="accentFor(g.key)"
        :count="g.items.length"
        @add="showAdd = true"
      >
        <DenseRow
          v-for="t in g.items"
          :key="t.id"
          :todo="t"
          :show-project="true"
          :show-area="true"
        />
      </DenseGroup>
    </div>

    <DenseStatusBar :rows="visibleTodos.length" :groups="groups.length" />
  </section>
</template>

<style scoped>
.d-today-toggle-row {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 0.5rem;
}
.d-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 0.75rem;
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
    "JetBrains Mono", "Diatype Mono Variable", ui-monospace, monospace;
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
    "JetBrains Mono", "Diatype Mono Variable", ui-monospace, monospace;
  font-size: 0.625rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--sl-300);
}
.d-empty {
  font-size: 0.875rem;
  color: var(--sl-500);
  padding: 1rem 0;
}
</style>
