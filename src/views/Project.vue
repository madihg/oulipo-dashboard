<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from "vue";
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
import { projectColor } from "../composables/useProjectColor";
import { useListDragReorder } from "../composables/useListDragReorder";
import {
  applyControls,
  groupTodos,
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

const deadlineLabel = computed(() => {
  if (!project.value?.deadline) return null;
  const days = Math.ceil(
    (new Date(project.value.deadline).getTime() - Date.now()) / 86_400_000,
  );
  if (days < 0) return `${Math.abs(days)} days ago`;
  if (days === 0) return "due today";
  return `${days} days left`;
});

const cadenceLabel = computed(() => {
  if (!project.value?.cadence) return null;
  const target = project.value.cadence_target ?? 1;
  return `${target} per ${project.value.cadence}`;
});

const listControls = useListControlsStore();
const routeKey = computed(() => `project:${slug.value}`);
const ctrl = computed(() => listControls.get(routeKey.value));
const availableTags = computed(() => uniqueTagsFrom(projectTodos.value));

const visibleTodos = computed(() =>
  applyControls(projectTodos.value, ctrl.value),
);
const groups = computed(() => groupTodos(visibleTodos.value, ctrl.value.group));

const { setBodyRef } = useListDragReorder(groups, routeKey);

const DOT_BY_PRIORITY: Record<string, string> = {
  P0: "var(--acc-carnation)",
  P1: "var(--acc-hard)",
  P2: "var(--acc-reverse)",
  none: "rgba(0,0,0,0.3)",
};

const showAdd = ref(false);

async function load() {
  await vault.loadAreasAndProjects();
  if (project.value) {
    vault.currentProjectId = project.value.id;
    vault.currentAreaId = null;
    await vault.loadProjectTodos(project.value.id);
  }
}

function dotFor(key: string): string {
  return DOT_BY_PRIORITY[key] ?? "rgba(0,0,0,0.3)";
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
    <div v-if="!project" class="d-empty">loading project…</div>
    <template v-else>
      <!-- Header: area breadcrumb + project chip with color + name -->
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
          <span v-if="deadlineLabel || cadenceLabel" class="d-proj-meta">
            <span v-if="deadlineLabel">{{ deadlineLabel }}</span>
            <span v-if="deadlineLabel && cadenceLabel"> · </span>
            <span v-if="cadenceLabel">{{ cadenceLabel }}</span>
          </span>
          <ViewToggle :slug="project.slug" current="list" />
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
        :meta="`${visibleTodos.length} of ${projectTodos.length} open`"
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

      <div v-if="projectTodos.length === 0" class="d-empty">
        no open tasks. project clean.
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
            class="d-list-body"
            :data-prio="g.key"
            :ref="(el) => setBodyRef(g.key, el)"
          >
            <div v-for="t in g.items" :key="t.id" :data-id="t.id">
              <DenseRow :todo="t" />
            </div>
            <p v-if="!g.items.length" class="d-list-drop-hint">drop here</p>
          </div>
        </section>
      </div>

      <DenseStatusBar
        :rows="projectTodos.length"
        :groups="4"
        :extra="[`project · ${project.slug}`]"
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
    "JetBrains Mono", "Diatype Mono Variable", ui-monospace, monospace;
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
    "JetBrains Mono", "Diatype Mono Variable", ui-monospace, monospace;
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--sl-500);
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
/* One divider per group: drop the first group's top rule and the last
   row's bottom rule so boundaries never show a doubled hairline. */
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
.d-list-body {
  display: flex;
  flex-direction: column;
}
/* Empty priority section is still a drop target (drag a task into an empty
   bucket to change its priority). */
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
