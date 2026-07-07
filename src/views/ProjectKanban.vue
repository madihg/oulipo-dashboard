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
import { projectColor } from "../composables/useProjectColor";
import {
  applyControls,
  uniqueTagsFrom,
  useListControlsStore,
} from "../stores/listControls";

const route = useRoute();
const vault = useVaultStore();
const { projectTodos, projects, areas } = storeToRefs(vault);

const slug = computed(() => route.params.slug as string);
const project = computed(
  () => projects.value.find((p) => p.slug === slug.value) ?? null,
);
const area = computed(
  () =>
    areas.value.find((a) => project.value && a.id === project.value.area_id) ??
    null,
);

const listControls = useListControlsStore();
const routeKey = computed(() => `project-kanban:${slug.value}`);
const ctrl = computed(() => listControls.get(routeKey.value));
const availableTags = computed(() => uniqueTagsFrom(projectTodos.value));
const visibleTodos = computed(() =>
  applyControls(projectTodos.value, ctrl.value),
);

const showAdd = ref(false);

async function load() {
  await vault.loadAreasAndProjects();
  if (project.value) {
    vault.currentProjectId = project.value.id;
    vault.currentAreaId = null;
    await vault.loadProjectTodos(project.value.id);
  }
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

const deadlineLabel = computed(() => {
  if (!project.value?.deadline) return null;
  const days = Math.ceil(
    (new Date(project.value.deadline).getTime() - Date.now()) / 86_400_000,
  );
  if (days < 0) return `${Math.abs(days)} days ago`;
  if (days === 0) return "due today";
  return `${days} days left`;
});
</script>

<template>
  <section class="list-column">
    <div v-if="!project" class="d-empty">loading project…</div>
    <template v-else>
      <div class="d-proj-header">
        <p class="d-proj-area">
          <router-link
            v-if="area"
            :to="`/area/${area.slug}`"
            class="interactive"
            >{{ area.name }}</router-link
          >
        </p>
        <div class="flex items-center gap-s-3 flex-wrap">
          <span
            class="d-proj-dot"
            :style="{ background: projectColor(project.slug) }"
          ></span>
          <h2 class="d-proj-title">{{ project.name }}</h2>
          <span v-if="deadlineLabel" class="d-proj-meta">{{
            deadlineLabel
          }}</span>
          <ViewToggle :slug="project.slug" current="kanban" />
        </div>
        <EntityActions
          class="mt-s-2"
          kind="project"
          :id="project.id"
          :current-name="project.name"
        />
      </div>

      <DenseToolbar
        title=""
        :meta="`${visibleTodos.length} of ${projectTodos.length} open · drag across priority columns`"
        :route-key="routeKey"
        :available-tags="availableTags"
        :hide-project-group="true"
        @new="showAdd = !showAdd"
      />

      <AddTaskInput
        v-if="showAdd"
        class="mb-s-4"
        placeholder="new task in this project"
        :project-id="project.id"
        :area-id="project.area_id"
        state="anytime"
        :hide-project-picker="true"
      />

      <KanbanBoard
        :todos="visibleTodos"
        group="project-kanban"
        @add="showAdd = true"
      />

      <DenseStatusBar
        :rows="projectTodos.length"
        :groups="4"
        :extra="[`kanban · drag to reprioritize`]"
      />
    </template>
  </section>
</template>

<style scoped>
.d-proj-header {
  margin-bottom: 0.75rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--sl-200);
}
.d-proj-area {
  font-family:
    "Diatype Mono Variable", "JetBrains Mono", ui-monospace, monospace;
  font-variation-settings: "MONO" 1;
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--sl-400);
}
.d-proj-dot {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  flex-shrink: 0;
  margin-top: 4px;
}
.d-proj-title {
  font-size: 1.25rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--sl-900);
  text-transform: lowercase;
}
.d-proj-meta {
  font-family:
    "Diatype Mono Variable", "JetBrains Mono", ui-monospace, monospace;
  font-variation-settings: "MONO" 1;
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--sl-500);
}
.d-empty {
  font-size: 0.875rem;
  color: var(--sl-500);
  padding: 1rem 0;
}
</style>
