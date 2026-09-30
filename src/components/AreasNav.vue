<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useVaultStore } from "../stores/vault";
import { storeToRefs } from "pinia";
import { supabase } from "../lib/supabase";
import Sortable from "sortablejs";
import { openTaskAction } from "../composables/useOpenTask";

const route = useRoute();
const router = useRouter();
const vault = useVaultStore();
const { areas } = storeToRefs(vault);

const areaListEl = ref<HTMLElement | null>(null);
const sortables: Sortable[] = [];

function onProjects() {
  return route.path === "/projects" || route.path.startsWith("/project/");
}
function isActiveArea(slug: string) {
  return route.path === `/area/${slug}`;
}

// ============================================================================
// Drop targets for DenseRow drags. Drop on a project = assign to that project +
// the project's area. Drop on an area heading = assign to area, clear project.
// ============================================================================
const TODO_MIME = "application/x-hmart-todo";
const dragOverAreaId = ref<string | null>(null);

function onTaskDragOver(e: DragEvent) {
  if (!e.dataTransfer?.types.includes(TODO_MIME)) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
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
    useToastStore().show(
      `moved to ${area.name} (no project)`,
      openTaskAction(router, todoId, `/area/${area.slug}`),
    );
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

  // Area reorder: the outer list of .d-area-block items, dragged by the grip.
  const areaEl = areaListEl.value;
  if (areaEl) {
    sortables.push(
      Sortable.create(areaEl, {
        group: "areas-list",
        draggable: ".d-area-block",
        handle: ".area-drag-handle",
        animation: 150,
        ghostClass: "opacity-30",
        onEnd: async () => {
          const ids = Array.from(areaEl.children)
            .map((n) => (n as HTMLElement).dataset.areaId)
            .filter((x): x is string => !!x);
          await vault.reorderAreas(ids.map((id, i) => ({ id, position: i })));
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
    <p v-if="areas.length === 0" class="cap">no areas. sign in or refresh.</p>
    <div ref="areaListEl" class="flex flex-col">
      <div
        v-for="area in areas"
        :key="area.id"
        :data-area-id="area.id"
        class="d-area-block flex flex-col"
      >
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
          <button
            type="button"
            class="area-grip area-drag-handle"
            aria-label="drag to reorder area"
            title="drag to reorder"
          >
            <svg viewBox="0 0 10 16" aria-hidden="true">
              <circle cx="3" cy="4" r="1" />
              <circle cx="7" cy="4" r="1" />
              <circle cx="3" cy="8" r="1" />
              <circle cx="7" cy="8" r="1" />
              <circle cx="3" cy="12" r="1" />
              <circle cx="7" cy="12" r="1" />
            </svg>
          </button>
          <router-link
            :to="`/area/${area.slug}`"
            class="interactive cap d-area-name flex-1 truncate"
            :class="{ 'd-area-name-active': isActiveArea(area.slug) }"
          >
            {{ area.name.toLowerCase() }}
          </router-link>
        </div>
      </div>
    </div>
    <!-- Every project, on one page. A row like the areas above it: same type,
         same indent, a mark where their emoji sits, so the word lines up with
         the area names instead of floating under them. -->
    <div v-if="areas.length" class="d-area-head d-all-projects">
      <span class="area-grip-gap" aria-hidden="true"></span>
      <router-link
        to="/projects"
        class="interactive cap d-area-name flex-1 truncate"
        :class="{ 'd-area-name-active': onProjects() }"
      >
        <svg class="d-all-mark" viewBox="0 0 12 12" aria-hidden="true">
          <circle cx="6" cy="6" r="4.5" />
          <circle cx="6" cy="6" r="1.25" /></svg
        >projects
      </router-link>
    </div>
  </nav>
</template>

<style scoped>
.d-area-head {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 1px 6px 1px 2px;
  border-radius: 2px;
  margin-top: 1px;
  margin-bottom: 0;
  transition:
    background var(--dur-fast) var(--ease-out),
    box-shadow var(--dur-fast) var(--ease-out);
}
/* Drag handle for area reorder - discreet 6-dot grip, revealed on hover and
   whenever the keyboard lands on it. */
.area-grip {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  /* Sized to the row, not to the icon: at 18px the grip was the tallest thing
     in an area row and held it open 4px past what the label needs. */
  height: 14px;
  flex-shrink: 0;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: grab;
  opacity: 0;
  transition: opacity var(--dur-fast) var(--ease-out);
}
.d-area-head:hover .area-grip,
.area-grip:focus-visible {
  opacity: 1;
}
.area-grip:active {
  cursor: grabbing;
}
.area-grip svg {
  width: 10px;
  height: 16px;
  fill: var(--ink-40);
}
/* A drop target is the cobalt wash inside a metal ring. The one cobalt note
   on this surface is the active area or project. */
.d-area-head-drop {
  background: var(--cobalt-tint);
  box-shadow: inset 0 0 0 1px var(--metal);
}
/* The caption recipe (.cap) at eyebrow tracking, in ink: names stay ink, the
   dot carries the hue. */
.d-area-name {
  letter-spacing: 0.08em;
  color: var(--ink);
  text-decoration: none;
}
/* The projects row: the grip's width kept empty, a monoline target where an
   area has its emoji, and a hairline above to part it from the areas. */
.area-grip-gap {
  width: 14px;
  flex-shrink: 0;
}
.d-all-projects {
  margin-top: 5px;
  padding-top: 5px;
  border-top: 1px solid var(--hair);
  border-radius: 0;
}
.d-all-mark {
  display: inline-block;
  width: 11px;
  height: 11px;
  margin-right: 5px;
  vertical-align: -2px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
}
.d-area-name-active {
  color: var(--acc-carnation-text);
}
/* Tablets show the sidebar to a finger: every row keeps a 32px target. */
@media (pointer: coarse) {
  .d-area-head {
    min-height: 32px;
  }
}
</style>
