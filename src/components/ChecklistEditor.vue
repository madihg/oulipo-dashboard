<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { supabase } from "../lib/supabase";
import type { ChecklistItemRow } from "../types/database";

const props = defineProps<{ todoId: string }>();

const items = ref<ChecklistItemRow[]>([]);
const draft = ref("");

async function load() {
  await supabase.auth.getSession();
  const { data } = await supabase
    .from("checklist_items")
    .select("*")
    .eq("todo_id", props.todoId)
    .order("position");
  items.value = (data as ChecklistItemRow[]) ?? [];
}

watch(
  () => props.todoId,
  () => void load(),
  { immediate: false },
);

onMounted(() => void load());

async function add() {
  const title = draft.value.trim();
  if (!title) return;
  const position = items.value.length
    ? Math.max(...items.value.map((i) => i.position)) + 1
    : 0;
  const { data } = await supabase
    .from("checklist_items")
    .insert({ todo_id: props.todoId, title, done: false, position } as never)
    .select()
    .single();
  if (data) items.value.push(data as ChecklistItemRow);
  draft.value = "";
}

async function toggle(item: ChecklistItemRow) {
  item.done = !item.done;
  await supabase
    .from("checklist_items")
    .update({ done: item.done } as never)
    .eq("id", item.id);
}

async function remove(item: ChecklistItemRow) {
  items.value = items.value.filter((i) => i.id !== item.id);
  await supabase.from("checklist_items").delete().eq("id", item.id);
}

async function commitTitle(item: ChecklistItemRow, newTitle: string) {
  const t = newTitle.trim();
  if (!t || t === item.title) return;
  item.title = t;
  await supabase
    .from("checklist_items")
    .update({ title: t } as never)
    .eq("id", item.id);
}
</script>

<template>
  <div v-if="items.length || true" class="mt-s-4">
    <p
      class="font-mono uppercase tracking-tracked text-meta text-text-tertiary mb-s-2"
    >
      checklist
    </p>
    <ul class="flex flex-col gap-s-1">
      <li
        v-for="item in items"
        :key="item.id"
        class="flex items-center gap-s-3 group"
      >
        <input
          type="checkbox"
          class="check"
          :checked="item.done"
          @change="toggle(item)"
        />
        <input
          :value="item.title"
          type="text"
          class="input-bare flex-1 !py-s-1 !border-b-0"
          :class="{ 'line-through text-text-tertiary': item.done }"
          @blur="(e) => commitTitle(item, (e.target as HTMLInputElement).value)"
          @keydown.enter="(e) => (e.target as HTMLInputElement).blur()"
        />
        <button
          class="font-mono text-meta text-text-hint opacity-0 group-hover:opacity-100 interactive"
          @click="remove(item)"
        >
          ×
        </button>
      </li>
    </ul>
    <form class="flex items-center gap-s-3 mt-s-2" @submit.prevent="add">
      <span class="font-mono text-meta text-text-hint" aria-hidden="true"
        >+</span
      >
      <input
        v-model="draft"
        type="text"
        class="input-bare !py-s-1 !border-b-0 flex-1"
        placeholder="add subitem"
      />
    </form>
  </div>
</template>
