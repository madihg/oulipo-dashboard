<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { storeToRefs } from "pinia";
import { useRoute } from "vue-router";
import Sortable from "sortablejs";
import { useVaultStore } from "../stores/vault";
import { supabase } from "../lib/supabase";
import DenseToolbar from "../components/dense/DenseToolbar.vue";
import DenseGroup from "../components/dense/DenseGroup.vue";
import DenseRow from "../components/dense/DenseRow.vue";
import DenseStatusBar from "../components/dense/DenseStatusBar.vue";
import AddTaskInput from "../components/AddTaskInput.vue";
import EntityActions from "../components/EntityActions.vue";
import ViewToggle from "../components/ViewToggle.vue";
import { projectColor } from "../composables/useProjectColor";
import type { Priority, TodoRow } from "../types/database";
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

const listControls = useListControlsStore();
const routeKey = computed(() => `project-kanban:${slug.value}`);
const ctrl = computed(() => listControls.get(routeKey.value));
const availableTags = computed(() => uniqueTagsFrom(projectTodos.value));
const visibleTodos = computed(() =>
  applyControls(projectTodos.value, ctrl.value),
);

const grouped = computed<Record<string, TodoRow[]>>(() => {
  const out: Record<string, TodoRow[]> = {
    P0: [],
    P1: [],
    P2: [],
    none: [],
  };
  for (const t of visibleTodos.value) {
    const key = t.priority ?? "none";
    out[key]!.push(t);
  }
  return out;
});

const showAdd = ref(false);

async function load() {
  await vault.loadAreasAndProjects();
  if (project.value) {
    vault.currentProjectId = project.value.id;
    vault.currentAreaId = null;
    await vault.loadProjectTodos(project.value.id);
    void nextTick(initSortables);
  }
}

watch(slug, () => void load());

const sortables: Sortable[] = [];
const colRefs = ref<Record<string, HTMLElement | null>>({});

function initSortables() {
  while (sortables.length) sortables.pop()?.destroy();
  for (const col of cols) {
    const el = colRefs.value[col.id];
    if (!el) continue;
    const sortable = Sortable.create(el, {
      group: "project-kanban",
      animation: 150,
      handle: ".d-row",
      ghostClass: "opacity-30",
      // No chosen/drag class -> Sortable does not paint additional state
      // that lingers post-drop.
      chosenClass: "d-sortable-chosen",
      dragClass: "d-sortable-drag",
      onEnd: async (evt) => {
        const fromColId = (evt.from.parentElement?.dataset.col ?? null) as
          | string
          | null;
        const toColId = (evt.to.parentElement?.dataset.col ?? null) as
          | string
          | null;
        const todoId = evt.item.dataset.id;
        if (!todoId || !toColId) return;
        const targetCol = cols.find((c) => c.id === toColId);
        if (!targetCol) return;

        const destEl = colRefs.value[toColId];
        if (!destEl) return;
        const orderedIds = Array.from(destEl.children).map(
          (n) => (n as HTMLElement).dataset.id!,
        );
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
            const sourceIds = Array.from(sourceEl.children).map(
              (n) => (n as HTMLElement).dataset.id!,
            );
            updates.push(...sourceIds.map((id, i) => ({ id, position: i })));
          }
        }
        await vault.reorderTodos(updates);
        // Sortable.js leaves the dropped element focused, which trips the
        // global *:focus-visible carnation outline. Blur explicitly + any
        // focused descendant. Also pull focus to body so the next click
        // doesn't immediately reapply the outline.
        if (evt.item instanceof HTMLElement) {
          (evt.item.querySelector(":focus") as HTMLElement | null)?.blur();
          evt.item.blur();
        }
        (document.activeElement as HTMLElement | null)?.blur();
      },
    });
    sortables.push(sortable);
  }
}

let authSub: { unsubscribe: () => void } | null = null;
onMounted(() => {
  void load();
  const { data } = supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") void load();
  });
  authSub = data.subscription;
});
onBeforeUnmount(() => {
  authSub?.unsubscribe();
  while (sortables.length) sortables.pop()?.destroy();
});

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
            @add="showAdd = true"
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
.d-empty {
  font-size: 0.875rem;
  color: var(--sl-500);
  padding: 1rem 0;
}
</style>
