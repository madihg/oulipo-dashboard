<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, watch, ref } from "vue";
import { storeToRefs } from "pinia";
import { useRoute } from "vue-router";
import { useVaultStore } from "../stores/vault";
import { supabase } from "../lib/supabase";
import DenseToolbar from "../components/dense/DenseToolbar.vue";
import DenseRow from "../components/dense/DenseRow.vue";
import DenseStatusBar from "../components/dense/DenseStatusBar.vue";
import AddTaskInput from "../components/AddTaskInput.vue";
import EntityActions from "../components/EntityActions.vue";
import ViewToggle from "../components/ViewToggle.vue";
import { useListDragReorder } from "../composables/useListDragReorder";
import {
  applyControls,
  groupTodos,
  uniqueTagsFrom,
  useListControlsStore,
} from "../stores/listControls";

const route = useRoute();
const vault = useVaultStore();
const { areaTodos, areas } = storeToRefs(vault);

const slug = computed(() => route.params.slug as string);
const area = computed(
  () => areas.value.find((a) => a.slug === slug.value) ?? null,
);

const showAdd = ref(false);

const listControls = useListControlsStore();
const routeKey = computed(() => `area:${slug.value}`);
const ctrl = computed(() => listControls.get(routeKey.value));
const availableTags = computed(() => uniqueTagsFrom(areaTodos.value));

const visibleTodos = computed(() => applyControls(areaTodos.value, ctrl.value));
const groups = computed(() => groupTodos(visibleTodos.value, ctrl.value.group));

const { setBodyRef } = useListDragReorder(groups, routeKey);

const DOT_BY_PRIORITY: Record<string, string> = {
  P0: "var(--acc-carnation)",
  P1: "var(--acc-hard)",
  P2: "var(--acc-reverse)",
  none: "rgba(0,0,0,0.3)",
};
function dotFor(key: string): string {
  return DOT_BY_PRIORITY[key] ?? "rgba(0,0,0,0.3)";
}

async function load() {
  await vault.loadAreasAndProjects();
  if (!area.value) return;
  vault.currentAreaId = area.value.id;
  vault.currentProjectId = null;
  await vault.loadAreaTodos(area.value.id);
}

watch(slug, () => void load());

let authSub: { unsubscribe: () => void } | null = null;
onMounted(() => {
  void load();
  const { data } = supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") void load();
  });
  authSub = data.subscription;
});
onBeforeUnmount(() => authSub?.unsubscribe());
</script>

<template>
  <section class="list-column">
    <div v-if="!area" class="d-empty">loading area…</div>
    <template v-else>
      <div class="d-area-header">
        <p class="d-area-kicker">area</p>
        <div class="flex items-center gap-s-3 flex-wrap">
          <h2 class="d-area-title">{{ area.name }}</h2>
          <ViewToggle :slug="area.slug" entity="area" current="list" />
        </div>
        <EntityActions
          class="mt-s-2"
          kind="area"
          :id="area.id"
          :current-name="area.name"
        />
      </div>

      <DenseToolbar
        title=""
        :meta="`${visibleTodos.length} of ${areaTodos.length} tasks`"
        :route-key="routeKey"
        :available-tags="availableTags"
        :hide-project-group="true"
        @new="showAdd = !showAdd"
      />

      <AddTaskInput
        v-if="showAdd"
        class="mb-s-4"
        placeholder="new task in this area"
        :area-id="area.id"
        state="anytime"
        hide-project-picker
      />

      <div v-if="areaTodos.length === 0" class="d-empty">
        no tasks here yet. add one above.
      </div>
      <div v-else-if="visibleTodos.length === 0" class="d-empty">
        no tasks match the current filter.
      </div>

      <div v-else class="d-list">
        <section v-for="g in groups" :key="g.key" class="d-list-section">
          <header class="d-list-head">
            <span class="d-list-dot" :style="{ background: dotFor(g.key) }" />
            <span class="d-list-label">{{ g.label }}</span>
            <span class="d-list-count">{{ g.items.length }}</span>
          </header>
          <div
            v-if="g.items.length"
            class="d-list-body"
            :ref="(el) => setBodyRef(g.key, el)"
          >
            <div v-for="t in g.items" :key="t.id" :data-id="t.id">
              <DenseRow :todo="t" />
            </div>
          </div>
        </section>
      </div>

      <DenseStatusBar
        :rows="areaTodos.length"
        :groups="groups.length"
        :extra="[`area · ${area.slug}`]"
      />
    </template>
  </section>
</template>

<style scoped>
.d-area-header {
  margin-bottom: 0.75rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--sl-200);
}
.d-area-kicker {
  font-family:
    "JetBrains Mono", "Diatype Mono Variable", ui-monospace, monospace;
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--sl-400);
}
.d-area-title {
  font-size: 1.25rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--sl-900);
  text-transform: lowercase;
  margin-top: 2px;
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
.d-empty {
  font-size: 0.875rem;
  color: var(--sl-500);
  padding: 1rem 0;
}
</style>
