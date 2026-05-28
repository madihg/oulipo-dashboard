<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from "vue";
import { storeToRefs } from "pinia";
import { useVaultStore } from "../stores/vault";
import { useFiltersStore } from "../stores/filters";
import { supabase } from "../lib/supabase";
import DenseToolbar from "../components/dense/DenseToolbar.vue";
import DenseGroup from "../components/dense/DenseGroup.vue";
import DenseRow from "../components/dense/DenseRow.vue";
import DenseStatusBar from "../components/dense/DenseStatusBar.vue";
import AddTaskInput from "../components/AddTaskInput.vue";
import FilterBar from "../components/FilterBar.vue";

const vault = useVaultStore();
const filters = useFiltersStore();
const { todayTodos, areas, projects } = storeToRefs(vault);
const { todayArea, todayProject, todayPriority } = storeToRefs(filters);

const showFilters = ref(false);
const showAdd = ref(false);

const today = new Date().toLocaleDateString("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
});

const filteredTodos = computed(() => {
  let rows = todayTodos.value;
  if (todayArea.value) {
    const area = areas.value.find((a) => a.slug === todayArea.value);
    if (area) rows = rows.filter((t) => t.area_id === area.id);
    else rows = [];
  }
  if (todayProject.value) {
    const project = projects.value.find((p) => p.slug === todayProject.value);
    if (project) rows = rows.filter((t) => t.project_id === project.id);
    else rows = [];
  }
  if (todayPriority.value) {
    rows = rows.filter((t) => t.priority === todayPriority.value);
  }
  return rows;
});

const grouped = computed(() => {
  const isoToday = new Date().toISOString().slice(0, 10);
  const p0 = filteredTodos.value.filter((t) => t.priority === "P0");
  const overdue = filteredTodos.value.filter(
    (t) => t.priority !== "P0" && t.deadline && t.deadline <= isoToday,
  );
  const scheduled = filteredTodos.value.filter(
    (t) => t.priority !== "P0" && !overdue.includes(t),
  );
  return { p0, overdue, scheduled };
});

function loadAll() {
  void vault.loadAreasAndProjects();
  void vault.loadToday();
}

let authSub: { unsubscribe: () => void } | null = null;
onMounted(() => {
  vault.currentProjectId = null;
  vault.currentAreaId = null;
  loadAll();
  const { data } = supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") loadAll();
  });
  authSub = data.subscription;
});
onBeforeUnmount(() => authSub?.unsubscribe());
</script>

<template>
  <section class="list-column">
    <DenseToolbar
      title="today"
      :meta="`${today.toLowerCase()} · ${filteredTodos.length}/${todayTodos.length} open`"
      @filter="showFilters = !showFilters"
      @new="showAdd = !showAdd"
    />

    <FilterBar v-if="showFilters" class="mb-s-4" />
    <AddTaskInput
      v-if="showAdd"
      class="mb-s-4"
      placeholder="capture for today — type and hit return"
      state="today"
    />

    <div v-if="filteredTodos.length === 0" class="d-empty">
      nothing queued. take the morning.
    </div>

    <div v-else class="d-grid">
      <DenseGroup
        v-if="grouped.p0.length"
        label="p0"
        accent="carnation"
        :count="grouped.p0.length"
        @add="showAdd = true"
      >
        <DenseRow
          v-for="t in grouped.p0"
          :key="t.id"
          :todo="t"
          :show-project="true"
        />
      </DenseGroup>
      <DenseGroup
        v-if="grouped.overdue.length"
        label="overdue"
        accent="carnation"
        :count="grouped.overdue.length"
        @add="showAdd = true"
      >
        <DenseRow
          v-for="t in grouped.overdue"
          :key="t.id"
          :todo="t"
          :show-project="true"
        />
      </DenseGroup>
      <DenseGroup
        v-if="grouped.scheduled.length"
        label="scheduled"
        accent="neutral"
        :count="grouped.scheduled.length"
        @add="showAdd = true"
      >
        <DenseRow
          v-for="t in grouped.scheduled"
          :key="t.id"
          :todo="t"
          :show-project="true"
        />
      </DenseGroup>
    </div>

    <DenseStatusBar
      :rows="filteredTodos.length"
      :groups="
        [grouped.p0, grouped.overdue, grouped.scheduled].filter((g) => g.length)
          .length
      "
    />
  </section>
</template>

<style scoped>
.d-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 0.75rem;
}
.d-empty {
  font-size: 0.875rem;
  color: var(--sl-500);
  padding: 1rem 0;
}
</style>
