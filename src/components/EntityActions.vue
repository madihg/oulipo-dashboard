<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { storeToRefs } from "pinia";
import { useRouter } from "vue-router";
import { useVaultStore } from "../stores/vault";
import { useToastStore } from "../stores/toast";

/**
 * Inline rename + delete for an area or a project. Renders as a small
 * meta-row of buttons that expand into edit/confirm states. No modal -
 * lives inline above the list (Things-3-style direct manipulation).
 */
const props = defineProps<{
  kind: "area" | "project";
  id: string;
  currentName: string;
}>();

const router = useRouter();
const vault = useVaultStore();
const toast = useToastStore();
const { projects } = storeToRefs(vault);

const mode = ref<"idle" | "rename" | "confirm-delete">("idle");
const newName = ref(props.currentName);
const inputEl = ref<HTMLInputElement | null>(null);

// Cascade choice for project delete - only applies to projects
const todosMode = ref<"orphan" | "cascade" | "move">("orphan");
const moveTarget = ref<string>("");
const otherProjects = computed(() =>
  projects.value
    .filter((p) => p.id !== props.id)
    .sort((a, b) => a.name.localeCompare(b.name)),
);

async function startRename() {
  mode.value = "rename";
  newName.value = props.currentName;
  await nextTick();
  inputEl.value?.focus();
  inputEl.value?.select();
}

async function commitRename() {
  const n = newName.value.trim();
  if (!n || n === props.currentName) {
    mode.value = "idle";
    return;
  }
  if (props.kind === "project") {
    await vault.renameProject(props.id, n);
  } else {
    await vault.renameArea(props.id, n);
  }
  toast.show(`renamed to "${n}"`);
  mode.value = "idle";
}

function cancel() {
  mode.value = "idle";
}

function startDelete() {
  mode.value = "confirm-delete";
  todosMode.value = "orphan";
  moveTarget.value = otherProjects.value[0]?.id ?? "";
}

async function commitDelete() {
  if (props.kind === "project") {
    await vault.deleteProject(props.id, {
      todosMode: todosMode.value,
      moveToProjectId:
        todosMode.value === "move" ? moveTarget.value : undefined,
    });
    toast.show(`deleted project "${props.currentName}"`);
    // Navigate away if we were on this project's page
    void router.push("/today");
  } else {
    const result = await vault.deleteArea(props.id);
    if (!result.ok) {
      toast.show(result.reason ?? "delete failed");
      mode.value = "idle";
      return;
    }
    toast.show(`deleted area "${props.currentName}"`);
    void router.push("/today");
  }
  mode.value = "idle";
}
</script>

<template>
  <div
    class="flex flex-wrap items-center gap-s-3 text-meta font-mono uppercase tracking-tracked"
  >
    <template v-if="mode === 'idle'">
      <button class="interactive text-text-tertiary" @click="startRename">
        rename
      </button>
      <button class="interactive text-acc-carnation-text" @click="startDelete">
        delete
      </button>
    </template>

    <template v-else-if="mode === 'rename'">
      <input
        ref="inputEl"
        v-model="newName"
        type="text"
        class="input-bare flex-1 min-w-[160px] !py-s-1 lowercase text-text-primary text-base"
        :placeholder="`new ${kind} name`"
        @keydown.enter="commitRename"
        @keydown.escape="cancel"
      />
      <button class="interactive text-text-primary" @click="commitRename">
        save
      </button>
      <button class="interactive text-text-tertiary" @click="cancel">
        cancel
      </button>
    </template>

    <template v-else-if="mode === 'confirm-delete'">
      <span class="text-acc-carnation-text"
        >delete {{ kind }} "{{ currentName }}"?</span
      >
      <template v-if="kind === 'project'">
        <label class="flex items-center gap-s-2">
          tasks
          <select
            v-model="todosMode"
            class="bg-transparent border-b border-border-light text-base text-text-primary lowercase"
          >
            <option value="orphan">unassign (keep in area)</option>
            <option value="cascade">delete with project</option>
            <option value="move">move to another project</option>
          </select>
        </label>
        <select
          v-if="todosMode === 'move'"
          v-model="moveTarget"
          class="bg-transparent border-b border-border-light text-base text-text-primary lowercase max-w-[200px]"
        >
          <option v-for="p in otherProjects" :key="p.id" :value="p.id">
            {{ p.name }}
          </option>
        </select>
      </template>
      <button class="interactive text-acc-carnation-text" @click="commitDelete">
        confirm
      </button>
      <button class="interactive text-text-tertiary" @click="cancel">
        cancel
      </button>
    </template>
  </div>
</template>
