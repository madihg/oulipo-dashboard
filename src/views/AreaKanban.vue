<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useRoute } from "vue-router";
import { useVaultStore } from "../stores/vault";
import { supabase } from "../lib/supabase";
import DenseToolbar from "../components/dense/DenseToolbar.vue";
import DenseStatusBar from "../components/dense/DenseStatusBar.vue";
import AddTaskInput from "../components/AddTaskInput.vue";
import EntityActions from "../components/EntityActions.vue";
import ViewToggle from "../components/ViewToggle.vue";
import KanbanBoard from "../components/KanbanBoard.vue";
import {
  applyControls,
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

const listControls = useListControlsStore();
const routeKey = computed(() => `area-kanban:${slug.value}`);
const ctrl = computed(() => listControls.get(routeKey.value));
const availableTags = computed(() => uniqueTagsFrom(areaTodos.value));
const visibleTodos = computed(() => applyControls(areaTodos.value, ctrl.value));

const showAdd = ref(false);

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
          <ViewToggle :slug="area.slug" entity="area" current="kanban" />
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
        :meta="`${visibleTodos.length} of ${areaTodos.length} tasks · drag across priority columns`"
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

      <KanbanBoard
        :todos="visibleTodos"
        group="area-kanban"
        @add="showAdd = true"
      />

      <DenseStatusBar
        :rows="areaTodos.length"
        :groups="4"
        :extra="[`kanban · drag to reprioritize`]"
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
    "Diatype Mono Variable", "JetBrains Mono", ui-monospace, monospace;
  font-variation-settings: "MONO" 1;
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
}
.d-empty {
  font-size: 0.875rem;
  color: var(--sl-500);
  padding: 1rem 0;
}
</style>
