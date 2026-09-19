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
const showMore = ref(false);

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
      <!-- One pinned line, as on the list view of this area. -->
      <DenseToolbar
        :title="area.name"
        :meta="`${visibleTodos.length} of ${areaTodos.length} tasks`"
        :route-key="routeKey"
        :available-tags="availableTags"
        :hide-project-group="true"
        @new="showAdd = !showAdd"
      >
        <template #extra>
          <ViewToggle :slug="area.slug" entity="area" current="kanban" />
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
          :slug="area.slug"
          entity="area"
          current="kanban"
        />
        <EntityActions kind="area" :id="area.id" :current-name="area.name" />
      </div>

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
/* One hosted line, one next action, flush with the list's left edge. */
</style>
