<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useVaultStore } from "../stores/vault";

const props = defineProps<{
  projectId?: string | null;
  areaId?: string | null;
  state?: "inbox" | "anytime" | "today" | "someday";
  placeholder?: string;
  // Hide the project picker (e.g. on the Project view where context is implicit)
  hideProjectPicker?: boolean;
}>();

const vault = useVaultStore();
const { projects, areas } = storeToRefs(vault);
const title = ref("");
const submitting = ref(false);

// Auto-focus the title on open. The component mounts only when the caller
// reveals it (showAdd), so mount == open. On mobile this also raises the
// keyboard; scrollIntoView keeps the field clear of the bottom tab bar.
const titleEl = ref<HTMLInputElement | null>(null);
onMounted(() =>
  nextTick(() => {
    titleEl.value?.focus();
    titleEl.value?.scrollIntoView({ block: "center", behavior: "smooth" });
  }),
);

// Local override - user can pick a project at capture time. Defaults to
// whatever the parent passed (props.projectId).
const pickedProjectId = ref<string | null>(props.projectId ?? null);
watch(
  () => props.projectId,
  (v) => {
    pickedProjectId.value = v ?? null;
  },
);

const sortedProjects = computed(() =>
  projects.value.slice().sort((a, b) => {
    const aArea = areas.value.find((x) => x.id === a.area_id)?.name ?? "";
    const bArea = areas.value.find((x) => x.id === b.area_id)?.name ?? "";
    if (aArea !== bArea) return aArea.localeCompare(bArea);
    return a.position - b.position;
  }),
);

function areaForProject(projectId: string | null): string | null {
  if (!projectId) return null;
  const p = projects.value.find((x) => x.id === projectId);
  return p?.area_id ?? null;
}

async function submit() {
  const t = title.value.trim();
  if (!t || submitting.value) return;
  submitting.value = true;
  // Tiny syntax: leading [P0], [P1], [P2] sets priority
  let priority: "P0" | "P1" | "P2" | null = null;
  let body = t;
  const m = /^\[(P[012])\]\s+(.+)/i.exec(t);
  if (m) {
    priority = m[1]!.toUpperCase() as "P0" | "P1" | "P2";
    body = m[2]!;
  }
  const projId = pickedProjectId.value ?? null;
  await vault.createTodo({
    title: body,
    priority,
    project_id: projId,
    area_id: projId ? areaForProject(projId) : (props.areaId ?? null),
    state: props.state ?? "anytime",
    // Quick-capture: let Claude enrich notes / infer a deadline in the
    // background. The full editor (CaptureBar) opts out so it isn't raced.
    enrich: true,
    // Toast the destination so it's never a mystery where the task landed.
    announce: true,
  });
  title.value = "";
  submitting.value = false;
}

// Where this task will land, shown inline so it's clear before you hit return.
const destinationLabel = computed(() => {
  const projId = pickedProjectId.value;
  if (projId) {
    return projects.value.find((p) => p.id === projId)?.name ?? "project";
  }
  if (props.areaId) {
    return areas.value.find((a) => a.id === props.areaId)?.name ?? "area";
  }
  return props.state ?? "anytime";
});
</script>

<template>
  <form class="flex items-center gap-s-3 flex-wrap" @submit.prevent="submit">
    <span
      class="font-mono text-meta uppercase tracking-tracked text-text-hint"
      aria-hidden="true"
      >+</span
    >
    <input
      ref="titleEl"
      v-model="title"
      type="text"
      class="input-bare flex-1 min-w-[200px]"
      :placeholder="
        placeholder ?? 'new task - type and hit return ([P0] for priority)'
      "
      :disabled="submitting"
      autocomplete="off"
    />
    <select
      v-if="!hideProjectPicker"
      v-model="pickedProjectId"
      class="bg-transparent border-b border-border-light text-base text-text-secondary lowercase max-w-[180px]"
      :title="'assign to project'"
    >
      <option :value="null">no project</option>
      <option v-for="p in sortedProjects" :key="p.id" :value="p.id">
        {{ areas.find((a) => a.id === p.area_id)?.name }} / {{ p.name }}
      </option>
    </select>
    <span
      class="font-mono text-meta uppercase tracking-tracked text-text-hint whitespace-nowrap"
      :title="'this task will land in ' + destinationLabel"
    >
      → {{ destinationLabel }}
    </span>
  </form>
</template>
