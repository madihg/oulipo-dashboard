<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useVaultStore } from "../stores/vault";
import { useFiltersStore } from "../stores/filters";

const vault = useVaultStore();
const filters = useFiltersStore();
const { areas, projects } = storeToRefs(vault);
const { todayArea, todayProject, todayPriority } = storeToRefs(filters);

// When area changes, narrow project options. If the selected project belongs
// to a different area, clear it.
const projectsForArea = computed(() => {
  if (!todayArea.value) {
    return projects.value.slice().sort((a, b) => a.name.localeCompare(b.name));
  }
  const area = areas.value.find((a) => a.slug === todayArea.value);
  if (!area) return [];
  return projects.value
    .filter((p) => p.area_id === area.id)
    .sort((a, b) => a.position - b.position);
});

function onAreaChange() {
  // If selected project no longer in narrowed list, clear it
  if (
    todayProject.value &&
    !projectsForArea.value.find((p) => p.slug === todayProject.value)
  ) {
    todayProject.value = null;
  }
}

const anyActive = computed(
  () => !!todayArea.value || !!todayProject.value || !!todayPriority.value,
);
</script>

<template>
  <div
    class="flex flex-wrap items-center gap-s-3 font-mono uppercase tracking-tracked text-meta text-text-tertiary"
  >
    <label class="flex items-center gap-s-2">
      area
      <select
        v-model="todayArea"
        class="bg-transparent border-b border-border-light text-base text-text-primary lowercase"
        @change="onAreaChange"
      >
        <option :value="null">all</option>
        <option v-for="a in areas" :key="a.id" :value="a.slug">
          {{ a.name }}
        </option>
      </select>
    </label>
    <label class="flex items-center gap-s-2">
      project
      <select
        v-model="todayProject"
        class="bg-transparent border-b border-border-light text-base text-text-primary lowercase"
      >
        <option :value="null">all</option>
        <option v-for="p in projectsForArea" :key="p.id" :value="p.slug">
          {{ p.name }}
        </option>
      </select>
    </label>
    <label class="flex items-center gap-s-2">
      priority
      <select
        v-model="todayPriority"
        class="bg-transparent border-b border-border-light text-base text-text-primary lowercase"
      >
        <option :value="null">all</option>
        <option value="P0">p0</option>
        <option value="P1">p1</option>
        <option value="P2">p2</option>
      </select>
    </label>
    <button
      v-if="anyActive"
      class="interactive text-text-tertiary lowercase"
      @click="filters.clear()"
    >
      clear
    </button>
  </div>
</template>
