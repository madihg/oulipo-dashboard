<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useVaultStore } from "../stores/vault";
import { storeToRefs } from "pinia";
import { supabase } from "../lib/supabase";
import Sortable from "sortablejs";
import { projectColor } from "../composables/useProjectColor";

const route = useRoute();
const vault = useVaultStore();
const { areas, projectsByArea } = storeToRefs(vault);

const listRefs = ref<Record<string, HTMLElement | null>>({});
const sortables: Sortable[] = [];

function isActiveArea(slug: string) {
  return route.path === `/area/${slug}`;
}
function isActiveProject(slug: string) {
  return route.path === `/project/${slug}`;
}

function fmtDeadline(deadline: string | null): string {
  if (!deadline) return "";
  const days = Math.ceil(
    (new Date(deadline).getTime() - Date.now()) / 86_400_000,
  );
  if (days < 0) return `${Math.abs(days)}d ago`;
  if (days === 0) return "today";
  return `${days}d`;
}

// ============================================================================
// Drop targets for TaskRow drags. Drop on a project = assign to that project +
// the project's area. Drop on an area heading = assign to area, clear project.
// ============================================================================
const TODO_MIME = "application/x-hmart-todo";
const dragOverProjectId = ref<string | null>(null);
const dragOverAreaId = ref<string | null>(null);

function onTaskDragOver(e: DragEvent) {
  if (!e.dataTransfer?.types.includes(TODO_MIME)) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
}
async function onTaskDropOnProject(
  e: DragEvent,
  projectId: string,
  areaId: string,
) {
  const todoId = e.dataTransfer?.getData(TODO_MIME);
  if (!todoId) return;
  e.preventDefault();
  dragOverProjectId.value = null;
  dragOverAreaId.value = null;
  await vault.updateTodo(todoId, {
    project_id: projectId,
    area_id: areaId,
  } as never);
  const proj = vault.projects.find((p) => p.id === projectId);
  if (proj) {
    const { useToastStore } = await import("../stores/toast");
    useToastStore().show(`moved to ${proj.name}`);
  }
}
async function onTaskDropOnArea(e: DragEvent, areaId: string) {
  const todoId = e.dataTransfer?.getData(TODO_MIME);
  if (!todoId) return;
  e.preventDefault();
  dragOverAreaId.value = null;
  await vault.updateTodo(todoId, {
    area_id: areaId,
    project_id: null,
  } as never);
  const area = vault.areas.find((a) => a.id === areaId);
  if (area) {
    const { useToastStore } = await import("../stores/toast");
    useToastStore().show(`moved to ${area.name} (no project)`);
  }
}

// =============================================================================
// Drag-drop reorder of projects within + across areas.
// Each area's <ul> gets a Sortable instance with a shared `projects-list`
// group so cross-area drops work. onEnd rebuilds positions from DOM order
// in both the source and destination columns and ships one upsert per row.
// =============================================================================
function teardownSortables() {
  while (sortables.length) {
    const s = sortables.pop();
    s?.destroy();
  }
}

function initSortables() {
  teardownSortables();
  for (const area of areas.value) {
    const el = listRefs.value[area.id];
    if (!el) continue;
    sortables.push(
      Sortable.create(el, {
        group: "projects-list",
        animation: 150,
        handle: ".drag-handle",
        ghostClass: "opacity-30",
        onEnd: async (evt) => {
          const fromAreaId = (evt.from.dataset.areaId ?? null) as string | null;
          const toAreaId = (evt.to.dataset.areaId ?? null) as string | null;
          if (!toAreaId) return;

          // Rebuild positions for the destination column from DOM order.
          const destEl = listRefs.value[toAreaId];
          if (!destEl) return;
          const destIds = Array.from(destEl.children).map(
            (n) => (n as HTMLElement).dataset.projectId!,
          );
          const updates: Array<{
            id: string;
            position: number;
            area_id?: string;
          }> = destIds.map((id, i) => ({
            id,
            position: i,
            area_id: toAreaId,
          }));

          // If moved cross-area, also rebuild source positions.
          if (fromAreaId && fromAreaId !== toAreaId) {
            const sourceEl = listRefs.value[fromAreaId];
            if (sourceEl) {
              const sourceIds = Array.from(sourceEl.children).map(
                (n) => (n as HTMLElement).dataset.projectId!,
              );
              updates.push(...sourceIds.map((id, i) => ({ id, position: i })));
            }
          }
          await vault.reorderProjects(updates);
        },
      }),
    );
  }
}

// Re-init sortables whenever the area list changes (e.g. after auth reload)
watch(
  areas,
  () => {
    void nextTick(initSortables);
  },
  { deep: false },
);

let authSub: { unsubscribe: () => void } | null = null;

onMounted(() => {
  void vault.loadAreasAndProjects().then(() => nextTick(initSortables));
  const { data } = supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
      void vault.loadAreasAndProjects().then(() => nextTick(initSortables));
    } else if (event === "SIGNED_OUT") {
      vault.reset();
    }
  });
  authSub = data.subscription;
});

onBeforeUnmount(() => {
  authSub?.unsubscribe();
  teardownSortables();
});
</script>

<template>
  <nav class="flex flex-col" aria-label="areas and projects">
    <p
      v-if="areas.length === 0"
      class="font-mono uppercase tracking-tracked text-meta text-text-tertiary"
    >
      no areas. sign in or refresh.
    </p>
    <div v-for="area in areas" :key="area.id" class="flex flex-col">
      <div
        class="d-area-head"
        :class="{ 'd-area-head-drop': dragOverAreaId === area.id }"
        @dragover="
          onTaskDragOver($event);
          dragOverAreaId = area.id;
        "
        @dragleave="dragOverAreaId = null"
        @drop="onTaskDropOnArea($event, area.id)"
      >
        <router-link
          :to="`/area/${area.slug}`"
          class="interactive d-area-name flex-1 truncate"
          :class="{ 'd-area-name-active': isActiveArea(area.slug) }"
        >
          {{ area.name.toLowerCase() }}
        </router-link>
      </div>
      <ul
        :ref="(el) => (listRefs[area.id] = el as HTMLElement | null)"
        :data-area-id="area.id"
        class="d-area-projects"
      >
        <li
          v-for="p in projectsByArea.get(area.id) ?? []"
          :key="p.id"
          :data-project-id="p.id"
          class="d-proj-row drag-handle"
          :class="{ 'd-proj-row-drop': dragOverProjectId === p.id }"
          @dragover="
            onTaskDragOver($event);
            dragOverProjectId = p.id;
          "
          @dragleave="dragOverProjectId = null"
          @drop="onTaskDropOnProject($event, p.id, area.id)"
        >
          <span
            class="d-nav-dot flex-shrink-0"
            :style="{ background: projectColor(p.slug) }"
            aria-hidden="true"
          ></span>
          <router-link
            :to="`/project/${p.slug}`"
            class="interactive d-proj-link flex-1"
            :class="{ 'd-proj-link-active': isActiveProject(p.slug) }"
          >
            <span class="truncate">{{ p.name.toLowerCase() }}</span>
          </router-link>
          <span v-if="p.deadline" class="d-proj-meta flex-shrink-0">{{
            fmtDeadline(p.deadline)
          }}</span>
          <span v-else-if="p.cadence" class="d-proj-meta flex-shrink-0"
            >{{ p.cadence_target ?? 1 }}/{{ p.cadence?.[0] }}</span
          >
        </li>
      </ul>
    </div>
  </nav>
</template>

<style scoped>
.d-nav-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.d-area-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 3px 6px;
  border-radius: 4px;
  margin-top: 2px;
  margin-bottom: 2px;
  transition:
    background 120ms ease,
    box-shadow 120ms ease;
}
.d-area-head-drop {
  background: rgba(246, 0, 155, 0.1);
  box-shadow: inset 0 0 0 1px var(--acc-carnation);
}
.d-area-name {
  font-family:
    "JetBrains Mono", "Diatype Mono Variable", ui-monospace, monospace;
  font-size: 0.625rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--sl-500);
  text-decoration: none;
}
.d-area-name-active {
  color: var(--sl-900);
}
.d-area-projects {
  display: flex;
  flex-direction: column;
  gap: 1px;
  list-style: none;
  margin: 0;
  padding: 0;
}
.d-proj-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 6px;
  border-radius: 4px;
  cursor: grab;
  transition:
    background 120ms ease,
    box-shadow 120ms ease;
}
.d-proj-row:hover {
  background: var(--sl-100);
}
.d-proj-row:active {
  cursor: grabbing;
}
.d-proj-row-drop {
  background: rgba(246, 0, 155, 0.1);
  box-shadow: inset 0 0 0 1px var(--acc-carnation);
}
.d-proj-link {
  font-size: 0.8125rem;
  color: var(--sl-500);
  text-decoration: none;
  text-transform: lowercase;
  min-width: 0;
}
.d-proj-link:hover {
  color: var(--sl-900);
}
.d-proj-link-active {
  color: var(--sl-900);
  font-weight: 600;
}
.d-proj-meta {
  font-family:
    "JetBrains Mono", "Diatype Mono Variable", ui-monospace, monospace;
  font-size: 0.625rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--sl-400);
}
</style>
