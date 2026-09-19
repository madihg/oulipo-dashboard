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
const showMore = ref(false);
const headerMeta = computed(() =>
  [
    area.value?.name,
    deadlineLabel.value,
    `${visibleTodos.value.length} of ${projectTodos.value.length} open`,
  ]
    .filter(Boolean)
    .join(" · "),
);

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
      <!-- One pinned line, as on the list view of this project. -->
      <DenseToolbar
        :title="project.name"
        :meta="headerMeta"
        :route-key="routeKey"
        :available-tags="availableTags"
        :hide-project-group="true"
        @new="showAdd = !showAdd"
      >
        <template #extra>
          <ViewToggle :slug="project.slug" current="kanban" />
          <button
            type="button"
            class="chip chip-quiet"
            :aria-expanded="showMore"
            @click="showMore = !showMore"
          >
            <span
              class="chev"
              :class="{ 'chev-open': showMore }"
              aria-hidden="true"
            ></span>
            more
          </button>
        </template>
      </DenseToolbar>
      <div v-if="showMore" class="d-page-more">
        <ViewToggle
          class="d-only-phone"
          :slug="project.slug"
          current="kanban"
        />
        <router-link
          v-if="area"
          :to="`/area/${area.slug}`"
          class="cap interactive"
        >
          in {{ area.name }}
        </router-link>
        <EntityActions
          kind="project"
          :id="project.id"
          :current-name="project.name"
        />
      </div>

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
/* One hosted line, one next action, flush with the list's left edge. */
</style>
