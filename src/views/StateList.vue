<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useVaultStore } from "../stores/vault";
import { supabase } from "../lib/supabase";
import DenseToolbar from "../components/dense/DenseToolbar.vue";
import DenseRow from "../components/dense/DenseRow.vue";
import DenseStatusBar from "../components/dense/DenseStatusBar.vue";
import AddTaskInput from "../components/AddTaskInput.vue";
import ViewToggle from "../components/ViewToggle.vue";
import KanbanBoard from "../components/KanbanBoard.vue";
import { useListDragReorder } from "../composables/useListDragReorder";
import {
  applyControls,
  groupTodos,
  uniqueTagsFrom,
  useListControlsStore,
} from "../stores/listControls";
import type { TodoRow } from "../types/database";

const route = useRoute();
const vault = useVaultStore();

const mode = computed(
  () => (route.meta.stateMode as string) ?? (route.name as string),
);

// Anytime can also render as a priority kanban. Persisted per session.
const anytimeView = ref<"list" | "kanban">(
  (localStorage.getItem("anytime-view") as "list" | "kanban") ?? "list",
);
const showKanban = computed(
  () => mode.value === "anytime" && anytimeView.value === "kanban",
);
function setAnytimeView(v: string) {
  anytimeView.value = v as "list" | "kanban";
  localStorage.setItem("anytime-view", v);
}

const captureState = computed(
  () => mode.value as "anytime" | "someday" | "today" | "inbox",
);

const items = ref<TodoRow[]>([]);
const showAdd = ref(false);

// Filter / sort / group via the shared controls (one persisted set per mode).
// Default: manual sort (preserves the fetch order when positions are uniform,
// and lets drag-reorder stick), grouped by area for the cross-area views.
const listControls = useListControlsStore();
const routeKey = computed(() => `state:${mode.value}`);
function ensureDefaults(m: string) {
  const key = `state:${m}`;
  if (!listControls.byRoute[key]) {
    listControls.byRoute[key] = {
      filter: { tags: [], priority: [], state: [] },
      sort: "manual",
      group: m === "anytime" || m === "someday" ? "area" : "none",
    };
  }
}
// Seed BEFORE first render so the computed below doesn't trip listControls.get()
// into creating the generic default first. Re-seed on mode change (flush pre,
// before re-render) since vue-router reuses this component across state routes.
ensureDefaults(mode.value);
watch(mode, (m) => ensureDefaults(m));
const ctrl = computed(() => listControls.get(routeKey.value));
const availableTags = computed(() => uniqueTagsFrom(items.value));
const projectsById = computed(() =>
  Object.fromEntries(
    vault.projects.map((p) => [p.id, { name: p.name, slug: p.slug }]),
  ),
);
const areasById = computed(() =>
  Object.fromEntries(
    vault.areas.map((a) => [a.id, { name: a.name, slug: a.slug }]),
  ),
);
const visibleItems = computed(() => applyControls(items.value, ctrl.value));
const groups = computed(() =>
  groupTodos(
    visibleItems.value,
    ctrl.value.group,
    projectsById.value,
    areasById.value,
  ),
);
const { setBodyRef } = useListDragReorder(groups, routeKey);

async function load() {
  ensureDefaults(mode.value);
  await vault.loadAreasAndProjects();
  if (mode.value === "anytime") {
    items.value = await vault.loadByState({ state: "anytime" });
  } else if (mode.value === "upcoming") {
    const today = new Date().toISOString().slice(0, 10);
    items.value = await vault.loadByState({ startDateAfter: today });
  } else if (mode.value === "someday") {
    items.value = await vault.loadByState({ state: "someday" });
  } else if (mode.value === "logbook") {
    items.value = await vault.loadByState({ completedOnly: true, limit: 200 });
  }
}

watch(mode, () => void load());

// Renders from a detached fetch; reload when the store signals any todo change
// so in-place edits / drags don't go stale. Debounced to coalesce write + echo.
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
  return key === "all" ? mode.value : label;
}
</script>

<template>
  <section class="list-column">
    <div v-if="mode === 'anytime'" class="d-state-toggle-row">
      <ViewToggle
        :options="[
          { value: 'list', label: 'list' },
          { value: 'kanban', label: 'kanban' },
        ]"
        :model-value="anytimeView"
        @update:model-value="setAnytimeView"
      />
    </div>

    <DenseToolbar
      :title="mode"
      :meta="`${visibleItems.length} of ${items.length} ${mode === 'logbook' ? 'done' : 'open'}`"
      :route-key="routeKey"
      :available-tags="availableTags"
      show-area-group
      @new="showAdd = !showAdd"
    />

    <AddTaskInput
      v-if="mode !== 'logbook' && showAdd"
      class="mb-s-4"
      :placeholder="`new task - ${mode}`"
      :state="captureState"
    />

    <div v-if="items.length === 0" class="d-empty">nothing here.</div>
    <div v-else-if="!visibleItems.length" class="d-empty">
      nothing matches the current filter.
    </div>

    <KanbanBoard
      v-else-if="showKanban"
      :todos="visibleItems"
      group="anytime-kanban"
      @add="showAdd = true"
      @reordered="load"
    />

    <div v-else class="d-list">
      <section v-for="g in groups" :key="g.key" class="d-list-section">
        <header class="d-list-head">
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
            <DenseRow
              :todo="t"
              :show-project="true"
              :show-area="ctrl.group !== 'area'"
            />
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
.d-state-toggle-row {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 0.5rem;
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
