<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useVaultStore } from "../stores/vault";
import { supabase } from "../lib/supabase";

const props = defineProps<{ todoId: string }>();

const vault = useVaultStore();
const { tags } = storeToRefs(vault);

const todoTagIds = ref<Set<string>>(new Set());
const draft = ref("");

async function loadAssignments() {
  await supabase.auth.getSession();
  const { data } = await supabase
    .from("todo_tags")
    .select("tag_id")
    .eq("todo_id", props.todoId);
  todoTagIds.value = new Set(
    (data ?? []).map((r: { tag_id: string }) => r.tag_id),
  );
}

onMounted(loadAssignments);
watch(
  () => props.todoId,
  () => void loadAssignments(),
);

const assigned = computed(() =>
  tags.value.filter((t) => todoTagIds.value.has(t.id)),
);
const suggestions = computed(() => {
  const q = draft.value.trim().toLowerCase();
  return tags.value
    .filter((t) => !todoTagIds.value.has(t.id))
    .filter((t) => (q ? t.name.toLowerCase().includes(q) : true))
    .slice(0, 8);
});

async function attach(tagId: string) {
  todoTagIds.value.add(tagId);
  await supabase
    .from("todo_tags")
    .insert({ todo_id: props.todoId, tag_id: tagId } as never);
}
async function detach(tagId: string) {
  todoTagIds.value.delete(tagId);
  await supabase
    .from("todo_tags")
    .delete()
    .eq("todo_id", props.todoId)
    .eq("tag_id", tagId);
}
async function createAndAttach() {
  const name = draft.value.trim();
  if (!name) return;
  const tag = await vault.createTag(name);
  if (tag) {
    await attach(tag.id);
    draft.value = "";
  }
}
</script>

<template>
  <div class="mt-s-4">
    <p
      class="font-mono uppercase tracking-tracked text-meta text-text-tertiary mb-s-2"
    >
      tags
    </p>
    <div class="flex flex-wrap gap-s-2">
      <span
        v-for="t in assigned"
        :key="t.id"
        class="pill flex items-center gap-s-2 cursor-pointer interactive"
        :style="t.color ? { color: t.color, borderColor: t.color } : {}"
        @click="detach(t.id)"
      >
        #{{ t.name }} <span aria-hidden="true">×</span>
      </span>
    </div>
    <form class="mt-s-2 flex gap-s-2" @submit.prevent="createAndAttach">
      <input
        v-model="draft"
        type="text"
        class="input-bare !py-s-1 !border-b-0 flex-1"
        placeholder="add tag (return to create)"
      />
    </form>
    <div v-if="suggestions.length" class="mt-s-2 flex flex-wrap gap-s-2">
      <button
        v-for="t in suggestions"
        :key="t.id"
        type="button"
        class="pill interactive text-text-secondary"
        :style="t.color ? { color: t.color, borderColor: t.color } : {}"
        @click="attach(t.id)"
      >
        +#{{ t.name }}
      </button>
    </div>
  </div>
</template>
