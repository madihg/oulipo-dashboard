<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import Sortable from "sortablejs";
import { supabase } from "../lib/supabase";
import type { ChecklistItemRow } from "../types/database";

const props = defineProps<{ todoId: string }>();

const items = ref<ChecklistItemRow[]>([]);
const draft = ref("");
const listEl = ref<HTMLElement | null>(null);
let sortable: Sortable | null = null;

async function load() {
  await supabase.auth.getSession();
  const { data } = await supabase
    .from("checklist_items")
    .select("*")
    .eq("todo_id", props.todoId)
    .order("position");
  items.value = (data as ChecklistItemRow[]) ?? [];
  void nextTick(initSortable);
}

function initSortable() {
  sortable?.destroy();
  if (!listEl.value) return;
  sortable = Sortable.create(listEl.value, {
    handle: ".ci-grip",
    animation: 150,
    // Touch: press-hold to drag so a normal swipe still scrolls the page.
    delay: 180,
    delayOnTouchOnly: true,
    touchStartThreshold: 8,
    chosenClass: "ci-chosen",
    onEnd: async (evt) => {
      (evt.item as HTMLElement)?.blur?.();
      const orderedIds = Array.from(listEl.value!.children).map(
        (n) => (n as HTMLElement).dataset.id!,
      );
      // Reorder local model + persist new positions.
      const byId = new Map(items.value.map((i) => [i.id, i]));
      items.value = orderedIds.map((id) => byId.get(id)!).filter(Boolean);
      await Promise.all(
        orderedIds.map((id, i) =>
          supabase
            .from("checklist_items")
            .update({ position: i } as never)
            .eq("id", id),
        ),
      );
    },
  });
}

watch(
  () => props.todoId,
  () => void load(),
  { immediate: false },
);

onMounted(() => void load());
onBeforeUnmount(() => sortable?.destroy());

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
    <ul ref="listEl" class="flex flex-col gap-s-1">
      <li
        v-for="item in items"
        :key="item.id"
        :data-id="item.id"
        class="flex items-center gap-s-2 group"
      >
        <span class="ci-grip" aria-hidden="true" title="drag to reorder"></span>
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

<style scoped>
/* 6-dot drag grip: hidden until row hover on desktop, always shown on touch.
   44px-tall hit area for touch; cursor grab. */
.ci-grip {
  flex-shrink: 0;
  width: 12px;
  align-self: stretch;
  min-height: 24px;
  cursor: grab;
  opacity: 0;
  transition: opacity 120ms ease;
  background-image: radial-gradient(currentColor 1px, transparent 1.5px);
  background-size: 4px 4px;
  background-position: center;
  background-repeat: round;
  color: var(--sl-400);
}
.group:hover .ci-grip {
  opacity: 1;
}
.ci-grip:active {
  cursor: grabbing;
}
.ci-chosen {
  background: var(--sl-100);
}
@media (max-width: 767px) {
  .ci-grip {
    opacity: 1;
    width: 20px;
    min-height: 44px;
  }
}
</style>
